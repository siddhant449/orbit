"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { ArrowUp, Globe, Square } from "lucide-react";
import { Button, cn } from "@brandloop/ui";
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
      className="relative rounded-card border border-keyline bg-surface p-2 shadow-raised focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus"
    >
      <label htmlFor="chat-composer" className="sr-only">
        Message
      </label>
      {knowledge.length > 0 && (
        <ul aria-label="Selected knowledge" className="flex flex-wrap gap-1.5 px-2 pt-1">
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
        placeholder={busy ? "Brandloop is writing…" : "Reply, or ask for a change…"}
        className="block max-h-[40vh] min-h-12 w-full resize-none bg-transparent px-3 pt-3 type-body text-ink outline-none [field-sizing:content] placeholder:text-ink-faint"
      />
      <div className="flex items-center justify-between gap-2 px-1 pb-1 pt-1">
        <div className="flex min-w-0 items-center gap-1">
          <KnowledgePicker selected={knowledge} onChange={onKnowledgeChange} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={webSearch}
            aria-label="Web search"
            title={webSearch ? "Web search is on" : "Web search is off"}
            onClick={() => onWebSearchChange(!webSearch)}
            className={cn(webSearch && "text-ink")}
          >
            <Globe aria-hidden="true" />
            <span className="hidden sm:inline">Web</span>
            <span aria-hidden="true" className={cn("web-switch", webSearch && "web-switch--on")} />
          </Button>
          <VoicePicker voices={voices} selectedId={selectedVoiceId} />
        </div>
        {busy ? (
          <Button type="button" variant="secondary" size="icon-lg" aria-label="Stop" onClick={onStop}>
            <Square aria-hidden="true" className="!size-3.5 fill-current" />
          </Button>
        ) : (
          <Button type="submit" variant="generate" size="icon-lg" aria-label="Send" disabled={!canSend}>
            <ArrowUp />
          </Button>
        )}
      </div>
    </form>
  );
}
