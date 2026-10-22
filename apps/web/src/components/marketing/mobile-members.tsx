import { Ph } from "./ui";

const CARDS: Array<[string, string]> = [
  ["Priya Natarajan", "Fractional CMO"],
  ["Tomás Ferreira", "Sales coach"],
  ["Hanna Lindqvist", "Tech recruiter"],
];

/** C13 (<768 only): member card carousel with scroll-snap. */
export function MobileMembers() {
  return (
    <section className="paper mmembers only-mobile" aria-labelledby="mm-title">
      <div className="wrap">
        <h2 id="mm-title" data-placeholder="member-count" className="t-section" style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: "-0.03em" }}>
          Hundreds of <span className="accent">founders</span> build their audience with Orbit.
        </h2>
      </div>
      <Ph as="div" kind="member-names">
        <ul className="mmembers__track" tabIndex={0} style={{ listStyle: "none", margin: "32px 0 0" }} aria-label="Members">
          {CARDS.map(([n, r]) => (
            <li key={n} className="mcard">
              <span className="mcard__ph" aria-hidden="true" />
              <span style={{ fontWeight: 500, paddingInline: 4 }}>{n}</span>
              <span style={{ fontSize: 12, color: "#6C6C70", paddingInline: 4 }}>{r}</span>
            </li>
          ))}
        </ul>
      </Ph>
    </section>
  );
}
