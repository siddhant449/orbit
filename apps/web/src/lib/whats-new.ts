export type WhatsNewRow = { id: "challenge" | "ideas" | "next-step"; title: string; detail?: string; href: string };

export type DerivedInput = {
  challenge: { day: number; posted: number; total: number; href: string } | null;
  ideasWaiting: number;
  nextStep: { title: string; href: string } | null;
};

/** The bell's rows that are worked out from current state, in a fixed order: the challenge day, ideas waiting, the next step. */
export function buildDerivedRows(input: DerivedInput): WhatsNewRow[] {
  const rows: WhatsNewRow[] = [];
  if (input.challenge) {
    const c = input.challenge;
    rows.push({ id: "challenge", title: `Challenge day ${c.day}`, detail: `${c.posted} of ${c.total} posted`, href: c.href });
  }
  if (input.ideasWaiting > 0) {
    const n = input.ideasWaiting;
    rows.push({ id: "ideas", title: n === 1 ? "1 idea is waiting for you" : `${n} ideas are waiting for you`, href: "/ideas" });
  }
  if (input.nextStep) rows.push({ id: "next-step", title: input.nextStep.title, detail: "Next step", href: input.nextStep.href });
  return rows;
}

const MIN = 60_000;

/** "just now", "5 min ago", "3 h ago", "2 d ago", else the date. */
export function relativeTime(at: Date | string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(at).getTime();
  if (ms < MIN) return "just now";
  if (ms < 60 * MIN) return `${Math.floor(ms / MIN)} min ago`;
  if (ms < 24 * 60 * MIN) return `${Math.floor(ms / (60 * MIN))} h ago`;
  if (ms < 14 * 24 * 60 * MIN) return `${Math.floor(ms / (24 * 60 * MIN))} d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(at));
}
