import { Logo } from "@/components/shell/logo";
import { AuthArt } from "./auth-art";
import { ThemeToggle } from "./theme-toggle";

const footerLinks = [
  // No public Privacy, Terms or Help routes exist yet; placeholders until they do.
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Help", href: "#" },
];

/**
 * Sign-in / sign-up split screen. ≥1024 px: the form panel on the left, everything on one centred axis (mark, heading,
 * Clerk form, footer links); on the right a framed artwork, a dithered planet rising under its orbit. Below 1024 px
 * the artwork becomes a short band above the form.
 */
export function AuthScreen({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col bg-ground lg:grid lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)]">
      {/* Over the band's empty corner on small screens; the left panel's top-right corner from 1024 px. */}
      <ThemeToggle className="absolute right-6 top-6 z-10 lg:right-auto lg:left-[calc(46%-4.25rem)] lg:top-8" />
      <AuthArt className="mx-3 mt-3 h-44 sm:h-56 lg:sticky lg:top-0 lg:order-2 lg:m-0 lg:h-svh lg:p-3 lg:pl-0" />

      <main className="relative flex min-w-0 flex-1 flex-col items-center px-5 pb-6 pt-5 sm:px-10 lg:min-h-svh lg:py-8">

        <div className="flex w-full max-w-[400px] flex-1 flex-col justify-center py-8 lg:py-14">
          <div className="flex flex-col items-center text-center">
            <Logo size={22} />
            <h1 className="type-greeting mt-10 text-text">{title}</h1>
            <p className="mt-3 max-w-[40ch] text-[15px] leading-[1.55] text-text-2">{lead}</p>
          </div>
          <div className="mt-9">{children}</div>
        </div>

        <footer className="w-full">
          <nav aria-label="Legal and help">
            <ul className="flex justify-center gap-6 text-[13px] text-text-3">
              {footerLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="orbit-transition hover:text-text">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </footer>
      </main>
    </div>
  );
}
