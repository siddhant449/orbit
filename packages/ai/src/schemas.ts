import { z } from "zod";

export const GoalSchema = z.enum(["get_customers", "build_authority", "grow_audience"]);
export const ContentTypeSchema = z.enum([
  "lead_magnet",
  "personal",
  "authority",
  "sales",
  "educational",
]);
export const AudienceLevelSchema = z.enum(["broad", "narrow", "niche"]);
export const FormatSchema = z.enum(["text", "image", "carousel", "video", "newsletter", "poll"]);

export type Goal = z.infer<typeof GoalSchema>;
export type ContentType = z.infer<typeof ContentTypeSchema>;
export type AudienceLevel = z.infer<typeof AudienceLevelSchema>;
export type Format = z.infer<typeof FormatSchema>;

export const GOALS: Record<Goal, { label: string; tagline: string }> = {
  get_customers: { label: "Get customers", tagline: "Turn content into business growth" },
  build_authority: { label: "Build authority", tagline: "Become known for your expertise" },
  grow_audience: { label: "Grow audience", tagline: "Reach more people, grow your following" },
};

export const CONTENT_TYPES: Record<
  ContentType,
  { label: string; description: string; examples: string[] }
> = {
  lead_magnet: {
    label: "Lead magnet",
    description: "Posts that trade value for a signup, comment or DM",
    examples: ["Comment X get Y", "Comment X get DM", "Post to sign-up link"],
  },
  personal: {
    label: "Personal",
    description: "Human stories that build connection and trust",
    examples: [
      "Family",
      "Milestones",
      "Vulnerable moments",
      "Transformations",
      "Burnout",
      "Remote work",
    ],
  },
  authority: {
    label: "Authority",
    description: "Proof of credibility",
    examples: ["Revenue numbers", "Speaking", "Domain expertise", "Results", "Networking"],
  },
  sales: {
    label: "Sales",
    description: "Direct conversion",
    examples: ["Case studies", "Announcements", "CTAs", "Webinars"],
  },
  educational: {
    label: "Educational",
    description: "Teaching",
    examples: [
      "How-to",
      "Listicles",
      "Infographics",
      "Breakdowns",
      "News",
      "Frameworks",
      "Playbooks",
      "Tutorials",
    ],
  },
};

export const AUDIENCE_LEVELS: Record<AudienceLevel, { label: string; description: string }> = {
  broad: { label: "Broad", description: "Top of funnel, aimed at reach and visibility" },
  narrow: { label: "Narrow", description: "Middle of funnel, aimed at engagement and trust" },
  niche: { label: "Niche", description: "Bottom of funnel, aimed at conversions and clients" },
};

export const FORMATS: Record<Format, { label: string }> = {
  text: { label: "Text" },
  image: { label: "Image" },
  carousel: { label: "Carousel" },
  video: { label: "Video" },
  newsletter: { label: "Newsletter" },
  poll: { label: "Poll" },
};

export const StrategySchema = z.object({
  goal: GoalSchema,
  goalWhy: z.string(),
  positioning: z.string(),
  positioningWhy: z.string(),
  tagline: z.string(),
  expertise: z.string(),
  expertiseWhy: z.string(),
  contentMix: z.array(z.object({ type: ContentTypeSchema, percent: z.number() })),
  audienceBalance: z.array(
    z.object({ level: AudienceLevelSchema, percent: z.number(), note: z.string() }),
  ),
  contentFormats: z.array(
    z.object({ format: FormatSchema, perWeek: z.number(), note: z.string() }),
  ),
  recurringSeries: z.array(
    z.object({
      name: z.string(),
      weekday: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
      description: z.string(),
    }),
  ),
});
export type Strategy = z.infer<typeof StrategySchema>;

export const ExtractedMemorySchema = z.object({
  facts: z.array(z.object({ key: z.string(), text: z.string() })),
  refusal: z.boolean(),
});
export type ExtractedMemory = z.infer<typeof ExtractedMemorySchema>;

export const VoiceGuideSchema = z.object({ guide: z.string(), tagline: z.string() });
export type VoiceGuide = z.infer<typeof VoiceGuideSchema>;

/** Round percents and adjust the largest item so the total is exactly 100. */
export function normalizePercents<T extends { percent: number }>(items: T[]): T[] {
  if (items.length === 0) return [];
  const total = items.reduce((a, i) => a + i.percent, 0);
  const scaled =
    total > 0
      ? items.map((i) => Math.round((i.percent / total) * 100))
      : items.map((_, idx) => (idx === 0 ? 100 : 0));
  const diff = 100 - scaled.reduce((a, n) => a + n, 0);
  let largest = 0;
  scaled.forEach((n, idx) => {
    if (n > (scaled[largest] ?? 0)) largest = idx;
  });
  scaled[largest] = (scaled[largest] ?? 0) + diff;
  return items.map((i, idx) => ({ ...i, percent: scaled[idx] as number }));
}
