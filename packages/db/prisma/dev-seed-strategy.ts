// Dev-only: upserts a sample strategy for the profile of the user with the given email.
// Usage: tsx prisma/dev-seed-strategy.ts <email>
import "dotenv/config";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: tsx prisma/dev-seed-strategy.ts <email>");
  process.exit(1);
}

const { prisma } = await import("../src/client");
const { saveStrategy } = await import("../src/services/strategy");

const user = await prisma.user.findFirst({ where: { email } });
if (!user) {
  console.error(`No user with email ${email}. Sign in once first.`);
  process.exit(1);
}
const profileId =
  user.currentProfileId ??
  (await prisma.profile.findFirst({ where: { ownerUserId: user.id, deletedAt: null }, orderBy: { createdAt: "asc" } }))?.id;
if (!profileId) {
  console.error("User has no profile.");
  process.exit(1);
}

await saveStrategy(profileId, {
  goal: "build_authority",
  goalWhy: "You have years of hands-on design systems work that few people on LinkedIn explain well, so being known for it opens doors.",
  positioning: "The design systems lead who helps teams ship interfaces people actually reuse",
  positioningWhy: "Most voices in this space talk about components. You talk about adoption, which is where systems succeed or fail.",
  tagline: "Design systems that teams actually use",
  expertise: "Design systems, component libraries and design-to-code workflows",
  expertiseWhy: "Your story and projects show a decade of building and rolling out systems across product teams.",
  contentMix: [
    { type: "educational", percent: 35 },
    { type: "authority", percent: 25 },
    { type: "personal", percent: 20 },
    { type: "lead_magnet", percent: 10 },
    { type: "sales", percent: 10 },
  ],
  audienceBalance: [
    { level: "broad", percent: 50, note: "Everyday lessons any product person can use" },
    { level: "narrow", percent: 30, note: "Design systems craft for practitioners" },
    { level: "niche", percent: 20, note: "Adoption playbooks for heads of design" },
  ],
  contentFormats: [
    { format: "text", perWeek: 3, note: "Your core format. Short lessons with one clear point." },
    { format: "carousel", perWeek: 1, note: "Step-by-step breakdowns people save." },
    { format: "poll", perWeek: 1, note: "Quick questions that start conversations." },
  ],
  recurringSeries: [
    { name: "Teardown Tuesday", weekday: "tue", description: "Take apart one real component and explain the choices behind it." },
    { name: "Friday field notes", weekday: "fri", description: "One thing you learned this week from rolling out a system." },
  ],
}, true);
console.log("Seeded strategy for", email);
await prisma.$disconnect();
