import { cn } from "@brandloop/ui";
import { TokenSwatch } from "./token-swatch";

type Swatch = { name: string; token: string; note?: string; ring?: boolean };

const surfaces: Swatch[] = [
  { name: "Ground", token: "--ground", ring: true },
  { name: "Panel", token: "--panel", ring: true },
  { name: "Panel hover", token: "--panel-hover" },
  { name: "Inverse", token: "--inverse", note: "chips, toolbar" },
  { name: "Text", token: "--text" },
  { name: "Text soft", token: "--text-soft" },
  { name: "Text 2", token: "--text-2" },
  { name: "Text 3", token: "--text-3", note: "meta, AA" },
  { name: "Accent fill", token: "--accent", note: "white text" },
  { name: "Fill hover", token: "--accent-hover" },
  { name: "Accent text", token: "--accent-text", note: "dots, rings" },
  { name: "Cobalt glow", token: "--cobalt", note: "radial only" },
];

const lines = [
  ["line-faint", "week grid"],
  ["line-soft", "sidebar edge, nav hover"],
  ["line", "panel borders"],
  ["line-2", "composer, pill buttons"],
  ["line-3", "chips, icon buttons"],
  ["line-4", "status pills"],
  ["line-strong", "ghost CTA"],
] as const;

function TokenCard({ theme }: { theme: "dark" | "light" }) {
  const dark = theme === "dark";
  return (
    <section
      aria-labelledby={`tokens-${theme}`}
      className={cn(theme, "flex min-w-0 flex-col gap-5 rounded-card-lg bg-ground p-5 text-text shadow-card sm:p-7", dark && "ring-1 ring-line-2")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`tokens-${theme}`} className="text-lg font-medium tracking-[-0.01em]">
          {dark ? "Dark studio tokens" : "Light tokens"}
        </h3>
        <span className="text-xs text-text-2">{dark ? "App default" : "Settings: Light, Dark or Auto"}</span>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(116px,100%),1fr))] gap-x-2.5 gap-y-4">
        {surfaces.map((s) => (
          <TokenSwatch key={s.token} {...s} />
        ))}
      </ul>
      <div>
        <h4 className="mb-2 text-xs text-text-2">Lines: {dark ? "paper" : "ink"} at fixed alphas</h4>
        <ul className="flex flex-col">
          {lines.map(([token, use]) => (
            <li key={token} className="flex items-center gap-3 py-1.5 text-xs">
              <span aria-hidden="true" className="h-px w-16 shrink-0" style={{ background: `var(--${token})`, height: 2 }} />
              <span className="w-24 shrink-0 text-text">{token}</span>
              <span className="truncate text-text-2">{use}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function TokensSection() {
  return (
    <section id="tokens" aria-labelledby="tokens-title" className="scroll-mt-6">
      <h2 id="tokens-title" className="sr-only">
        Colour tokens
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-5">
        <TokenCard theme="dark" />
        <TokenCard theme="light" />
      </div>
    </section>
  );
}
