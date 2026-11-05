"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Hint, Label, NativeSelect, cn } from "@brandloop/ui";
import type { McpSettingsDto } from "@/lib/mcp-settings-api";

type TabId = "chatgpt" | "codex";
const TABS: { id: TabId; label: string }[] = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "codex", label: "Codex" },
];

async function call(url: string, method: string, body?: unknown): Promise<McpSettingsDto> {
  const res = await fetch(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
  const data = (await res.json().catch(() => ({}))) as McpSettingsDto & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it instead.");
  }
}

function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-card-sm border border-line bg-ground px-3 py-2 text-[13px] text-text" tabIndex={0} aria-label={label}>
        {value}
      </code>
      <Button type="button" variant="secondary" size="sm" onClick={() => void copy(value, label)} aria-label={`Copy ${label.toLowerCase()}`}>
        Copy
      </Button>
    </div>
  );
}

export function AssistantsPanel({ serverUrl, initial }: { serverUrl: string; initial: McpSettingsDto }) {
  const [tab, setTab] = useState<TabId>("chatgpt");
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ chatgpt: null, codex: null });

  function onTabKey(e: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    const id = TABS[next]!.id;
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  async function run(action: () => Promise<McpSettingsDto>, done: string) {
    setBusy(true);
    try {
      setSettings(await action());
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const add = `codex mcp add orbit --url ${serverUrl}`;
  const login = "codex mcp login orbit";
  const toml = `[mcp_servers.orbit]\nurl = "${serverUrl}"`;

  return (
    <div className="orbit-panel flex flex-col gap-5 p-5 sm:p-6">
      <p className="text-[13px] leading-[1.55] text-text-soft">
        Connect ChatGPT or Codex to read your strategy, ideas, memory and posts, and to save drafts, ideas and memory for you. An assistant can never publish, schedule or delete anything. You sign in with your Orbit account; there are no keys to copy.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mcp-url">Server URL</Label>
        <div className="flex items-center gap-2">
          <input
            id="mcp-url"
            readOnly
            value={serverUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 min-w-0 flex-1 rounded-card-sm border border-line-control bg-ground px-3 text-[13px] text-text"
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => void copy(serverUrl, "Server URL")}>
            Copy URL
          </Button>
        </div>
      </div>

      <div>
        <div role="tablist" aria-label="Assistant" className="flex gap-2" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`mcp-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`mcp-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={cn(
                "orbit-transition h-8 rounded-pill border px-3.5 text-[13px] font-medium",
                tab === t.id ? "border-inverse bg-inverse text-on-inverse" : "border-line-control text-text hover:border-text-3",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "chatgpt" ? (
          <div role="tabpanel" id="mcp-panel-chatgpt" aria-labelledby="mcp-tab-chatgpt" className="mt-4">
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13px] leading-[1.55] text-text-soft">
              <li>In ChatGPT, open Settings and then Connectors. If you don&apos;t see an option to create one, turn on Developer mode under Advanced.</li>
              <li>Choose Create, name it Orbit and paste the server URL above.</li>
              <li>Set authentication to OAuth, then create the connector.</li>
              <li>Sign in with your Orbit account when asked and allow access.</li>
              <li>Start a chat, add Orbit from the tools menu and ask it for your latest ideas.</li>
            </ol>
          </div>
        ) : (
          <div role="tabpanel" id="mcp-panel-codex" aria-labelledby="mcp-tab-codex" className="mt-4 flex flex-col gap-3">
            <p className="text-[13px] leading-[1.55] text-text-soft">Add Orbit as a server, then sign in. Your browser opens so you can allow access.</p>
            <CopyLine label="Add command" value={add} />
            <CopyLine label="Sign-in command" value={login} />
            <p className="text-[13px] leading-[1.55] text-text-soft">Or add it to your Codex config file (~/.codex/config.toml):</p>
            <div className="flex items-start gap-2">
              <pre className="min-w-0 flex-1 overflow-x-auto rounded-card-sm border border-line bg-ground px-3 py-2 text-[13px] text-text" tabIndex={0} aria-label="Codex config">
                {toml}
              </pre>
              <Button type="button" variant="secondary" size="sm" onClick={() => void copy(toml, "Config")} aria-label="Copy config">
                Copy
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-2.5 border-t border-line pt-5 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-8">
        <div>
          <Label htmlFor="mcp-profile">AI assistants act as</Label>
          <Hint className="mt-1">The profile they read from and write to. You can change it any time.</Hint>
        </div>
        <NativeSelect
          id="mcp-profile"
          value={settings.profileId ?? ""}
          disabled={busy || settings.profiles.length === 0}
          onChange={(e) => void run(() => call("/api/mcp-settings", "PUT", { profileId: e.target.value }), "Profile saved")}
        >
          {settings.profiles.length === 0 && <option value="">No profile yet</option>}
          {settings.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="border-t border-line pt-5">
        <h3 className="text-[14px] font-medium text-text">Connected assistants</h3>
        {settings.clients.length === 0 ? (
          <p className="mt-2 text-[13px] leading-[1.55] text-text-2">None yet. An assistant shows up here after its first request.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {settings.clients.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-text">{c.clientName}</p>
                  <p className="text-[12px] text-text-2">Last used {c.lastUsedAt.slice(0, 10)}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  aria-label={`Disconnect ${c.clientName}`}
                  onClick={() => void run(() => call(`/api/mcp-settings/clients/${c.id}`, "DELETE"), `Disconnected ${c.clientName}`)}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
