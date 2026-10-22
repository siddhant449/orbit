import { SIGN_IN_URL } from "./links";
import { OrbitMark } from "./ui";

/** C1: centred pill with a single action, the Sign in pill. After the hero it shrinks to logo + the Sign in pill (`.past-hero` on <html>, set by PageMotion). */
export function Nav() {
  return (
    <header className="nav">
      <a href="#top" className="nav__home" aria-label="Orbit home">
        <OrbitMark />
        <span className="wordmark" aria-hidden="true">
          orbit
        </span>
      </a>
      <a className="btn btn--ink" href={SIGN_IN_URL}>Sign in</a>
    </header>
  );
}
