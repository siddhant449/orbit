"use client";

import { useEffect, useRef, useState } from "react";

/** Reads a custom property from the swatch itself, so a forced-theme wrapper reports its own value. */
function readToken(el: HTMLElement, name: string) {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  if (/^#[0-9a-f]{3}$/i.test(raw)) return `#${[...raw.slice(1)].map((ch) => ch + ch).join("")}`.toUpperCase();
  return /^#[0-9a-f]{6,8}$/i.test(raw) ? raw.toUpperCase() : raw;
}

/** One colour token: a chip filled with the live value, its role name, the variable and the value read from the CSS. */
export function TokenSwatch({ name, token, note, ring = false }: { name: string; token: string; note?: string; ring?: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setValue(readToken(el, token));
    update();
    // next-themes flips the class on <html>; the value follows.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [token]);

  return (
    <li ref={ref} className="flex min-w-0 flex-col gap-2" data-token={token}>
      <span
        aria-hidden="true"
        className="block h-16 rounded-card-sm motion-safe:transition-[scale] motion-safe:duration-[var(--dur-hover)] motion-safe:ease-[var(--ease-out)] motion-safe:hover:scale-[1.04]"
        style={{
          background: token === "--cobalt" ? `radial-gradient(circle at 50% 50%, var(${token}), transparent 70%)` : `var(${token})`,
          boxShadow: ring ? "inset 0 0 0 1px var(--line-3)" : undefined,
        }}
      />
      <span className="text-xs text-text">{name}</span>
      <span className="truncate text-[11px] text-text-2" title={value}>
        <span className="sr-only">{token}: </span>
        {value || " "}
        {note && <span className="text-text-3"> · {note}</span>}
      </span>
    </li>
  );
}
