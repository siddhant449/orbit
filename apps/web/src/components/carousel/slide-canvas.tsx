"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@brandloop/ui";
import type { SlideInput } from "@/lib/carousel/layout";
import { fontsReady, paintSlide } from "@/lib/carousel/render";
import { plainText } from "@/lib/carousel/view";

let fontsSettled = false;

/**
 * One slide painted on a canvas by the same code the PDF export uses. It fills its box's width, at the device's pixel
 * ratio, and repaints when the slide, the box or the fonts change. The words are the canvas's accessible name.
 */
export function SlideCanvas({ input, className }: { input: SlideInput; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [fonts, setFonts] = useState(fontsSettled);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (fonts) return;
    let live = true;
    void fontsReady().then(() => {
      fontsSettled = true;
      if (live) setFonts(true);
    });
    return () => {
      live = false;
    };
  }, [fonts]);

  useEffect(() => {
    const el = ref.current;
    if (!el || width === 0) return;
    paintSlide(el, input, Math.round(width * Math.min(window.devicePixelRatio || 1, 3)));
  }, [input, width, fonts]);

  const words = [plainText(input.slide.title), plainText(input.slide.body)].filter((t) => t.trim()).join(". ");
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`Slide ${input.index + 1} of ${input.count}${words ? `: ${words}` : ", empty"}`}
      data-slide-canvas=""
      className={cn("block h-auto w-full", input.aspect === "4:5" ? "aspect-[4/5]" : "aspect-square", className)}
    />
  );
}
