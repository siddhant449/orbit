"use client";

import { useRef } from "react";
import { Check, ChevronRight, PencilLine, X } from "lucide-react";
import type { QuestionSet } from "@brandloop/agent/client";
import { nextFocus } from "./options-panel";

/**
 * The writer's questions, docked above the composer in the options panel's language: "Question 1 of N", the question,
 * up to three numbered starter rows (only when the writer drew them from the user's own material), a compact trail of
 * answered questions and a footer saying the composer takes a typed answer. Arrow keys move, Enter or click fills the
 * answer, Esc (or ✕) closes it.
 */
export function QuestionDock({
  set,
  answers,
  onPick,
  onClose,
  disabled = false,
}: {
  set: QuestionSet;
  answers: string[];
  onPick: (suggestion: string) => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.min(answers.length, set.questions.length - 1);
  const current = set.questions[at]!;
  return (
    <section
      aria-labelledby="question-dock-title"
      data-question-dock=""
      className="msg-arrive orbit-panel mb-3 overflow-hidden rounded-card-sm border border-line-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
          return;
        }
        const i = rows.current.findIndex((r) => r === document.activeElement);
        const to = nextFocus(e.key, i, current.suggestions.length);
        if (to !== null) {
          e.preventDefault();
          rows.current[to]?.focus();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line-row py-2 pl-4 pr-2 sm:pl-5">
        <div className="flex min-w-0 flex-col gap-0.5 py-0.5">
          <p data-question-count="" className="text-[11px] font-medium uppercase tracking-wide text-text-3">
            Question {at + 1} of {set.questions.length}
          </p>
          <h2 id="question-dock-title" data-question-text="" className="text-[14px] font-semibold leading-snug text-text">
            {current.text}
          </h2>
          {answers.length > 0 && (
            <p data-answered="" className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5 text-[12px] text-text-3">
              {answers.map((_, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <Check aria-hidden="true" className="size-3" />Q{i + 1} answered
                </span>
              ))}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close questions"
          className="orbit-transition grid size-8 shrink-0 place-items-center rounded-full text-text-3 hover:bg-panel-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text max-md:size-11"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      {current.suggestions.length > 0 && (
        <ol className="flex flex-col">
          {current.suggestions.map((s, i) => (
            <li key={`${at}-${s}`} className="border-b border-line-row last:border-b-0">
              <button
                type="button"
                ref={(el) => {
                  rows.current[i] = el;
                }}
                disabled={disabled}
                data-suggestion={i}
                onClick={() => onPick(s)}
                className="group orbit-transition flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-panel-hover focus-visible:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-text disabled:pointer-events-none disabled:opacity-50 sm:px-5"
              >
                <span aria-hidden="true" className="mt-px grid size-5 shrink-0 place-items-center rounded-[6px] bg-line-soft text-[11px] font-medium text-text-2">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-text">{s}</span>
                <ChevronRight aria-hidden="true" className="orbit-transition mt-0.5 size-4 shrink-0 text-text-3 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="flex items-center gap-2 border-t border-line-row px-4 py-2 text-[12.5px] text-text-3 sm:px-5" data-question-hint="">
        <PencilLine aria-hidden="true" className="size-3.5 shrink-0" />
        Or type your answer in the chat below
      </p>
    </section>
  );
}
