/**
 * The quality eval's throwaway user: an invented person with a full set of grounding (identity, voice, writing
 * rules, strategy, two knowledge items and an own writing style). No real creator is named anywhere.
 */
import type { Embedder, Strategy } from "@brandloop/ai";
import { createKnowledge, ensureAccount, prisma, replaceChunks, saveStrategy, upsertMemory } from "@brandloop/db";

const TEAM_SUFFIX = " (eval)";

const ABOUT = `- Maya Okafor is a fractional CTO for pre-seed and seed startups
- Runs Northbeam Labs, a two-person technical advisory studio based in Lisbon
- 12 years as a software engineer and engineering lead, mostly backend and data systems
- Works with non-technical founders who need to scope, build and staff their first product
- Has helped 23 founders scope their first product since starting Northbeam Labs in 2023`;

const STORY = `- Her first startup, a grocery-delivery app, shut down after 18 months: the team built for a year before talking to customers
- That failure is why she now pushes founders to test the riskiest assumption first and build the smallest thing that proves it
- Before Northbeam she led a team of 9 engineers at a freight logistics scale-up`;

const PERSONAL = `- Lives in Lisbon with her partner and their dog
- Runs along the river most mornings before work
- Grew up in Manchester`;

const RULES = `## Do
- Short paragraphs: one or two sentences each
- British spelling
- End with a question to the reader or one clear takeaway, never a sales pitch
- Use concrete examples from founder work

## Don't
- No hashtags
- No emojis
- Never open with a rhetorical question

## Banned words
- leverage
- synergy
- game-changer
- delve
- unlock`;

const VOICE_MEMORY = `- Direct and calm; sounds like a senior engineer explaining things to a smart friend
- Plain words over jargon; explains any technical term in one clause
- Likes a contrarian first line backed by a specific example`;

const WRITING_STYLE_GUIDE = `## Rhythm
Short sentences. Mostly one-line paragraphs, with the occasional two-sentence paragraph for an example. Reads fast on a phone.

## Structure
Opens with a blunt claim or a specific moment. Then the example, then what it means for a founder, then one practical takeaway. Ends with a question or a single-line lesson.

## Signature moves
Contrasts two things founders confuse. Uses small real numbers (weeks, euros, people). Admits her own mistakes.

## Avoid
Hype, motivational filler, generic advice, lists of more than five items, corporate words.`;

const STRATEGY: Strategy = {
  goal: "build_authority",
  goalWhy: "She wins advisory clients through referrals once founders trust her judgement.",
  positioning: "The fractional CTO who helps non-technical founders build less and learn faster.",
  positioningWhy: "Most technical advice targets engineers; her audience is founders who can't yet judge technical work.",
  tagline: "Build the smallest thing that proves you're right.",
  expertise: "Scoping first products, MVPs and prototypes, hiring the first engineers, technical due diligence.",
  expertiseWhy: "Twelve years of engineering plus 23 founder engagements.",
  contentMix: [
    { type: "educational", percent: 50 },
    { type: "personal", percent: 25 },
    { type: "authority", percent: 25 },
  ],
  audienceBalance: [
    { level: "broad", percent: 30, note: "Early-stage founders in general" },
    { level: "narrow", percent: 50, note: "Non-technical founders before their first hire" },
    { level: "niche", percent: 20, note: "Founders about to sign with a dev agency" },
  ],
  contentFormats: [
    { format: "text", perWeek: 3, note: "Main format" },
    { format: "carousel", perWeek: 1, note: "Frameworks and checklists" },
  ],
  recurringSeries: [
    { name: "Scope Clinic", weekday: "mon", description: "Take one founder idea and cut it down to the smallest testable build" },
    { name: "Build Notes", weekday: "wed", description: "A lesson from a real build: a mistake, a trade-off or a decision" },
    { name: "Hiring Desk", weekday: "fri", description: "Hiring and working with the first engineers" },
  ],
};

const KNOWLEDGE = [
  {
    title: "MVP vs POC: founder workshop notes",
    content: `Notes from the scoping workshop I run with founders.

A proof of concept (POC) answers one question: can this be built at all? It is usually technical, throwaway and seen by nobody outside the team. Example: a fintech founder wanted to know if bank statement PDFs could be parsed reliably. Two days of scripts against 40 sample statements answered it: 90 percent parsed cleanly, the rest needed a manual fallback.

A minimum viable product (MVP) answers a different question: will people use and pay for this? It goes in front of real customers. It can be ugly and partly manual behind the scenes. The same fintech founder's MVP was a form, a spreadsheet and a weekly email report sent by hand to 12 small businesses, and 5 of them paid 40 euros a month within six weeks.

Common mistake: founders call a polished POC an MVP and wait months to show it to anyone. Another one: building the MVP before checking the risky technical part, then discovering it doesn't work.

Rule of thumb I give: if the riskiest assumption is technical, do the POC first. If it's about demand, skip the POC and do the scrappiest MVP you can. Most founders I meet have a demand risk, not a technical one.`,
  },
  {
    title: "Checklist: hiring your first engineer",
    content: `What I tell founders before they hire engineer number one.

1. Write down what they will build in their first 90 days. If you can't, you're not ready to hire; you need scoping first.
2. Hire for range, not depth. The first engineer will touch the database, the frontend, the deploys and the support inbox.
3. Pay for a short paid trial project, one or two weeks, on real but non-critical work. It tells you more than any interview.
4. Check how they explain trade-offs to a non-technical person. You will be that person every week.
5. Don't hire your first engineer as a manager. You need someone who ships, not someone who builds a team around a product that doesn't exist yet.
6. Get a technical person you trust to sit in on the final interview, even for an hour. A founder I advised in 2024 skipped this and hired someone who had only ever maintained one legacy system; they parted ways after four months.
7. Equity matters more than title. A first engineer is taking founder-level risk on a salary that is usually below market.

The most common failure I see is hiring too early, before the product is scoped, and then paying a senior salary for someone to wait for decisions.`,
  },
] as const;

