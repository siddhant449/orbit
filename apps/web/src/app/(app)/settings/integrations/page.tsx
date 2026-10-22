import type { ReactNode } from "react";
import { StatusPill, cn } from "@brandloop/ui";
import { PageBody, PageHeader, SectionHeading } from "@/components/page";
import { NotYetButton } from "@/components/settings/not-yet-button";

export const metadata = { title: "Integrations" };

/*
 * Integrations (screens.md B12, p14/p27). The layout is Orbit's; nothing here is connected yet, so every card reads
 * "Not connected" (or nothing) and every action answers "Not available yet" (ruling A14: no fake Active states, no
 * sample keys or commands).
 */

const SOCIAL = [
  {
    name: "LinkedIn",
    body: "Import your profile, recent posts, writing style and analytics. Publishing goes through the official API.",
    mark: (
      <span className="grid size-10 place-items-center rounded-[10px] bg-[#0A66C2] text-[17px] font-semibold text-white">in</span>
    ),
    featured: true,
  },
  {
    name: "X",
    body: "Import your profile, posts, writing style and analytics.",
    mark: (
      <span className="grid size-10 place-items-center rounded-[10px] border border-line-2 bg-ground text-[17px] font-semibold text-text">
        X
      </span>
    ),
  },
  {
    name: "Instagram",
    body: "Read your posts, comments and insights from chat. Business and Creator accounts only.",
    mark: (
      <span className="block size-10 rounded-[10px] bg-[linear-gradient(135deg,#FEDA75_0%,#FA7E1E_30%,#D62976_60%,#962FBF_80%,#4F5BD5_100%)]" />
    ),
  },
];

const ASSISTANTS = [
  { name: "AI assistants", body: "Use Orbit drafts, hooks and your voice profile from Codex, Claude, ChatGPT and Cursor." },
  { name: "Orbit CLI", body: "The Orbit agent in your terminal: draft, refine and schedule without leaving it." },
  { name: "Telegram", body: "Tap once to connect, then message Orbit on Telegram: ideas, drafts, scheduling." },
];

const APPS = [
  ["Notion", "Search, read, create pages"],
  ["Google Drive", "Search and read files"],
  ["Google Docs", "Search and read docs"],
  ["Gmail", "Search and read threads"],
  ["Outlook", "Search and read mail"],
  ["Zoom", "Meetings and AI summaries"],
  ["Google Meet", "Recordings and transcripts"],
  ["Fireflies", "Transcripts and highlights"],
  ["Fathom", "Recordings and summaries"],
  ["Microsoft Teams", "Chats, channels, messages"],
  ["Slack", "Channels and threads"],
  ["Avoma", "Recordings and notes"],
  ["Evernote", "Notes and notebooks"],
] as const;

