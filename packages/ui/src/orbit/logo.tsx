import { cn } from "../cn";

// Raster exports of the brand mark, served from each app's public/ folder.
const MARK_SIZES = [32, 64, 96, 128, 256] as const;

function markSrc(px: number) {
  const fit = MARK_SIZES.find((s) => s >= px) ?? MARK_SIZES[MARK_SIZES.length - 1];
  return `/orbit-mark-${fit}.png`;
}

/**
 * Orbit mark (system §6.2): the planet-and-moon brand image, followed by the lower-case `orbit` wordmark. Decorative;
 * the link around it carries the name ("Orbit home").
 */
export function LogoMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size brand asset shared by both apps
    <img
      src={markSrc(size)}
      srcSet={`${markSrc(size)} 1x, ${markSrc(size * 2)} 2x, ${markSrc(size * 3)} 3x`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={cn("shrink-0 select-none", className)}
    />
  );
}

// The wordmark grows with the mark (20px at the default 18px mark) so larger lockups keep the same proportions.
export function Logo({ size = 18, withWordmark = true, className }: { size?: number; withWordmark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center text-text", className)} style={{ gap: Math.max(8, Math.round(size * 0.32)) }}>
      <LogoMark size={size} />
      {withWordmark && (
        <span className="type-wordmark" style={{ fontSize: Math.max(20, Math.round(size * 0.92)) }}>
          orbit
        </span>
      )}
    </span>
  );
}
