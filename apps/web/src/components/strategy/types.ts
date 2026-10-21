import type { Strategy as StrategyInput } from "@brandloop/ai";

type Row = {
  goal: string | null;
  goalWhy: string | null;
  positioning: string | null;
  positioningWhy: string | null;
  tagline: string | null;
  expertise: string | null;
  expertiseWhy: string | null;
  contentMix: unknown;
  audienceBalance: unknown;
  contentFormats: unknown;
  recurringSeries: unknown;
};

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Turns a stored strategy row into the shape the editor and the save action use. */
export function toInput(row: Row): StrategyInput {
  return {
    goal: (row.goal as StrategyInput["goal"]) ?? "build_authority",
    goalWhy: row.goalWhy ?? "",
    positioning: row.positioning ?? "",
    positioningWhy: row.positioningWhy ?? "",
    tagline: row.tagline ?? "",
    expertise: row.expertise ?? "",
    expertiseWhy: row.expertiseWhy ?? "",
    contentMix: arr(row.contentMix),
    audienceBalance: arr(row.audienceBalance),
    contentFormats: arr(row.contentFormats),
    recurringSeries: arr(row.recurringSeries),
  };
}
