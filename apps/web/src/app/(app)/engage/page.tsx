import { StatusPill } from "@brandloop/ui";

export const metadata = { title: "Engage" };

/** Engage (screens.md B10) is a future feature (O12); until then the route says what it will be, in Orbit's empty-state style. */
export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-5 pb-16 pt-8 md:px-8 md:pt-[28px]">
      <header className="flex flex-col gap-3">
        <h1 className="type-page-title text-text focus-visible:outline-none">Engage</h1>
        <p className="max-w-[56ch] text-[15px] leading-[1.55] text-text-2">
          Twenty minutes a day. Comment on the people in your plan, answer the people who showed intent.
        </p>
      </header>
      <section
        aria-labelledby="engage-soon"
        className="flex flex-col gap-4 rounded-[18px] border border-dashed border-line-3 p-6 md:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="engage-soon" className="type-card-title text-text">
            A comment queue, drafted in your voice
          </h2>
          <StatusPill>Coming soon</StatusPill>
        </div>
        <p className="max-w-[60ch] text-[14px] leading-[1.55] text-text-2">
          Orbit will line up posts worth answering and draft a comment for each. You read it, change it and post it yourself
          on LinkedIn. Orbit never comments for you.
        </p>
      </section>
    </div>
  );
}
