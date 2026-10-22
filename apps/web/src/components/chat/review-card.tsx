import { CHECK_LABELS } from "@brandloop/agent/client";
import { cn } from "@brandloop/ui";
import type { ToolPartLike } from "./tool-row";

export type ReviewChecks = { id: string; passed: boolean; detail: string }[];

/** The checks of a finished final review (`delegateEditing`), read from the tool part's envelope. Null for anything else. */
export function reviewChecksOf(part: ToolPartLike): ReviewChecks | null {
  if (part.type !== "tool-delegateEditing" || part.state !== "output-available") return null;
  const checks = (part.output as { payload?: { qualityReview?: { deterministicChecks?: unknown } } } | undefined)?.payload?.qualityReview?.deterministicChecks;
  if (!Array.isArray(checks) || checks.length === 0) return null;
  const ok = checks.filter(
    (c): c is { id: string; passed: boolean; detail: string } =>
      typeof c === "object" && c !== null && typeof (c as { id?: unknown }).id === "string" && typeof (c as { passed?: unknown }).passed === "boolean",
  );
  return ok.length ? ok.map((c) => ({ id: c.id, passed: c.passed, detail: String(c.detail ?? "") })) : null;
}

/** The review's deterministic checks: failures first, each with the reason in plain words. */
export function ReviewCard({ checks }: { checks: ReviewChecks }) {
  const failed = checks.filter((c) => !c.passed);
  const rows = [...failed, ...checks.filter((c) => c.passed)];
  return (
    <section aria-label="Review checks" data-review-card className="rounded-card border border-line-3 px-4 py-3 text-[13px]">
      <p className="mb-2 font-medium text-text">{failed.length === 0 ? "All checks passed" : `${failed.length} ${failed.length === 1 ? "check" : "checks"} failed`}</p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((c) => (
          <li key={c.id} data-check={c.id} data-passed={c.passed} className="flex flex-wrap gap-x-2">
            <span className={cn("font-medium", c.passed ? "text-text-2" : "text-danger")}>
              {CHECK_LABELS[c.id] ?? c.id}
              <span className="sr-only">{c.passed ? " passed" : " failed"}</span>
            </span>
            <span className="text-text-3">{c.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
