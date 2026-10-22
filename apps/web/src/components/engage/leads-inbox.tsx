import { StatusPill, cn } from "@brandloop/ui";
import { leadsWithIntent, type Lead } from "@/lib/insights/engage-view";
import { NotYetButton } from "@/components/settings/not-yet-button";
import { Avatar } from "./avatar";

/**
 * Leads inbox (p12 right rail): people who commented, asked, messaged or visited, with Reply / Open. Reply goes to
 * LinkedIn; CRM and list actions are stubs until those integrations exist.
 */
export function LeadsInbox({ leads, className }: { leads: Lead[]; className?: string }) {
  const intent = leadsWithIntent(leads);
  const open = leads.filter((l) => !l.handled);
  return (
    <section aria-labelledby="leads-h" className={cn("orbit-panel flex flex-col gap-3.5 !rounded-[20px] p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="leads-h" className="text-sm font-medium text-text">
          Leads inbox
        </h2>
        {intent > 0 && <StatusPill>{intent} with intent</StatusPill>}
      </div>
      {open.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <StatusPill>Coming later</StatusPill>
          <p className="text-[13px] leading-[1.55] text-text-2">
            Once LinkedIn is connected, people who comment on your posts more than once or ask you a question will be listed
            here, with a reply drafted for each.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {open.map((l, i) => {
              return (
                <li key={l.id} className="flex items-center gap-3 rounded-[12px] bg-ground px-3 py-2.5">
                  <Avatar name={l.name} size={28} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-medium text-text">{l.name}</span>
                    <span className="truncate text-[11px] text-text-2">{l.text}</span>
                  </div>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "orbit-transition inline-flex min-h-6 items-center rounded-pill px-[9px] text-[11px] font-medium",
                      i === 0
                        ? "bg-accent text-on-accent hover:bg-accent-hover"
                        : "border border-line-4 text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse",
                    )}
                  >
                    Reply
                    <span className="sr-only"> to {l.name} on LinkedIn</span>
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2 pt-1">
            <NotYetButton service="HubSpot" variant="secondary" size="sm" className="flex-1 text-xs">
              Push to HubSpot
            </NotYetButton>
            <NotYetButton service="Lists" variant="secondary" size="sm" className="flex-1 text-xs">
              Add to list
            </NotYetButton>
          </div>
        </>
      )}
    </section>
  );
}
