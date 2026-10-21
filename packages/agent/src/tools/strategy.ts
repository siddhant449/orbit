import { FORMATS, GOALS, StrategySchema, type Format, type Goal } from "@brandloop/ai";
import { getStrategy, strategyThemesMarkdown, type Strategy as StrategyRow } from "@brandloop/db";
import { tool } from "ai";
import { z } from "zod";
import type { TurnContext } from "../context";
import { capOutput } from "./cap";

export const NO_STRATEGY =
  "No content strategy yet. The user can build one on the Strategy page; until then, work from memory and ask about their goals.";

function formatsBlock(formats: { format: Format; perWeek: number; note: string }[]): string[] {
  if (formats.length === 0) return [];
  return ["", "## Formats", "", ...formats.map((f) => `- ${FORMATS[f.format]?.label ?? f.format}: ${f.perWeek} per week${f.note ? ` (${f.note})` : ""}`)];
}

/** The strategy as markdown: goal, the themes mirror and formats. Partial strategies render what they have. */
export function strategyMarkdown(row: StrategyRow): string {
  const { id: _id, profileId: _p, generatedAt: _g, updatedAt: _u, ...fields } = row;
  const parsed = StrategySchema.safeParse(fields);
  const goal = row.goal && row.goal in GOALS ? GOALS[row.goal as Goal].label : row.goal;
  const head = ["# Content strategy", "", `- Goal: ${goal ?? "not set"}`];
  if (parsed.success) {
    return [...head, "", strategyThemesMarkdown(parsed.data), ...formatsBlock(parsed.data.contentFormats)].join("\n");
  }
  const lines = [
    row.positioning && `- Positioning: ${row.positioning}`,
    row.tagline && `- Tagline: ${row.tagline}`,
    row.expertise && `- Expertise: ${row.expertise}`,
  ].filter((l): l is string => Boolean(l));
  return [...head, ...lines, "", "(This strategy is incomplete.)"].join("\n");
}

export function strategyTools(ctx: TurnContext) {
  return {
    getContentStrategy: tool({
      description: "Read the user's content strategy: goal, positioning, tagline, content pillars and formats.",
      inputSchema: z.object({}),
      execute: async () => {
        const row = await getStrategy(ctx.profileId);
        return capOutput(row ? strategyMarkdown(row) : NO_STRATEGY);
      },
    }),
  };
}
