type Step = { cls: string; sample: string; spec: string; use: string };

// Mirrors docs/design/system.md section 3.2. The sample renders with the real utility, so a drift shows on screen.
const steps: Step[] = [
  {
    cls: "type-display-1",
    sample: "What are we writing today?",
    spec: "Archivo 700 at width 92, tracking -0.035em. clamp(36px, 6.4vw, 80px), line 0.98.",
    use: "Home greeting, auth wordmark.",
  },
  {
    cls: "type-display-2",
    sample: "No strategy yet",
    spec: "Archivo 700 at width 92, tracking -0.03em. clamp(30px, 5vw, 48px), line 1.02.",
    use: "Empty-state headline, marketing sub-hero.",
  },
  {
    cls: "type-title-1",
    sample: "Strategy foundation",
    spec: "Archivo 600 at width 96, tracking -0.025em. 28 px, line 1.1. At 390 px: 24 px.",
    use: "Strategy section heads, dialog hero line, the donut value.",
  },
  {
    cls: "type-title-2",
    sample: "Manage account",
    spec: "Archivo 600 at width 100, tracking -0.015em. 20 px, line 1.2. At 390 px: 18 px.",
    use: "Page header title, dialog titles, card titles, section panel title, wordmark.",
  },
  {
    cls: "type-title-3",
    sample: "Content mix",
    spec: "Hanken Grotesk 600. 16 px, line 1.3.",
    use: "Group titles.",
  },
  {
    cls: "type-body",
    sample:
      "Your posts sound like you because your memories shape every draft. Add a few lines about how you work and who you write for.",
    spec: "Hanken Grotesk 400. 15 px, line 1.6.",
    use: "Reading text: memory lines, descriptions, strategy prose.",
  },
  {
    cls: "type-ui",
    sample: "Change writing style",
    spec: "Hanken Grotesk 400 or 500. 14 px, line 1.45.",
    use: "Controls, navigation rows, list rows, inputs, buttons.",
  },
  {
    cls: "type-caption",
    sample: "Saved 4 minutes ago, 35% educational, 880 px",
    spec: "Hanken Grotesk 500, tabular numerals. 13 px, line 1.4, tracking +0.01em.",
    use: "Metadata, chips, hints, keycaps, legend values, dimension labels, timestamps.",
  },
  {
    cls: "type-micro",
    sample: "12 drafts, 3 scheduled, 0 failed",
    spec: "Hanken Grotesk 600, tabular numerals. 11 px, line 1.3, tracking +0.02em.",
    use: "Counters, badges and monogram initials only; never a sentence.",
  },
];

export function TypeSection() {
  return (
    <section id="type" aria-labelledby="type-title" className="scroll-mt-4 border-t border-line py-12 md:py-16">
      <h2 id="type-title" className="type-title-1">
        Type
      </h2>
      <p className="type-body mt-3 max-w-[68ch] text-ink-muted">
        Two registers with a gap between them: a tight Archivo display (width 92 to 100, tight tracking, never wide) and
        Hanken Grotesk for everything else. No monospace anywhere; numbers are tabular.
      </p>
      <ul className="mt-10 divide-y divide-line">
        {steps.map((step) => (
          <li key={step.cls} className="grid gap-4 py-8 md:grid-cols-[minmax(0,1fr)_280px] md:gap-10">
            <p className={`${step.cls} break-words text-ink`} data-testid={step.cls}>
              {step.sample}
            </p>
            <div>
              <p className="type-caption text-ink">{step.cls}</p>
              <p className="type-caption mt-1 text-ink-muted">{step.spec}</p>
              <p className="type-caption mt-1 text-ink-muted">{step.use}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
