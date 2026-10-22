/**
 * The compiled writing-style profile (design §2.1). The layout numbers are measured in code (`measureCorpus`), never
 * written by a model; the descriptive parts (voiceTarget, rules, moves, checks) come from an extraction call or are
 * hand-written for the presets. Lives here, not in agent, because db validates and stores it.
 */
import { z } from "zod";

export const STYLE_SCHEMA_VERSION = 1;

export const PostTypeSchema = z.enum(["story", "framework", "how-to", "analysis", "opinion", "news", "short"]);
export type PostType = z.infer<typeof PostTypeSchema>;

export const RangeSchema = z.object({ low: z.number(), typical: z.number(), high: z.number() });

const ENDINGS = ["question", "rule", "cta", "statement", "sources"] as const;

export const LayoutTargetsSchema = z.object({
  hookChars: RangeSchema,
  hookMobileLines: RangeSchema,
  postChars: RangeSchema,
  blocks: RangeSchema,
  blockLineMix: z.object({ one: z.number(), two: z.number(), threePlus: z.number() }),
  proseBlockChars: RangeSchema,
  sentenceWords: RangeSchema,
  listPosts: z.object({ bullet: z.number(), numbered: z.number() }),
  emoji: z.object({ perPost: z.number(), positions: z.array(z.enum(["line-end", "cta", "line-start"])) }),
  hashtagsPerPost: z.number(),
  postscriptPercent: z.number(),
  linkPercent: z.number(),
  endings: z.object({ question: z.number(), rule: z.number(), cta: z.number(), statement: z.number(), sources: z.number() }),
});
export type LayoutTargetsData = z.infer<typeof LayoutTargetsSchema>;

const rule = z.string().min(1).max(200);
export const DoDontSchema = z.object({ do: z.array(rule).max(7), dont: z.array(rule).max(7) });

export const StyleRulesSchema = z.object({
  hooks: DoDontSchema,
  rhythm: DoDontSchema,
  formatting: DoDontSchema,
  diction: DoDontSchema,
  closings: DoDontSchema,
  global: DoDontSchema,
});

export const SignatureMoveSchema = z.object({
  label: z.string().min(1).max(60),
  /** A fill-in template with [slots]. */
  pattern: z.string().min(1).max(300),
  useWhen: z.string().min(1).max(200),
});

export const ReferencePostSchema = z.object({
  text: z.string().min(1).max(3_000),
  postType: PostTypeSchema,
  note: z.string().max(200),
});

export const StyleProfileSchema = z.object({
  schemaVersion: z.literal(STYLE_SCHEMA_VERSION),
  language: z.string().min(2).max(20),
  voiceTarget: z.string().min(1).max(600),
  rules: StyleRulesSchema,
  signatureMoves: z.array(SignatureMoveSchema).max(8),
  finalChecks: z.array(z.string().min(1).max(200)).max(10),
  layout: LayoutTargetsSchema,
  referencePosts: z.array(ReferencePostSchema).min(3).max(5),
  source: z.object({
    kind: z.enum(["preset", "own"]),
    postCount: z.number().int().min(0),
    corpusHash: z.string(),
    compiledAt: z.string(),
    model: z.string().nullable(),
  }),
});
export type StyleProfile = z.infer<typeof StyleProfileSchema>;

/** The descriptive parts only: what a model may write when it compiles an own style (Task W4 builds on this). */
export const StyleDescriptionSchema = StyleProfileSchema.pick({ language: true, voiceTarget: true, rules: true, signatureMoves: true, finalChecks: true });
export type StyleDescription = z.infer<typeof StyleDescriptionSchema>;
export { ENDINGS as ENDING_TYPES };

/**
 * What the extraction call returns: only the parts code cannot measure. Every key is required (nullable, never optional,
 * for OpenAI strict mode). Layout numbers are not here on purpose: they are measured, never estimated by a model.
 */
export const ExtractedStyleSchema = z.object({
  language: z.string().min(2).max(20),
  voiceTarget: z.string().min(1).max(600),
  rules: StyleRulesSchema,
  signatureMoves: z.array(SignatureMoveSchema).max(8),
  finalChecks: z.array(z.string().min(1).max(200)).max(10),
  /** Indexes (0-based) of 3 to 5 of the numbered posts that show the style best. */
  referencePostIndexes: z.array(z.number().int().min(0)).min(3).max(5),
  /** One post type per chosen reference post, in the same order. */
  postTypes: z.array(PostTypeSchema).min(3).max(5),
});
export type ExtractedStyle = z.infer<typeof ExtractedStyleSchema>;
