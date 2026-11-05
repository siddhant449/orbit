"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { AlertDialog, Dialog } from "radix-ui";
import { Heart, Pencil, Trash2 } from "lucide-react";
import { Button, Input, NativeSelect, Segmented } from "@brandloop/ui";
import { CATEGORIES } from "@brandloop/agent/client";
import { CloseIcon, SearchIcon } from "@brandloop/ui/icons";
import { EmptyState } from "@/components/page";
import { dialogActionsClass, dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass } from "@/components/dialog-classes";
import { SaveMenu } from "@/components/saves/save-menu";
import { promptHref } from "@/lib/prompt-param";
import { categoryLabel, NEED_LABELS, templateHref, usedLabel, type TemplateDto } from "./labels";
import { TemplateForm } from "./template-form";

type Kind = "POST" | "HOOK";
type Page = { total: number; items: TemplateDto[] };
const PAGE = 24;
type Sort = "popular" | "newest";

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
  const [sort, setSort] = useState<Sort>("popular");
  const [form, setForm] = useState<{ edit?: TemplateDto } | null>(null);
  const [deleting, setDeleting] = useState<TemplateDto | null>(null);
  const [likes, setLikes] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<TemplateDto | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<Page>(
    (index, prev) => {
      if (prev && prev.items.length < PAGE) return null;
      const p = new URLSearchParams({ type: kind, sort, offset: String(index * PAGE), limit: String(PAGE) });
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

  const likeOf = (t: TemplateDto) => likes[t.id] ?? { liked: t.liked, count: t.likeCount };

  async function toggleLike(t: TemplateDto) {
    const cur = likeOf(t);
    const next = { liked: !cur.liked, count: Math.max(0, cur.count + (cur.liked ? -1 : 1)) };
    setLikes((l) => ({ ...l, [t.id]: next }));
    setFailed(null);
    const res = await fetch(`/api/templates/${encodeURIComponent(t.id)}/like`, { method: next.liked ? "POST" : "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setLikes((l) => ({ ...l, [t.id]: cur }));
      setFailed("Couldn't update that like. Try again.");
    }
  }

  async function remove(t: TemplateDto) {
    setFailed(null);
    const res = await fetch(`/api/templates/${encodeURIComponent(t.id)}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) await mutate();
    else setFailed("Couldn't delete that template. Try again.");
  }

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
        <NativeSelect aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-auto min-w-36">
          <option value="popular">Popular</option>
          <option value="newest">Newest</option>
        </NativeSelect>
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" />
          <Input aria-label="Search templates" placeholder="Search templates" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        <Button type="button" size="sm" className="sm:ml-auto" onClick={() => setForm({})} data-new-template>
          + New template
        </Button>
      </div>

      {failed && (
        <p role="alert" className="text-[13px] text-danger">
          {failed}
        </p>
      )}

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
                  <span className="text-[12px] text-text-3">
                    {categoryLabel(t.category)}
                    {t.own && <span data-template-own> · You</span>}
                  </span>
                  <span className="type-card-title text-text">{t.title}</span>
                  <span className="line-clamp-3 text-[14px] leading-[1.5] text-text-2">{t.why}</span>
                </button>
                <div className="flex items-center gap-1 text-[12px] text-text-3">
                  <button
                    type="button"
                    aria-pressed={likeOf(t).liked}
                    aria-label={`${likeOf(t).liked ? "Unlike" : "Like"} ${t.title}, ${likeOf(t).count} ${likeOf(t).count === 1 ? "like" : "likes"}`}
                    data-template-like
                    onClick={() => void toggleLike(t)}
                    className="orbit-transition inline-flex h-9 items-center gap-1.5 rounded-pill px-2.5 text-text-2 hover:bg-line-soft hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-text"
                  >
                    <Heart aria-hidden="true" className={`size-4 ${likeOf(t).liked ? "fill-accent-text text-accent-text" : ""}`} />
                    <span data-like-count className="tabular-nums">
                      {likeOf(t).count}
                    </span>
                  </button>
                  <span data-template-used>{usedLabel(t.useCount)}</span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {t.own && (
                    <>
                      <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Edit ${t.title}`} onClick={() => setForm({ edit: t })}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Delete ${t.title}`} onClick={() => setDeleting(t)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </>
                  )}
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

      <TemplateForm
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        editId={form?.edit?.id}
        prefill={form?.edit ? { title: form.edit.title, type: form.edit.type, category: form.edit.category, skeleton: form.edit.skeleton, why: form.edit.why } : undefined}
        onSaved={() => void mutate()}
      />
      <AlertDialog.Root open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={dialogOverlayClass} />
          <AlertDialog.Content className={`${dialogContentClass} max-w-md`}>
            <AlertDialog.Title className={dialogTitleClass}>Delete {deleting?.title}?</AlertDialog.Title>
            <AlertDialog.Description className={dialogDescriptionClass}>Posts already written with it stay as they are. This can&apos;t be undone.</AlertDialog.Description>
            <div className={dialogActionsClass}>
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button onClick={() => deleting && void remove(deleting)}>Delete template</Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <Preview t={open} saved={open ? isSaved(open) : false} onChange={(v) => open && setSaved(open, v)} onClose={() => setOpen(null)} />
    </div>
  );
}
