"use client";

import { Suspense, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Pin, Plus } from "lucide-react";
import { IntentLink as Link } from "@/components/shell/intent-link";
import { cn } from "@brandloop/ui";
import { fetchJson, SPACES_KEY, type SpaceDto } from "@/lib/saves-client";
import { SpaceDialog } from "./space-dialog";

function Spaces({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = useSearchParams().get("space");
  const [creating, setCreating] = useState(false);
  const { data } = useSWR<{ spaces: SpaceDto[] }>(SPACES_KEY, (u: string) => fetchJson(u), { revalidateOnFocus: false });
  return (
    <div className="flex flex-col gap-1" data-spaces-nav>
      <div className="flex h-6 items-center justify-between pl-2.5 pr-1">
        <h3 className="text-[11px] text-text-3">Spaces</h3>
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-label="New space"
          className="orbit-transition grid size-6 place-items-center rounded-full text-text-3 hover:bg-line-soft hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-text"
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      {data && data.spaces.length === 0 && <p className="px-2.5 text-[12px] leading-[1.5] text-text-3">Make a space to group your saves.</p>}
      {data?.spaces.map((s) => {
        const active = pathname === "/saves" && current === s.id;
        return (
          <Link
            key={s.id}
            href={`/saves?space=${encodeURIComponent(s.id)}`}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "orbit-transition flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[14px]",
              active ? "bg-line-row font-medium text-text" : "text-text-soft hover:bg-line-soft hover:text-text",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            {s.pinned && <Pin aria-label="Pinned" className="size-3 shrink-0 text-text-3" />}
            {active && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent-text" />}
          </Link>
        );
      })}
      <SpaceDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

/** The user's spaces under "My library" in the Ideas sub-nav, pinned first, with a + that opens the new-space dialog. */
export function SpacesNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={null}>
      <Spaces onNavigate={onNavigate} />
    </Suspense>
  );
}
