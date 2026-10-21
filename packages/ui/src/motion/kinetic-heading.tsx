import type { CSSProperties, ElementType } from "react";
import { cn } from "../cn";

type Props = {
  /** The whole sentence. It becomes the element's accessible name, so it must stay byte for byte. */
  text: string;
  /** Lines on wide screens (≥ 640 px): the words of each line, joined with single spaces. */
  lines: string[];
  /** Lines below 640 px. Defaults to `lines`. */
  narrowLines?: string[];
  /** Heading level or element. */
  as?: ElementType;
  /** Delay before the first letter sets in, in ms. */
  delay?: number;
  className?: string;
  id?: string;
};

type Layer = "ink" | "pink" | "blue";

function breaksAfter(lines: string[]): Set<number> {
  const set = new Set<number>();
  let count = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    count += lines[i]!.split(" ").filter(Boolean).length;
    set.add(count);
  }
  return set;
}

/**
 * Kinetic display type (C2): every letter sets in with `font-stretch` 75 → 125 on a CSS stagger, and the pink and
 * blue plate copies run the same score behind it, 70 and 140 ms later, ending 3 px out of register. The layers are
 * `aria-hidden`; the heading's accessible name is `text` through `aria-label`. Under reduced motion the CSS renders
 * the final frame. No JS runs here, so the sequence starts with first paint.
 */
export function KineticHeading({ text, lines, narrowLines, as: Tag = "h1", delay = 160, className, id }: Props) {
  const words = text.split(" ").filter(Boolean);
  const wide = breaksAfter(lines);
  const narrow = breaksAfter(narrowLines ?? lines);
  if (words.join(" ") !== lines.join(" ").split(" ").filter(Boolean).join(" ")) {
    throw new Error("KineticHeading: `lines` must spell `text`");
  }

  let letterIndex = 0;
  const renderLayer = (layer: Layer) => {
    letterIndex = 0;
    return words.map((word, wi) => {
      const letters = [...word].map((ch) => {
        const i = letterIndex++;
        return (
          <span key={i} className="kinetic__letter" style={{ "--i": i } as CSSProperties}>
            {ch}
          </span>
        );
      });
      return (
        <span key={`${layer}-${wi}`}>
          <span className="kinetic__word">{letters}</span>
          {wi < words.length - 1 && " "}
          {wide.has(wi) && <br className="kinetic__br kinetic__br--wide" />}
          {narrow.has(wi) && <br className="kinetic__br kinetic__br--narrow" />}
        </span>
      );
    });
  };

  return (
    <Tag
      id={id}
      aria-label={text}
      className={cn("kinetic", className)}
      style={{ "--kinetic-delay": `${delay}ms` } as CSSProperties}
    >
      <span aria-hidden="true" className="kinetic__layer">
        {renderLayer("ink")}
      </span>
      <span aria-hidden="true" className="kinetic__layer kinetic__layer--pink">
        {renderLayer("pink")}
      </span>
      <span aria-hidden="true" className="kinetic__layer kinetic__layer--blue">
        {renderLayer("blue")}
      </span>
    </Tag>
  );
}
