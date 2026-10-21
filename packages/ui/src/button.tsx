"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { useRef, type ComponentProps, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "./cn";

/**
 * Riso button (riso-system.md section 5.1 and 6). Plated variants (primary ink, generate blue, danger) are a static
 * plate (the button box) with a moving face child: the face lands on the plate on press (B1) and its pink and blue
 * plates misregister on hover (B2). Secondary soaks in ink from the pointer's entry side (B3); ghost icon buttons
 * stamp (B4). All motion is CSS in `cinematic.css`; keyboard presses mirror the pointer press for 120 ms.
 */
export const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "btn--plated btn--primary",
      generate: "btn--plated btn--generate",
      danger: "btn--plated btn--danger",
      secondary: "btn--flat btn--secondary",
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

const PLATED = new Set(["primary", "generate", "danger"]);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  children,
  onKeyDown,
  onKeyUp,
  onPointerEnter,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  const resolved = variant ?? "primary";
  const plated = PLATED.has(resolved) && !asChild;
  const timer = useRef<number | null>(null);

  function keyDown(e: KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented || (e.key !== " " && e.key !== "Enter")) return;
    e.currentTarget.setAttribute("data-pressed", "");
    if (timer.current) window.clearTimeout(timer.current);
    const el = e.currentTarget;
    timer.current = window.setTimeout(() => el.removeAttribute("data-pressed"), 120);
  }
  function keyUp(e: KeyboardEvent<HTMLButtonElement>) {
    onKeyUp?.(e);
  }
  function pointerEnter(e: PointerEvent<HTMLButtonElement>) {
    onPointerEnter?.(e);
    if (resolved !== "secondary") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--soak-x", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    e.currentTarget.style.setProperty("--soak-y", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  }

  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onPointerEnter={pointerEnter}
      {...props}
    >
      {plated ? <span className="btn__face">{children}</span> : children}
    </Comp>
  );
}
