import Link from "next/link";
import { OrbitMark, Ph } from "./ui";

/** Privacy / Terms stand-ins: real routes so the footer has no dead links; the body is a launch-blocking placeholder. */
export function LegalPage({ title }: { title: string }) {
  return (
    <>
      <header className="nav" style={{ animation: "none" }}>
        <Link href="/" className="nav__home" aria-label="Orbit home">
          <OrbitMark />
          <span className="wordmark" aria-hidden="true">orbit</span>
        </Link>
      </header>
      <main className="paper legal">
        <div className="wrap">
          <h1 className="t-section">{title}</h1>
          <Ph as="div" kind="legal-copy">
            <p>Coming before launch. Orbit&apos;s {title.toLowerCase()} will be published here before anyone can sign up.</p>
          </Ph>
          <p>
            <Link href="/" style={{ textDecoration: "underline" }}>Back to Orbit</Link>
          </p>
        </div>
      </main>
    </>
  );
}
