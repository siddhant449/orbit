import { LoopStages, type Stage } from "./loop-stages";
import { Icon } from "./ui";

const STAGES: Stage[] = [
  { name: "Capture", desc: "Voice notes, links and half-thoughts land in one inbox and come out as ideas on the board." },
  { name: "Voice", desc: "A profile built from forty of your posts and the rules you add, checked against every draft before you see it." },
  { name: "Draft", desc: "Posts and carousels you react to, not prompts you write. Swap the hook, tighten the ending, keep the voice." },
  { name: "Publish", desc: "Preview, approval and scheduling through the official API. The first comment goes out two minutes later, on its own." },
  { name: "Engage", desc: "A comment queue sorted by who matters to your plan, reply drafts in your voice, twenty minutes a day." },
  { name: "Learn", desc: "Numbers per post and per format, turned into next week's plan. What worked gets more room." },
];

const BARS = [6, 14, 10, 18, 8, 16, 12, 6, 14, 9, 16, 7];

export function VoiceRules({ compact }: { compact?: boolean }) {
  const rows: Array<[string, boolean]> = [
    ["Under 120 words", true],
    ["No emojis, ever", true],
    ["One idea per post", true],
    ["Questions at the end", false],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
      {rows.map(([label, on]) => (
        <div key={label} className="toggle-row" style={compact ? { background: "#0E0E10", padding: "10px 12px", borderRadius: 10 } : undefined}>
          <span style={on ? undefined : { color: "#9A9A9E" }}>{label}</span>
          <span className={on ? "toggle" : "toggle toggle--off"} aria-label={on ? "On" : "Off"} role="img" />
        </div>
      ))}
    </div>
  );
}

function Capture() {
  return (
    <div className="mini">
      <div className="mini__head">
        <span>Inbox</span>
        <span className="pill">3 new</span>
      </div>
      <div className="card-d card-row">
        <span className="round-ic round-ic--accent"><Icon name="mic" /></span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 500 }}>Voice note · 2:14 · this morning</span>
          <span aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 18 }}>
            {BARS.map((h, i) => (
              <span key={i} style={{ width: 3, height: h, borderRadius: 2, background: i < 5 ? "#7C8AFF" : "#5B5B5E" }} />
            ))}
          </span>
        </div>
        <span className="meta">Transcribed</span>
      </div>
      <div className="card-d card-row">
        <span className="round-ic"><Icon name="link" /></span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 500 }}>Saved post · Lena Marsh on vendor cuts</span>
          <span className="meta" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            &ldquo;We cut our vendor list from 23 tools to 9 this quarter…&rdquo;
          </span>
        </div>
        <span className="meta">Swipe file</span>
      </div>
      <div className="card-d card-row">
        <span className="round-ic"><Icon name="lines" /></span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 500 }}>Note · &ldquo;A Series A is eighteen months, not a trophy&rdquo;</span>
          <span className="meta" style={{ fontSize: 12 }}>Typed on the phone, Sunday</span>
        </div>
        <span className="meta">Note</span>
      </div>
      <div className="card-p" style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span className="card-p__label">Turned into</span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>3 ideas on the board · 1 fits Thursday&apos;s slot</span>
        </div>
        <span className="small-btn" style={{ background: "#0A0A0B", color: "#F5F4F0" }}>Open ideas</span>
      </div>
    </div>
  );
}

function Voice() {
  return (
    <div className="mini">
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 4px 6px" }}>
        <span className="voice-orb" style={{ width: 36, height: 36 }} aria-hidden="true" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Your voice</span>
          <span className="meta">Built from 40 posts · updated today</span>
        </div>
      </div>
      <VoiceRules />
      <div className="card-d" style={{ gap: 8 }}>
        <span className="meta">Model draft</span>
        <p style={{ margin: 0, lineHeight: 1.5, color: "#9A9A9E", textDecoration: "line-through", textDecorationColor: "rgba(245,244,240,0.3)" }}>
          In today&apos;s fast-paced digital landscape, we made the strategic decision to sunset our free tier.
        </p>
      </div>
      <div className="card-p">
        <span className="card-p__label">In your voice</span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Free users cost us more than they taught us.
          <br />
          Not in money. In attention.
        </p>
      </div>
    </div>
  );
}

