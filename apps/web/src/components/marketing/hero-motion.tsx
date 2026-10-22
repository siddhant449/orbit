"use client";

import { useEffect } from "react";

/**
 * Hero cost control (system §7.5, §8). The art itself is server-rendered SVG; this island only
 * - pauses every hero loop (CSS animations + the SMIL turbulence) when the hero is off-screen or the tab is hidden,
 * - starts the turbulence morph once, only when motion is allowed,
 * - drifts the orb toward the pointer (±18 px x / ±12 px y, 60 ms lerp), rAF only while it is settling.
 */
export function HeroMotion({ targetId }: { targetId: string }) {
  useEffect(() => {
    const hero = document.getElementById(targetId);
    if (!hero) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const svg = hero.querySelector<SVGSVGElement>(".orb svg");
    const flow = hero.querySelector<SVGAnimationElement>("[data-orb-flow]");
    const orb = hero.querySelector<HTMLElement>("[data-orb]");
    let visible = true;
    let started = false;

    const apply = () => {
      const run = visible && document.visibilityState === "visible" && !reduce.matches;
      hero.classList.toggle("is-paused", !run);
      if (!svg || !flow) return;
      if (run) {
        if (!started) {
          flow.beginElement();
          started = true;
        }
        svg.unpauseAnimations();
      } else {
        svg.pauseAnimations();
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      apply();
    });
    io.observe(hero);
    document.addEventListener("visibilitychange", apply);
    reduce.addEventListener("change", apply);
    apply();

    // Pointer drift, desktop pointers only.
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    let last = 0;
    const step = (t: number) => {
      const dt = last ? t - last : 16;
      last = t;
      const k = 1 - Math.exp(-dt / 60);
      x += (tx - x) * k;
      y += (ty - y) * k;
      orb?.style.setProperty("--orb-x", `${x.toFixed(2)}px`);
      orb?.style.setProperty("--orb-y", `${y.toFixed(2)}px`);
      if (Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05) raf = requestAnimationFrame(step);
      else {
        raf = 0;
        last = 0;
      }
    };
    const fine = window.matchMedia("(pointer: fine)");
    const onMove = (e: PointerEvent) => {
      if (reduce.matches || !visible) return;
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 36;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 24;
      if (!raf) raf = requestAnimationFrame(step);
    };
    if (fine.matches) hero.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", apply);
      reduce.removeEventListener("change", apply);
      hero.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [targetId]);

  return null;
}
