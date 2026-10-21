"use client";

import { useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { toast } from "sonner";
import { ArrowUp, BarChart3, GraduationCap, Lightbulb, Mic, PenLine, Plus } from "lucide-react";
import { Button, KineticHeading, LineArt, cn } from "@brandloop/ui";
import { VoicePicker, type VoiceOption } from "./voice-picker";

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
  onSend,
}: {
  firstName: string;
  voices: VoiceOption[];
  selectedVoiceId: string | null;
  /** Starts the chat with this text. Without it the composer only says chat isn't connected. */
  onSend?: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    if (onSend) {
      onSend(text.trim());
      return;
    }
    toast("Chat isn't connected yet", { description: "Writing with AI arrives in the next build." });
  }

  return (
    <div className="relative flex min-h-full flex-col justify-center px-5 pb-[10vh] pt-10 md:px-12">
      <div className="relative mx-auto w-full max-w-[880px]">
        {/* The drawing on the table: a sheet and a pencil, drawn in stroke by stroke. */}
        <LineArt
          name="sheet"
          delay={700}
          className="pointer-events-none absolute -top-6 right-0 hidden w-[220px] text-ink-muted lg:block"
        />
        <p className={cn("type-ui text-ink-muted transition-opacity", hello ? "opacity-100" : "opacity-0")}>
          {hello}
          {firstName ? `, ${firstName}` : ""}
        </p>
        <KineticHeading
          text="What are we writing today?"
          lines={["What are we", "writing today?"]}
          narrowLines={["What are", "we writing", "today?"]}
          className="type-display-1 mt-2 text-ink focus-visible:outline-none"
        />

        <div className="land mt-10 rounded-card">
          <span aria-hidden="true" className="land__plate" />
          <form
            onSubmit={send}
            className="land__sheet rounded-card border border-keyline bg-surface p-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus"
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

        {/* Measured: the composer's width, drawn in after it lands. */}
        <span aria-hidden="true" className="dim dim--draw mt-4 block">
          <span className="dim__label">880</span>
        </span>

        <ul className="mt-6 flex flex-wrap gap-3" aria-label="Ways to start">
          {starters.map(({ label, icon: Icon, prompt }, i) => (
            <li key={label}>
              <button type="button" onClick={() => applyStarter(prompt)} className="tab tab--rise" style={{ "--i": i } as CSSProperties}>
                <span aria-hidden="true" className="tab__plate" />
                <span className="tab__face">
                  <Icon aria-hidden="true" className="tab__icon" />
                  <span className="tab__label">
                    <span className="tab__text">{label}</span>
                    <span aria-hidden="true" className="tab__text tab__text--dup">
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
