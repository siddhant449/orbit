import type { ReactNode } from "react";

/** Orbit mark (system §6.2). Decorative: the link around it names it. */
export function OrbitMark({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="#2A3BFF" aria-hidden="true" focusable="false">
      <g transform="translate(10 10) rotate(-28)" strokeLinecap="round">
        <path d="M-9 0A9 3.4 0 0 1 9 0" strokeWidth="1.3" opacity="0.4" />
        <circle r="4.5" strokeWidth="2.6" />
        <path d="M-9 0A9 3.4 0 0 0 9 0" strokeWidth="1.5" />
        <circle cx="0" cy="3.4" r="1.7" fill="#2A3BFF" stroke="none" />
      </g>
    </svg>
  );
}

/**
 * Design placeholder (decision D9, ruling A14): testimonials, member numbers, reader counts, team bios, prices and
 * clocks are artboard content, not claims. Every one sits inside `data-placeholder`; launch is blocked until cleared.
 */
export function Ph({ children, as: Tag = "span", kind }: { children: ReactNode; as?: "span" | "div"; kind: string }) {
  return <Tag data-placeholder={kind}>{children}</Tag>;
}

type IconName = "plus" | "mic" | "send" | "check" | "link" | "lines" | "chat" | "up" | "play" | "left" | "right";

const PATHS: Record<IconName, ReactNode> = {
  plus: <path d="M10 4v12M4 10h12" />,
  mic: (
    <>
      <rect x="7.5" y="3" width="5" height="9" rx="2.5" />
      <path d="M5 10a5 5 0 0 0 10 0M10 15v2" />
    </>
  ),
  send: (
    <>
      <path d="M3 10 17 3l-4 14-3.5-5.5L3 10z" />
      <path d="M9.5 11.5 17 3" />
    </>
  ),
  check: <path d="M5 10.5l4 4 8-9" />,
  link: (
    <>
      <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-1 1" />
      <path d="M11.5 8.5a3 3 0 0 0-4.2 0L5 10.8a3 3 0 0 0 4.2 4.2l1-1" />
    </>
  ),
  lines: <path d="M6 6h8M6 10h8M6 14h5" />,
  chat: <path d="M3 10a7 7 0 1 1 3.2 5.9L3 17l1.1-3.2A7 7 0 0 1 3 10z" />,
  up: <path d="M5 11l5-5 5 5" />,
  play: <path d="M7 5l9 5-9 5z" fill="currentColor" />,
  left: <path d="M12 5l-5 5 5 5" />,
  right: <path d="M8 5l5 5-5 5" />,
};

export function Icon({ name, size = 16, stroke = 1.6 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Splits a heading into lines that rise from a mask (p31: 112%, 1.2 s, 120 ms stagger). */
export function RiseLines({ lines, start = 0.1, accentLast }: { lines: string[]; start?: number; accentLast?: boolean }) {
  return (
    <>
      {lines.map((line, i) => (
        <span className="rise" key={line}>
          <span
            style={{ animationDelay: `${start + i * 0.12}s` }}
            className={accentLast && i === lines.length - 1 ? "accent" : undefined}
          >
            {line}
          </span>
        </span>
      ))}
    </>
  );
}

/** Visible marker on every mock product panel: the numbers and people in it are illustrative, not claims. */
export function Illustrative({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return <span className={tone === "light" ? "illus illus--light" : "illus"}>Illustrative</span>;
}
