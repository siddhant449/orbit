import { describe, expect, it } from "vitest";
import { ChatRequestError, ChatTurnActiveError } from "./chat-fetch";
import {
  dropsOnRetry,
  friendlyError,
  hasReplyTo,
  pollUntilIdle,
  RECOVERY_CAP_MS,
  recoveryDelay,
  recoveryMessage,
  loadOutcome,
  restoresDraft,
  safeUrl,
} from "./chat-logic";

describe("safeUrl", () => {
  it.each([
    ["javascript:alert(1)", ""],
    ["JaVaScRiPt:alert(1)", ""],
    ["JaVa\nscript:alert(1)", ""],
    ["java\tscript:alert(1)", ""],
    ["  javascript:alert(1)", ""],
    ["data:text/html,<script>alert(1)</script>", ""],
    ["vbscript:msgbox(1)", ""],
    ["/settings", ""],
    ["../up", ""],
    ["//evil.example/x", ""],
    ["#section", ""],
    ["ftp://example.com/file", ""],
    ["mailto:hi@example.com", "mailto:hi@example.com"],
    ["http://example.com/a?b=1", "http://example.com/a?b=1"],
    ["https://example.com/guide", "https://example.com/guide"],
    ["HTTPS://EXAMPLE.COM", "HTTPS://EXAMPLE.COM"],
    ["  https://example.com  ", "https://example.com"],
    ["&#106;avascript:alert(1)", ""],
    ["%6Aavascript:alert(1)", ""],
    ["javascript&colon;alert(1)", ""],
    ["\u0001javascript:alert(1)", ""],
    ["\u0000", ""],
    ["\u0000https://example.com", ""],
    ["http:foo", ""],
    ["https:example.com", ""],
  ])("%j -> %j", (input, out) => {
    expect(safeUrl(input)).toBe(out);
  });
});

const u = (id: string) => ({ id, role: "user" as const });
const a = (id: string) => ({ id, role: "assistant" as const });

describe("hasReplyTo", () => {
  it("is true only when an assistant message follows the request", () => {
    expect(hasReplyTo([u("m1"), a("r1")], "m1")).toBe(true);
    expect(hasReplyTo([u("m1"), a("r1"), u("m2")], "m2")).toBe(false);
    expect(hasReplyTo([a("r0"), u("m1")], "m1")).toBe(false);
    expect(hasReplyTo([u("m1"), a("r1")], "missing")).toBe(false);
    expect(hasReplyTo([u("m1"), a("r1")], null)).toBe(false);
    // An assistant message with the request's id is not the request.
    expect(hasReplyTo([a("m1"), a("r1")], "m1")).toBe(false);
  });
});

describe("errors", () => {
  it("restores the draft for refused requests (4xx), not for server errors or turn conflicts", () => {
    expect(restoresDraft(new ChatRequestError("message_too_long", "Too long.", 413))).toBe(true);
    expect(restoresDraft(new ChatRequestError("bad_request", "Bad.", 400))).toBe(true);
    expect(restoresDraft(new ChatRequestError("ai_unavailable", "Down.", 503))).toBe(false);
    expect(restoresDraft(new ChatTurnActiveError(null))).toBe(false);
    expect(restoresDraft(new TypeError("Failed to fetch"))).toBe(false);
  });
  it("drops the on-screen message before a retry when it may never have been stored", () => {
    expect(dropsOnRetry(new ChatRequestError("ai_unavailable", "Down.", 503))).toBe(true);
    expect(dropsOnRetry(new TypeError("Failed to fetch"))).toBe(true);
    expect(dropsOnRetry(new Error("Something went wrong while answering. Try again."))).toBe(false);
    expect(dropsOnRetry(null)).toBe(false);
  });
  it("names network failures plainly and keeps server causes", () => {
    const net = "Brandloop couldn't be reached. Check your connection, then try again.";
    expect(friendlyError(new TypeError("Failed to fetch"))).toBe(net);
    expect(friendlyError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(net);
    expect(friendlyError(new TypeError("Load failed"))).toBe(net);
    expect(friendlyError(new ChatRequestError("message_too_long", "That message is too long.", 413))).toBe("That message is too long.");
    expect(friendlyError(new Error("Something went wrong while answering. Try again."))).toBe("Something went wrong while answering. Try again.");
    expect(friendlyError(new Error(""))).toBe("Something went wrong while answering. Try again.");
  });
});

describe("pollUntilIdle", () => {
  const stored = (activeTurn: { runId: string; requestMessageId: string | null } | null) => ({
    ok: true as const,
    chat: { messages: [], activeTurn },
  });
  const transient = { ok: false as const, terminal: null };

  it("backs off while a turn is active or a load fails, reports the run, and returns once idle", async () => {
    const answers = [stored({ runId: "run_9", requestMessageId: "m1" }), transient, stored({ runId: "run_9", requestMessageId: "m1" }), stored(null)];
    const slept: number[] = [];
    const runs: string[] = [];
    let clock = 0;
    const out = await pollUntilIdle({
      load: async () => answers.shift()!,
      onActive: (t) => runs.push(t.runId),
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
      now: () => clock,
    });
    expect(out).toEqual({ status: "idle", chat: { messages: [], activeTurn: null } });
    expect(runs).toEqual(["run_9", "run_9"]);
    expect(slept).toEqual([recoveryDelay(0), recoveryDelay(1), recoveryDelay(2)]);
  });

  it.each([
    ["gone", "This chat is no longer available."],
    ["signed-out", "Your session ended. Sign in again to see this chat."],
  ] as const)("stops at once on a terminal answer (%s)", async (terminal, message) => {
    let loads = 0;
    const out = await pollUntilIdle({
      load: async () => {
        loads++;
        return loads === 1 ? stored({ runId: "r", requestMessageId: null }) : { ok: false as const, terminal };
      },
      sleep: async () => {},
    });
    expect(out).toEqual({ status: "terminal", reason: terminal });
    expect(loads).toBe(2);
    expect(recoveryMessage(out)).toBe(message);
  });

  it("gives up at the cap with a reload message", async () => {
    let clock = 0;
    let loads = 0;
    const out = await pollUntilIdle({
      load: async () => {
        loads++;
        return stored({ runId: "r", requestMessageId: null });
      },
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    });
    expect(out).toEqual({ status: "timeout" });
    expect(recoveryMessage(out)).toBe("The reply is taking longer than expected. Reload to check on it.");
    expect(clock).toBeGreaterThanOrEqual(RECOVERY_CAP_MS);
    expect(clock).toBeLessThan(RECOVERY_CAP_MS + 20_000);
    expect(loads).toBeGreaterThan(5);
  });

  it("stops when aborted", async () => {
    const ctrl = new AbortController();
    const out = await pollUntilIdle({
      load: async () => {
        ctrl.abort();
        return stored(null);
      },
      sleep: async () => {},
      signal: ctrl.signal,
    });
    expect(out).toEqual({ status: "aborted" });
    expect(recoveryMessage(out)).toBeNull();
  });

  it("backs off from half a second to ten seconds", () => {
    expect(recoveryDelay(0)).toBe(500);
    expect(recoveryDelay(1)).toBeGreaterThan(recoveryDelay(0));
    expect(recoveryDelay(50)).toBe(10_000);
  });
});

describe("loadOutcome", () => {
  it.each([
    [401, "signed-out"],
    [403, "signed-out"],
    [404, "gone"],
    [500, null],
    [502, null],
  ] as const)("maps HTTP %i", (status, terminal) => {
    expect(loadOutcome(status)).toEqual({ ok: false, terminal });
  });
});
