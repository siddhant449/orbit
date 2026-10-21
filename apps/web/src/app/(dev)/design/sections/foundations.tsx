import { Panel } from "@brandloop/ui";
import { icons } from "@brandloop/ui/icons";

const radii = [
  { name: "Pill", value: "999", className: "size-12 rounded-pill bg-inverse" },
  { name: "Card S", value: "14", className: "h-12 w-16 rounded-card-sm bg-panel-hover" },
  { name: "Card", value: "18", className: "h-14 w-20 rounded-card bg-panel-hover" },
  { name: "Card L", value: "24", className: "h-16 w-24 rounded-card-lg bg-panel-hover" },
  { name: "Shot", value: "28", className: "h-[72px] w-28 rounded-shot bg-panel-hover" },
];

const shadows = [
  { name: "Card", token: "--shadow-card" },
  { name: "Composer", token: "--shadow-composer" },
  { name: "Draft", token: "--shadow-draft" },
  { name: "Hover", token: "--shadow-hover" },
];

export function FoundationsSection() {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Panel as="section" id="radii" aria-labelledby="radii-title" className="flex scroll-mt-6 flex-col gap-5 rounded-card-lg p-5 sm:p-7">
        <h2 id="radii-title" className="text-lg font-medium tracking-[-0.01em]">
          Radii, spacing, shadow
        </h2>
        <ul className="flex flex-wrap items-end gap-3">
          {radii.map((r) => (
            <li key={r.name} className="flex flex-col items-start gap-2">
              <span aria-hidden="true" className={r.className} />
              <span className="text-[11px] text-text-2">
                {r.name} {r.value}
              </span>
            </li>
          ))}
        </ul>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {shadows.map((s) => (
            <li key={s.name} className="flex flex-col gap-2">
              <span aria-hidden="true" className="h-12 rounded-card-sm bg-panel" style={{ boxShadow: `var(--panel-highlight), var(${s.token})` }} />
              <span className="text-[11px] text-text-2">{s.name}</span>
            </li>
          ))}
        </ul>
        <p className="max-w-[62ch] text-[13px] leading-relaxed text-text-2">
          Pills for every control. Cards step 14, 18, 24 and 28 by size. App gutters are 32 px, grids gap 12 to 20. Dark
          has no drop shadows, only 8 to 12 % paper borders; light lifts with soft ink shadows and keeps borders for inputs.
        </p>
      </Panel>
      <Panel as="section" id="icons" aria-labelledby="icons-title" className="flex scroll-mt-6 flex-col gap-5 rounded-card-lg p-5 sm:p-7">
        <h2 id="icons-title" className="text-lg font-medium tracking-[-0.01em]">
          Icons
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-x-2 gap-y-4">
          {Object.entries(icons).map(([name, Icon]) => (
            <li key={name} className="flex flex-col items-center gap-2">
              <span className="inline-flex size-10 items-center justify-center rounded-full border border-line-3 text-text">
                <Icon size={16} />
              </span>
              <span className="text-[11px] text-text-2">{name}</span>
            </li>
          ))}
        </ul>
        <p className="max-w-[62ch] text-[13px] leading-relaxed text-text-2">
          A 20-unit grid stroked at 1.6, centred in a 36 to 44 px circle when it stands alone. Chevrons only for previous,
          next and disclosure; no text arrows.
        </p>
      </Panel>
    </div>
  );
}
