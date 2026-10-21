import { Fragment, type CSSProperties, type ElementType } from "react";
import { cn } from "../cn";

/**
 * Headline line reveal (system §7): each authored line rises 112 % through a clip mask, 1.2 s out-expo, 80 ms apart
 * (CSS, so it starts with first paint). The lines are the heading's real text, joined by single spaces, so the
 * heading's text and accessible name are the full sentence exactly once; no duplicate copy is needed. Reduced motion
 * and client navigations render the lines in place.
 */
export function LineReveal({
  as: Tag = "h2",
  lines,
  className,
  delay,
  stagger,
  id,
}: {
  as?: ElementType;
  lines: readonly string[];
  className?: string;
  /** Delay before the first line, in ms. */
  delay?: number;
  /** Between lines, in ms (80 by default; the three-line marketing hero uses 120). */
  stagger?: number;
  id?: string;
}) {
  const style = {
    ...(delay !== undefined && { "--line-delay": `${delay}ms` }),
    ...(stagger !== undefined && { "--line-stagger": `${stagger}ms` }),
  } as CSSProperties;
  return (
    <Tag id={id} className={cn("line-reveal", className)} style={style}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className="line-reveal__line">
            <span style={{ "--i": i } as CSSProperties}>{line}</span>
          </span>
        </Fragment>
      ))}
    </Tag>
  );
}
