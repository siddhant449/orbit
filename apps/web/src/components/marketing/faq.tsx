import { Icon } from "./ui";

// [question, answer, placeholder kind if the answer states a policy or offer that is not decided yet]
const QA: Array<[string, string, string?]> = [
  ["How is Orbit different from ChatGPT with a good prompt?", "A chat window gives you a draft. Orbit gives you the loop around it: a strategy, a voice profile that remembers your rules, a calendar, a comment queue, analytics that rewrite next week's plan, and a 30-day sprint. All in one place, and all through LinkedIn's official API."],
  ["Will it sound like me?", "Orbit builds a voice profile from your own posts and the rules you give it, then shows you every edit as a before and after. You can also point it at a creator's profile to borrow their cadence without copying their words. You stay the author."],
  ["Can I manage clients or a team?", "Yes. Studio gives each profile or company page its own voice, calendar and approvals, with a shared swipe file, brand kits and a leads inbox across all of them. Clients approve from a link without an account.", "offer"],
  ["Does Orbit use a browser extension?", "No. Publishing, scheduling and analytics all go through LinkedIn's official API, with no extension and no session cookies, so there is nothing for LinkedIn to restrict. Your data is kept only while your account stays connected.", "policy"],
  ["What if I've never posted before?", "Start with the 30-day sprint. Every weekday gives you one proven format, two worked examples and a draft to react to. If you'd rather talk than type, record a voice note or let Orbit interview you for ten minutes and turn the answers into a week of drafts."],
  ["Can I cancel any time?", "Yes. Both plans start with a 7-day free trial. Cancel from Billing in two clicks and keep access until the end of the period. Annual plans are refundable in full within 30 days.", "policy"],
];

/** C11 FAQ: native <details> disclosures (height 400 ms via ::details-content, plus rotates 45°). */
export function Faq() {
  return (
    <section id="faq" className="paper faq" aria-labelledby="faq-title">
      <div className="wrap faq__grid">
        <div className="faq__intro">
          <h2 id="faq-title" className="t-section">Questions, answered.</h2>
          <p data-placeholder="response-time">Something else? Talk to a person from inside the app, any weekday.</p>
          <a className="btn btn--ink btn--md" href="mailto:hello@orbit.example" data-placeholder="contact-address">
            <Icon name="chat" />
            Talk to us
          </a>
        </div>
        <div className="faq__list">
          {QA.map(([q, a, kind], i) => (
            <details key={q} className="qa" open={i === 0} name="faq">
              <summary>
                {q}
                <span className="qa__ic" aria-hidden="true"><Icon name="plus" size={14} stroke={1.8} /></span>
              </summary>
              {kind ? <p data-placeholder={kind}>{a}</p> : <p>{a}</p>}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
