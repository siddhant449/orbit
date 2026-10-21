"use client";

import { useState } from "react";
import { CONTENT_TYPES, normalizePercents } from "@brandloop/ai";
import { cn } from "@brandloop/ui";
import { NumberField, Section, useStrategy } from "./edit";

/** Accent family derived from tokens, ordered dark to light. Each step also reads in dark mode. */
const SHADES = [
  "color-mix(in oklab, var(--accent) 62%, var(--ink))",
  "var(--accent)",
  "color-mix(in oklab, var(--accent) 68%, var(--surface))",
  "color-mix(in oklab, var(--accent) 42%, var(--surface))",
  "color-mix(in oklab, var(--accent) 22%, var(--surface))",
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
      <div className="grid items-center gap-6 sm:grid-cols-[220px_1fr] sm:gap-8">
        <div className="relative mx-auto size-[200px] sm:size-[220px]">
          <svg viewBox="0 0 200 200" role="group" aria-label="Content mix chart" className="size-full -rotate-90">
            <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-sunk)" strokeWidth="34" />
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
            <span className="font-display text-2xl font-semibold tabular-nums">
              {active === null ? "100%" : `${mix[active]!.percent}%`}
            </span>
            <span className="max-w-[90px] text-xs text-ink-muted">
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
                {...act(i)}
                className={cn("-mx-2 flex items-start gap-3 rounded-row px-2 py-3 transition-colors", active === i && "bg-surface-sunk")}
              >
                <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-[4px]" style={{ background: SHADES[i % SHADES.length] }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-sm text-ink-muted">{t.description}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">{t.examples.join(", ")}</p>
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
