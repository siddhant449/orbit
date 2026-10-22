/**
 * Format selection (design §5): which block plan the writer is asked to follow. An explicit pick in the composer wins;
 * otherwise the post type implies one (a story is paragraphs, a framework or how-to is a list, an analysis is a few chunky
 * blocks, a short post is tight lines), and the style's list share breaks ties.
 */
import type { PostType, StyleProfile } from "@brandloop/ai/style";
import { FRAMEWORKS, TEMPLATES, type BlockPlan } from "../library";

export const FORMAT_IDS: ReadonlySet<string> = new Set([...FRAMEWORKS.map((f) => f.id), ...TEMPLATES.map((t) => t.id)]);

export type Format = { id: string | null; plan: BlockPlan; source: "picked" | "post-type" | "style" | "default"; skeleton: string | null; name: string | null };

const prose = (lines: [number, number], note: string) => ({ kind: "prose" as const, lines, note });
const hook = { kind: "hook" as const, lines: [1, 1] as [number, number], note: "The opening line" };
const close = (note: string) => ({ kind: "close" as const, lines: [1, 1] as [number, number], note });

function planFor(type: PostType | null, listKind: "bullets" | "numbered"): BlockPlan {
  const list = { kind: listKind, lines: [3, 5] as [number, number], note: "Parallel items, one per line, a short lead-in before them" };
  switch (type) {
    case "framework":
    case "how-to":
      return [hook, prose([1, 2], "Set-up"), list, close("The one to start with")];
    case "story":
      return [hook, prose([2, 3], "What happened"), prose([2, 3], "What changed"), close("A plain takeaway")];
    case "analysis":
      return [hook, prose([2, 3], "The finding"), prose([2, 3], "Why it holds"), prose([2, 3], "What to do"), close("The rule")];
    case "short":
      return [hook, prose([1, 2], "The point"), close("The ending line")];
    case "news":
      return [hook, prose([1, 2], "What happened, with the date"), { ...list, lines: [2, 3] as [number, number] }, close("What it means")];
    case "opinion":
      return [hook, prose([2, 3], "The reason"), prose([1, 2], "The objection, answered"), close("The position, restated")];
    default:
      return [hook, prose([2, 3], "The point"), prose([2, 3], "The example"), close("The ending line")];
  }
}

/** A template's skeleton read as a plan: blank-line blocks, "1." lines are numbered, "-" lines are bullets. */
function planFromSkeleton(skeleton: string): BlockPlan {
  return skeleton.split(/\n\s*\n/).map((block, i) => {
    const lines = block.split("\n").filter((l) => l.trim());
    const numbered = lines.filter((l) => /^\d+\./.test(l.trim())).length >= 2;
    const bullets = lines.filter((l) => /^-\s/.test(l.trim())).length >= 2;
    return { kind: numbered ? "numbered" : bullets ? "bullets" : i === 0 ? "hook" : "prose", lines: [lines.length, lines.length] as [number, number], note: "" } as BlockPlan[number];
  });
}

export function selectFormat(input: { selectedFormatId: string | null; postType: PostType | null; style: StyleProfile | null; request: string }): Format {
  const picked = input.selectedFormatId;
  if (picked) {
    const fw = FRAMEWORKS.find((f) => f.id === picked);
    if (fw) return { id: fw.id, plan: fw.plan, source: "picked", skeleton: null, name: fw.name };
    const t = TEMPLATES.find((x) => x.id === picked);
    if (t) return { id: t.id, plan: planFromSkeleton(t.skeleton), source: "picked", skeleton: t.skeleton, name: t.title };
  }
  const l = input.style?.layout.listPosts;
  const listKind = l && l.numbered > l.bullet ? "numbered" : "bullets";
  if (input.postType) return { id: null, plan: planFor(input.postType, listKind), source: "post-type", skeleton: null, name: null };
  if (l && l.bullet + l.numbered >= 50) return { id: null, plan: planFor("how-to", listKind), source: "style", skeleton: null, name: null };
  return { id: null, plan: planFor(null, listKind), source: "default", skeleton: null, name: null };
}

export const planHasList = (plan: BlockPlan) => plan.some((b) => b.kind === "bullets" || b.kind === "numbered");

/** The writer's `<format>` block (at most 1,200 characters). */
export function renderFormatBlock(f: Format): string {
  const steps = f.plan.map((b, i) => `${i + 1}. ${b.kind}, ${b.lines[0] === b.lines[1] ? b.lines[0] : `${b.lines[0]}-${b.lines[1]}`} line(s)${b.note ? `: ${b.note}` : ""}`);
  const head = f.source === "picked" ? `The user picked this format${f.name ? ` ("${f.name}")` : ""}. Follow its block order.` : "Suggested block plan (adapt it to the material):";
  const out = [head, ...steps];
  if (f.skeleton) out.push("Skeleton to fill with the user's real material (every [slot] must be filled or the post is not ready):", f.skeleton);
  return out.join("\n").slice(0, 1_200);
}
