import { cn } from "../cn";

/**
 * Orbit mark (system §6.2): a planet with a tilted ring and a moon, stroked in `accent-text`, followed by the lower-case
 * `orbit` wordmark. Decorative; the link around it carries the name ("Orbit home").
 */
export function LogoMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0 text-accent-text", className)}
    >
      <g transform="translate(10 10) rotate(-28)" strokeLinecap="round">
        <path d="M-9 0A9 3.4 0 0 1 9 0" strokeWidth="1.3" opacity="0.4" />
        <circle r="4.5" strokeWidth="2.6" />
        <path d="M-9 0A9 3.4 0 0 0 9 0" strokeWidth="1.5" />
        <circle cx="0" cy="3.4" r="1.7" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export function Logo({ size = 18, withWordmark = true, className }: { size?: number; withWordmark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-text", className)}>
      <LogoMark size={size} />
      {withWordmark && <span className="type-wordmark">orbit</span>}
    </span>
  );
}
