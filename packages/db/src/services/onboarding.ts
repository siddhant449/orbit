import { prisma } from "../client";
import type { Prisma } from "../generated/prisma/client";
import { ONBOARDING_GOALS, type OnboardingGoal, type Strategy as StrategyInput } from "@brandloop/ai";
import { AccountError, assertProfileAccess } from "./account";
import { memoryLines, withMemoryRetry, writeSection, MEMORY_KEYS } from "./memory";
import { saveStrategy } from "./strategy";
import { selectVoice } from "./voice";

/** Steps of the first-run flow. Only step 1 is required; 2 to 5 can be skipped. */
export const ONBOARDING_STEPS = 5;

export { ONBOARDING_GOALS, type OnboardingGoal };

export type PostLength = "short" | "medium" | "long";

export type VoiceAnswers = {
  mode: "preset" | "own" | "none";
  voiceStyleId: string | null;
  allowEmoji: boolean;
  allowHashtags: boolean;
  allowDashes: boolean;
  allowLists: boolean;
  length: PostLength;
};

export type OnboardingAnswers = {
  about?: { fullName: string; jobTitle: string; company: string; timezone: string };
  goal?: { goal: OnboardingGoal; note: string };
  audience?: { roles: string[]; industries: string[]; sizes: string[]; text: string };
  offer?: string;
  voice?: VoiceAnswers;
  topics?: { topics: string[]; stories: string[] };
  skipped?: number[];
  finishedAt?: string;
  checklistDismissed?: boolean;
};

export type OnboardingState = { completed: boolean; step: number; answers: OnboardingAnswers };

const clean = (text: string, max = 300) => text.replace(/\s+/g, " ").trim().slice(0, max);
const cleanList = (items: string[], max: number, each = 80) => {
  const seen = new Set<string>();
  return items
    .map((i) => clean(i, each))
    .filter((i) => i && !seen.has(i.toLowerCase()) && seen.add(i.toLowerCase()))
    .slice(0, max);
};

function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const LENGTH_RULE: Record<PostLength, string | null> = {
  short: "Keep posts short, under 700 characters.",
  medium: null,
  long: "Posts can run long, up to 1,800 characters.",
};
const FIXED_RULES = ["No emojis.", "No hashtags.", "No dashes.", "No bullet lists."];
const OWNED_RULES = new Set([...FIXED_RULES, ...Object.values(LENGTH_RULE).filter((r): r is string => Boolean(r))]);

/** The hard writing rules implied by the voice step's toggles: a "no" for everything the person does not want. */
export function rulesFromToggles(v: Omit<VoiceAnswers, "mode" | "voiceStyleId">): string[] {
  return [
    !v.allowEmoji && FIXED_RULES[0]!,
    !v.allowHashtags && FIXED_RULES[1]!,
    !v.allowDashes && FIXED_RULES[2]!,
    !v.allowLists && FIXED_RULES[3]!,
    LENGTH_RULE[v.length],
  ].filter((r): r is string => Boolean(r));
}

/** Memory lines for each section, as `Label: value`. */
export function aboutLines(a: NonNullable<OnboardingAnswers["about"]>): string[] {
  return [`Name: ${a.fullName}`, a.jobTitle && `Role: ${a.jobTitle}`, a.company && `Company or industry: ${a.company}`].filter((l): l is string => Boolean(l));
}

export function audienceText(a: OnboardingAnswers["audience"]): string {
  if (!a) return "";
  return [
    a.roles.length && `roles: ${a.roles.join(", ")}`,
    a.industries.length && `industries: ${a.industries.join(", ")}`,
    a.sizes.length && `company size: ${a.sizes.join(", ")}`,
    a.text,
  ]
    .filter(Boolean)
    .join("; ");
}

export function goalAudienceLines(goal: OnboardingAnswers["goal"], audience: OnboardingAnswers["audience"]): string[] {
  const out: string[] = [];
  if (goal) out.push(`LinkedIn goal: ${ONBOARDING_GOALS[goal.goal].label}${goal.note ? `. ${goal.note}` : ""}`);
  const who = audienceText(audience);
  if (who) out.push(`Target audience: ${who}`);
  return out;
}

/**
 * Replaces the lines the flow owns in one memory section (those `owns` accepts) with `lines`, keeping every other
 * line the person or the AI wrote. Running a step again therefore updates its answers instead of piling up copies.
 */
