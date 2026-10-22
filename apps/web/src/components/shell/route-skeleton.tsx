import type { ReactNode } from "react";
import { cn } from "@brandloop/ui";

/**
 * Route loading states (`loading.tsx`). Next shows them the moment a link is clicked, while the screen's data loads.
 * Each one is shaped like the screen it stands in for (same header position and title size, same column width), so
 * content replaces it without a jump. It stays invisible for its first 120 ms (`.route-loading`), so a fast load never
 * flashes a skeleton: the old screen gives way to the new one directly.
 */
function Frame({ children, className, fill }: { children: ReactNode; className?: string; fill?: boolean }) {
  return (
    <div data-route-loading="" data-route-fill={fill ? "" : undefined} aria-busy="true" className={cn("route-loading", className)}>
      <span role="status" className="sr-only">
        Loading
      </span>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  );
}

const Bar = ({ className }: { className?: string }) => <div className={cn("skeleton", className)} />;

/** The `PageHeader` footprint: a 40 px page title and an optional subtitle line. */
function Header({ width = "w-56", subtitle = true, max = "max-w-[880px]" }: { width?: string; subtitle?: boolean; max?: string }) {
  return (
    <div className={cn("w-full px-5 pt-8 md:px-8 md:pt-[28px]", max)}>
      <Bar className={cn("h-10 rounded-[10px]", width)} />
      {subtitle && <Bar className="mt-3.5 h-4 w-[min(420px,80%)]" />}
    </div>
  );
}

function Panel({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn("orbit-panel p-5", className)}>{children}</div>;
}

/** A titled screen with stacked rows (settings, memories, knowledge, strategy): header plus panels in an 880 column. */
export function PageSkeleton({ rows = 3, max = "max-w-[880px]", title = "w-56" }: { rows?: number; max?: string; title?: string }) {
  return (
    <Frame>
      <Header width={title} max={max} />
      <div className={cn("flex w-full flex-col gap-4 px-5 pb-16 pt-7 md:px-8", max)}>
        {Array.from({ length: rows }, (_, i) => (
          <Panel key={i} className="flex flex-col gap-3">
            <Bar className="h-4 w-1/3" />
            <Bar className="h-3.5 w-[85%]" />
            <Bar className="h-3.5 w-[60%]" />
          </Panel>
        ))}
      </div>
    </Frame>
  );
}

/** Wide dashboards (analytics, engage, activities, sprint): title, then a row of stat panels and a large panel. */
export function DashboardSkeleton({ stats = 3 }: { stats?: number }) {
  return (
    <Frame className="w-full max-w-[1376px] px-5 pb-16 pt-8 md:px-8 md:pt-[28px]">
      <Bar className="h-10 w-60 rounded-[10px]" />
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {Array.from({ length: stats }, (_, i) => (
          <Panel key={i} className="flex h-[132px] flex-col justify-between">
            <Bar className="h-3.5 w-24" />
            <Bar className="h-9 w-20 rounded-[10px]" />
          </Panel>
        ))}
      </div>
      <Panel className="mt-4 h-[280px]">
        <Bar className="h-4 w-40" />
      </Panel>
    </Frame>
  );
}

/** Posts board / list: the title with its count, the view switch and search pills, then the columns. */
export function PostsSkeleton() {
  return (
    <Frame>
      <div className="px-5 pb-5 pt-8 md:px-8 md:pt-[28px]">
        <Bar className="h-10 w-40 rounded-[10px]" />
        <div className="mt-3.5 flex gap-2.5">
          <Bar className="h-9 w-[220px] rounded-pill" />
          <Bar className="h-9 w-40 rounded-pill" />
        </div>
      </div>
      <div className="grid gap-4 px-5 md:grid-cols-3 md:px-8">
        {[3, 2, 1].map((n, col) => (
          <div key={col} className="flex flex-col gap-3">
            <Bar className="h-4 w-24" />
            {Array.from({ length: n }, (_, i) => (
              <Panel key={i} className="flex flex-col gap-2.5">
                <Bar className="h-4 w-3/4" />
                <Bar className="h-3.5 w-full" />
                <Bar className="h-3.5 w-1/2" />
              </Panel>
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Home: the greeting and the composer, centred where the real ones sit. */
export function HomeSkeleton() {
  return (
    <Frame className="flex min-h-full flex-col">
      <div className="min-h-[68px] max-md:hidden" />
      <div className="flex flex-1 flex-col items-center justify-center gap-[18px] px-5 pb-6 pt-4 md:gap-[26px] md:px-8 md:pb-16 md:pt-6">
        <div className="w-full max-w-[760px]">
          <Bar className="h-12 w-[min(520px,90%)] rounded-[12px]" />
        </div>
        <div className="h-[132px] w-full max-w-[760px] rounded-[22px] border border-line-control bg-panel" />
      </div>
    </Frame>
  );
}

/** A chat thread: the title bar, two turns, and the docked composer. */
export function ChatSkeleton() {
  return (
    <Frame fill className="flex h-full min-h-0 flex-col">
      <div className="flex items-center px-4 py-3 sm:px-8 md:py-[18px]">
        <Bar className="h-5 w-48" />
      </div>
      <div className="min-h-0 flex-1 px-4 pt-3 sm:px-8">
        <div className="mx-auto flex w-full max-w-[780px] flex-col gap-7">
          <div className="flex justify-end">
            <Bar className="h-11 w-[min(320px,70%)] rounded-[18px]" />
          </div>
          <div className="flex gap-4">
            <Bar className="size-7 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2.5 pt-1">
              <Bar className="h-3.5 w-[90%]" />
              <Bar className="h-3.5 w-[75%]" />
              <Bar className="h-3.5 w-[55%]" />
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 pb-3 pt-2 sm:px-8 md:pb-6">
        <div className="mx-auto h-[104px] w-full max-w-[780px] rounded-[22px] border border-line-control bg-panel sm:pl-11" />
      </div>
    </Frame>
  );
}

/** The post editor: title and meta on the left, the post sheet below. */
export function EditorSkeleton() {
  return (
    <Frame fill className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 px-4 pt-5 sm:px-8 lg:pt-6">
        <Bar className="h-7 w-[min(360px,70%)] rounded-[8px]" />
        <Bar className="mt-3 h-3.5 w-48" />
        <Panel className="mt-6 flex max-w-[640px] flex-col gap-3">
          <Bar className="h-3.5 w-full" />
          <Bar className="h-3.5 w-[92%]" />
          <Bar className="h-3.5 w-[80%]" />
          <Bar className="h-3.5 w-[40%]" />
        </Panel>
      </div>
    </Frame>
  );
}

/** Idea and card grids (For you, carousel): title and subtitle, then a three-up grid of panels. */
export function GridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <Frame>
      <Header max="max-w-[1120px]" />
      <div className="grid w-full max-w-[1120px] gap-4 px-5 pb-16 pt-7 md:grid-cols-2 md:px-8 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <Panel key={i} className="flex h-[180px] flex-col gap-3">
            <div className="flex gap-2">
              <Bar className="h-6 w-16 rounded-pill" />
              <Bar className="h-6 w-20 rounded-pill" />
            </div>
            <Bar className="h-5 w-[90%]" />
            <Bar className="h-5 w-[65%]" />
          </Panel>
        ))}
      </div>
    </Frame>
  );
}
