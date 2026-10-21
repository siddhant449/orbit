import { Panel } from "@brandloop/ui";

// Full class names, written out so Tailwind sees every utility.
const steps = [
  { id: "display", className: "type-display", sample: "Display 112", meta: "Bricolage · opsz 96 · wdth 88 · 460 · −0.05em" },
  { id: "section", className: "type-section", sample: "Section 72", meta: "opsz 96 · wdth 88 · 460 · −0.045em" },
  { id: "greeting", className: "type-greeting", sample: "What are we putting out there?", meta: "Greeting · 36–56 · opsz 96 · wdth 90" },
  { id: "page-title", className: "type-page-title", sample: "Posts", meta: "Page title 40 · opsz 72 · wdth 90" },
  { id: "panel-title", className: "type-panel-title", sample: "Panel title 28", meta: "opsz 48 · wdth 90 · 500" },
  { id: "card-title", className: "type-card-title", sample: "The contrarian take", meta: "Card title 22 · opsz 48 · 500" },
  { id: "stat-xl", className: "type-stat-xl", sample: "2,998,895", meta: "Stat XL 64 · wdth 85 · tabular" },
  { id: "stat", className: "type-stat", sample: "412,118", meta: "Stat 40 · wdth 85" },
] as const;

const text = [
  { id: "lead", className: "type-lead", sample: "Orbit turns what you already know into a weekly rhythm of posts.", meta: "Lead 19 / 1.5 · Geist 400" },
  { id: "body", className: "type-body", sample: "Body copy sits at 15 to 16 px with a 1.55 line height, set in Geist.", meta: "Body 15 / 1.55" },
  { id: "ui", className: "type-ui", sample: "Labels and buttons use 13 to 14 px at weight 500.", meta: "UI 13–14" },
  { id: "meta", className: "type-meta", sample: "Resets in 7h · 0 of 22 posted", meta: "Meta 11–12 in Text 3" },
  { id: "mono-data", className: "type-mono-data", sample: "VOICE PROFILE · LENGTH RULE ADDED", meta: "Data register only: mono 12, +0.04em" },
] as const;

export function TypeSection() {
  return (
    <Panel as="section" id="type" aria-labelledby="type-title" className="flex min-w-0 scroll-mt-6 flex-col gap-6 rounded-card-lg p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="type-title" className="text-lg font-medium tracking-[-0.01em]">
          Type
        </h2>
        <span className="text-xs text-text-2">Bricolage Grotesque (opsz, wdth, wght) and Geist</span>
      </div>
      <ul className="flex flex-col gap-5">
        {steps.map((s) => (
          <li key={s.id} className="flex min-w-0 flex-col gap-1.5">
            <span data-testid={`type-${s.id}`} className={`${s.className} break-words`}>
              {s.sample}
            </span>
            <span className="text-[11px] text-text-3">{s.meta}</span>
          </li>
        ))}
      </ul>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-5 border-t border-line pt-5">
        {text.map((s) => (
          <li key={s.id} className="flex min-w-0 flex-col gap-1.5">
            <span data-testid={`type-${s.id}`} className={`${s.className} break-words text-text-soft`}>
              {s.sample}
            </span>
            <span className="text-[11px] text-text-3">{s.meta}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
