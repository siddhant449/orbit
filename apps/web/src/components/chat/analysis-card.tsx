import { cn } from "@brandloop/ui";
import type { ToolPartLike } from "./tool-row";

type Criterion = { id: string; rating: "strong" | "good" | "needs-work"; note: string };
type Fix = { quote: string; problem: string; rewrite: string; impact: string };
export type Analysis = { source: "open-post" | "pasted"; criteria: Criterion[]; topFixes: Fix[]; optional: string[] };

const LABEL: Record<string, string> = {
  hook: "Hook",
  "fold-layout": "Fold and layout",
  flow: "Flow",
  "voice-rules": "Voice and rules",
  accuracy: "Accuracy",
  "audience-clarity": "Audience clarity",
};
const RATING: Record<Criterion["rating"], string> = { strong: "Strong", good: "Good", "needs-work": "Needs work" };

/** The analysis of a finished analyzePost call, or null for a failure string or anything else. */
export function analysisOf(part: ToolPartLike): Analysis | null {
  if (part.type !== "tool-analyzePost" || part.state !== "output-available") return null;
  const o = part.output as Partial<Analysis> & { success?: unknown };
  if (o?.success !== true || !Array.isArray(o.criteria) || !Array.isArray(o.topFixes)) return null;
  return { source: o.source === "pasted" ? "pasted" : "open-post", criteria: o.criteria, topFixes: o.topFixes, optional: Array.isArray(o.optional) ? o.optional : [] };
}

/** Six criteria, the top fixes in order, and the small stuff folded away. */
export function AnalysisCard({ analysis }: { analysis: Analysis }) {
  return (
    <section aria-label="Post analysis" data-analysis-card className="rounded-card border border-line-3 px-4 py-3.5 text-[13px]">
      <p className="mb-3 font-medium text-text">{analysis.source === "pasted" ? "Analysis of the draft you pasted" : "Analysis of the open post"}</p>
      <ul className="flex flex-col gap-2">
        {analysis.criteria.map((c) => (
          <li key={c.id} data-criterion={c.id} data-rating={c.rating} className="flex flex-wrap items-baseline gap-x-2">
            <span className="w-[124px] shrink-0 font-medium text-text">{LABEL[c.id] ?? c.id}</span>
            <span className={cn("text-[12px] font-medium", c.rating === "needs-work" ? "text-danger" : "text-text-2")}>{RATING[c.rating]}</span>
            <span className="min-w-0 flex-1 basis-[200px] text-text-3">{c.note}</span>
          </li>
        ))}
      </ul>
      {analysis.topFixes.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 font-medium text-text">Fix these first</p>
          <ol data-top-fixes className="flex list-decimal flex-col gap-3 pl-5">
            {analysis.topFixes.map((f, i) => (
              <li key={i} data-top-fix>
                <blockquote className="border-l-2 border-line-4 pl-3 text-text-2">{f.quote}</blockquote>
                <p className="mt-1 text-text">{f.problem}</p>
                <p className="mt-0.5 text-text-3">Try: {f.rewrite}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
      {analysis.optional.length > 0 && (
        <details data-optional className="mt-4">
          <summary className="cursor-pointer font-medium text-text-2">Optional ({analysis.optional.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-text-3">
            {analysis.optional.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
