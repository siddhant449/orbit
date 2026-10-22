import { Ph } from "./ui";

const TEAM: Array<[string, string, string, string]> = [
  ["Arjun Mehta", "Co-founder · product", "210K followers", "I spent four years growing an audience with a spreadsheet, a notes app and a lot of guilt. Orbit is the system I kept wishing existed: capture, voice, calendar and the numbers, in one loop."],
  ["Lena Hoffmann", "Co-founder · content", "160K followers", "I ghostwrote for forty executives. The hard part was never the writing, it was keeping each voice straight and getting a yes before Tuesday. That's what Studio is for."],
  ["Samuel Okafor", "Co-founder · engineering", "48K followers", "Arjun called me with a spreadsheet and a theory: consistency beats talent on LinkedIn, and software can carry the consistency. We built Orbit to find out."],
];

/** C10 team: three staggered portrait cards. Names, bios and follower counts are placeholders (A14). */
export function Team() {
  return (
    <section id="team" className="ink team" aria-labelledby="team-title">
      <div className="grain" aria-hidden="true" />
      <div className="team__glow" aria-hidden="true" />
      <div className="wrap">
        <div className="split-head">
          <h2 id="team-title" className="t-section" data-reveal style={{ fontSize: "clamp(40px,5.6vw,80px)" }}>
            Built by operators
            <br />
            who did it first.
          </h2>
          <p className="note" data-reveal style={{ ["--i" as string]: 1, fontSize: 17 }}>
            <Ph kind="team-bio">Three people, one spreadsheet that got out of hand, and a combined 418K followers earned the slow way before a line of Orbit was written.</Ph>
          </p>
        </div>
        <ul className="team__grid" style={{ listStyle: "none", padding: 0 }}>
          {TEAM.map(([name, role, followers, quote], i) => (
            <li key={name} className="member" data-reveal style={{ ["--i" as string]: i }}>
              <Ph as="div" kind="team-member">
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div className="portrait" role="img" aria-label={`Portrait of ${name} (placeholder)`}>
                    <span aria-hidden="true">B&amp;W PORTRAIT · {name.toUpperCase()} · ONE HARD LIGHT</span>
                  </div>
                  <blockquote>{quote}</blockquote>
                  <div className="member__foot">
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontWeight: 500 }}>{name}</span>
                      <span style={{ fontSize: 12, color: "#9A9A9E" }}>{role}</span>
                    </span>
                    <span className="pill pill--accent">{followers}</span>
                  </div>
                </div>
              </Ph>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
