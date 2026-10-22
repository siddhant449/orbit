"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "./cn";

/**
 * Orbit button (system §6.3, migration §2): one element, a pill. Colour answers in 150 ms, the lift and scale settle
 * over 400 ms out-expo (`orbit-transition`), press is `scale(.98)`. Lifts are `motion-safe:` so reduced motion keeps
 * only the colour change. API kept from Drafting: `primary`/`generate` are the accent fill, `secondary` the ghost
 * outline, `ghost` a text pill, `danger` a neutral pill with danger text.
 *
 * Sizes come before variants in the class list so `micro` and `send`, which carry their own box, win the merge.
 */
export const buttonVariants = cva(
  [
    "orbit-transition relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill font-medium",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      size: {
        sm: "h-8 px-3.5 text-[13px] motion-safe:hover:-translate-y-px",
        md: "min-h-10 px-[18px] text-sm motion-safe:hover:-translate-y-px",
        lg: "min-h-[52px] px-6 text-[15px] motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.02]",
        icon: "size-10 rounded-full p-0 motion-safe:hover:-translate-y-px",
        "icon-lg": "size-12 rounded-full p-0 motion-safe:hover:-translate-y-px [&_svg]:size-[18px]",
      },
      variant: {
        primary: "bg-accent text-on-accent hover:bg-accent-hover hover:shadow-glow",
        generate: "bg-accent text-on-accent hover:bg-accent-hover hover:shadow-glow",
        secondary: "border border-line-strong text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse",
        ghost: "text-text-2 hover:bg-line-soft hover:text-text",
        danger:
          "border border-line-4 text-danger hover:border-danger hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]",
        paper: "bg-inverse text-on-inverse hover:bg-inverse-hover hover:text-on-inverse-hover",
        inverse: "bg-inverse text-on-inverse",
        micro: "h-auto min-h-6 border border-line-4 px-2.5 text-[11px] text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse [&_svg]:size-3",
        send: "size-12 rounded-full bg-accent p-0 text-on-accent hover:bg-accent-hover hover:shadow-glow [&_svg]:size-[18px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
