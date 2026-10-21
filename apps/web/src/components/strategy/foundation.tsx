"use client";

import { GOALS, type Goal } from "@brandloop/ai";
import { Label, NativeSelect } from "@brandloop/ui";
import { EditableText, Section, useStrategy } from "./edit";

export function Foundation() {
  const { strategy: s, save } = useStrategy();
  return (
    <Section title="Strategy foundation" description="Who you are on LinkedIn, and what the rest of the plan builds on.">
      <div className="space-y-6">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="strategy-goal">Goal</Label>
          <NativeSelect id="strategy-goal" value={s.goal} onChange={(e) => void save({ goal: e.target.value as Goal })}>
            {Object.entries(GOALS).map(([value, g]) => (
              <option key={value} value={value}>
                {g.label}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-ink-muted">{GOALS[s.goal].tagline}</p>
          <EditableText label="why this goal" value={s.goalWhy} onSave={(goalWhy) => save({ goalWhy })} className="text-sm leading-relaxed text-ink-muted" />
        </div>

        <div>
          <h3 className="text-sm font-medium text-ink-muted">Positioning</h3>
          <EditableText label="positioning" value={s.positioning} onSave={(positioning) => save({ positioning })} className="mt-1 font-display text-xl font-semibold leading-snug tracking-[-0.01em]" />
          <EditableText label="why this positioning" value={s.positioningWhy} onSave={(positioningWhy) => save({ positioningWhy })} className="mt-1 text-sm leading-relaxed text-ink-muted" />
        </div>

        <div>
          <h3 className="text-sm font-medium text-ink-muted">Tagline</h3>
          <EditableText label="tagline" multiline={false} value={s.tagline} onSave={(tagline) => save({ tagline })} className="mt-1 text-[15px]" />
        </div>

        <div>
          <h3 className="text-sm font-medium text-ink-muted">Expertise</h3>
          <EditableText label="expertise" value={s.expertise} onSave={(expertise) => save({ expertise })} className="mt-1 text-[15px]" />
          <EditableText label="why this expertise" value={s.expertiseWhy} onSave={(expertiseWhy) => save({ expertiseWhy })} className="mt-1 text-sm leading-relaxed text-ink-muted" />
        </div>
      </div>
    </Section>
  );
}
