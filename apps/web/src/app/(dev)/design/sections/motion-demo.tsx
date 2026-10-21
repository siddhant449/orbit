"use client";

import { LineReveal } from "@brandloop/ui";
import { useState } from "react";

/** Replays the headline line reveal (the one first-paint move the app makes). */
export function MotionDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className="flex min-w-0 flex-col items-start gap-4">
      <LineReveal key={run} as="p" lines={["Good evening.", "What are we putting out there?"]} className="type-greeting [&>span:last-child]:text-text-2" />
      <button
        type="button"
        onClick={() => setRun((n) => n + 1)}
        className="orbit-transition inline-flex h-8 cursor-pointer items-center rounded-pill border border-line-2 px-3.5 text-[13px] text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse motion-safe:hover:-translate-y-px"
      >
        Replay the line reveal
      </button>
    </div>
  );
}
