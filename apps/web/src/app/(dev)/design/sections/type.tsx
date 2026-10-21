type Step = { cls: string; sample: string; spec: string; use: string };

// Mirrors docs/design/riso-system.md section 3.2. The sample renders with the real utility, so a drift shows on screen.
const steps: Step[] = [
  {
    cls: "type-display-1",
    sample: "Brandloop",
    spec: "Archivo 800 at width 125. 72 px, line 0.98, tracking -0.03em. At 390 px: clamp(40px, 11vw, 72px).",
    use: "Marketing hero, auth wordmark.",
  },
  {
    cls: "type-display-2",
    sample: "What are we writing today?",
    spec: "Archivo 800 at width 125. 48 px, line 1.02, tracking -0.025em. At 390 px: clamp(30px, 8vw, 48px).",
    use: "Home greeting, empty-state headline.",
  },
  {
    cls: "type-title-1",
    sample: "Strategy foundation",
    spec: "Archivo 700 at width 112. 28 px, line 1.1, tracking -0.02em. At 390 px: 24 px.",
    use: "Strategy section heads, dialog hero line.",
  },
  {
    cls: "type-title-2",
    sample: "Manage account",
    spec: "Archivo 600 at width 100. 20 px, line 1.2, tracking -0.01em. At 390 px: 18 px.",
    use: "Page header title, dialog titles, section panel title.",
  },
  {
    cls: "type-title-3",
    sample: "Content mix",
    spec: "Hanken Grotesk 600. 16 px, line 1.3.",
    use: "Card and group titles.",
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
    sample: "Saved 4 minutes ago, 35% educational",
    spec: "Hanken Grotesk 500 with tabular figures. 13 px, line 1.4, tracking +0.01em.",
    use: "Metadata, chips, hints, legend values, timestamps.",
  },
  {
    cls: "type-micro",
    sample: "12 new",
    spec: "Hanken Grotesk 600 with tabular figures. 11 px, line 1.3, tracking +0.02em.",
    use: "Counters and badges only, never a sentence.",
  },
];

export function TypeSection() {
  return (
    <section id="type" aria-labelledby="type-title" className="scroll-mt-4 border-t border-line py-12 md:py-16">
      <h2 id="type-title" className="type-title-1">
        Type
      </h2>
      <p className="type-body mt-3 max-w-[68ch] text-ink-muted">
        Archivo sets the wide display lines and nothing else. Everything the person reads or touches is Hanken Grotesk.
        There is no third family and no monospace.
      </p>
      <ul className="mt-10">
        {steps.map((s) => (
          <li key={s.cls} className="grid gap-4 border-t border-line py-8 md:grid-cols-[260px_minmax(0,1fr)] md:gap-10">
            <div>
              <p className="type-title-3">{s.cls}</p>
              <p className="type-caption mt-1 max-w-[44ch] text-ink-muted">{s.spec}</p>
              <p className="type-caption mt-1 max-w-[44ch] text-ink-muted">{s.use}</p>
            </div>
            <div className="min-w-0">
              <p className={`${s.cls} max-w-[68ch]`} data-testid={s.cls}>
                {s.sample}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
