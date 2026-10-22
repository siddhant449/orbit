"use client";

import { useState } from "react";
import { CONTENT_TYPES, normalizePercents } from "@brandloop/ai";
import { CountUp, cn } from "@brandloop/ui";
import { NumberField, Section, useStrategy } from "./edit";

/** One accent family (system §1.2), heaviest first, mixed into the panel so every step reads in both themes. */
const SHADES = [
  "var(--accent-text)",
  "color-mix(in oklab, var(--accent-text) 74%, var(--panel))",
  "color-mix(in oklab, var(--accent-text) 54%, var(--panel))",
  "color-mix(in oklab, var(--accent-text) 36%, var(--panel))",
  "color-mix(in oklab, var(--accent-text) 22%, var(--panel))",
];

const R = 70;
const C = 2 * Math.PI * R;
const GAP = 3;

export function ContentMix() {
  const { strategy, save } = useStrategy();
  const [active, setActive] = useState<number | null>(null);
  const mix = normalizePercents(strategy.contentMix);

  const arcs = mix.map((m, i) => {
    const before = mix.slice(0, i).reduce((a, x) => a + x.percent, 0);
    const len = (m.percent / 100) * C;
    return { i, dash: Math.max(0, len - (mix.length > 1 ? GAP : 0)), offset: (before / 100) * C };
  });

  const setPercent = (i: number, percent: number) =>
    save({ contentMix: strategy.contentMix.map((m, j) => (j === i ? { ...m, percent } : m)) });

  const act = (i: number | null) => ({
    onMouseEnter: () => setActive(i),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(i),
    onBlur: () => setActive(null),
  });

  return (
    <Section title="Content mix" description="How often to post each type.">
      <div className="grid items-center gap-8 md:grid-cols-[240px_1fr] md:gap-10">
        <div className="relative mx-auto size-[220px] md:size-[240px]">
          <svg viewBox="0 0 200 200" role="group" aria-label="Content mix chart" className="size-full -rotate-90">
            <circle cx="100" cy="100" r={R} fill="none" stroke="var(--line-2)" strokeWidth="34" />
            {arcs.map(({ i, dash, offset: off }) => (
              <circle
                key={mix[i]!.type}
                data-testid="mix-segment"
                tabIndex={0}
                role="img"
                aria-label={`${CONTENT_TYPES[mix[i]!.type].label}, ${mix[i]!.percent}%`}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={SHADES[i % SHADES.length]}
                strokeWidth={active === i ? 40 : 34}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-off}
                opacity={active === null || active === i ? 1 : 0.35}
                className="cursor-pointer transition-[stroke-width,opacity] duration-150 focus-visible:outline-none"
                {...act(i)}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="type-stat tabular-nums text-text">
              <CountUp value={active === null ? 100 : mix[active]!.percent} suffix="%" />
            </span>
            <span className="mt-1.5 max-w-[110px] text-[12px] leading-snug text-text-2">
              {active === null ? "of your posts" : CONTENT_TYPES[mix[active]!.type].label}
            </span>
          </div>
        </div>

        <ul className="divide-y divide-line" aria-label="Content mix breakdown">
          {mix.map((m, i) => {
            const t = CONTENT_TYPES[m.type];
            return (
              <li
                key={m.type}
                data-testid="mix-row"
                data-selected={active === i ? "" : undefined}
                {...act(i)}
                className={cn(
                  "orbit-transition -mx-3 flex items-start gap-3 rounded-[12px] px-3 py-3.5",
                  active === i && "bg-line-row",
                )}
              >
                <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: SHADES[i % SHADES.length] }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-text">{t.label}</p>
                  <p className="text-[14px] leading-[1.5] text-text-soft">{t.description}</p>
                  <p className="mt-1 text-[12px] text-text-2">{t.examples.join(", ")}</p>
                </div>
                <NumberField value={m.percent} label={`${t.label} percent`} suffix="%" testId="mix-percent" onSave={(n) => setPercent(i, n)} />
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
