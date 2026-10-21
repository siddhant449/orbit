"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  // next-themes flips the `dark` class and `data-theme` on <html>; either one changes the tokens.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  return () => observer.disconnect();
}

/** The live value of a token in the active theme, read from the cascade so this page cannot drift from tokens.css. */
export function TokenHex({ name }: { name: string }) {
  const value = useSyncExternalStore(
    subscribe,
    () => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    () => "",
  );
  // The stylesheet pipeline lowercases hex; the system doc writes it upper case.
  return <span className="inline-block min-w-[7ch]">{value.toUpperCase()}</span>;
}
