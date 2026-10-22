"use client";

import { GOALS, type Goal } from "@brandloop/ai";
import { Segmented } from "@brandloop/ui";
import { EditableText, Section, useStrategy } from "./edit";

const GOAL_OPTIONS = Object.entries(GOALS).map(([value, g]) => ({ value: value as Goal, label: g.label }));

function Label({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-[13px] font-medium text-text-2">
      {children}
    </h3>
  );
}

export function Foundation() {
  const { strategy: s, save } = useStrategy();
  return (
    <Section title="Strategy foundation" description="Who you are on LinkedIn, and what the rest of the plan builds on.">
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <Label id="strategy-goal">Goal</Label>
          {/* Segmented control (system §6.4): one tab stop, arrows move the choice and save it. */}
          <Segmented label="Goal" options={GOAL_OPTIONS} value={s.goal} onChange={(goal) => void save({ goal })} className="self-start" />
          <p className="text-[13px] text-text-2">{GOALS[s.goal].tagline}</p>
          <EditableText label="why this goal" value={s.goalWhy} onSave={(goalWhy) => save({ goalWhy })} className="max-w-[68ch] text-[14px] leading-[1.6] text-text-soft" />
        </div>

        <div className="flex flex-col gap-1 border-t border-line pt-6">
          <Label>Positioning</Label>
          <EditableText label="positioning" value={s.positioning} onSave={(positioning) => save({ positioning })} className="type-card-title mt-1 max-w-[40ch] text-text" />
          <EditableText label="why this positioning" value={s.positioningWhy} onSave={(positioningWhy) => save({ positioningWhy })} className="max-w-[68ch] text-[14px] leading-[1.6] text-text-soft" />
        </div>

        <div className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label>Tagline</Label>
            <EditableText label="tagline" multiline={false} value={s.tagline} onSave={(tagline) => save({ tagline })} className="text-[15px] text-text" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Expertise</Label>
            <EditableText label="expertise" value={s.expertise} onSave={(expertise) => save({ expertise })} className="text-[15px] text-text" />
            <EditableText label="why this expertise" value={s.expertiseWhy} onSave={(expertiseWhy) => save({ expertiseWhy })} className="text-[14px] leading-[1.6] text-text-soft" />
          </div>
        </div>
      </div>
    </Section>
  );
}
