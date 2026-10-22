import { SIGN_UP_URL } from "./links";

type Day = [string, string, string, string, boolean?];
const DAYS: Day[] = [
  ["DAY 01", "STORY", "The origin post", "~20 min · 2 examples · posted"],
  ["DAY 02 · TODAY", "INSIGHT", "The contrarian take", "~20 min · 2 examples · draft ready", true],
  ["DAY 03", "INSIGHT", "The checklist", "~15 min · carousel"],
  ["DAY 04", "PROOF", "Before and after", "~20 min · 2 examples"],
  ["DAY 07", "STORY", "The expensive mistake", "~25 min · 2 examples"],
  ["DAY 08", "INSIGHT", "The myth in your industry", "~20 min · 2 examples"],
  ["DAY 09", "PROOF", "The customer's number", "~20 min · 2 examples"],
  ["DAY 14", "PROOF", "One chart, one lesson", "~20 min · visual"],
  ["DAY 21", "INSIGHT", "The question you're tired of", "~20 min · 2 examples"],
  ["DAY 30", "FINISH", "The advice you ignored", "~20 min · streak 22"],
];

function DayCard({ d }: { d: Day }) {
  return (
    <div className={d[4] ? "day day--today" : "day"}>
      <span className="day__top">
        <span>{d[0]}</span>
        <b>{d[1]}</b>
      </span>
      <span className="t-card" style={{ fontSize: 19 }}>{d[2]}</span>
      <span style={{ fontSize: 12, color: d[4] ? "#5B5B5E" : "#9A9A9E" }}>{d[3]}</span>
    </div>
  );
}

function Row({ days, b }: { days: Day[]; b?: boolean }) {
  return (
    <div className={b ? "day-row day-row--b" : "day-row"} data-marquee>
      <div className="marquee">
        {[0, 1].map((k) => (
          <div className="day-row__set" key={k} aria-hidden={k === 1 || undefined}>
            {days.map((d) => (
              <DayCard d={d} key={d[0]} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** C6 sprint: ink, h2 + copy + CTA, two marquee rows of day cards (32 s / 40 s), ruler with ring cursor. */
export function Sprint() {
  return (
    <section id="sprint" className="ink sprint" aria-labelledby="sprint-title">
      <div className="grain" aria-hidden="true" />
      <div className="wrap">
        <div className="sprint__head">
          <div style={{ flex: "1 1 560px", display: "flex", flexDirection: "column", gap: 28 }} data-reveal>
            <span className="eyebrow">07 · The sprint</span>
            <h2 id="sprint-title" className="t-section t-section--xl" style={{ maxWidth: "12ch" }}>
              Never start from a blank page.
            </h2>
          </div>
          <div className="sprint__aside" data-reveal style={{ ["--i" as string]: 1 }}>
            <p className="note">
              Thirty days on one track. One proven format every weekday, two worked examples, a draft to react to. Twenty-two posts later you have a voice, a rhythm and a streak.
            </p>
            <a className="btn btn--accent" href={SIGN_UP_URL}>Start the sprint</a>
          </div>
        </div>
      </div>
      <ul className="sr-only">
        {DAYS.map((d) => (
          <li key={d[0]}>{`${d[0]}, ${d[1]}: ${d[2]} (${d[3]})`}</li>
        ))}
      </ul>
      <div className="day-rows" aria-hidden="true">
        <Row days={DAYS.slice(0, 5)} />
        <Row days={DAYS.slice(5)} b />
      </div>
      <div className="wrap" aria-hidden="true">
        <div className="ruler">
          <div className="ruler__line">
            <span className="ruler__fill" />
            <span className="ruler__cursor" />
          </div>
          <div className="ruler__ticks">
            {["01", "05", "10", "15", "20", "25", "30"].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
