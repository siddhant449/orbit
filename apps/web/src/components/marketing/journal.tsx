import { SIGN_UP_URL } from "./links";
import { Ph } from "./ui";

const ROWS: Array<[string, string, string]> = [
  ["6", "Post breakdowns", "Real posts, real numbers, and why each one worked."],
  ["2", "Field notes", "Short, practical notes from operators who post every week."],
  ["1", "Operator interview", "One person, one audience, and exactly how they built it."],
  ["3", "Sign-up gifts", "Hook library, 30-day plan and the comment playbook."],
];

/** C8 journal: ink, mono eyebrow, h2, email + Subscribe, the 6 / 2 / 1 / 3 issue list. */
export function Journal() {
  return (
    <section id="journal" className="ink journal" aria-labelledby="journal-title">
      <div className="grain" aria-hidden="true" />
      <div className="journal__glow" aria-hidden="true" />
      <div className="wrap journal__grid">
        <div data-reveal>
          <span className="eyebrow">09 · The journal · every Tuesday</span>
          <h2 id="journal-title" className="t-section" style={{ marginTop: 28, fontSize: "clamp(36px,4.4vw,60px)" }}>
            One email a week. Six posts, taken apart, with the numbers attached.
          </h2>
          <div className="journal__form">
            <a className="btn btn--paper btn--md" href={SIGN_UP_URL}>Join Orbit</a>
          </div>
          <p style={{ margin: "20px 0 0", fontSize: 13, color: "#828288" }}>
            <Ph kind="reader-count">Sent to Orbit members every Tuesday. 14,000 readers. Unsubscribe any time.</Ph>
          </p>
        </div>
        <ol className="jlist" aria-label="In every issue">
          {ROWS.map(([n, t, d], i) => (
            <li key={t} data-reveal style={{ ["--i" as string]: i }}>
              <span className="t-stat" style={i === 3 ? { color: "#7C8AFF" } : undefined}>{n}</span>
              <span>
                <b>{t}</b>
                <span style={{ fontSize: 13, color: "#9A9A9E" }}>{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
