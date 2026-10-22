"use client";

import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import useSWR from "swr";
import { Button, cn } from "@brandloop/ui";

export const AI_MODEL_KEY = "/api/ai-model";
export type AiModelInfo = { model: string | null; default: string; models: { id: string; label: string; hint: string }[] };

const fetchJson = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

/** The profile's saved chat model and the models on offer. */
export function useAiModel() {
  const swr = useSWR<AiModelInfo>(AI_MODEL_KEY, fetchJson, { revalidateOnFocus: false });
  const current = swr.data ? (swr.data.model ?? swr.data.default) : null;
  async function choose(id: string | null) {
    await swr.mutate(
      async (prev) => {
        const res = await fetch(AI_MODEL_KEY, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: id }) });
        if (!res.ok) throw new Error("That model could not be saved.");
        return prev ? { ...prev, model: id } : prev;
      },
      { optimisticData: (prev) => (prev ? { ...prev, model: id } : (prev as unknown as AiModelInfo)), rollbackOnError: true, revalidate: false },
    );
  }
  return { info: swr.data ?? null, current, choose };
}

const itemClass =
  "flex cursor-pointer items-start gap-2 rounded-[8px] px-2.5 py-2 text-[14px] text-text outline-none data-[highlighted]:bg-line-row";

/** A pill in the composer: pick the model for this and later messages. The pick is saved on the profile. */
export function ModelPicker({ current, info, onChoose }: { current: string | null; info: AiModelInfo | null; onChoose: (id: string) => void }) {
  const label = info?.models.find((m) => m.id === current)?.label ?? "Model";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="AI model" data-model-pill className="h-[var(--composer-control)]" disabled={!info}>
          <span className="max-w-[9ch] truncate @md:max-w-none">{label}</span>
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="top" align="start" sideOffset={6} data-lenis-prevent className="plate plate--sm z-50 w-64 p-1.5 data-[state=open]:animate-[plate-in_120ms_var(--ease-ink)_both]">
          {info?.models.map((m) => (
            <DropdownMenu.Item key={m.id} className={itemClass} onSelect={() => onChoose(m.id)} data-model-option={m.id}>
              <Check aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", m.id === current ? "opacity-100" : "opacity-0")} />
              <span className="flex flex-col">
                <span>{m.label}</span>
                <span className="text-[12px] text-text-2">{m.hint}</span>
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
