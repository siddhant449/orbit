import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "../cn";

type PanelProps<T extends ElementType> = {
  as?: T;
  /** Hover lifts 3 px with `panel-hover` and a brighter border (dark) or a softer shadow (light). Use on links. */
  interactive?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

/**
 * Panel (system §6.6): `panel` fill, radius 18, padding 20, inset top highlight in both themes; `line` border in dark,
 * soft shadow in light. Clickable panels are links with the whole card as the hit area: `<Panel as="a" interactive>`.
 */
export function Panel<T extends ElementType = "div">({ as, interactive = false, className, ...props }: PanelProps<T>) {
  const Tag: ElementType = as ?? "div";
  return <Tag className={cn("orbit-panel block p-5", interactive && "orbit-panel--interactive", className)} {...props} />;
}
