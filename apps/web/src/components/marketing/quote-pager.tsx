"use client";

import { useState } from "react";
import { Icon } from "./ui";

export type Quote = { lead: string; rest: string; name: string; role: string };

/** C7 quote card with a pager. Every quote is a design placeholder (A14). */
export function QuotePager({ quotes }: { quotes: Quote[] }) {
  const [i, setI] = useState(0);
  const q = quotes[i];
  const go = (d: number) => setI((v) => (v + d + quotes.length) % quotes.length);
  return (
    <figure className="quote" data-placeholder="testimonial" style={{ margin: 0 }} role="group" aria-label="Member quotes">
      <blockquote aria-live="polite">
        {q.lead} <span>{q.rest}</span>
      </blockquote>
      <figcaption className="quote__foot">
        <span className="avatar" style={{ width: 44, height: 44 }} aria-hidden="true" />
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{q.name}</span>
          <span style={{ fontSize: 12, color: "#6C6C70" }}>{q.role}</span>
        </span>
        <span className="pager">
          <button type="button" aria-label="Previous quote" onClick={() => go(-1)}><Icon name="left" size={14} /></button>
          <button type="button" aria-label="Next quote" onClick={() => go(1)}><Icon name="right" size={14} /></button>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{i + 1} of {quotes.length}</span>
        </span>
      </figcaption>
    </figure>
  );
}