function Draft() {
  const hooks = [
    "We paid $140k a year to support people who never paid us.",
    "Our free tier had 61% of the tickets and 4% of the revenue.",
    "We killed the free tier on a Tuesday. Here is the Wednesday.",
  ];
  return (
    <div className="mini">
      <div className="mini__head">
        <span>Why we killed the free tier</span>
        <span className="pill eyebrow" style={{ color: "#C9C8C4", textTransform: "none", fontSize: 11 }}>Predicted reach 9k to 14k</span>
      </div>
      <div className="card-p" style={{ padding: 20, gap: 10, fontSize: 14, lineHeight: 1.5 }}>
        <p style={{ margin: 0 }}><mark style={{ background: "rgba(124,138,255,0.35)", color: "inherit" }}>Free users cost us more than they taught us.</mark></p>
        <p style={{ margin: 0 }}>Not in money. In attention.</p>
        <p style={{ margin: 0, color: "#5B5B5E" }}>Every week we shipped fixes for people who would never pay, while paying customers waited…</p>
      </div>
      <span className="meta" style={{ padding: "0 4px" }}>Swap hook · 3 options in your voice</span>
      {hooks.map((h, i) => (
        <div key={h} className="toggle-row" style={{ gap: 12, border: i === 0 ? "1px solid rgba(124,138,255,0.45)" : undefined, color: i ? "#C9C8C4" : undefined }}>
          <span style={{ flex: 1 }}>{h}</span>
          <span className="small-btn" style={i === 0 ? { background: "#4F5FF5", color: "#fff", minHeight: 26, fontSize: 11 } : { border: "1px solid rgba(245,244,240,0.14)", minHeight: 26, fontSize: 11 }}>Use</span>
        </div>
      ))}
    </div>
  );
}

