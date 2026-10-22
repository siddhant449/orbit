import "./marketing.css";

// The public marketing pages (/welcome, /privacy, /terms; "/" rewrites to /welcome when signed out). They are always
// ink and paper whatever the app theme is, so the wrapper pins the dark token set and the page chrome is scoped to `.mk`.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mk dark">
      {/* Reveal-on-scroll only hides content once we know JS runs; without it every section paints in its final state. */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      {children}
    </div>
  );
}
