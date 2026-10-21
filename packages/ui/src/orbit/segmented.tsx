"use client";

import { m } from "motion/react";
import { useId, useRef, type KeyboardEvent } from "react";
import { cn } from "../cn";
import { durations, easeOut } from "../motion/presets";

export type SegmentedOption<T extends string> = { value: T; label: string };

/**
 * Segmented tabs (system §6.4) as a radio group: one tab stop, arrow keys (and Home / End) move the selection and
 * focus, wrapping at the ends. The selected pill is `inverse` and slides between options with a shared `layoutId`
 * (400 ms out-expo; instant under reduced motion via MotionConfig).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function move(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-pill bg-segmented-fill p-1", className)}
    >
      {options.map((o, i) => {
        const selected = i === current;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              "orbit-transition relative inline-flex min-h-8 shrink-0 cursor-pointer items-center rounded-pill px-3.5 text-[13px]",
              selected ? "font-medium text-on-inverse" : "text-text-2 hover:text-text",
            )}
          >
            {selected && (
              <m.span
                aria-hidden="true"
                layoutId={`segmented-${id}`}
                transition={{ duration: durations.hover, ease: easeOut }}
                className="absolute inset-0 rounded-pill bg-inverse"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