// Literal classes so Tailwind sees them (system §9: every grid uses minmax(min(X,100%),1fr), no h-scroll at 390).
const GRIDS = {
  260: "grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]",
  220: "grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))]",
  200: "grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))]",
} as const;
const grid = (min: keyof typeof GRIDS) => GRIDS[min];

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("orbit-panel flex flex-col gap-4 p-5", className)}>{children}</div>;
}

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader className="max-w-[1120px]" title="Integrations" subtitle="Connect the profiles Orbit uses for publishing, analytics and personalization." />
      <PageBody className="flex max-w-[1120px] flex-col gap-9">
        <section aria-labelledby="int-social">
          <SectionHeading id="int-social" title="Social accounts" />
          <ul className={grid(260)}>
            {SOCIAL.map((s) => (
              <li key={s.name} className="flex">
                <Card
                  className={cn(
                    "relative w-full overflow-hidden",
                    s.featured &&
                      "border-[rgba(124,138,255,0.5)] bg-[radial-gradient(120%_90%_at_100%_0%,var(--accent-wash),transparent_60%),var(--panel)] [.light_&]:border-[rgba(46,63,230,0.35)]",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true">{s.mark}</span>
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-medium leading-6 text-text">{s.name}</h3>
                      <p className="text-[12px] text-text-2">Not connected</p>
                    </div>
                  </div>
                  <p className="flex-1 text-[13px] leading-[1.55] text-text-soft">{s.body}</p>
                  <NotYetButton
                    service={s.name}
                    variant={s.featured ? "primary" : "paper"}
                    aria-label={s.featured ? undefined : `Connect ${s.name}`}
                    className="w-full"
                  >
                    {s.featured ? `Connect ${s.name}` : "Connect"}
                  </NotYetButton>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="int-assistants">
          <SectionHeading id="int-assistants" title="AI assistants" note="use Orbit from your coding agent, Telegram and more" />
          <ul className={grid(220)}>
            {ASSISTANTS.map((a) => (
              <li key={a.name} className="flex">
                <Card className="w-full">
                  <h3 className="text-[15px] font-medium leading-6 text-text">{a.name}</h3>
                  <p className="flex-1 text-[13px] leading-[1.55] text-text-soft">{a.body}</p>
                  <NotYetButton service={a.name} variant="paper" aria-label={`Set up ${a.name}`} className="w-full">
                    Set up
                  </NotYetButton>
                </Card>
              </li>
            ))}
            <li className="flex">
              <div className="flex w-full flex-col gap-4 rounded-card border border-dashed border-line-3 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-medium leading-6 text-text">WhatsApp</h3>
                  <StatusPill>Coming soon</StatusPill>
                </div>
                <p className="text-[13px] leading-[1.55] text-text-2">
                  Link your number and chat with Orbit like a contact: ideas in, drafts out.
                </p>
              </div>
            </li>
          </ul>
        </section>

        <section aria-labelledby="int-dev">
          <SectionHeading id="int-dev" title="Developers" note="the same loop from your own tools" />
          <ul className={grid(260)}>
            <li className="flex">
              <Card className="w-full">
                <h3 className="text-[15px] font-medium leading-6 text-text">API key</h3>
                <p className="flex-1 text-[13px] leading-[1.55] text-text-soft">
                  No key yet. Keys let your own scripts read and write drafts in this profile.
                </p>
                <div>
                  <NotYetButton service="API keys" variant="secondary" size="sm">
                    Create key
                  </NotYetButton>
                </div>
              </Card>
            </li>
            <li className="flex">
              <Card className="w-full">
                <h3 className="text-[15px] font-medium leading-6 text-text">MCP server</h3>
                <p className="flex-1 text-[13px] leading-[1.55] text-text-soft">
                  Draft, schedule and read analytics from Claude, Cursor, Codex or ChatGPT.
                </p>
                <div>
                  <NotYetButton service="The MCP server" variant="secondary" size="sm" aria-label="Set up MCP server">
                    Set up
                  </NotYetButton>
                </div>
              </Card>
            </li>
            <li className="flex">
              <Card className="w-full">
                <h3 className="text-[15px] font-medium leading-6 text-text">Zapier and webhooks</h3>
                <p className="flex-1 text-[13px] leading-[1.55] text-text-soft">
                  Post published, lead detected, approval requested. Send them anywhere.
                </p>
                <div>
                  <NotYetButton service="Webhooks" variant="secondary" size="sm">
                    Add endpoint
                  </NotYetButton>
                </div>
              </Card>
            </li>
          </ul>
        </section>

        <section aria-labelledby="int-apps">
          <SectionHeading id="int-apps" title="Apps" note="bring your tools into Orbit: meeting recorders, docs and more" />
          <ul className={grid(200)}>
            {APPS.map(([name, line]) => (
              <li key={name} className="orbit-panel flex items-center gap-3 rounded-card-sm p-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-medium leading-tight text-text">{name}</h3>
                  <p className="mt-1 text-[12px] leading-snug text-text-2">{line}</p>
                </div>
                <NotYetButton service={name} variant="secondary" size="sm" aria-label={`Connect ${name}`}>
                  Connect
                </NotYetButton>
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
    </>
  );
}
