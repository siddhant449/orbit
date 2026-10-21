"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { ArrowUp, BarChart3, GraduationCap, Lightbulb, Mic, PenLine, Plus, Wand2 } from "lucide-react";
import { Button, cn } from "@brandloop/ui";
import { VoicePicker, type VoiceOption } from "./voice-picker";

const starters = [
  { label: "Find ideas", icon: Lightbulb, prompt: "Give me five post ideas for this week based on my strategy." },
  { label: "Draft a post", icon: PenLine, prompt: "Help me write a post about " },
  { label: "Improve a draft", icon: Wand2, prompt: "Make this draft sharper without changing my voice:\n\n" },
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
    <div className="flex min-h-full flex-col items-center justify-center px-5 pb-[12vh] pt-10">
      <div className="w-full max-w-[640px]">
        <p className={cn("text-[15px] text-ink-muted transition-opacity", hello ? "opacity-100" : "opacity-0")}>
          {hello}
          {firstName ? `, ${firstName}` : ""}
        </p>
        <h1 className="mt-1 font-display text-[clamp(30px,5vw,44px)] font-semibold leading-[1.05] tracking-[-0.035em] text-ink">
          What are we writing today?
        </h1>

        <form
          onSubmit={send}
          className="mt-8 rounded-[22px] border border-line bg-surface p-2 shadow-[0_1px_0_var(--line),0_12px_32px_-18px_rgb(27_34_32/0.25)] focus-within:border-accent/60"
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
            placeholder="A story from this week, a lesson, a hot take…"
            className="block w-full resize-none bg-transparent px-3 pt-2 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
          />
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex min-w-0 items-center gap-1">
              <Button type="button" variant="ghost" size="icon" aria-label="Attach a file" disabled>
                <Plus />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Dictate" disabled>
                <Mic />
              </Button>
              <VoicePicker voices={voices} selectedId={selectedVoiceId} />
            </div>
            <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim()} className="rounded-full">
              <ArrowUp />
            </Button>
          </div>
        </form>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Ways to start">
          {starters.map(({ label, icon: Icon, prompt }) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => applyStarter(prompt)}
                className="flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
