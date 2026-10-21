import { cn } from "@brandloop/ui";

/** The loop mark: an open ring whose tail returns as a dot. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-6 text-jade", className)}>
      <path
        d="M19 12a7 7 0 1 1-3.2-5.88"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="19" cy="6.5" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      {!collapsed && (
        <span className="font-display text-[19px] font-semibold tracking-[-0.02em] text-ink">
          Brandloop
        </span>
      )}
    </span>
  );
}
