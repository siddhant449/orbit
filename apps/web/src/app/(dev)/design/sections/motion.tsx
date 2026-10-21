import { Panel } from "@brandloop/ui";
import { MotionDemo } from "./motion-demo";

const catalog = [
  {
    title: "First paint",
    body: "Headlines rise line by line through a clip mask, 1.2 s and 80 ms apart. Panels fade and rise 18 px, 120 ms apart. Route changes switch instantly.",
  },
  {
    title: "Hover",
    body: "Colour answers in 150 ms; buttons lift 1 to 2 px and scale to 1.02 over 400 ms. Chips invert. Panels lift 3 px with a brighter edge in dark and a softer shadow in light.",
  },
  {
    title: "Draws and counts",
    body: "Rings draw to their value in 1.6 s after half a second. Chart lines draw in 1.2 s. Big numbers count up once per session.",
  },
  {
    title: "Reduced motion",
    body: "Transforms and loops stop at their final frame; colour and opacity still answer in 150 ms. The composer aura holds still.",
  },
];

export function MotionSection() {
  return (
    <Panel as="section" id="motion" aria-labelledby="motion-title" className="flex scroll-mt-6 flex-col gap-7 rounded-card-lg p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="motion-title" className="text-lg font-medium tracking-[-0.01em]">
          Motion
        </h2>
        <span className="text-xs text-text-2">One easing everywhere: cubic-bezier(.16, 1, .3, 1)</span>
      </div>
      <MotionDemo />
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-7">
        {catalog.map((c) => (
          <li key={c.title} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{c.title}</h3>
            <p className="text-[13px] leading-relaxed text-text-2">{c.body}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
