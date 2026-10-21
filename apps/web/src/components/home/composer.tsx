"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { toast } from "sonner";
import { ArrowUp, BarChart3, GraduationCap, Lightbulb, Mic, PenLine, Plus } from "lucide-react";
import { Button, KineticHeading, cn } from "@brandloop/ui";
import { useAfterFirstPaint } from "@/lib/use-after-first-paint";
import { VoicePicker, type VoiceOption } from "./voice-picker";

/** The dither field (C4) is its own chunk, mounted after first paint; it renders nothing on the server. */
const DitherField = dynamic(() => import("@brandloop/ui/effects").then((mod) => mod.DitherField), { ssr: false });

const starters = [
  { label: "Find ideas", icon: Lightbulb, prompt: "Give me five post ideas for this week based on my strategy." },
  { label: "Draft a post", icon: PenLine, prompt: "Help me write a post about " },
  { label: "Improve a draft", icon: PenLine, prompt: "Make this draft sharper without changing my voice:\n\n" },
  { label: "Review my posts", icon: BarChart3, prompt: "What's working in my recent posts, and what should I change?" },
  { label: "Learn the basics", icon: GraduationCap, prompt: "How do I write a strong first line on LinkedIn?" },
];

const noopSubscribe = () => () => {};

function greeting(hour: number) {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function Composer({
  firstName,
  voices,
  selectedVoiceId,
}: {
  firstName: string;
  voices: VoiceOption[];
  selectedVoiceId: string | null;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const afterPaint = useAfterFirstPaint();
  // Greeting depends on the viewer's clock, so the server renders none.
  const hello = useSyncExternalStore(
    noopSubscribe,
    () => greeting(new Date().getHours()),
    () => null,
  );

  function applyStarter(prompt: string) {
    setText(prompt);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      el?.focus();
      el?.setSelectionRange(prompt.length, prompt.length);
    });
  }

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    toast("Chat isn't connected yet", { description: "Writing with AI arrives in the next build." });
  }

  return (
    <div className="relative flex min-h-full flex-col justify-center px-5 pb-[10vh] pt-10 md:px-12">
      {afterPaint && <DitherField mask={{ cx: 0.5, cy: 0.56, rx: 0.5, ry: 0.46 }} />}
      <div className="relative z-[1] mx-auto w-full max-w-[880px]">
        <p className={cn("type-ui text-ink-muted transition-opacity", hello ? "opacity-100" : "opacity-0")}>
          {hello}
          {firstName ? `, ${firstName}` : ""}
        </p>
        <KineticHeading
          text="What are we writing today?"
          lines={["What are we", "writing today?"]}
          narrowLines={["What are", "we writing", "today?"]}
          className="mt-2 font-display text-[clamp(36px,6.2vw,88px)] font-[800] leading-[0.98] tracking-[-0.03em] text-ink [font-stretch:125%] focus-visible:outline-none"
        />

        <div className="land mt-10 rounded-card">
          <span aria-hidden="true" className="land__plate" />
          <form
            onSubmit={send}
            className="land__sheet rounded-card border border-keyline bg-surface p-2 focus-within:border-focus"
          >
          <label htmlFor="composer" className="sr-only">
            Message
          </label>
          <textarea
            id="composer"
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            rows={3}
            data-lenis-prevent
            placeholder="A story from this week, a lesson, a hot take…"
            className="block w-full resize-none bg-transparent px-3 pt-3 type-body text-ink outline-none placeholder:text-ink-faint"
          />
          <div className="flex items-center justify-between px-1 pb-1 pt-1">
            <div className="flex min-w-0 items-center gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="Attach a file" disabled>
                <Plus />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Dictate" disabled>
                <Mic />
              </Button>
              <VoicePicker voices={voices} selectedId={selectedVoiceId} />
            </div>
            <Button type="submit" variant="generate" size="icon-lg" aria-label="Send" disabled={!text.trim()}>
              <ArrowUp />
            </Button>
          </div>
          </form>
        </div>

        <ul className="mt-6 flex flex-wrap gap-3" aria-label="Ways to start">
          {starters.map(({ label, icon: Icon, prompt }, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => applyStarter(prompt)}
                className="ticket ticket--stamp"
                style={{ "--i": i } as CSSProperties}
              >
                <span aria-hidden="true" className="ticket__plate ticket__plate--pink" />
                <span aria-hidden="true" className="ticket__plate ticket__plate--blue" />
                <span className="ticket__face">
                  <span aria-hidden="true" className="ticket__perf" />
                  <Icon aria-hidden="true" className="ticket__icon" />
                  <span className="ticket__label">
                    <span className="ticket__text">{label}</span>
                    <span aria-hidden="true" className="ticket__text ticket__text--dup">
                      {label}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
