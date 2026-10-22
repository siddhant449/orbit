import { SIGN_UP_URL } from "./links";
import { HeroMotion } from "./hero-motion";
import { Orb } from "./hero-art";
import { RiseLines } from "./ui";

const ROLES = ["Founders", "Consultants", "Recruiters", "Coaches", "Product leads", "Built by operators, for operators"];

function RoleSet({ hidden }: { hidden?: boolean }) {
  return (
    <div className="marquee__set" aria-hidden={hidden || undefined}>
      {ROLES.map((role) => (
        <span key={role} style={{ display: "contents" }}>
          <span>{role}</span>
          <span className="dot" aria-hidden="true" />
        </span>
      ))}
    </div>
  );
}

/** C2 hero: ink + grain, h1 in three rising lines, lead, Get started, roles marquee, orb right. */
export function Hero() {
  return (
    <section id="top" className="hero" aria-labelledby="hero-title">
      <div className="grain" aria-hidden="true" />
      <Orb />
      <HeroMotion targetId="top" />
      <div className="wrap hero__body">
        <h1 id="hero-title" className="t-display">
          <RiseLines lines={["Put your", "LinkedIn growth", "in orbit."]} accentLast />
        </h1>
        <div className="fade" style={{ animationDelay: ".55s", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 28 }}>
          <p className="hero__lead">
            <span className="only-desktop">
              Orbit turns what you already know into a weekly rhythm of posts, comments and conversations, so the right
              people find you before you need them.
            </span>
            <span className="only-mobile">
              A weekly rhythm of posts, comments and conversations, so the right people find you first.
            </span>
          </p>
          <a className="btn btn--accent btn--lg" href={SIGN_UP_URL}>
            Get started
          </a>
        </div>
        <div className="fade hero__marquee" style={{ animationDelay: ".8s" }} data-marquee>
          <p className="sr-only">For {ROLES.slice(0, 5).join(", ")}.</p>
          <div className="marquee" aria-hidden="true">
            <RoleSet />
            <RoleSet hidden />
          </div>
        </div>
      </div>
    </section>
  );
}
