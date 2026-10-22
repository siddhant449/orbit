import { SIGN_IN_URL, SIGN_UP_URL } from "./links";
import { Icon, Ph } from "./ui";

// `null` href: the destination does not exist yet, so the item renders as plain text flagged as a placeholder.
const COLS: Array<[string, Array<[string, string | null]>]> = [
  ["Product", [["Start free", SIGN_UP_URL], ["Sign in", SIGN_IN_URL], ["Pricing", "#pricing"], ["Changelog", null], ["API and MCP", null]]],
  ["Learn", [["Journal", "#journal"], ["30-day sprint", "#sprint"], ["Hook library", null], ["Live sessions", null], ["Community", null]]],
  ["Company", [["About", "#team"], ["Affiliates", null], ["LinkedIn", null], ["X", null], ["YouTube", null]]],
];

const LETTERS = ["o", "r", "b", "i", "t"];

/** C12 footer: CTA, three link columns, journal input, clocks + status, legal, giant `orbit` wordmark. */
export function Footer() {
  return (
    <footer className="ink footer">
      <div className="grain" aria-hidden="true" />
      <div className="footer__glow" aria-hidden="true" />
      <div className="wrap footer__inner">
        <div className="footer__top">
          <div className="footer__cta">
            <h2 className="t-section">
              Your first post goes out
              <br />
              tomorrow at eight.
            </h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="btn btn--accent btn--md" href={SIGN_UP_URL}>Start free trial</a>
              <a className="btn btn--ghost btn--md" href="mailto:hello@orbit.example" data-placeholder="contact-address">Talk to us</a>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "#828288" }}>
              <Ph kind="offer">7 days free · no card</Ph> · official LinkedIn API, no extension
            </p>
          </div>
          {COLS.map(([label, links]) => (
            <nav key={label} className="fnav" aria-labelledby={`fnav-${label}`}>
              <h3 id={`fnav-${label}`}>{label}</h3>
              {links.map(([t, href]) =>
                href ? (
                  <a key={t} href={href}>{t}</a>
                ) : (
                  <span key={t} data-placeholder="link" className="fnav__soon">{t}</span>
                ),
              )}
            </nav>
          ))}
        </div>
        <div className="footer__bar">
          <div className="footer__sub">
            <span style={{ whiteSpace: "nowrap" }}>The Journal, every Tuesday</span>
            <a className="btn btn--accent" href={SIGN_UP_URL} style={{ minHeight: 36, padding: "0 16px", fontSize: 13 }}>Join Orbit</a>
          </div>
          <div className="footer__status">
            <Ph kind="city-clocks">
              <span style={{ display: "flex", gap: 18 }}>
                <span>Bengaluru <b>22:09</b></span>
                <span>Berlin <b>18:39</b></span>
                <span>New York <b>12:39</b></span>
              </span>
            </Ph>
            <Ph kind="status">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span className="dot" aria-hidden="true" style={{ width: 7, height: 7 }} />
                All systems operational
              </span>
            </Ph>
            <a href="#top" className="totop" aria-label="Back to top">
              <Icon name="up" size={14} stroke={1.7} />
            </a>
          </div>
        </div>
        <div className="footer__legal">
          <span>
            <Ph kind="legal-entity">© 2026 Orbit</Ph>. Built by operators, for operators.
          </span>
          <nav aria-label="Legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <span>Not affiliated with LinkedIn.</span>
          </nav>
        </div>
        <div className="wm" data-wordmark>
          <svg viewBox="0 0 1328 470" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="wmg" x1="0" y1="0" x2="1" y2="0">
                <stop data-g="0" offset="2" stopColor="#F5F4F0" />
                <stop data-g="1" offset="2" stopColor="#7C8AFF" />
                <stop data-g="2" offset="2" stopColor="#F5F4F0" />
              </linearGradient>
            </defs>
            <text x="0" y="452" fontSize="560" textLength="1328" lengthAdjust="spacingAndGlyphs" fill="url(#wmg)">
              {LETTERS.map((l, i) => (
                <tspan key={i} data-l={i}>{l}</tspan>
              ))}
            </text>
          </svg>
        </div>
      </div>
    </footer>
  );
}
