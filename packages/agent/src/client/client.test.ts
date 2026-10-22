import { afterAll, describe, expect, it } from "vitest";
import { buildTools } from "../tools";
import { cleanup, testContext } from "../test/fixtures";
import {
  collapseToolRuns,
  groupChatsByDate,
  HIDDEN_OUTPUT_TOOLS,
  isToolError,
  QUICK_LINKS,
  TOOL_LABELS,
  toolLabel,
} from "./index";

afterAll(cleanup);

const c = (at: string, pinned = false) => ({ id: at, lastActivityAt: at, pinned });

describe("tool labels", () => {
  it("has a label for every server tool", async () => {
    const names = Object.keys(buildTools(await testContext())).concat("web_search");
    for (const n of names) expect(TOOL_LABELS[n], n).toBeDefined();
  });

  it("covers the tools later tasks add", () => {
    for (const n of [
      "delegateWriting",
      "delegateEditing",
      "delegateIdentity",
      "delegateStrategy",
      "createDocument",
      "updateDocument",
      "proposeDocumentEdits",
      "getPostVersions",
      "generateHooks",
      "analyzePost",
      "runSkill",
    ]) {
      expect(TOOL_LABELS[n], n).toBeDefined();
    }
  });

  it("names each state in plain words", () => {
    expect(toolLabel("saveMemory", "active")).toBe("Saving that");
    expect(toolLabel("saveMemory", "done")).toBe("Saved to memory");
    expect(toolLabel("saveMemory", "error")).toBe("Couldn't save that");
    expect(toolLabel("searchKB", "active")).toBe("Searching your knowledge");
    expect(toolLabel("createDocument", "active")).toBe("Creating your post");
  });

  it("falls back to a generic label for an unknown tool", () => {
    expect(toolLabel("somethingNew", "active")).toBe("Working");
    expect(toolLabel("somethingNew", "done")).toBe("Done");
    expect(toolLabel("somethingNew", "error")).toBe("That step didn't work");
  });

  it("hides the outputs of memory and knowledge tools", () => {
    for (const n of ["viewMemory", "readMemory", "searchMemory", "saveMemory", "editMemory", "listKB", "searchKB", "readKB"]) {
      expect(HIDDEN_OUTPUT_TOOLS.has(n), n).toBe(true);
    }
    expect(HIDDEN_OUTPUT_TOOLS.has("createDocument")).toBe(false);
  });
});

describe("isToolError", () => {
  it("detects tool errors", () => {
    expect(isToolError("Failed: no memory file")).toBe(true);
    expect(isToolError("Refused: these read like assistant replies")).toBe(true);
    expect(isToolError("⚠ That source timed out")).toBe(true);
    expect(isToolError({ success: false })).toBe(true);
    expect(isToolError({ error: "EXISTING_POST: …" })).toBe(true);
    expect(isToolError("✓ Updated about with 1 item")).toBe(false);
    expect(isToolError({ success: true })).toBe(false);
    expect(isToolError(null)).toBe(false);
    expect(isToolError("EDIT_REQUIREMENTS_MISSED: Complete these omitted requirements: Add a CTA")).toBe(true);
    expect(isToolError("STALE_DOCUMENT: The user changed the post")).toBe(true);
    expect(isToolError("STALE_SELECTED_PASSAGE: That passage isn't in the current draft.")).toBe(true);
    expect(isToolError("EXISTING_POST: A post already exists")).toBe(true);
    expect(isToolError(undefined)).toBe(false);
  });
});

describe("groupChatsByDate", () => {
  it("groups chats by local day boundaries", () => {
    const now = new Date("2026-10-21T09:00:00");
    const g = groupChatsByDate(
      [c("2026-10-21T00:01:00"), c("2026-10-20T23:59:00"), c("2026-10-01T10:00:00"), c("2026-09-01", true)],
      now,
    );
    expect(g.map((x) => x.label)).toEqual(["Pinned", "Today", "Yesterday", "Previous 30 days"]);
  });

  it("uses the previous 7 days and older buckets and keeps the input order inside a group", () => {
    const now = new Date("2026-10-21T09:00:00");
    const g = groupChatsByDate(
      [c("2026-10-17T08:00:00"), c("2026-10-15T08:00:00"), c("2026-09-10T08:00:00"), c("2025-01-01T08:00:00")],
      now,
    );
    expect(g.map((x) => [x.label, x.chats.map((ch) => ch.id)])).toEqual([
      ["Previous 7 days", ["2026-10-17T08:00:00", "2026-10-15T08:00:00"]],
      ["Older", ["2026-09-10T08:00:00", "2025-01-01T08:00:00"]],
    ]);
  });

  it("accepts Date values and returns no empty groups", () => {
    const now = new Date("2026-10-21T09:00:00");
    expect(groupChatsByDate([], now)).toEqual([]);
    const g = groupChatsByDate([{ lastActivityAt: new Date("2026-10-21T08:00:00"), pinned: false }], now);
    expect(g.map((x) => x.label)).toEqual(["Today"]);
  });
});

describe("collapseToolRuns", () => {
  const t = (n: number) => ({ type: `tool-step${n}` });
  it("collapses three or more consecutive tool parts", () => {
    const text = { type: "text" };
    const out = collapseToolRuns([text, t(1), t(2), t(3), text]);
    expect(out).toEqual([text, { type: "tool-group", parts: [t(1), t(2), t(3)] }, text]);
  });

  it("leaves runs of one or two alone, and step-start parts don't break a run", () => {
    const text = { type: "text" };
    const step = { type: "step-start" };
    expect(collapseToolRuns([t(1), t(2), text])).toEqual([t(1), t(2), text]);
    expect(collapseToolRuns([t(1), step, t(2), step, t(3)])).toEqual([{ type: "tool-group", parts: [t(1), t(2), t(3)] }]);
  });
});

describe("QUICK_LINKS", () => {
  it("has five quick links with unique keys", () => {
    expect(QUICK_LINKS).toHaveLength(5);
    expect(new Set(QUICK_LINKS.map((q) => q.key)).size).toBe(5);
    for (const q of QUICK_LINKS) {
      expect(q.label.length).toBeGreaterThan(0);
      expect(q.prompt.length).toBeGreaterThan(10);
    }
  });
});
