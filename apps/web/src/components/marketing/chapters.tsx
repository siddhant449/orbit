import type { ReactNode } from "react";
import { FormatBars, VoiceRules } from "./loop";
import { Illustrative } from "./ui";

function Chapter({ id, eyebrow, title, body, flip, children }: { id: string; eyebrow: string; title: [string, string]; body: string; flip?: boolean; children: ReactNode }) {
  return (
    <article className={flip ? "chapter chapter--flip" : "chapter"} aria-labelledby={id}>
      <div className="chapter__text" data-reveal>
        <span className="eyebrow">{eyebrow}</span>
        <h2 id={id} className="t-section t-section--md">
          {title[0]}
          <br />
          {title[1]}
        </h2>
        <p>{body}</p>
      </div>
      <div className="shot" data-reveal="shot" data-placeholder="demo-data" style={{ ["--i" as string]: 1 }}>
        <div className="illus-slot">
          <Illustrative />
        </div>
        {children}
      </div>
    </article>
  );
}

function VoiceShot() {
  return (
    <div className="shot__grid">
      <div className="card-d" style={{ padding: 20, gap: 14, borderRadius: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="voice-orb" style={{ width: 36, height: 36 }} aria-hidden="true" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Your voice</span>
            <span className="meta">Built from 40 posts · updated today</span>
          </div>
        </div>
        <div className="rule" style={{ background: "rgba(245,244,240,0.08)" }} />
        <VoiceRules compact />
        <span className="meta" style={{ lineHeight: 1.5 }}>Noticed: short lines, concrete numbers, no hashtags.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="card-d" style={{ gap: 8 }}>
          <span className="meta">Model draft</span>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#9A9A9E" }}>
            In today&apos;s fast-paced digital landscape, we made the strategic decision to sunset our free tier in order to better serve our valued customers.
          </p>
        </div>
        <div className="card-p">
          <span className="card-p__label">In your voice</span>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Free users cost us more than they taught us.
            <br />
            Not in money. In attention.
            <br />
            So we killed it.
          </p>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#5B5B5E" }}>
            <span><span className="accent">●</span> Under 120 words</span>
            <span><span className="accent">●</span> One idea</span>
            <span><span className="accent">●</span> Concrete</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const WEEK: Array<{ day: string; items: Array<[string, string, "today" | "rest" | "sugg" | ""]> }> = [
  { day: "Mon 9", items: [["The origin post", "08:00", ""]] },
  { day: "Tue 10", items: [["Carousel · 6 slides", "08:00", ""]] },
  { day: "Wed 11 · today", items: [["The contrarian take", "08:00", "today"], ["Suggested", "17:30", "sugg"]] },
  { day: "Thu 12", items: [["The checklist", "08:00", ""]] },
  { day: "Fri 13", items: [["Before and after", "08:00", ""]] },
  { day: "Sat 14", items: [["Rest", "", "rest"]] },
  { day: "Sun 15", items: [["Rest", "", "rest"]] },
];

function CalendarShot() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>November · week 2</span>
        <span className="seg" aria-hidden="true"><span className="on">Week</span><span>Month</span></span>
      </div>
      <div className="week">
        {WEEK.map((d) => (
          <div className="day-col" key={d.day}>
            <span className="day-col__label" style={d.day.includes("today") ? { color: "#8A93FF" } : undefined}>{d.day}</span>
            {d.items.map(([t, time, k]) => (
              <div key={t} className={`slot${k ? ` slot--${k}` : ""}`}>
                <span style={{ fontWeight: 500 }}>{t}</span>
                {time && <span style={{ fontSize: 11 }}>{time}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, paddingTop: 14, borderTop: "1px solid rgba(245,244,240,0.08)", fontSize: 12, color: "#9A9A9E" }}>
        <span><span className="accent">●</span> 22 posts planned · 8 rest days · 4 carousels</span>
        <span>Mix: Insight 35 · Proof 25 · Story 20 · Offer 12 · Ask 8</span>
      </div>
    </div>
  );
}

const LEADS: Array<[string, string, string, boolean]> = [
  ["Lena Marsh · Head of Ops, Brightline", "Commented twice, then visited your profile · 2h ago", "Reply draft", true],
  ["Ravi Shah · Ops consultant", "Asked “what did churn look like after?” · 5h ago", "Reply draft", false],
  ["Elif Aydın · Talent partner", "Sent a DM: “Can we talk about the hiring post?” · yesterday", "Open", false],
];

function LeadsShot() {
  return (
    <div className="mini">
      <div className="mini__head">
        <span>Leads inbox</span>
        <span className="pill">7 with intent</span>
      </div>
      {LEADS.map(([n, d, a, hot]) => (
        <div key={n} className="card-d card-row" style={{ gap: 12 }}>
          <span className="avatar" aria-hidden="true" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>{n}</span>
            <span className="meta">{d}</span>
          </div>
          <span className="small-btn" style={hot ? { background: "#4F5FF5", color: "#fff" } : { border: "1px solid rgba(245,244,240,0.14)" }}>{a}</span>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="card-d" style={{ gap: 4 }}>
          <span className="meta">Comment queue</span>
          <span>8 posts from people on your audience plan</span>
        </div>
        <div className="card-d" style={{ gap: 4 }}>
          <span className="meta">Today</span>
          <span>3 replies drafted · 12 min spent</span>
        </div>
      </div>
    </div>
  );
}

function LearnShot() {
  const stats: Array<[string, string, string]> = [
    ["Impressions · 30d", "1.84M", "+41.6%"],
    ["Replies to DMs", "38", "11 became calls"],
    ["Best format", "Proof", "2.3x your average"],
  ];
  return (
    <div className="mini">
      <div className="stats3">
        {stats.map(([l, v, d]) => (
          <div key={l} className="card-d" style={{ gap: 6, padding: 14, borderRadius: 14 }}>
            <span className="meta">{l}</span>
            <span className="t-stat" style={{ fontSize: 30 }}>{v}</span>
            <span style={{ fontSize: 11, color: "#7C8AFF" }}>{d}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 12, alignItems: "start" }} className="learn-grid">
        <div className="card-d">
          <span className="meta">Impressions by format · last 30 days</span>
          <FormatBars />
        </div>
        <div className="card-p" style={{ gap: 10 }}>
          <span className="card-p__label">Next week&apos;s plan, adjusted</span>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
            Proof posts are carrying you. Orbit moved two Insight slots to Proof and pulled the pricing carousel forward to Tuesday.
          </p>
          <span className="small-btn" style={{ alignSelf: "flex-start", background: "#0A0A0B", color: "#F5F4F0" }}>Apply to calendar</span>
        </div>
      </div>
    </div>
  );
}

/** C5 product chapters: four alternating rows, text + dark product shot built in HTML. */
export function Chapters() {
  return (
    <section id="product" className="paper" aria-label="Product">
      <div className="wrap chapters">
        <Chapter id="ch-voice" eyebrow="02 · Voice" title={["Write in your voice,", "not the model's."]} body="Orbit reads forty of your posts, writes down what it notices, and keeps the rules you add. Every draft is checked against them before you see it.">
          <VoiceShot />
        </Chapter>
        <Chapter id="ch-plan" flip eyebrow="03 · 04 · Draft and publish" title={["Plan a month", "in an afternoon."]} body="Your strategy sets the mix. Orbit fills the calendar with drafts, carousels and suggested slots, and publishes through LinkedIn's official API when the time comes.">
          <CalendarShot />
        </Chapter>
        <Chapter id="ch-engage" eyebrow="05 · Engage" title={["Turn readers", "into conversations."]} body="Reach is vanity. The leads inbox watches for intent, someone who commented twice, visited your profile, asked a question, and drafts the reply in your voice.">
          <LeadsShot />
        </Chapter>
        <Chapter id="ch-learn" flip eyebrow="06 · Learn" title={["Know what worked.", "Do more of it."]} body="Analytics that end in a decision. Orbit reads your numbers per post and per format, then rewrites next week's plan to lean into what's working.">
          <LearnShot />
        </Chapter>
      </div>
    </section>
  );
}
