"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { Dialog } from "radix-ui";
import { Button, Input, NativeSelect, Segmented } from "@brandloop/ui";
import { CATEGORIES } from "@brandloop/agent/client";
import { CloseIcon, SearchIcon } from "@brandloop/ui/icons";
import { EmptyState } from "@/components/page";
import { dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass } from "@/components/dialog-classes";
import { SaveMenu } from "@/components/saves/save-menu";
import { promptHref } from "@/lib/prompt-param";
import { categoryLabel, NEED_LABELS, templateHref, type TemplateDto } from "./labels";

type Kind = "POST" | "HOOK";
type Page = { total: number; items: TemplateDto[] };
const PAGE = 24;

async function fetchPage(url: string): Promise<Page> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("templates");
  return (await res.json()) as Page;
}

function SaveButton({ t, saved, onChange }: { t: TemplateDto; saved: boolean; onChange: (saved: boolean) => void }) {
  return (
    <SaveMenu kind="TEMPLATE" refId={t.id} snapshot={{ title: t.title, slug: t.slug, category: t.category, type: t.type }} label={t.title} initialSaved={saved} onSavedChange={onChange} />
  );
}

function UseLink({ t }: { t: TemplateDto }) {
  const href = t.type === "POST" ? templateHref(t.slug) : promptHref(`Write a post that opens with a hook shaped like this:\n\n${t.skeleton}\n\nMy topic: `);
  return (
    <Button asChild size="sm">
      <Link href={href} data-template-use>
        Use
      </Link>
    </Button>
  );
}

function Preview({ t, saved, onChange, onClose }: { t: TemplateDto | null; saved: boolean; onChange: (saved: boolean) => void; onClose: () => void }) {
  return (
    <Dialog.Root open={t !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={`${dialogContentClass} max-w-xl`} aria-describedby={undefined} data-template-preview>
          {t && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Dialog.Title className={dialogTitleClass}>{t.title}</Dialog.Title>
                  <p className="mt-1 text-[13px] text-text-3">
                    {t.type === "HOOK" ? "Hook" : "Post"} · {categoryLabel(t.category)}
                  </p>
                </div>
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Close">
                    <CloseIcon size={16} />
                  </Button>
                </Dialog.Close>
              </div>
              <p className={dialogDescriptionClass.replace("mt-2 ", "")}>{t.why}</p>
              <figure className="light rounded-card bg-panel p-4 text-text">
                <figcaption className="mb-2 text-xs text-text-3">Structure</figcaption>
                <div data-template-skeleton className="whitespace-pre-wrap break-words text-[14px] leading-[1.55]">
                  {t.skeleton}
                </div>
              </figure>
              {t.needs.length > 0 && (
                <p className="text-[13px] text-text-2">
                  You will need: {t.needs.map((n) => NEED_LABELS[n] ?? n).join(", ")}.
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <SaveButton t={t} saved={saved} onChange={onChange} />
                <UseLink t={t} />
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The Templates page: post structures and hooks that work, filtered by type and category, searched, and saved. Use
 * opens a new chat with the template pinned.
 */
export function TemplatesLibrary() {
  const [kind, setKind] = useState<Kind>("POST");
  const [category, setCategory] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<TemplateDto | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data, error, size, setSize, isLoading, isValidating } = useSWRInfinite<Page>(
    (index, prev) => {
      if (prev && prev.items.length < PAGE) return null;
      const p = new URLSearchParams({ type: kind, offset: String(index * PAGE), limit: String(PAGE) });
      if (category) p.set("category", category);
      if (search) p.set("search", search);
      if (savedOnly) p.set("saved", "1");
      return `/api/templates?${p}`;
    },
    fetchPage,
    { revalidateOnFocus: false },
  );
  const items = data?.flatMap((p) => p.items) ?? [];
  const total = data?.[0]?.total ?? 0;
  const isSaved = (t: TemplateDto) => overrides[t.id] ?? t.saved;

  const setSaved = (t: TemplateDto, saved: boolean) => setOverrides((o) => ({ ...o, [t.id]: saved }));

  const shown = savedOnly ? items.filter((t) => isSaved(t)) : items;
  return (
    <div className="flex flex-col gap-5" data-templates-library>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Template type"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setCategory("");
          }}
          options={[
            { value: "POST", label: "Posts" },
            { value: "HOOK", label: "Hooks" },
          ]}
        />
        <Button type="button" variant={savedOnly ? "inverse" : "secondary"} size="sm" aria-pressed={savedOnly} onClick={() => setSavedOnly((v) => !v)}>
          Saved
        </Button>
        <NativeSelect aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto min-w-44">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" />
          <Input aria-label="Search templates" placeholder="Search templates" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
      </div>


      {error ? (
        <EmptyState title="Couldn't load templates" body="Reload the page to try again." />
      ) : isLoading ? (
        <p role="status" className="text-[14px] text-text-2">
          Loading templates…
        </p>
      ) : shown.length === 0 ? (
        <EmptyState
          title={savedOnly ? "Nothing saved yet" : "No templates match"}
          body={savedOnly ? "Save a template to find it here again." : "Try another category or a different search."}
        />
      ) : (
        <>
          <p className="text-[13px] text-text-3" data-template-count>
            {total} {total === 1 ? "template" : "templates"}
          </p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 min-[1500px]:grid-cols-4">
            {shown.map((t) => (
              <li key={t.id} data-template-card={t.slug} className="orbit-panel flex flex-col gap-3 p-5">
                <button type="button" onClick={() => setOpen(t)} className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-card-sm text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">
                  <span className="text-[12px] text-text-3">{categoryLabel(t.category)}</span>
                  <span className="type-card-title text-text">{t.title}</span>
                  <span className="line-clamp-3 text-[14px] leading-[1.5] text-text-2">{t.why}</span>
                </button>
                <div className="flex items-center justify-end gap-2">
                  <SaveButton t={t} saved={isSaved(t)} onChange={(v) => setSaved(t, v)} />
                  <UseLink t={t} />
                </div>
              </li>
            ))}
          </ul>
          {data && data.at(-1)!.items.length === PAGE && (
            <Button type="button" variant="secondary" className="self-center" disabled={isValidating} onClick={() => void setSize(size + 1)}>
              {isValidating ? "Loading" : "Show more"}
            </Button>
          )}
        </>
      )}

      <Preview t={open} saved={open ? isSaved(open) : false} onChange={(v) => open && setSaved(open, v)} onClose={() => setOpen(null)} />
    </div>
  );
}
