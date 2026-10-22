"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Illustrative } from "./ui";

export type Stage = { name: string; desc: string };

/**
 * C4 pinned loop. The track is 600 vh; while it scrolls past, each 100 vh advances a stage (rAF-throttled scroll
 * read). Hover, focus and click also select a stage (buttons with aria-pressed); the stage label is announced
 * politely. Without JS the list renders with every description open and the first frame shown. Below 900 px the list
 * becomes scroll-snap tabs and nothing pins (C13).
 */
export function LoopStages({ stages, frames }: { stages: Stage[]; frames: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  // A hover / focus / click choice holds until the reader scrolls on by half a screen (focus itself may scroll the
  // page to the button; that scroll must not undo the choice).
  const manual = useRef<{ at: number; y: number | null }>({ at: 0, y: null });
  const choose = (i: number, e: { timeStamp: number }) => {
    manual.current = { at: e.timeStamp, y: null };
    setActive(i);
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const wide = window.matchMedia("(min-width: 900px)");
    let raf = 0;
    let last = -1;
    const read = () => {
      raf = 0;
      if (!wide.matches) return;
      const r = track.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      if (span <= 0) return;
      const m = manual.current;
      if (m.at) {
        if (performance.now() - m.at < 700 || m.y === null) {
          m.y = window.scrollY;
          if (performance.now() - m.at < 700) return;
        }
        if (Math.abs(window.scrollY - m.y) < window.innerHeight / 2) return;
        manual.current = { at: 0, y: null };
        last = -1;
      }
      const p = Math.min(0.9999, Math.max(0, -r.top / span));
      const i = Math.floor(p * stages.length);
      if (i !== last) {
        last = i;
        setActive(i);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [stages.length]);

  const n = String(active + 1).padStart(2, "0");
  const total = String(stages.length).padStart(2, "0");

  return (
    <div className="loop__track" ref={trackRef}>
      <div className="loop__stick">
        <ol className="stages" aria-label="The six stages">
          {stages.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                className="stage"
                aria-pressed={i === active}
                aria-controls="loop-frame"
                onClick={(e) => choose(i, e)}
                onMouseEnter={(e) => choose(i, e)}
                onFocus={(e) => choose(i, e)}
              >
                <span className="stage__n">{String(i + 1).padStart(2, "0")}</span>
                <span className="stage__name">{s.name}</span>
                <span className="stage__desc">
                  <span>{s.desc}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="loop__frame-wrap" data-placeholder="demo-data">
          <div className="loop__meta">
            <span aria-live="polite">
              Stage {n} · {stages[active].name}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Illustrative />
              <span className="loop__progress" aria-hidden="true">
                <span style={{ ["--p" as string]: (active + 1) / stages.length }} />
              </span>
              <span aria-hidden="true">
                {n} / {total}
              </span>
            </span>
          </div>
          <div className="frame" id="loop-frame" role="group" aria-label={`${stages[active].name} preview`}>
            {frames.map((f, i) => (
              <div key={i} data-stage={i} data-active={i === active ? "" : undefined} aria-hidden={i !== active}>
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
