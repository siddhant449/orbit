"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { Globe, Square } from "lucide-react";
import { Button, ComposerShell, cn } from "@brandloop/ui";
import { SendIcon } from "@brandloop/ui/icons";
import { VoicePicker, type VoiceOption } from "@/components/home/voice-picker";
import { KnowledgeChip, KnowledgePicker, type KnowledgeChoice } from "./knowledge-picker";

/** Where the home composer sat when the chat started: the docked composer glides from there. */
export type ComposerRect = { top: number; left: number; width: number; height: number };

const LAND = "linear(0, 0.057, 0.19, 0.353, 0.516, 0.662, 0.783, 0.876, 0.944, 0.989, 1.016, 1.031, 1.036, 1.035, 1.031, 1.025, 1.019, 1.014, 1.009, 1.005, 1.003, 1.001, 1)";

/** FLIP from the home composer's box to the docked one, on the landing spring. Nothing under reduced motion. */
function useHandoff(ref: RefObject<HTMLElement | null>, from: ComposerRect | null | undefined) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    el.animate(
      [
        { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, 1)` },
        { transformOrigin: "0 0", transform: "none" },
      ],
      { duration: 620, easing: LAND },
    );
    // Only the first mount glides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function ChatComposer({
  value,
  onValueChange,
  onSend,
  onStop,
  busy,
  voices,
  selectedVoiceId,
  knowledge,
  onKnowledgeChange,
  webSearch,
  onWebSearchChange,
  fromRect,
  inputRef,
}: {
  value: string;
  onValueChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  voices: VoiceOption[];
  selectedVoiceId: string | null;
  knowledge: KnowledgeChoice[];
  onKnowledgeChange: (next: KnowledgeChoice[]) => void;
  webSearch: boolean;
  onWebSearchChange: (on: boolean) => void;
  fromRect?: ComposerRect | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const sheetRef = useRef<HTMLFormElement>(null);
  useHandoff(sheetRef, fromRect);
  const canSend = !busy && value.trim().length > 0;

  return (
    <form
      ref={sheetRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
    >
      <ComposerShell variant="thread" className="flex flex-col">
        <label htmlFor="chat-composer" className="sr-only">
          Message
        </label>
        {knowledge.length > 0 && (
          <ul aria-label="Selected knowledge" className="flex flex-wrap gap-1.5 px-4 pt-3">
            {knowledge.map((k) => (
              <KnowledgeChip key={k.id} item={k} onRemove={() => onKnowledgeChange(knowledge.filter((x) => x.id !== k.id))} />
            ))}
          </ul>
        )}
        <textarea
          id="chat-composer"
          ref={inputRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          rows={1}
          data-lenis-prevent
          enterKeyHint="send"
          placeholder={busy ? "Orbit is writing…" : "Reply, or ask for a change…"}
          className="block max-h-[min(40vh,320px)] min-h-[44px] w-full resize-none bg-transparent px-4 pt-4 text-[16px] leading-[1.5] text-text outline-none [field-sizing:content] placeholder:text-text-3 sm:px-5"
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-2 [--composer-control:44px] @md:[--composer-control:40px]">
          <div className="flex min-w-0 items-center gap-1 @md:gap-2">
            <KnowledgePicker selected={knowledge} onChange={onKnowledgeChange} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={webSearch}
              aria-label="Web search"
              title={webSearch ? "Web search is on" : "Web search is off"}
              onClick={() => onWebSearchChange(!webSearch)}
              className={cn("h-[var(--composer-control)]", webSearch && "text-text")}
            >
              <Globe aria-hidden="true" />
              <span className="hidden @md:inline">Web</span>
              <span aria-hidden="true" className={cn("web-switch", webSearch && "web-switch--on")} />
            </Button>
            <VoicePicker voices={voices} selectedId={selectedVoiceId} />
          </div>
          {busy ? (
            <button
              type="button"
              aria-label="Stop"
              onClick={onStop}
              className="orbit-transition grid size-[var(--composer-control)] shrink-0 place-items-center rounded-full border border-line-control text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse"
            >
              <Square aria-hidden="true" className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!canSend}
              className="orbit-transition grid size-[var(--composer-control)] shrink-0 place-items-center rounded-full bg-accent text-on-accent enabled:hover:bg-accent-hover enabled:hover:shadow-glow motion-safe:enabled:hover:-translate-y-px motion-safe:enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendIcon size={18} />
            </button>
          )}
        </div>
      </ComposerShell>
    </form>
  );
}
