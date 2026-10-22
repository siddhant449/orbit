"use client";

import { createContext, useContext } from "react";
import { hookMeta, parseHookCards, type HookCard } from "@brandloop/agent/client";
import { Button } from "@brandloop/ui";

/** What picking a hook does is the thread's business (swap the open post's opening, or start a draft from it). */
export const HookActionsContext = createContext<{ useHook: (card: HookCard) => void; disabled: boolean } | null>(null);

/** The cards of a finished generateHooks call in this message, in order. */
export function hookCardsOf(parts: { type: string; state?: string; output?: unknown }[]): HookCard[][] {
  return parts.flatMap((p) => {
    if (p.type !== "tool-generateHooks" || p.state !== "output-available") return [];
    const cards = parseHookCards(p.output);
    return cards ? [cards] : [];
  });
}

/** A set of hook options (design §5): a purpose badge, the line, its size on a phone, and "Use this hook". */
export function HookCards({ cards }: { cards: HookCard[] }) {
  const actions = useContext(HookActionsContext);
  return (
    <section aria-label="Hook options" data-hook-cards className="flex flex-col gap-2.5">
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {cards.map((c) => (
          <li key={c.index} data-hook-card={c.index} className="orbit-panel flex flex-col gap-2.5 rounded-card-sm p-4">
            <span data-hook-purpose className="inline-flex h-6 w-fit items-center rounded-pill border border-line-3 px-2.5 text-[11px] font-medium uppercase tracking-wide text-text-2">
              {c.purposeLabel}
            </span>
            <p className="flex-1 text-[15px] leading-[1.45] text-text">{c.text}</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-text-3">{hookMeta(c)}</span>
              <Button variant="secondary" size="sm" disabled={!actions || actions.disabled} onClick={() => actions?.useHook(c)}>
                Use this hook
                <span className="sr-only">{`, option ${c.index}`}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
