import { QuotePager, type Quote } from "./quote-pager";
import { Icon, Ph } from "./ui";

const QUOTES: Quote[] = [
  { lead: "Twenty minutes a morning. Three posts a week.", rest: "Her last three posts brought in four discovery calls, and she hasn't opened a template once.", name: "Nadia Rahman", role: "Founder, Studio Rahman · 41k followers" },
  { lead: "One post about pricing. Eleven inbound leads.", rest: "He writes on the train and approves from his phone before the first meeting.", name: "Tomás Ferreira", role: "Sales coach · 12k followers" },
  { lead: "Seven months, one hire a quarter from LinkedIn.", rest: "The comment queue does the work her old spreadsheet never did.", name: "Hanna Lindqvist", role: "Tech recruiter · 18k followers" },
  { lead: "Two posts a week, between product reviews.", rest: "Thirty-eight DM replies last month; eleven became calls.", name: "Dev Kapoor", role: "Product lead · 6k followers" },
  { lead: "The backend role filled from one post.", rest: "She now plans the month on the first Sunday and forgets about it.", name: "Maya Oduya", role: "Founder, Ledgerly · 9k followers" },
];

const OPS: Array<[string, string, string, string, string, number]> = [
  ["Priya Natarajan", "Fractional CMO", "3", "Impressions in 60 days, from a standing start", "2.4M", 2.4],
  ["Tomás Ferreira", "Sales coach", "4", "Inbound leads from one post about pricing", "11", 11],
  ["Hanna Lindqvist", "Tech recruiter", "3", "Followers in seven months", "18,240", 18240],
  ["Dev Kapoor", "Product lead", "2", "DM replies in a month, eleven became calls", "38", 38],
  ["Maya Oduya", "Founder, Ledgerly", "3", "Hires from one post about the backend role", "2", 2],
];

const MEMBERS: Array<[string, string]> = [
  ["Priya Natarajan", "Fractional CMO"],
  ["Tomás Ferreira", "Sales coach"],
  ["Hanna Lindqvist", "Tech recruiter"],
  ["Dev Kapoor", "Product lead"],
  ["Maya Oduya", "Founder, Ledgerly"],
  ["Nadia Rahman", "Founder, Studio Rahman"],
];

/** C7 proof: h2 + note, video poster + quote pager, operator table with count-ups, member marquee. */
export function Proof() {
  return (
    <section id="proof" className="paper proof" aria-labelledby="proof-title">
      <div className="wrap">
        <div className="split-head">
          <h2 id="proof-title" className="t-section" data-reveal style={{ maxWidth: "13ch" }}>
            Used by people who&apos;d rather build than perform.
          </h2>
          <p className="note" data-reveal style={{ ["--i" as string]: 1, maxWidth: "32ch" }}>
            No influencers in this section. Founders, consultants, recruiters and product people, posting a few times a week between the actual work.
          </p>
        </div>
        <div className="proof__cards">
          <Ph as="div" kind="video">
            <div className="poster" data-reveal style={{ height: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#C9C8C4" }}>
                <span>Nadia Rahman · a morning in Orbit</span>
                <span>03:48</span>
              </div>
              <button type="button" className="poster__play" aria-label="Play video (coming soon)" disabled>
                <Icon name="play" size={18} />
              </button>
              <span style={{ color: "#9A9A9E" }}>Video placeholder</span>
            </div>
          </Ph>
          <div data-reveal style={{ ["--i" as string]: 1, display: "grid" }}>
            <QuotePager quotes={QUOTES} />
          </div>
        </div>
        <Ph as="div" kind="operator-results">
          <table className="ops">
            <caption className="sr-only">Results reported by Orbit operators</caption>
            <thead>
              <tr>
                <th scope="col">Operator</th>
                <th scope="col">Role</th>
                <th scope="col">Posts / wk</th>
                <th scope="col">Outcome</th>
                <th scope="col" className="num">Number</th>
              </tr>
            </thead>
            <tbody>
              {OPS.map(([n, r, p, o, v, c]) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td>{r}</td>
                  <td>{p}</td>
                  <td className="ops__out">{o}</td>
                  <td className="num" data-count={c} data-format={v}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: "16px 0 0", fontSize: 12, color: "#6C6C70" }}>Numbers from connected LinkedIn accounts, 30 days ending 14 Oct.</p>
        </Ph>
        <div className="members">
          <div className="members__head">
            <Ph kind="member-count">2,400 operators on Orbit</Ph>
            <Ph kind="update-cadence">Updated weekly</Ph>
          </div>
          <Ph as="div" kind="member-names">
            <ul className="sr-only">
              {MEMBERS.map(([n, r]) => (
                <li key={n}>{`${n}, ${r}`}</li>
              ))}
            </ul>
            <div style={{ overflow: "hidden" }} data-marquee aria-hidden="true">
              <div className="marquee">
                {[0, 1].map((k) => (
                  <div className="members__set" key={k}>
                    {MEMBERS.map(([n, r]) => (
                      <span key={n}>
                        {n}
                        <small>{r}</small>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </Ph>
        </div>
      </div>
    </section>
  );
}
