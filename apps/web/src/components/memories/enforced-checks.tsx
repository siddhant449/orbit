import { enforcedChips } from "@brandloop/agent/client";

/** Under the writing preferences: which rules Orbit checks in code, and how many only guide the writer (design §3.1). */
export function EnforcedChecks({ markdown }: { markdown: string }) {
  const { chips, guidance } = enforcedChips(markdown);
  if (chips.length === 0 && guidance === 0) return null;
  return (
    <div data-enforced-checks className="flex flex-col gap-2 px-1 text-[13px] text-text-2">
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span id="enforced-label" className="text-text-3">
            Enforced as checks
          </span>
          <ul aria-labelledby="enforced-label" className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <li key={c} className="inline-flex h-7 items-center rounded-pill border border-line-3 px-3 text-[12px] font-medium text-text-2">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {guidance > 0 && <p className="text-text-3">{guidance === 1 ? "1 other rule guides the writer." : `${guidance} other rules guide the writer.`}</p>}
    </div>
  );
}
