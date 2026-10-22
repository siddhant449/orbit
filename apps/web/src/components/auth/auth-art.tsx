import { cn } from "@brandloop/ui";
import { AuthShader } from "./auth-shader";

/**
 * The right-hand artwork, a framed sheet (28 px, system §5): the product line set large at the top, and below it the
 * dithered planet rising from the bottom edge inside one hairline orbit with a single satellite, the Orbit mark drawn
 * as a scene. The orbit is drawn in a stretched 100x100 box (non-scaling strokes) so it stays centred on the planet at
 * any panel size; the satellite is an HTML dot placed on the same ellipse. Decorative only.
 */
export function AuthArt({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative", className)}>
      <div className="relative h-full overflow-hidden rounded-[20px] border border-line bg-ground lg:rounded-[28px]">
        <AuthShader className="absolute inset-0" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full text-text" viewBox="0 0 100 100" preserveAspectRatio="none">
          <g transform="rotate(-10 50 80)" fill="none" vectorEffect="non-scaling-stroke">
            <ellipse cx="50" cy="80" rx="56" ry="14" stroke="currentColor" strokeOpacity="0.42" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
            <ellipse cx="50" cy="80" rx="74" ry="21" stroke="currentColor" strokeOpacity="0.14" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
        {/* On the inner orbit at 320°: (50 + 56·cos, 80 + 14·sin) rotated -10° about the planet's centre. */}
        <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text" style={{ left: "90.7%", top: "63.7%" }} />

        <p className="type-section absolute left-10 top-10 hidden max-w-[11ch] text-text lg:block xl:left-12 xl:top-12">
          Write posts that sound like you.
        </p>
      </div>
    </div>
  );
}
