import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";
import { ALERT_WINDOW_MS, evaluateAlert, getProviderAlert, recordProviderFailure, reportProviderError } from "./provider-alert";
import { memoryStore } from "./usage-limits";

const none = { quota: [], auth: [], outage: [] };
const NOW = 10_000_000;
const min = 60_000;

describe("evaluateAlert", () => {
  it("is null with no failures", () => expect(evaluateAlert(none, [], NOW)).toBeNull());
  it("reports the earliest failure as 'since' and the class", () => {
    expect(evaluateAlert({ ...none, quota: [NOW - 5 * min, NOW - 2 * min] }, [], NOW)).toEqual({ cls: "quota", since: NOW - 5 * min, lastAt: NOW - 2 * min });
  });
  it("clears once a call succeeded after the last failure", () => {
    expect(evaluateAlert({ ...none, quota: [NOW - 5 * min] }, [NOW - min], NOW)).toBeNull();
  });
  it("keeps failures that came after the last success", () => {
    expect(evaluateAlert({ ...none, auth: [NOW - 5 * min, NOW - min] }, [NOW - 3 * min], NOW)).toEqual({ cls: "auth", since: NOW - min, lastAt: NOW - min });
  });
  it("ignores failures older than 30 minutes", () => {
    expect(evaluateAlert({ ...none, outage: [NOW - ALERT_WINDOW_MS - 1] }, [], NOW)).toBeNull();
  });
  it("ranks quota over auth over outage", () => {
    expect(evaluateAlert({ quota: [NOW - min], auth: [NOW - min], outage: [NOW - min] }, [], NOW)?.cls).toBe("quota");
    expect(evaluateAlert({ ...none, auth: [NOW - min], outage: [NOW - min] }, [], NOW)?.cls).toBe("auth");
  });
});

describe("recording", () => {
  it("round-trips through the store", async () => {
    const store = memoryStore(() => NOW);
    recordProviderFailure("quota", { store, now: () => NOW - min });
    recordProviderFailure("rate_limit", { store, now: () => NOW });
    await Promise.resolve();
    expect(await getProviderAlert({ store, now: () => NOW })).toMatchObject({ cls: "quota", since: NOW - min });
  });
  it("logs one line per error object, class and status only", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new APICallError({ message: "You have no credits remaining", url: "u", requestBodyValues: {}, statusCode: 429, responseBody: JSON.stringify({ error: { code: "insufficient_quota" } }) });
    const store = memoryStore();
    reportProviderError(err, "chat", { store });
    reportProviderError(err, "chat again", { store });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]![0])).toMatch(/quota \(status 429\)/);
    expect(String(spy.mock.calls[0]![0])).not.toMatch(/credits/);
    spy.mockRestore();
  });
});
