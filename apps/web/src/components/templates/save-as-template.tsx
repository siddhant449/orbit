"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@brandloop/ui";
import { TemplateForm, type TemplateDraft } from "./template-form";

/** "Save as template" on a post: one model call suggests a skeleton, the user reviews it in the form, and nothing is saved until they confirm. */
export function SaveAsTemplate({ documentId, className }: { documentId: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<TemplateDraft | null>(null);

  async function suggest() {
    setBusy(true);
    try {
      const res = await fetch("/api/templates/from-post", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string; suggestion?: TemplateDraft };
      if (!res.ok || !body.suggestion) throw new Error(body.error ?? "Couldn't make a template from this post. Try again.");
      setSuggestion(body.suggestion);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't make a template from this post. Try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <Button type="button" variant="secondary" size="icon" className={className} disabled={busy} onClick={() => void suggest()} aria-label={busy ? "Making a template from this post" : "Save as template"} title="Save as template" data-save-as-template>
        <LayoutTemplate aria-hidden="true" />
      </Button>
      <TemplateForm
        open={suggestion !== null}
        onOpenChange={(o) => !o && setSuggestion(null)}
        prefill={suggestion ?? undefined}
        onSaved={() => toast.success("Template saved. Find it on the Templates page.")}
      />
    </>
  );
}
