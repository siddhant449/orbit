"use client";

import { useId, useState } from "react";
import { Dialog } from "radix-ui";
import { Button, Input, Label, NativeSelect, Segmented } from "@brandloop/ui";
import { CATEGORIES } from "@brandloop/agent/client";
import { dialogActionsClass, dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass, textareaClass } from "@/components/dialog-classes";
import { categoryLabel, splitSlots } from "./labels";

export type TemplateDraft = { title: string; type: "HOOK" | "POST"; category: string; skeleton: string; why: string };
const EMPTY: TemplateDraft = { title: "", type: "POST", category: "educational", skeleton: "", why: "" };
export const TEMPLATE_LIMITS = { title: 80, skeleton: 3000, why: 200 };

/** The skeleton with its `[slots]` highlighted, as the reader of the template will see where to fill in. */
export function SlotPreview({ text }: { text: string }) {
  return (
    <div data-template-preview-text className="light whitespace-pre-wrap break-words rounded-card-sm bg-panel p-4 text-[14px] leading-[1.55] text-text">
      {splitSlots(text).map((part, i) =>
        part.slot ? (
          <mark key={i} data-slot className="rounded-[4px] bg-accent-wash px-1 text-accent-text">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </div>
  );
}

function Form({ initial, id, onClose, onSaved }: { initial: TemplateDraft; id?: string; onClose: () => void; onSaved: (templateId: string) => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { name: useId(), cat: useId(), body: useId(), why: useId(), hint: useId() };
  const set = <K extends keyof TemplateDraft>(k: K, v: TemplateDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const hasSlot = splitSlots(draft.skeleton).some((p) => p.slot);
  const ready = draft.title.trim() && draft.skeleton.trim() && hasSlot;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(id ? `/api/templates/${encodeURIComponent(id)}` : "/api/templates", {
        method: id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, why: draft.why.trim() || null }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; template?: { id: string } };
      if (!res.ok || !body.template) throw new Error(body.error ?? "Couldn't save the template. Try again.");
      onSaved(body.template.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the template. Try again.");
    }
    setBusy(false);
  }

  return (
    <form
      className="mt-5 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) void submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.name}>Name</Label>
        <Input id={ids.name} value={draft.title} maxLength={TEMPLATE_LIMITS.title} onChange={(e) => set("title", e.target.value)} autoComplete="off" placeholder="The lesson I learned the hard way" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-text">Type</span>
          <Segmented
            label="Template type"
            value={draft.type}
            onChange={(v) => set("type", v)}
            options={[
              { value: "POST", label: "Post" },
              { value: "HOOK", label: "Hook" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.cat}>Category</Label>
          <NativeSelect id={ids.cat} value={draft.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c.id)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.body}>Template text</Label>
        <textarea
          id={ids.body}
          value={draft.skeleton}
          maxLength={TEMPLATE_LIMITS.skeleton}
          rows={7}
          aria-describedby={ids.hint}
          onChange={(e) => set("skeleton", e.target.value)}
          className={textareaClass}
          placeholder={"I used to [old belief].\n\nThen [what changed].\n\nNow I [new habit]."}
        />
        <span id={ids.hint} className="text-[12px] text-text-3">
          Put the part that changes each time in [square brackets]. At least one is needed. {draft.skeleton.length} of {TEMPLATE_LIMITS.skeleton}
        </span>
      </div>
      {draft.skeleton.trim() && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-text">Preview</span>
          <SlotPreview text={draft.skeleton} />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.why}>Why it works (optional)</Label>
        <Input id={ids.why} value={draft.why} maxLength={TEMPLATE_LIMITS.why} onChange={(e) => set("why", e.target.value)} autoComplete="off" />
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className={dialogActionsClass}>
        <Dialog.Close asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Dialog.Close>
        <Button type="submit" disabled={busy || !ready}>
          {id ? "Save changes" : "Save template"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Create or edit an own template (name, type, category, text with [slots], why it works). Pass `prefill` for a suggestion
 * (nothing is saved until the user confirms) or `editId` to change an existing one.
 */
export function TemplateForm({ open, onOpenChange, prefill, editId, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; prefill?: Partial<TemplateDraft>; editId?: string; onSaved: (templateId: string) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={`${dialogContentClass} max-w-xl`} aria-describedby="template-form-intro" data-template-form>
          <Dialog.Title className={dialogTitleClass}>{editId ? "Edit template" : "New template"}</Dialog.Title>
          <Dialog.Description id="template-form-intro" className={dialogDescriptionClass}>
            Only you can see your templates. Orbit can pick them when it writes your posts.
          </Dialog.Description>
          {/* Mounted only while open, so each opening starts from the given values. */}
          <Form initial={{ ...EMPTY, ...prefill }} id={editId} onClose={() => onOpenChange(false)} onSaved={onSaved} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
