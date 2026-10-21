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
      <ul className="space-y-5">
        {items.map((a, i) => {
          const l = AUDIENCE_LEVELS[a.level];
          return (
            <li key={a.level}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">
                  {l.label} <span className="font-normal text-ink-muted">{l.description}</span>
                </p>
                <NumberField value={a.percent} label={`${l.label} percent`} suffix="%" onSave={(n) => patch(i, { percent: n })} />
              </div>
              <div
                role="meter"
                aria-label={`${l.label} share`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={a.percent}
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunk"
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${a.percent}%` }} />
              </div>
              <EditableText label={`${l.label} note`} value={a.note} onSave={(note) => patch(i, { note })} className="mt-1.5 text-sm text-ink-muted" />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