export async function setOwnedLines(profileId: string, key: string, owns: (text: string) => boolean, lines: string[]): Promise<void> {
  await withMemoryRetry(profileId, async (version) => {
    const doc = await prisma.memoryDoc.findUnique({ where: { profileId_key: { profileId, key } } });
    const before = doc?.content ?? "";
    const drop = new Set(memoryLines(before).filter((l) => owns(l.text)).map((l) => l.index));
    const kept = before.split("\n").filter((_, i) => !drop.has(i));
    const next = [...kept, ...lines.map((l) => `- ${l}`)].join("\n").replace(/^\n+/, "").trimEnd();
    if (next === before.trimEnd()) return;
    if (!next) {
      await writeSection(profileId, key, null, "USER", { expectedVersion: version });
      return;
    }
    await writeSection(profileId, key, next, doc?.source ?? "USER", { expectedVersion: version });
  });
}

const startsWithAny = (...labels: string[]) => (text: string) => labels.some((l) => text.startsWith(l));

export async function getOnboarding(profileId: string): Promise<OnboardingState> {
  const p = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { onboardingCompleted: true, onboardingStep: true, onboardingAnswers: true },
  });
  if (!p) throw new AccountError("Profile not found");
  return {
    completed: p.onboardingCompleted,
    step: Math.min(Math.max(p.onboardingStep, 1), ONBOARDING_STEPS),
    answers: (p.onboardingAnswers ?? {}) as OnboardingAnswers,
  };
}

async function writeState(profileId: string, patch: Partial<OnboardingAnswers>, extra: Prisma.ProfileUpdateInput = {}) {
  const current = await getOnboarding(profileId);
  const answers = { ...current.answers, ...patch };
  await prisma.profile.update({ where: { id: profileId }, data: { ...extra, onboardingAnswers: answers as Prisma.InputJsonValue } });
}

export type StepInput =
  | { step: 1; about: NonNullable<OnboardingAnswers["about"]> }
  | { step: 2; goal: NonNullable<OnboardingAnswers["goal"]>; audience: NonNullable<OnboardingAnswers["audience"]>; offer: string }
  | { step: 3; voice: VoiceAnswers }
  | { step: 4; topics: NonNullable<OnboardingAnswers["topics"]> };

/** Saves one step's answers, writes them to the profile, memory and writing rules, and moves the resume point on. */
export async function saveOnboardingStep(userId: string, profileId: string, input: StepInput): Promise<void> {
  await assertProfileAccess(userId, profileId);
  const stepFields = { onboardingStep: Math.min(input.step + 1, ONBOARDING_STEPS) };
  const skipped = ((await getOnboarding(profileId)).answers.skipped ?? []).filter((s) => s !== input.step);

  if (input.step === 1) {
    const about = {
      fullName: clean(input.about.fullName, 120),
      jobTitle: clean(input.about.jobTitle, 120),
      company: clean(input.about.company, 160),
      timezone: input.about.timezone,
    };
    if (!about.fullName) throw new AccountError("Tell us your name");
    if (!about.jobTitle) throw new AccountError("Tell us your role or title");
    if (!isValidTimezone(about.timezone)) throw new AccountError("Unknown timezone");
    await setOwnedLines(profileId, MEMORY_KEYS.about, startsWithAny("Name:", "Role:", "Company or industry:"), aboutLines(about));
    await writeState(profileId, { about, skipped }, { ...stepFields, fullName: about.fullName, jobTitle: about.jobTitle, company: about.company || null, timezone: about.timezone });
    return;
  }

  if (input.step === 2) {
    const goal = { goal: input.goal.goal, note: clean(input.goal.note, 240) };
    if (!(goal.goal in ONBOARDING_GOALS)) throw new AccountError("Choose a goal");
    const audience = {
      roles: cleanList(input.audience.roles, 8),
      industries: cleanList(input.audience.industries, 8),
      sizes: cleanList(input.audience.sizes, 6),
      text: clean(input.audience.text, 300),
    };
    const offer = clean(input.offer, 400);
    await setOwnedLines(profileId, MEMORY_KEYS.about, startsWithAny("LinkedIn goal:", "Target audience:"), goalAudienceLines(goal, audience));
    await setOwnedLines(profileId, "identity/offers", startsWithAny("Offer:"), offer ? [`Offer: ${offer}`] : []);
    await writeState(profileId, { goal, audience, offer, skipped }, stepFields);
    return;
  }

  if (input.step === 3) {
    const v = input.voice;
    const voice: VoiceAnswers = { ...v, length: (["short", "medium", "long"] as const).includes(v.length) ? v.length : "medium" };
    if (voice.voiceStyleId) await selectVoice(userId, profileId, voice.voiceStyleId);
    await setOwnedLines(profileId, MEMORY_KEYS.rules, (t) => OWNED_RULES.has(t), rulesFromToggles(voice));
    await writeState(profileId, { voice, skipped }, stepFields);
    return;
  }

  const topics = { topics: cleanList(input.topics.topics, 5), stories: cleanList(input.topics.stories, 2, 600) };
  await setOwnedLines(profileId, "topics/known-for", startsWithAny("Topic:"), topics.topics.map((t) => `Topic: ${t}`));
  await setOwnedLines(profileId, MEMORY_KEYS.story, (t) => /^Story \d:/.test(t), topics.stories.map((s, i) => `Story ${i + 1}: ${s}`));
  await writeState(profileId, { topics, skipped }, stepFields);
}

