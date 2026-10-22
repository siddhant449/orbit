import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@brandloop/ui";
import type { LatestChat, StrategySummary } from "@/lib/home-summary";

/** First-paint rise for card i: the composer lands at +120 ms, cards from +340 ms, 120 ms apart (system §7.2). */
const rise = (i: number) => ({ "--rise-delay": `${340 + i * 120}ms` }) as CSSProperties;

const card =
  "orbit-panel orbit-rise flex flex-col gap-1 !rounded-[16px] p-4 max-md:flex-row max-md:items-center max-md:justify-between max-md:gap-3 md:min-h-[152px] md:!rounded-[18px] md:p-5";

function Label({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <span className="flex min-h-6 items-center justify-between gap-3 text-[12px] text-text-2">
      <span>{children}</span>
      {end}
    </span>
  );
}

/** Micro pill (system §6.3): the accent "Open" on mobile rows and inside the plan card. Decorative inside a card link. */
function OpenPill({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill bg-accent px-3.5 text-[12px] font-medium text-on-accent",
        className,
      )}
    >
      Open
    </span>
  );
}

const ago = (iso: string, now: Date) => {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

/**
 * Home cards (screens.md B1, system §6.15): Today's post, Activities and Your week, each a real link or an honest empty
 * state; nothing from Orbit's sample content. On mobile they stack as rows (p16) and the third becomes the latest chat
 * when one exists.
 */
export function HomeCards({
  strategy,
  latestChat,
  now = new Date(),
}: {
  strategy: StrategySummary | null;
  latestChat: LatestChat | null;
  now?: Date;
}) {
  return (
    <div className="grid w-full max-w-[760px] grid-cols-1 gap-3 md:mt-2 md:grid-cols-[repeat(auto-fit,minmax(min(192px,100%),1fr))] md:gap-3">
      <Link href="/challenge" className={cn(card, "orbit-panel--interactive")} style={rise(0)}>
        <span className="flex min-w-0 flex-col gap-1 md:flex-1 md:gap-3">
          <Label>Today&apos;s post</Label>
          <span className="type-card-title text-text max-md:text-[19px]">Start the 30-day sprint</span>
          <span className="text-[12px] text-text-2 md:mt-auto">One proven format every weekday</span>
        </span>
        <OpenPill className="h-8 md:hidden" />
      </Link>

      <div className={card} style={rise(1)}>
        <span className="flex min-w-0 flex-col gap-1 md:flex-1 md:gap-3">
          <Label>Activities</Label>
          <span className="text-[15px] font-medium leading-snug text-text md:text-[14px] md:font-normal md:text-text-soft">
            Daily goals arrive with Activities
          </span>
        </span>
      </div>

      <Link
        href="/strategy"
        className={cn(card, "orbit-panel--interactive", latestChat && "max-md:hidden")}
        style={rise(2)}
      >
        {strategy ? (
          <span className="flex min-w-0 flex-1 flex-col gap-1 md:gap-3">
            <Label end={<OpenPill className="h-6 px-2.5 text-[11px]" />}>Your plan</Label>
            {strategy.slots.length > 0 ? (
              <span className="flex flex-col gap-2 text-[13px]">
                {strategy.slots.map((slot) => (
                  <span key={`${slot.day}-${slot.title}`} className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-text-3 tabular-nums">{slot.day}</span>
                    <span className="truncate text-text">{slot.title}</span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-[13px] text-text-soft">Add a series or format to your strategy</span>
            )}
            <span className="text-[12px] text-text-3 md:mt-auto">From your saved strategy</span>
          </span>
        ) : (
          <>
            <span className="flex min-w-0 flex-col gap-1 md:flex-1 md:gap-3">
              <Label>Your week</Label>
              <span className="type-card-title text-text max-md:text-[19px]">Build your strategy</span>
              <span className="text-[12px] text-text-2 md:mt-auto">Decide what you post each week</span>
            </span>
            <OpenPill className="h-8 md:hidden" />
          </>
        )}
      </Link>

      {latestChat && (
        <Link href={`/chat/${latestChat.id}`} className={cn(card, "orbit-panel--interactive !flex-col !items-stretch md:hidden")} style={rise(2)}>
          <Label end={<span className="tabular-nums">{ago(latestChat.lastActivityAt, now)}</span>}>Latest draft</Label>
          <span className="truncate text-[15px] font-medium text-text">{latestChat.title}</span>
        </Link>
      )}
    </div>
  );
}
