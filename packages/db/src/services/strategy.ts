import {
  AUDIENCE_LEVELS,
  CONTENT_TYPES,
  GOALS,
  normalizePercents,
  StrategySchema,
  type AiClient,
  type Strategy as StrategyInput,
} from "@brandloop/ai";
import { prisma } from "../client";
import type { Prisma, Strategy } from "../generated/prisma/client";
import { listMemory, memoryLines, upsertMemory } from "./memory";

export function getStrategy(profileId: string): Promise<Strategy | null> {
  return prisma.strategy.findUnique({ where: { profileId } });
}

const WEEKDAYS = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

/** Deterministic markdown mirror of the strategy's themes, so chat and drafting can read it as memory. */
export function strategyThemesMarkdown(s: StrategyInput): string {
  const pillars = [
    ...s.recurringSeries.map((r) => `- ${r.name} (${WEEKDAYS[r.weekday]}): ${r.description}`),
    ...s.contentMix.map((m) => `- ${CONTENT_TYPES[m.type].label} posts, about ${m.percent}% of your content`),
  ];
  return [
    "# Content pillars and positioning",
    "",
    `- Positioning: ${s.positioning}`,
    `- Why it works: ${s.positioningWhy}`,
    `- Tagline: ${s.tagline}`,
    `- Expertise: ${s.expertise}`,
    "",
    "## Content pillars",
    "",
    ...pillars,
  ].join("\n");
}

export async function saveStrategy(profileId: string, data: StrategyInput, generated = false): Promise<Strategy> {
  const parsed = StrategySchema.parse(data);
  const clean: StrategyInput = {
    ...parsed,
    contentMix: normalizePercents(parsed.contentMix),
    audienceBalance: normalizePercents(parsed.audienceBalance),
  };
  const fields = {
    goal: clean.goal,
    goalWhy: clean.goalWhy,
    positioning: clean.positioning,
    positioningWhy: clean.positioningWhy,
    tagline: clean.tagline,
    expertise: clean.expertise,
    expertiseWhy: clean.expertiseWhy,
    contentMix: clean.contentMix as Prisma.InputJsonValue,
    audienceBalance: clean.audienceBalance as Prisma.InputJsonValue,
    contentFormats: clean.contentFormats as Prisma.InputJsonValue,
    recurringSeries: clean.recurringSeries as Prisma.InputJsonValue,
  };
  const saved = await prisma.strategy.upsert({
    where: { profileId },
    create: { profileId, ...fields, generatedAt: generated ? new Date() : null },
    update: generated ? { ...fields, generatedAt: new Date() } : fields,
  });
  await upsertMemory(profileId, "strategy/themes", strategyThemesMarkdown(clean), "MIRRORED");
  return saved;
}

const SYSTEM =
  "You are a LinkedIn content strategist. Build a personal-brand content strategy for one person, using only the facts provided. " +
  "Do not invent credentials, clients or numbers. Percent values in contentMix and in audienceBalance must each total 100.";

export async function generateStrategy(ai: AiClient, profileId: string): Promise<Strategy> {
  const memory = await listMemory(profileId);
  const items = await prisma.knowledgeItem.findMany({
    where: { profileId, status: "READY" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { title: true, summary: true },
  });

  const memoryText = memory
    .filter((d) => d.key !== "strategy/themes")
    .map((d) => `${d.key}:\n${memoryLines(d.content).map((l) => `- ${l.text}`).join("\n")}`)
    .join("\n\n");
  const knowledgeText = items.map((i) => `- ${i.title}${i.summary ? `: ${i.summary}` : ""}`).join("\n");

  const prompt =
    `What I know about this person:\n${memoryText || "(nothing yet)"}\n\n` +
    `Their knowledge base:\n${knowledgeText || "(empty)"}\n\n` +
    `Goals to choose from: ${Object.entries(GOALS).map(([k, g]) => `${k} (${g.tagline})`).join("; ")}.\n` +
    `Content types: ${Object.entries(CONTENT_TYPES).map(([k, t]) => `${k} (${t.description})`).join("; ")}.\n` +
    `Audience levels: ${Object.entries(AUDIENCE_LEVELS).map(([k, a]) => `${k} (${a.description})`).join("; ")}.\n\n` +
    "Return the goal and why, positioning and why, a tagline, their expertise and why, a content mix across the five content types, " +
    "an audience balance across broad/narrow/niche with a short note each, posts per week by format with a note, and two or three recurring weekly series.";

  const result = await ai.json({ model: "generate", system: SYSTEM, prompt, schema: StrategySchema });
  return saveStrategy(profileId, result, true);
}
