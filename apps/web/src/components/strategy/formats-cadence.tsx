"use client";

import { FORMATS } from "@brandloop/ai";
import { EditableText, NumberField, Section, useStrategy } from "./edit";

export function FormatsCadence() {
  const { strategy, save } = useStrategy();
  const patch = (i: number, p: Partial<(typeof strategy.contentFormats)[number]>) =>
    save({ contentFormats: strategy.contentFormats.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const total = strategy.contentFormats.reduce((a, f) => a + f.perWeek, 0);

  return (
    <Section title="Formats and cadence" description={`How the strategy shows up each week. About ${total} ${total === 1 ? "post" : "posts"} a week.`}>
      <ul className="divide-y divide-line">
        {strategy.contentFormats.map((f, i) => (
          <li key={f.format} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-text">{FORMATS[f.format].label}</p>
              <EditableText label={`${FORMATS[f.format].label} note`} value={f.note} onSave={(note) => patch(i, { note })} className="text-[14px] leading-[1.55] text-text-soft" />
            </div>
            <NumberField value={f.perWeek} label={`${FORMATS[f.format].label} posts per week`} suffix="a week" max={21} onSave={(n) => patch(i, { perWeek: n })} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