function Publish() {
  const ticks = ["Approved by Jonas Weber · 2h ago, from a link", "First comment with the link, 2 minutes after", "Carousel PDF attached · 6 slides"];
  return (
    <div className="mini">
      <div className="mini__head">
        <span>Schedule</span>
        <span className="meta" style={{ fontSize: 12, fontWeight: 400 }}>Official LinkedIn API</span>
      </div>
      <div className="card-d" style={{ padding: 20, gap: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span className="t-stat" style={{ fontSize: 56, letterSpacing: "-0.045em", lineHeight: 0.85 }}>08:00</span>
          <span style={{ fontSize: 14, color: "#9A9A9E" }}>Wed 11 Nov · your best slot</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }} aria-hidden="true">
          {[0, 0, 1, 0, 0, 2, 2].map((k, i) => (
            <span key={i} style={{ height: 28, borderRadius: 6, background: k === 1 ? "#4F5FF5" : k === 2 ? "#151517" : "#1A1A1D", border: k === 2 ? "1px dashed rgba(245,244,240,0.15)" : undefined }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ticks.map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="tick" aria-hidden="true"><Icon name="check" size={10} stroke={2.4} /></span>
              {t}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <span className="small-btn" style={{ flex: 1, minHeight: 44, background: "#4F5FF5", color: "#fff", fontSize: 13 }}>Schedule</span>
        <span className="small-btn" style={{ flex: 1, minHeight: 44, border: "1px solid rgba(245,244,240,0.14)", fontSize: 13 }}>Publish now</span>
      </div>
      <p style={{ margin: 0, padding: "0 4px", fontSize: 12, color: "#828288" }}>No browser extension. No session cookies. Nothing for LinkedIn to restrict.</p>
    </div>
  );
}

function Engage() {
  return (
    <div className="mini">
      <div className="mini__head">
        <span>Comment queue</span>
        <span className="meta" style={{ fontSize: 12, fontWeight: 400 }}>8 posts · 12 min today</span>
      </div>
      <div className="card-d" style={{ gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="avatar" aria-hidden="true" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>Lena Marsh · Head of Ops, Brightline</span>
            <span className="meta">On your audience plan · 40 min ago</span>
          </div>
          <span className="pill">High fit</span>
        </div>
        <p style={{ margin: 0, lineHeight: 1.5, color: "#C9C8C4" }}>
          We cut our vendor list from 23 tools to 9 this quarter. The surprising part wasn&apos;t the savings…
        </p>
      </div>
      <div className="card-p" style={{ gap: 10 }}>
        <span className="card-p__label">Draft comment · your voice</span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          We did the same with 40 to 6 on the roadmap. The hidden cost of &ldquo;barely used&rdquo; is that someone still has to own it. Curious which 9 made the cut.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="small-btn" style={{ background: "#0A0A0B", color: "#F5F4F0" }}>Open on LinkedIn and paste</span>
          <span className="small-btn" style={{ border: "1px solid #E3E2DC" }}>Shorter</span>
        </div>
      </div>
      <div className="toggle-row" style={{ gap: 12, borderRadius: 14 }}>
        <span className="dot" aria-hidden="true" style={{ width: 8, height: 8 }} />
        <span style={{ flex: 1 }}>Leads inbox · Lena commented twice, then visited your profile</span>
        <span style={{ color: "#9A9A9E" }}>Reply draft</span>
      </div>
    </div>
  );
}

export function FormatBars() {
  const bars: Array<[string, number, string]> = [
    ["Proof", 90, "#4F5FF5"],
    ["Insight", 62, "#7C8AFF"],
    ["Story", 46, "#C9CEFF"],
    ["Offer", 24, "#2A2A2D"],
    ["Ask", 12, "#2A2A2D"],
  ];
  return (
    <>
      <svg role="img" aria-label="Bar chart: Proof posts lead, then Insight, Story, Offer and Ask" viewBox="0 0 320 110" style={{ width: "100%", height: "auto", display: "block" }}>
        {bars.map(([, h, c], i) => (
          <rect key={i} x={10 + i * 62} y={100 - h} width="44" height={h} rx="6" fill={c} />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-around", fontSize: 11, color: "#9A9A9E" }} aria-hidden="true">
        {bars.map(([l]) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </>
  );
}

function Learn() {
  const stats: Array<[string, string, string]> = [
    ["Impressions", "1.84M", "+41.6%"],
    ["Conversations", "38", "11 became calls"],
    ["Best format", "Proof", "2.3x average"],
  ];
  return (
    <div className="mini">
      <div className="mini__head">
        <span>Last 30 days</span>
        <span className="meta" style={{ fontSize: 12, fontWeight: 400 }}>Per format</span>
      </div>
      <div className="stats3">
        {stats.map(([l, v, d]) => (
          <div key={l} className="card-d" style={{ gap: 4, padding: 14, borderRadius: 14 }}>
            <span className="meta">{l}</span>
            <span className="t-stat" style={{ fontSize: 30 }}>{v}</span>
            <span style={{ fontSize: 11, color: "#7C8AFF" }}>{d}</span>
          </div>
        ))}
      </div>
      <div className="card-d">
        <FormatBars />
      </div>
      <div className="card-p" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span className="card-p__label">Next week, adjusted</span>
          <span style={{ fontSize: 14, lineHeight: 1.4 }}>Two Insight slots moved to Proof. Pricing carousel pulled to Tuesday.</span>
        </div>
        <span className="small-btn" style={{ background: "#0A0A0B", color: "#F5F4F0" }}>Apply</span>
      </div>
    </div>
  );
}

/** C4 The loop: ink + cobalt radial, h2, note, pinned stage list with a crossfading frame. */
export function Loop() {
  return (
    <section id="loop" className="ink loop" aria-labelledby="loop-title">
      <div className="grain" aria-hidden="true" />
      <div className="loop__glow" aria-hidden="true" />
      <div className="wrap">
        <div className="loop__head">
          <h2 id="loop-title" className="t-section t-section--xl" data-reveal>
            Most tools stop at the draft. <span style={{ color: "#828288" }}>Orbit runs the whole loop.</span>
          </h2>
          <div className="loop__aside" data-reveal style={{ ["--i" as string]: 1 }}>
            <p className="note">Six stages, one weekly rhythm. Each one feeds the next, so the work compounds instead of starting over every Monday.</p>
            <p style={{ margin: 0, fontSize: 13, color: "#828288" }}>Scroll, hover or tab through the stages.</p>
          </div>
        </div>
        <LoopStages stages={STAGES} frames={[<Capture key="c" />, <Voice key="v" />, <Draft key="d" />, <Publish key="p" />, <Engage key="e" />, <Learn key="l" />]} />
      </div>
    </section>
  );
}
