import type { CSSProperties } from "react";
import { cn } from "../cn";

export type LineArtName = "sheet" | "stack" | "compass";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.25, strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" } as const;

/**
 * Monochrome ink line drawings (D5) for the hero and empty states. Every stroke carries `pathLength="1"` and a
 * `--i` index so `drafting.css` can draw them in sequence; under reduced motion they render complete. Decorative:
 * `aria-hidden`, strokes in `currentColor`.
 */
export function LineArt({ name, className, delay }: { name: LineArtName; className?: string; delay?: number }) {
  const style = delay !== undefined ? ({ "--draw-delay": `${delay}ms` } as CSSProperties) : undefined;
  const i = (n: number) => ({ style: { "--i": n } as CSSProperties, pathLength: 1 });
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 240 180"
      className={cn("draw block overflow-visible", className)}
      style={style}
      {...stroke}
    >
      {name === "sheet" && (
        <>
          {/* A sheet on the table, slightly turned, with its ruled lines and a pencil laid across it. */}
          <path {...i(0)} d="M48 30 L186 22 L196 150 L58 158 Z" />
          <path {...i(1)} d="M64 58 L172 52" />
          <path {...i(2)} d="M66 78 L174 72" />
          <path {...i(3)} d="M68 98 L150 94" />
          <path {...i(4)} d="M70 118 L176 112" />
          <path {...i(5)} d="M24 164 L208 164" />
          <path {...i(6)} d="M24 158 L24 170 M208 158 L208 170" />
          <path {...i(7)} d="M130 136 L214 62" />
          <path {...i(8)} d="M124 142 L130 136 L136 142 Z" />
          <path {...i(9)} d="M212 60 L222 70" />
          <path {...i(10)} d="M214 20 L214 10 M209 15 L219 15" />
        </>
      )}
      {name === "stack" && (
        <>
          {/* Three sheets, fanned, inside a measured frame. */}
          <path {...i(0)} d="M20 20 L20 10 M10 20 L20 20 M220 20 L230 20 M220 20 L220 10 M20 160 L20 170 M10 160 L20 160 M220 160 L230 160 M220 160 L220 170" />
          <path {...i(1)} d="M76 128 L160 128 L160 48 L76 48 Z" />
          <path {...i(2)} d="M66 118 L66 38 L150 38" />
          <path {...i(3)} d="M56 108 L56 28 L140 28" />
          <path {...i(4)} d="M90 70 L146 70 M90 86 L146 86 M90 102 L128 102" />
          <path {...i(5)} d="M176 48 L176 128 M172 48 L180 48 M172 128 L180 128" />
        </>
      )}
      {name === "compass" && (
        <>
          <path {...i(0)} d="M120 24 L72 156" />
          <path {...i(1)} d="M120 24 L168 156" />
          <path {...i(2)} d="M96 90 L144 90" />
          <circle {...i(3)} cx="120" cy="24" r="6" />
          <path {...i(4)} d="M40 160 L200 160" />
          <path {...i(5)} d="M72 156 A48 48 0 0 0 168 156" />
        </>
      )}
    </svg>
  );
}
