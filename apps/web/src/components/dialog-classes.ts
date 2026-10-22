/**
 * Orbit dialog surfaces for Radix Dialog / AlertDialog (system §5, §6.6): a dimmed overlay, a `panel` with radius 24
 * and the overlay shadow, popping in 200 ms out-expo (static under reduced motion via the global guard). Radix keeps
 * focus inside and returns it to the trigger on close.
 */
export const dialogOverlayClass =
  "fixed inset-0 z-50 bg-[rgba(10,10,11,0.55)] backdrop-blur-[2px] data-[state=closed]:animate-[fade-out_120ms_var(--ease-out)_both] data-[state=open]:animate-[fade-in_180ms_var(--ease-out)_both]";

export const dialogContentClass =
  "orbit-panel fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[24px] p-6 shadow-[var(--panel-highlight),var(--shadow-draft)] sm:p-7 data-[state=closed]:animate-[fade-out_120ms_var(--ease-out)_both] data-[state=open]:animate-[orbit-pop_200ms_var(--ease-out)_both]";

export const dialogTitleClass = "type-card-title text-text";
export const dialogDescriptionClass = "mt-2 text-[14px] leading-[1.55] text-text-2";
export const dialogActionsClass = "mt-6 flex flex-wrap justify-end gap-2";

/** Multi-line field matching `Input` (ground fill, `line-control` border per A17, accent focus ring). */
export const textareaClass =
  "w-full resize-y rounded-card-sm border border-line-control bg-ground px-3.5 py-3 text-[14px] leading-relaxed text-text placeholder:text-text-3 orbit-transition hover:border-text-3 focus-visible:border-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";