/** Skips an optional step (2 to 4): nothing is written, and the flow moves on. */
export async function skipOnboardingStep(userId: string, profileId: string, step: number): Promise<void> {
  await assertProfileAccess(userId, profileId);
  if (!Number.isInteger(step) || step < 2 || step > 4) throw new AccountError("This step can't be skipped");
  const { answers } = await getOnboarding(profileId);
  await writeState(profileId, { skipped: [...new Set([...(answers.skipped ?? []), step])] }, { onboardingStep: step + 1 });
}

/** Moves the resume point (Back). */
export async function setOnboardingStep(userId: string, profileId: string, step: number): Promise<void> {
  await assertProfileAccess(userId, profileId);
  if (!Number.isInteger(step) || step < 1 || step > ONBOARDING_STEPS) throw new AccountError("Unknown step");
  await prisma.profile.update({ where: { id: profileId }, data: { onboardingStep: step } });
}

/** Confirms the reviewed strategy and finishes. The strategy is saved here and nowhere earlier. */
export async function finishOnboarding(userId: string, profileId: string, strategy: StrategyInput | null): Promise<void> {
  await assertProfileAccess(userId, profileId);
  if (strategy) await saveStrategy(profileId, strategy, true);
  await writeState(profileId, { finishedAt: new Date().toISOString(), checklistDismissed: false }, { onboardingCompleted: true, onboardingStep: ONBOARDING_STEPS });
}

/** Leaves the flow without finishing: the app opens, nothing more is asked. */
export async function leaveOnboarding(userId: string, profileId: string): Promise<void> {
  await assertProfileAccess(userId, profileId);
  await prisma.profile.update({ where: { id: profileId }, data: { onboardingCompleted: true } });
}

/** "Set up again": back to step 1 with the saved answers; never blocks the app. */
export async function restartOnboarding(userId: string, profileId: string): Promise<void> {
  await assertProfileAccess(userId, profileId);
  await prisma.profile.update({ where: { id: profileId }, data: { onboardingStep: 1 } });
}

export async function dismissChecklist(userId: string, profileId: string): Promise<void> {
  await assertProfileAccess(userId, profileId);
  await writeState(profileId, { checklistDismissed: true });
}

export type ChecklistItemId = "first-post" | "knowledge" | "template" | "sprint" | "linkedin";
export type ChecklistItem = { id: ChecklistItemId; label: string; href: string; done: boolean; comingSoon?: boolean };

/** Pure: which items are done, from counts read out of real data. Sprint progress is not stored yet, LinkedIn is not connectable yet. */
export function deriveChecklist(c: { documents: number; knowledge: number; templateSaves: number; linkedinConnected?: boolean }): ChecklistItem[] {
  return [
    { id: "first-post", label: "Write your first post", href: "/", done: c.documents > 0 },
    { id: "knowledge", label: "Add something to your knowledge base", href: "/knowledge-base", done: c.knowledge > 0 },
    { id: "template", label: "Save a template", href: "/templates", done: c.templateSaves > 0 },
    { id: "sprint", label: "Start the 30-day sprint", href: "/challenge", done: false },
    { id: "linkedin", label: "Connect LinkedIn", href: "/settings/integrations", done: Boolean(c.linkedinConnected), comingSoon: true },
  ];
}

/** The checklist for a profile that finished onboarding, or null when it should not show (never onboarded, or dismissed). */
export async function getChecklist(profileId: string): Promise<ChecklistItem[] | null> {
  const { answers } = await getOnboarding(profileId);
  if (!answers.finishedAt || answers.checklistDismissed) return null;
  const [documents, knowledge, templateSaves] = await Promise.all([
    prisma.document.count({ where: { profileId, deletedAt: null } }),
    prisma.knowledgeItem.count({ where: { profileId } }),
    prisma.savedItem.count({ where: { profileId, kind: "TEMPLATE" } }),
  ]);
  return deriveChecklist({ documents, knowledge, templateSaves });
}