export const EVAL_FIXTURE = {
  clerkId: "user_test_eval_quality",
  email: "eval-quality@example.test",
  profile: {
    fullName: "Maya Okafor",
    jobTitle: "Fractional CTO",
    company: "Northbeam Labs",
    language: "en-GB",
    timezone: "Europe/Lisbon",
  },
  memory: {
    "identity/about": ABOUT,
    "identity/story": STORY,
    "identity/personal": PERSONAL,
    "writing/rules": RULES,
    "voice/style": VOICE_MEMORY,
  } as Record<string, string>,
  strategy: STRATEGY,
  knowledge: KNOWLEDGE,
  writingStyle: { name: "Maya's voice", tagline: "Blunt, calm, example-first", guide: WRITING_STYLE_GUIDE },
} as const;

/** Deletes the eval user, its team and (by cascade) its profile and everything under it. */
export async function removeEvalUser(): Promise<void> {
  const clerkId = EVAL_FIXTURE.clerkId;
  await prisma.team.deleteMany({ where: { name: { endsWith: TEAM_SUFFIX }, memberships: { some: { user: { clerkId } } } } });
  await prisma.user.deleteMany({ where: { clerkId } });
}

/**
 * A fresh eval user with the full fixture. Any previous eval user is removed first. With an embedder the knowledge
 * chunks get embeddings (as the app's ingest job does); without one they are full-text only.
 */
export async function seedEvalProfile(opts: { embedder?: Embedder | null } = {}): Promise<{ userId: string; profileId: string }> {
  await removeEvalUser();
  const acc = await ensureAccount({
    clerkId: EVAL_FIXTURE.clerkId,
    email: EVAL_FIXTURE.email,
    firstName: "Maya",
    teamNameSuffix: TEAM_SUFFIX,
  });
  const profileId = acc.currentProfile!.id;
  await prisma.profile.update({ where: { id: profileId }, data: { ...EVAL_FIXTURE.profile, onboardingCompleted: true } });

  for (const [key, content] of Object.entries(EVAL_FIXTURE.memory)) await upsertMemory(profileId, key, content, "USER");
  await saveStrategy(profileId, EVAL_FIXTURE.strategy);

  for (const k of EVAL_FIXTURE.knowledge) {
    const item = await createKnowledge(profileId, { type: "TEXT", title: k.title, content: k.content });
    const embedding = opts.embedder ? ((await opts.embedder.embed([`${k.title}\n\n${k.content}`]))[0] ?? null) : null;
    await replaceChunks(profileId, "KNOWLEDGE", item.id, [{ ordinal: 0, title: k.title, text: k.content, embedding }]);
  }

  const style = await prisma.voiceStyle.create({
    data: { profileId, kind: "OWN", samplePosts: [], ...EVAL_FIXTURE.writingStyle },
  });
  await prisma.profile.update({ where: { id: profileId }, data: { voiceStyleId: style.id } });
  return { userId: acc.user.id, profileId };
}

/** Rows that would still belong to the eval user or the given profile. All zero after `removeEvalUser`. */
export async function evalRowsLeft(profileId: string) {
  const clerkId = EVAL_FIXTURE.clerkId;
  const byProfile = { where: { profileId } };
  const [users, teams, profiles, memoryDocs, strategies, voiceStyles, knowledgeItems, knowledgeChunks, chats, documents] =
    await Promise.all([
      prisma.user.count({ where: { clerkId } }),
      // Any team named like ours, with or without members, so an orphaned team is caught too.
      prisma.team.count({ where: { name: { endsWith: TEAM_SUFFIX } } }),
      prisma.profile.count({ where: { id: profileId } }),
      prisma.memoryDoc.count(byProfile),
      prisma.strategy.count(byProfile),
      prisma.voiceStyle.count(byProfile),
      prisma.knowledgeItem.count(byProfile),
      prisma.knowledgeChunk.count(byProfile),
      prisma.chat.count(byProfile),
      prisma.document.count(byProfile),
    ]);
  return { users, teams, profiles, memoryDocs, strategies, voiceStyles, knowledgeItems, knowledgeChunks, chats, documents };
}
