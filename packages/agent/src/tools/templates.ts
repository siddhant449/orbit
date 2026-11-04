import { getStrategy, getTemplateBySlug, listMemory, listTemplates, recentTemplateUses, templateScores, type TemplateRow } from "@brandloop/db";
import { tool } from "ai";
import { z } from "zod";
import type { TurnContext } from "../context";
import { CATEGORIES } from "../library/categories";
import { pickTemplate, type PickEvidence } from "../library/pick";
import { runTool } from "./run";

const RECENT_LIMIT = 10;
const SEARCH_RESULTS = 8;
const WORD = /[\p{L}\p{N}]{3,}/gu;

const words = (text: string) => (text.toLowerCase().match(WORD) ?? []);

/** The post templates this profile may use: the shipped ones and its own. Other profiles' templates never show up. */
export async function postTemplates(profileId: string): Promise<TemplateRow[]> {
  const { items } = await listTemplates({ type: "POST", ownerProfileId: profileId, limit: 2_000 });
  return items.filter((t) => t.system || t.profileId === profileId);
}

const niches = new WeakMap<TurnContext, Promise<string[]>>();

/** Lowercase words from the content pillars (recurring series) and the memory topics, loaded once per turn. */
export function nicheTerms(ctx: TurnContext): Promise<string[]> {
  let p = niches.get(ctx);
  if (!p) {
    p = (async () => {
      const [strategy, docs] = await Promise.all([getStrategy(ctx.profileId).catch(() => null), listMemory(ctx.profileId).catch(() => [])]);
      const series = Array.isArray(strategy?.recurringSeries) ? (strategy!.recurringSeries as { name?: unknown }[]) : [];
      const pillars = series.flatMap((s) => (typeof s?.name === "string" ? words(s.name) : []));
      const topics = docs.filter((d) => d.key.startsWith("topics/")).flatMap((d) => words(d.key.slice("topics/".length).replace(/-/g, " ")));
      return [...new Set([...pillars, ...topics])];
    })();
    niches.set(ctx, p);
  }
  return p;
}

/** Auto-picks a template for a new post, or null when none fits (or the library cannot be read). */
export async function autoPickTemplate(
  ctx: TurnContext,
  input: { category: string | null; evidence: PickEvidence; seed: string; filter?: (t: TemplateRow) => boolean },
): Promise<TemplateRow | null> {
  try {
    const [all, recent, scores, terms] = await Promise.all([
      postTemplates(ctx.profileId),
      recentTemplateUses(ctx.profileId, RECENT_LIMIT),
      templateScores(ctx.profileId),
      nicheTerms(ctx),
    ]);
    const candidates = input.filter ? all.filter(input.filter) : all;
    const category = input.category && CATEGORIES.some((c) => c.id === input.category) ? input.category : null;
    return pickTemplate({ candidates, category, evidence: input.evidence, recent: recent.map((r) => r.templateId), scores, nicheTerms: terms, seed: input.seed });
  } catch (err) {
    console.error(`[agent] template pick failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

const summary = (t: TemplateRow) => `- ${t.slug} | ${t.title} | ${t.category}${t.needs.length ? ` | needs ${t.needs.join(", ")}` : ""} | ${t.why}`;

export function templateTools(ctx: TurnContext) {
  return {
    searchTemplates: tool({
      description:
        "Find post templates by name or kind when the user asks for a specific structure (for example \"use a listicle\" or \"a before and after post\"). All filters are optional (pass null to skip). Returns up to 8 templates with their slug. To use one, pass its slug as `templateSlug` to delegateWriting. Do not search when the user did not ask for a structure: the server picks one.",
      inputSchema: z.object({
        query: z.string().max(100).nullable(),
        category: z.string().max(40).nullable().describe(`One of: ${CATEGORIES.map((c) => c.id).join(", ")}.`),
      }),
      execute: ({ query, category }) =>
        runTool("searchTemplates", "template library", async () => {
          const { items } = await listTemplates({ type: "POST", ownerProfileId: ctx.profileId, ...(category ? { category } : {}), ...(query?.trim() ? { search: query.trim() } : {}), limit: 60 });
          const mine = items.filter((t) => t.system || t.profileId === ctx.profileId).slice(0, SEARCH_RESULTS);
          return mine.length ? mine.map(summary).join("\n") : "No templates matched. Try a broader word or no category.";
        }),
    }),
    readTemplate: tool({
      description: "Read one post template: its skeleton, beats and what the writer must be given. Use the slug from searchTemplates.",
      inputSchema: z.object({ slug: z.string().min(1).max(200) }),
      execute: ({ slug }) =>
        runTool("readTemplate", "template library", async () => {
          const t = await getTemplateBySlug(slug);
          if (!t || !(t.system || t.profileId === ctx.profileId)) return "Failed: no template with that slug. Search again.";
          return [summary(t), "", "Skeleton:", t.skeleton, "", `Beats: ${t.beats.join(" / ")}`].join("\n");
        }),
    }),
  };
}
