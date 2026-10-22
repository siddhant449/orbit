/** The material that makes drafts better (design §8): the user's own proof, not generic advice. */
export const WHAT_HELPS = [
  "A client result with numbers",
  "A story with a date",
  "An opinion you would defend",
  "A question clients keep asking",
  "Notes from a talk or workshop",
] as const;

export function WhatHelps({ className }: { className?: string }) {
  return (
    <div data-what-helps className={className}>
      <p className="text-[13px] font-medium text-text">What makes drafts better</p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] leading-[1.55] text-text-2">
        {WHAT_HELPS.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
    </div>
  );
}
