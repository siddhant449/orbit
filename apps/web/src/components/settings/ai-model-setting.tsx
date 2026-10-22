"use client";

import { toast } from "sonner";
import { Hint, Label, NativeSelect } from "@brandloop/ui";
import { useAiModel } from "@/components/chat/model-picker";

/** The default chat model for this profile. The chat composer can switch it too. */
export function AiModelSetting() {
  const { info, current, choose } = useAiModel();
  return (
    <div className="orbit-panel @container mt-3 grid gap-2.5 p-5 sm:p-6 @xl:grid-cols-[240px_minmax(0,1fr)] @xl:gap-8">
      <div>
        <Label htmlFor="ai-model">AI model</Label>
        <Hint className="mt-1">Used for chat replies and drafts. You can switch it in the chat box too.</Hint>
      </div>
      <NativeSelect
        id="ai-model"
        value={current ?? ""}
        disabled={!info}
        onChange={(e) => void choose(e.target.value).then(() => toast.success("Model saved"), (err: Error) => toast.error(err.message))}
      >
        {!info && <option value="">Loading…</option>}
        {info?.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}{m.id === info.default ? " (default)" : ""}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
