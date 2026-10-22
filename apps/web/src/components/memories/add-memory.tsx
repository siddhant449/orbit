"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, Input } from "@brandloop/ui";
import { PlusIcon } from "@brandloop/ui/icons";
import { addMemoryAction } from "@/app/(app)/actions";

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Appends one bullet to a memory key. With `askTopic`, it first asks for a topic name
 * and files the memory under topics/<slug>.
 */
export function AddMemory({
  memoryKey,
  askTopic = false,
  label = "Add a memory",
  variant = "ghost",
  placeholder = "Something worth remembering",
}: {
  memoryKey: string;
  askTopic?: boolean;
  label?: string;
  variant?: "ghost" | "secondary";
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  const key = askTopic ? `topics/${slugify(topic)}` : memoryKey;
  const ready = text.trim().length > 0 && (!askTopic || slugify(topic).length > 0);

  function close() {
    setOpen(false);
    setTopic("");
    setText("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    startTransition(async () => {
      const result = await addMemoryAction(key, text);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Memory added");
      close();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant={variant} size={variant === "secondary" ? "md" : "sm"} onClick={() => setOpen(true)}>
        <PlusIcon /> {label}
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && close()}
      className="flex w-full flex-col gap-2 sm:flex-row sm:items-center"
    >
      {askTopic && (
        <Input
          aria-label="Topic name"
          autoFocus
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic, e.g. Pricing"
          className="sm:w-44"
        />
      )}
      <Input
        aria-label="New memory"
        autoFocus={!askTopic}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="sm:flex-1"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !ready}>
          {pending ? "Adding…" : "Add memory"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
