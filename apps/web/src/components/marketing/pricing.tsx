import { SIGN_UP_URL } from "./links";
import { Icon, Ph } from "./ui";

const SOLO: Array<[string, string]> = [
  ["Strategy", "Positioning, content mix and a 30-day plan built from six questions."],
  ["Voice", "A voice profile built from your posts, with rules it actually remembers."],
  ["Draft and publish", "Unlimited drafts, carousels, first-comment scheduling, LinkedIn preview."],
  ["Engage", "Comment queue, reply drafts and a daily activity plan."],
  ["Analytics", "Per post and per format, who engaged, best time, CSV export."],
  ["Sprint, swipe file, API", "The 30-day sprint, a hook library, and an MCP server for your coding agent."],
];
const STUDIO: Array<[string, string]> = [
  ["Everything in Solo, per profile", "Separate voices, calendars, analytics and sprints for each person or company page."],
  ["Review and approval", "Clients approve from a link. Nothing goes out without a yes."],
  ["Leads inbox and CRM push", "Every comment, DM and profile visit that looks like intent, with one-tap export to HubSpot or lemlist."],
  ["Shared swipe file, hooks and brand kits", "One library for the whole team, with who used what, and a carousel kit per client."],
  ["White-label reports and priority support", "Monthly client reports in your brand, and a real person within a business day."],
];

// Studio rows whose detail is a service promise (response time, approvals without an account) rather than a feature.
const OFFER = new Set(["White-label reports and priority support", "Review and approval"]);

/** C9 pricing: Solo (white, numbered) and Studio (ink, cobalt glow, checked, spinning ring in view). */
export function Pricing() {
  return (
    <section id="pricing" className="paper pricing" aria-labelledby="pricing-title">
      <div className="wrap">
        <div className="split-head">
          <h2 id="pricing-title" className="t-section" data-reveal style={{ fontSize: "clamp(40px,5.6vw,80px)" }}>
            One system.
            <br />
            Two ways in.
          </h2>
          <div data-reveal style={{ ["--i" as string]: 1, display: "flex", flexDirection: "column", gap: 14 }}>
            <p className="note" style={{ fontSize: 17 }}>Solo is the whole system for one profile. Studio adds clients, teammates and the approvals agencies need.</p>
            <p style={{ margin: 0, fontSize: 12, color: "#6C6C70", display: "flex", gap: 8 }}>
              <span className="accent" aria-hidden="true">●</span>
              <span><Ph kind="offer">7-day free trial on both.</Ph> Official LinkedIn API, no browser extension, no cookies.</span>
            </p>
          </div>
        </div>
        <div className="plans">
          <article className="plan" aria-labelledby="plan-solo" data-reveal>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 id="plan-solo" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Solo</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#5B5B5E" }}>The whole system, one profile</p>
              </div>
              <span className="pill pill--paper" data-placeholder="offer">Billed monthly</span>
            </div>
            <Ph as="div" kind="price">
              <p className="plan__price" style={{ margin: 0 }}>
                <span className="t-stat">$39</span> per month · $390 a year
              </p>
            </Ph>
            <a className="btn btn--accent btn--md" href={SIGN_UP_URL}>Start free trial</a>
            <ul className="features">
              {SOLO.map(([t, d], i) => (
                <li key={t}>
                  <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                  <span><b>{t}</b><small>{d}</small></span>
                </li>
              ))}
            </ul>
            <p style={{ margin: "auto 0 0", fontSize: 12, color: "#6C6C70" }}><Ph kind="offer">Save two months on annual billing.</Ph></p>
          </article>
          <article className="plan plan--studio" aria-labelledby="plan-studio" data-reveal style={{ ["--i" as string]: 1 }}>
            <span className="orbit-ring" aria-hidden="true" />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 id="plan-studio" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Studio</h3>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#9A9A9E" }}>For ghostwriters, agencies and small teams</p>
              </div>
              <span className="pill pill--accent" data-placeholder="offer">Up to 5 profiles</span>
            </div>
            <Ph as="div" kind="price">
              <p className="plan__price" style={{ margin: 0 }}>
                <span className="t-stat">$99</span> per month · $990 a year
              </p>
            </Ph>
            <a className="btn btn--paper btn--md" href={SIGN_UP_URL}>Start free trial</a>
            <ul className="features">
              {STUDIO.map(([t, d]) => (
                <li key={t}>
                  <span className="tick" aria-hidden="true" style={{ width: 20, height: 20 }}><Icon name="check" size={11} stroke={2.4} /></span>
                  <span><b>{t}</b>{OFFER.has(t) ? <small data-placeholder="offer">{d}</small> : <small>{d}</small>}</span>
                </li>
              ))}
            </ul>
            <p style={{ margin: "auto 0 0", fontSize: 12, color: "#9A9A9E", display: "flex", gap: 8 }}>
              <span style={{ color: "#7C8AFF" }} aria-hidden="true">●</span>
              <Ph kind="price">Add profiles beyond five at $15 each per month</Ph>
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
