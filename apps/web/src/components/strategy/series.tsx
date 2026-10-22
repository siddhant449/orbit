"use client";

import { EditableText, Section, useStrategy } from "./edit";
import { NativeSelect } from "@brandloop/ui";

const DAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;

export function Series() {
  const { strategy, save } = useStrategy();
  const patch = (i: number, p: Partial<(typeof strategy.recurringSeries)[number]>) =>
    save({ recurringSeries: strategy.recurringSeries.map((r, j) => (j === i ? { ...r, ...p } : r)) });

  return (
    <Section title="Recurring series" description="Posts your audience can expect on the same day each week.">
      <ul className="divide-y divide-line">
        {strategy.recurringSeries.map((r, i) => (
          <li key={`${i}-${r.name}`} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
            <div className="min-w-0 flex-1">
              <EditableText label={`series ${i + 1} name`} multiline={false} value={r.name} onSave={(name) => patch(i, { name })} className="text-[14px] font-medium text-text" />
              <EditableText label={`${r.name} description`} value={r.description} onSave={(description) => patch(i, { description })} className="text-[14px] leading-[1.55] text-text-soft" />
            </div>
            <NativeSelect
              aria-label={`${r.name} day`}
              value={r.weekday}
              onChange={(e) => void patch(i, { weekday: e.target.value as typeof r.weekday })}
              className="w-full sm:w-36"
            >
              {DAYS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </li>
        ))}
      </ul>
    </Section>
  );
}
