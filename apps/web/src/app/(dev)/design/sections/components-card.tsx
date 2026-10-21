"use client";

import { Button, ComposerShell, CountUp, Input, Label, Panel, Pill, Ring, Segmented, StatusPill, cn } from "@brandloop/ui";
import { PlusIcon, SendIcon } from "@brandloop/ui/icons";
import { useState } from "react";

const views = [
  { value: "board", label: "Board" },
  { value: "list", label: "List" },
  { value: "calendar", label: "Calendar" },
] as const;

/** Every Orbit primitive, rendered inside a forced-theme wrapper so both themes sit side by side (p30). */
export function ComponentsCard({ theme }: { theme: "dark" | "light" }) {
  const [view, setView] = useState<(typeof views)[number]["value"]>("board");
  const [hook, setHook] = useState(true);
  const dark = theme === "dark";
  const title = dark ? "Components, dark" : "Components, light";

  return (
    <section
      aria-labelledby={`components-${theme}`}
      className={cn(theme, "flex min-w-0 flex-col gap-6 rounded-card-lg bg-ground p-5 text-text shadow-elevation-card sm:p-7", dark && "ring-1 ring-line-2")}
    >
      <h3 id={`components-${theme}`} className="text-lg font-medium tracking-[-0.01em]">
        {title}
      </h3>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="lg">Get started</Button>
        <Button size="lg" variant="secondary">
          Schedule
        </Button>
        <Button size="lg" variant="paper">
          Use post
        </Button>
        <Button variant="send" aria-label="Send">
          <SendIcon />
        </Button>
        <Button size="icon" variant="secondary" className="border-line-3" aria-label="Add files">
          <PlusIcon />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" className="border-line-2">
          Notifications
        </Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger" size="sm">
          Delete chat
        </Button>
        <Button variant="micro" className="border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover hover:text-on-accent">
          Approve
        </Button>
        <Button variant="micro">Edit</Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill selected={hook} onClick={() => setHook((v) => !v)}>
          Sharpen the hook
        </Pill>
        <Pill>Flip the angle</Pill>
        <StatusPill tone="accent">Approved</StatusPill>
        <StatusPill>4 left</StatusPill>
        <StatusPill tone="mono">+12.4%</StatusPill>
      </div>

      <Segmented label={`View, ${theme} sample`} options={views} value={view} onChange={setView} className="self-start" />

      <ComposerShell variant="thread" className="flex flex-col gap-3 rounded-card p-4">
        <label htmlFor={`composer-${theme}`} className="sr-only">
          Composer sample, {theme}
        </label>
        <textarea
          id={`composer-${theme}`}
          rows={2}
          placeholder="Composer: click to see the focus glow"
          className="w-full resize-none bg-transparent text-[15px] leading-normal text-text outline-none placeholder:text-text-3"
        />
      </ComposerShell>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`input-${theme}`}>Profile name</Label>
        <Input id={`input-${theme}`} defaultValue="Personal workspace" />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-2.5">
        <Panel as="a" href="#components" interactive className="flex flex-col gap-2 text-text no-underline">
          <span className="text-xs text-text-2">Panel: hover lifts</span>
          <CountUp value={412118} format={(n) => n.toLocaleString("en-US")} sessionKey={`design-${theme}`} className="type-stat" />
        </Panel>
        <Panel className="flex items-center gap-3.5">
          <Ring value={2} max={30} size={56} strokeWidth={7} label="Sprint progress" className="text-[30px]">
            2
          </Ring>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-text-2">Ring: draws on first view</span>
            <span className="text-sm font-medium">Day 2 of the 30-day sprint</span>
          </span>
        </Panel>
      </div>
    </section>
  );
}
