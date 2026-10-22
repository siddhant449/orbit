"use client";

import { useEffect, useState } from "react";
import { GOALS, type Goal } from "@brandloop/ai";
import { Segmented } from "@brandloop/ui";
import { createDebouncer } from "./debounce";
import { EditableText, Section, useStrategy } from "./edit";

/** Arrowing through the goals saves once, this long after the last change (or at once when focus leaves). */
const GOAL_SAVE_DELAY = 500;

const GOAL_OPTIONS = Object.entries(GOALS).map(([value, g]) => ({ value: value as Goal, label: g.label }));

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[13px] font-medium text-text-2">
      {children}
    </h3>
  );
}

export function Foundation() {
  const { strategy: s, save } = useStrategy();
  // The radiogroup moves the selection on every arrow press; show it at once, write it once.
  const [draftGoal, setDraftGoal] = useState<Goal | null>(null);
  // Each scheduled value carries the save from its render, so the write always uses the newest strategy context.
  const [goalSaver] = useState(() =>
    createDebouncer(({ goal, write }: { goal: Goal; write: typeof save }) => {
      void write({ goal });
      setDraftGoal(null);
    }, GOAL_SAVE_DELAY),
  );
  useEffect(() => () => goalSaver.flush(), [goalSaver]);
  const goal = draftGoal ?? s.goal;

  function changeGoal(next: Goal) {
    setDraftGoal(next);
    if (next === s.goal) goalSaver.cancel();
    else goalSaver.schedule({ goal: next, write: save });
  }

  return (
    <Section title="Strategy foundation" description="Who you are on LinkedIn, and what the rest of the plan builds on.">
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <Label>Goal</Label>
          {/* Segmented control (system §6.4): one tab stop; arrows move the choice, the save is debounced. */}
          <div
            className="self-start"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) goalSaver.flush();
            }}
          >
            <Segmented label="Goal" options={GOAL_OPTIONS} value={goal} onChange={changeGoal} />
          </div>
          <p className="text-[13px] text-text-2">{GOALS[goal].tagline}</p>
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
