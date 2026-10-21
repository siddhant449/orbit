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
 * Kinetic display type (D2): every letter sets in on a CSS stagger, from light and tracked-out to the heading's weight
 * and tight tracking. The letter layer is `aria-hidden`; the heading's accessible name is `text` through
 * `aria-label`. Under reduced motion the CSS renders the final frame. No JS runs here, so the sequence starts with
 * first paint.
 */
export function KineticHeading({ text, lines, narrowLines, as: Tag = "h1", delay = 160, className, id }: Props) {
  const words = text.split(" ").filter(Boolean);
  const wide = breaksAfter(lines);
  const narrow = breaksAfter(narrowLines ?? lines);
  if (words.join(" ") !== lines.join(" ").split(" ").filter(Boolean).join(" ")) {
    throw new Error("KineticHeading: `lines` must spell `text`");
  }

  let letterIndex = 0;
  const content = words.map((word, wi) => {
    const letters = [...word].map((ch) => {
      const i = letterIndex++;
      return (
        <span key={i} className="kinetic__letter" style={{ "--i": i } as CSSProperties}>
          {ch}
        </span>
      );
    });
    return (
      <span key={wi}>
        <span className="kinetic__word">{letters}</span>
        {wi < words.length - 1 && " "}
        {wide.has(wi) && <br className="kinetic__br kinetic__br--wide" />}
        {narrow.has(wi) && <br className="kinetic__br kinetic__br--narrow" />}
      </span>
    );
  });

  return (
    <Tag
      id={id}
      aria-label={text}
      className={cn("kinetic", className)}
      style={{ "--kinetic-delay": `${delay}ms` } as CSSProperties}
    >
      <span aria-hidden="true" className="kinetic__layer">
        {content}
      </span>
    </Tag>
  );
}
