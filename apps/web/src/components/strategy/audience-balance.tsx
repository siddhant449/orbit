"use client";

import { AUDIENCE_LEVELS, normalizePercents } from "@brandloop/ai";
import { EditableText, NumberField, Section, useStrategy } from "./edit";

export function AudienceBalance() {
  const { strategy, save } = useStrategy();
  const items = normalizePercents(strategy.audienceBalance);
  const patch = (i: number, p: Partial<(typeof items)[number]>) =>
    save({ audienceBalance: strategy.audienceBalance.map((a, j) => (j === i ? { ...a, ...p } : a)) });

  return (
    <Section title="Audience balance" description="Target this breakdown across your content.">
      <ul className="flex flex-col gap-6">
        {items.map((a, i) => {
          const l = AUDIENCE_LEVELS[a.level];
          return (
            <li key={a.level}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[14px] font-medium text-text">
                  {l.label} <span className="font-normal text-text-2">{l.description}</span>
                </p>
                <NumberField value={a.percent} label={`${l.label} percent`} suffix="%" onSave={(n) => patch(i, { percent: n })} />
              </div>
              <div
                role="meter"
                aria-label={`${l.label} share`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={a.percent}
                className="mt-2.5 h-1.5 overflow-hidden rounded-pill bg-line-2"
              >
                {/* Progress bar (system §6.16): accent fill on a line-2 track; the width eases when the share changes. */}
                <div
                  className="h-full rounded-pill bg-accent motion-safe:transition-[width] motion-safe:duration-[900ms] motion-safe:ease-[var(--ease-out)]"
                  style={{ width: `${a.percent}%` }}
                />
              </div>
              <EditableText label={`${l.label} note`} value={a.note} onSave={(note) => patch(i, { note })} className="mt-2 text-[14px] leading-[1.55] text-text-soft" />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
