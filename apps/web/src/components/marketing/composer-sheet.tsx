import { SIGN_UP_URL } from "./links";
import { Icon, Illustrative, OrbitMark } from "./ui";

const CHIPS = ["Draft", "Repurpose", "Comment", "Review", "Plan"];

/** C3: white sheet overlapping the hero by 110 px; tilts toward the pointer (PageMotion, `data-tilt`). */
export function ComposerSheet() {
  return (
    <section className="paper sheet-band" aria-label="Orbit composer preview">
      <div className="wrap">
        <div className="sheet" data-tilt>
          <div className="sheet__bar">
            <OrbitMark size={18} />
            <span>New draft</span>
            <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>Voice · yours</span>
          </div>
          <div className="sheet__body">
            <div className="sheet__main">
              <div className="sheet__draft-block">
                <span className="eyebrow" style={{ color: "#6C6C70" }}>Draft · in your voice · 09:41</span>
                <p className="sheet__draft">
                  Free users cost us more than they taught us.
                  <br />
                  <span style={{ color: "#6C6C70" }}>Not in money. In attention.</span>
                  <span className="caret" aria-hidden="true" />
                </p>
              </div>
              <p className="mobile-q">What are we putting out there?</p>
              <div className="composer">
                <a className="composer__prompt" href={SIGN_UP_URL}>
                  Give Orbit a thought, a link or a voice note…
                </a>
                <div className="composer__row">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }} aria-hidden="true">
                    <span className="icon-btn icon-fake">
                      <Icon name="plus" stroke={1.7} />
                    </span>
                    <span className="voice-chip">
                      <span className="voice-orb" />
                      Your voice
                    </span>
                    <span className="icon-btn icon-fake">
                      <Icon name="mic" />
                    </span>
                  </div>
                  <a className="btn btn--accent send-btn" href={SIGN_UP_URL} aria-label="Start a draft in Orbit">
                    <Icon name="send" size={18} />
                  </a>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CHIPS.map((c) => (
                  <span key={c} className={c === "Plan" ? "chip chip-5" : "chip"}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <aside className="sheet__side" aria-label="30-day sprint, day 2 (illustrative)" data-placeholder="demo-data">
              <div className="illus-slot" style={{ marginBottom: -8 }}><Illustrative /></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#9A9A9E" }}>30-day sprint</span>
                <span className="pill">Day 2</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true">
                  <circle cx="30" cy="30" r="25" fill="none" stroke="rgba(245,244,240,0.1)" strokeWidth="4" />
                  <circle cx="30" cy="30" r="25" fill="none" stroke="#7C8AFF" strokeWidth="4" strokeLinecap="round" strokeDasharray="157" strokeDashoffset="146" transform="rotate(-90 30 30)" />
                  <text x="30" y="35" textAnchor="middle" fontSize="15" fontWeight="500" fill="#F5F4F0" style={{ fontFamily: "var(--font-sans)" }}>2</text>
                </svg>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="t-card">The contrarian take</span>
                  <span style={{ fontSize: 12, color: "#9A9A9E" }}>Video · 2 examples · ~20 min</span>
                </div>
              </div>
              <div className="rule" />
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <li className="check"><span className="check__box" aria-hidden="true" />Comment on 8 posts</li>
                <li className="check"><span className="check__box" aria-hidden="true" />Reply to 3 DMs</li>
                <li className="check">
                  <span className="check__box check__box--on" aria-hidden="true"><Icon name="check" size={10} stroke={2.4} /></span>
                  <s style={{ color: "#9A9A9E" }}>Save two hooks</s>
                </li>
              </ul>
              <a className="btn btn--paper" href={SIGN_UP_URL} style={{ marginTop: "auto" }}>
                Open today&apos;s post
              </a>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
