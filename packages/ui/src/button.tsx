"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { useRef, type ComponentProps, type KeyboardEvent } from "react";
import { cn } from "./cn";

/**
 * Drafting-table button (system.md section 5). Plated variants (`primary`, and `generate` as its alias) are a static
 * 2 px graphite-grey plate (the button box) with a graphite face child that lands on the plate when pressed; keyboard
 * presses mirror the pointer for 120 ms. `secondary` is a hairline frame, `danger` a signal frame (status only),
 * `ghost` text. All motion is CSS in `drafting.css`.
 */
export const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "btn--plated btn--primary",
      generate: "btn--plated btn--primary",
      secondary: "btn--flat btn--secondary",
      danger: "btn--flat btn--danger",
      ghost: "btn--flat btn--ghost",
    },
    size: {
      sm: "btn--sm",
      md: "btn--md",
      icon: "btn--icon",
      "icon-lg": "btn--icon-lg",
    },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

const PLATED = new Set(["primary", "generate"]);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  children,
  onKeyDown,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  const plated = PLATED.has(variant ?? "primary") && !asChild;
  const timer = useRef<number | null>(null);

  function keyDown(e: KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented || (e.key !== " " && e.key !== "Enter")) return;
    const el = e.currentTarget;
    el.setAttribute("data-pressed", "");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => el.removeAttribute("data-pressed"), 120);
  }

  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} onKeyDown={keyDown} {...props}>
      {plated ? <span className="btn__face">{children}</span> : children}
    </Comp>
  );
}
