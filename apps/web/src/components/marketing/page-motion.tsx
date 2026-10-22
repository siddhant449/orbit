"use client";

import { useEffect, useSyncExternalStore } from "react";

const RM = "(prefers-reduced-motion: reduce)";
const subscribeRM = (cb: () => void) => {
  const mq = window.matchMedia(RM);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * Page-level motion (p31), one island for everything that is not the hero art or the loop:
 * - one IntersectionObserver for reveals (900 ms, 18 px, 120 ms stagger via --i, once),
 * - nav pill shrink after the hero,
 * - marquees pause when off-screen,
 * - count-ups (1.2 s) on first view, with `motion`'s animate loaded on demand,
 * - composer sheet tilt (±4°) and footer wordmark weight/highlight following the pointer (80 ms lag),
 * - Lenis smooth scroll, loaded after idle (workspace-pinned lenis).
 * Reduced motion: reveals are visible from the start (CSS), counts show final values, no tilt, no Lenis. The setting
 * is followed live: toggling it tears everything down and sets it up again.
 */
export function PageMotion() {
  const reduce = useSyncExternalStore(subscribeRM, () => window.matchMedia(RM).matches, () => false);
  useEffect(() => {
    const root = document.documentElement;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const cleanups: Array<() => void> = [];

    // Reveals + count-ups. A count only animates if it was armed (reset to zero) while still below the fold, so a
    // number already on screen never flashes from its final value to 0.
    const counts = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
    const finals = new Map(counts.map((el) => [el, el.dataset.format ?? el.textContent ?? ""]));
    const stops: Array<() => void> = [];
    let disposed = false;
    const formatter = (final: string) => {
      const decimals = final.includes(".") ? (final.split(".")[1]?.replace(/\D/g, "").length ?? 0) : 0;
      const suffix = final.replace(/[\d.,]/g, "");
      const grouped = final.includes(",");
      return (v: number) => (grouped ? Math.round(v).toLocaleString("en-US") : v.toFixed(decimals)) + suffix;
    };
    if (!reduce) {
      for (const el of counts) {
        if (el.getBoundingClientRect().top > window.innerHeight) {
          el.dataset.armed = "";
          el.textContent = formatter(finals.get(el)!)(0);
        }
      }
    }
    const countUp = async (el: HTMLElement) => {
      const final = finals.get(el)!;
      const target = Number(el.dataset.count);
      if (!("armed" in el.dataset) || !Number.isFinite(target)) return;
      delete el.dataset.armed;
      const fmt = formatter(final);
      const { animate } = await import("motion");
      if (disposed) return;
      const controls = animate(0, target, {
        duration: 1.2,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (v) => {
          el.textContent = fmt(v);
        },
        onComplete: () => {
          el.textContent = final;
        },
      });
      stops.push(() => {
        controls.stop();
        el.textContent = final;
      });
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          if (el.dataset.count) void countUp(el);
          else el.classList.add("in");
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    document.querySelectorAll<HTMLElement>("[data-reveal], [data-count]").forEach((el) => io.observe(el));
    cleanups.push(() => {
      disposed = true;
      io.disconnect();
      stops.forEach((stop) => stop());
      // Anything still armed (never reached) goes back to its real value.
      for (const el of counts) {
        delete el.dataset.armed;
        el.textContent = finals.get(el)!;
      }
    });

    // Nav shrink after the hero.
    const hero = document.getElementById("top");
    if (hero) {
      const navIo = new IntersectionObserver(([e]) => root.classList.toggle("past-hero", !e.isIntersecting), {
        rootMargin: "-120px 0px 0px 0px",
      });
      navIo.observe(hero);
      cleanups.push(() => navIo.disconnect());
    }

    // Marquees and the Studio ring run only in view.
    const offIo = new IntersectionObserver((entries) => {
      for (const e of entries) (e.target as HTMLElement).classList.toggle("is-paused", !e.isIntersecting);
    });
    document.querySelectorAll("[data-marquee], .orbit-ring").forEach((el) => offIo.observe(el));
    cleanups.push(() => offIo.disconnect());

    // Composer tilt toward the pointer.
    const sheet = document.querySelector<HTMLElement>("[data-tilt]");
    if (sheet && fine && !reduce) {
      const onMove = (e: PointerEvent) => {
        const r = sheet.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
        const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
        sheet.style.setProperty("--tilt-y", `${(x * 4).toFixed(2)}deg`);
        sheet.style.setProperty("--tilt-x", `${(-y * 4).toFixed(2)}deg`);
      };
      const onLeave = () => {
        sheet.style.setProperty("--tilt-x", "0deg");
        sheet.style.setProperty("--tilt-y", "0deg");
      };
      sheet.addEventListener("pointermove", onMove, { passive: true });
      sheet.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        sheet.removeEventListener("pointermove", onMove);
        sheet.removeEventListener("pointerleave", onLeave);
      });
    }

    // Footer wordmark: letters near the pointer gain weight (300 → 800) and a cobalt highlight band follows it.
    const wm = document.querySelector<HTMLElement>("[data-wordmark]");
    if (wm && fine && !reduce) {
      const footer = wm.closest("footer") ?? wm;
      const letters = Array.from(wm.querySelectorAll<SVGTSpanElement>("tspan"));
      const stops = Array.from(wm.querySelectorAll<SVGStopElement>("stop"));
      const pos = [0.1, 0.3, 0.5, 0.7, 0.9];
      let target = -1;
      let cur = -1;
      let raf = 0;
      let last = 0;
      const paint = (mx: number) => {
        letters.forEach((l, i) => {
          const w = mx < 0 ? 600 : Math.round(300 + 500 * Math.max(0, 1 - Math.abs(mx - pos[i]) * 3.2));
          l.style.fontVariationSettings = `'opsz' 96, 'wdth' 78, 'wght' ${w}`;
        });
        const g = mx < 0 ? [2, 2, 2] : [Math.max(0, mx - 0.22), mx, Math.min(1, mx + 0.22)];
        stops.forEach((s, i) => s.setAttribute("offset", g[i].toFixed(3)));
      };
      const step = (t: number) => {
        const dt = last ? t - last : 16;
        last = t;
        cur += (target - cur) * (1 - Math.exp(-dt / 80));
        paint(cur);
        if (Math.abs(target - cur) > 0.001) raf = requestAnimationFrame(step);
        else {
          raf = 0;
          last = 0;
        }
      };
      const onMove = (e: Event) => {
        const pe = e as PointerEvent;
        const r = wm.getBoundingClientRect();
        target = Math.max(0, Math.min(1, (pe.clientX - r.left) / r.width));
        if (cur < 0) cur = target;
        if (!raf) raf = requestAnimationFrame(step);
      };
      const onLeave = () => {
        target = cur = -1;
        cancelAnimationFrame(raf);
        raf = 0;
        paint(-1);
      };
      footer.addEventListener("pointermove", onMove, { passive: true });
      footer.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        footer.removeEventListener("pointermove", onMove);
        footer.removeEventListener("pointerleave", onLeave);
        cancelAnimationFrame(raf);
      });
    }

    // Lenis after idle, never under reduced motion.
    let lenis: { destroy: () => void } | undefined;
    let cancelled = false;
    if (!reduce) {
      const start = () => {
        void import("lenis").then(({ default: Lenis }) => {
          if (cancelled) return;
          lenis = new Lenis({ autoRaf: true, anchors: { offset: -96 } });
        });
      };
      const idle = typeof window.requestIdleCallback === "function";
      const id = idle ? window.requestIdleCallback(start, { timeout: 2000 }) : setTimeout(start, 1200);
      cleanups.push(() => {
        cancelled = true;
        if (idle) window.cancelIdleCallback(id as number);
        else clearTimeout(id);
        lenis?.destroy();
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, [reduce]);

  return null;
}
