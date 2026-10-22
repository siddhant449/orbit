"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { ComposerShell, pillClass, cn } from "@brandloop/ui";
import { MicIcon, PlusIcon, SendIcon } from "@brandloop/ui/icons";
import type { Greeting as GreetingText } from "@/lib/greeting";
import { Notifications } from "@/components/shell/notifications";
import { TopBar } from "@/components/shell/top-bar";
import { Greeting } from "./greeting";
import { VoicePicker, type VoiceOption } from "./voice-picker";

const starters = [
  { label: "Find ideas", prompt: "Give me five post ideas for this week based on my strategy." },
  { label: "Draft a post", prompt: "Help me write a post about " },
  { label: "Improve a draft", prompt: "Make this draft sharper without changing my voice:\n\n" },
  { label: "Review my posts", prompt: "What's working in my recent posts, and what should I change?" },
  { label: "Learn the basics", prompt: "How do I write a strong first line on LinkedIn?" },
];

const rise = (ms: number) => ({ "--rise-delay": `${ms}ms` }) as CSSProperties;

/**
 * Composer icon button (system §6.3 `icon`): a circle the height of the footer row (`--composer-control`, 44 px on
 * home so every control in the row, the voice pill and Send included, shares one height and a 44 px touch target).
 */
const iconButton =
  "orbit-transition grid size-[var(--composer-control)] shrink-0 place-items-center rounded-full border border-line-control text-text enabled:hover:border-inverse enabled:hover:bg-inverse enabled:hover:text-on-inverse disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Home (screens.md B1, p01 / p17 / p16): top bar, the greeting, the composer (system §6.5) with its focus aura, the
 * "Ways to start" chips and the home cards. Entrance motion plays on the document's first paint only.
 */
export function Composer({
  greeting,
  cards,
  voices,
  selectedVoiceId,
  onSend,
  initialText,
}: {
  greeting: GreetingText;
  /** The home cards, rendered on the server (real data or honest empty states). */
  cards?: ReactNode;
  voices: VoiceOption[];
  selectedVoiceId: string | null;
  /** Starts the chat with this text. Without it the composer only says chat isn't connected. */
  onSend?: (text: string) => void;
  /** Pre-fills the box (home's `?prompt=`); never sent on its own. */
  initialText?: string;
}) {
  const [text, setText] = useState(initialText ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A pre-filled prompt ends mid-sentence ("It's about "): put the caret there, after the shell's route focus.
  useEffect(() => {
    if (!initialText) return;
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }, 120);
    return () => window.clearTimeout(t);
  }, [initialText]);

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
    <div className="relative flex min-h-full flex-col">
      <TopBar crumb="Home" actions={<Notifications />} className="max-md:hidden" />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-(--gutter) pb-6 pt-4 md:gap-6 md:pb-16 md:pt-6">
        <div className="w-full max-w-[760px]">
          <Greeting greeting={greeting} />
        </div>

        <form onSubmit={send} className="orbit-rise w-full max-w-[760px]" style={rise(120)}>
          <ComposerShell className="flex flex-col max-md:!rounded-[20px]">
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
              placeholder="Give Orbit a thought, a link or a voice note…"
              className="block w-full resize-none bg-transparent px-[18px] pt-[18px] text-[16px] leading-[1.5] text-text outline-none placeholder:text-text-3 md:px-6 md:pt-[22px] md:text-[17px]"
            />
            <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-3 [--composer-control:44px] md:px-4 md:pb-4 md:pt-4">
              <div className="flex min-w-0 items-center gap-2">
                <button type="button" aria-label="Attach a file" disabled className={iconButton}>
                  <PlusIcon size={18} />
                </button>
                <VoicePicker voices={voices} selectedId={selectedVoiceId} />
                <button type="button" aria-label="Dictate" disabled className={iconButton}>
                  <MicIcon size={18} />
                </button>
              </div>
              <button
                type="submit"
                aria-label="Send"
                disabled={!text.trim()}
                className="orbit-transition grid size-[var(--composer-control)] shrink-0 place-items-center rounded-full bg-accent text-on-accent enabled:hover:bg-accent-hover enabled:hover:shadow-glow motion-safe:enabled:hover:-translate-y-px motion-safe:enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <SendIcon size={18} />
              </button>
            </div>
          </ComposerShell>
        </form>

        <ul className="orbit-rise flex w-full max-w-[760px] flex-wrap gap-2" style={rise(230)} aria-label="Ways to start">
          {starters.map(({ label, prompt }) => (
            <li key={label}>
              <button type="button" onClick={() => applyStarter(prompt)} className={pillClass()}>
                {label}
              </button>
            </li>
          ))}
        </ul>

        {cards}
      </div>
    </div>
  );
}
