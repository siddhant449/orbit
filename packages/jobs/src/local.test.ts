import { describe, expect, it, vi } from "vitest";
import { createJobDriver } from "./index";
import { TransientJobError } from "./types";

describe("local job driver", () => {
  it("runs the handler after enqueue returns, with attempt 1", async () => {
    const calls: unknown[] = [];
    const driver = createJobDriver({}, { handlers: { "t.a": async (p, ctx) => void calls.push([p, ctx.attempt]) } });
    await driver.enqueue("t.a", { id: 1 });
    expect(calls).toEqual([]); // not yet: the caller's response goes first
    await driver.idle();
    expect(calls).toEqual([[{ id: 1 }, 1]]);
  });

  it("retries a TransientJobError with the next attempt number, up to maxAttempts", async () => {
    const attempts: number[] = [];
    const driver = createJobDriver({}, {
      retryDelayMs: 0,
      handlers: { "t.a": async (_p, ctx) => { attempts.push(ctx.attempt); if (ctx.attempt < 3) throw new TransientJobError("later"); } },
    });
    await driver.enqueue("t.a", {});
    await driver.idle();
    expect(attempts).toEqual([1, 2, 3]);
  });

  it("stops after maxAttempts and on other errors, and reports only the message", async () => {
    const onError = vi.fn();
    const tries = vi.fn(async () => { throw new TransientJobError("still down"); });
    const boom = vi.fn(async () => { throw new Error("bug"); });
    const driver = createJobDriver({}, { retryDelayMs: 0, onError, handlers: { "t.t": tries, "t.b": boom } });
    await driver.enqueue("t.t", {});
    await driver.enqueue("t.b", {});
    await driver.idle();
    expect(tries).toHaveBeenCalledTimes(3);
    expect(boom).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls.map((c) => c[0].message)).toEqual(["still down", "bug"]);
  });

  it("ignores a repeated dedupeId and rejects unknown topics", async () => {
    const h = vi.fn(async () => {});
    const driver = createJobDriver({}, { handlers: { "t.a": h } });
    await driver.enqueue("t.a", {}, { dedupeId: "x" });
    await driver.enqueue("t.a", {}, { dedupeId: "x" });
    await driver.idle();
    expect(h).toHaveBeenCalledTimes(1);
    await expect(driver.enqueue("nope", {})).rejects.toThrow(/No handler/);
  });

  it("honours notBefore", async () => {
    const h = vi.fn(async () => {});
    const driver = createJobDriver({}, { handlers: { "t.a": h } });
    await driver.enqueue("t.a", {}, { notBefore: new Date(Date.now() + 60) });
    await new Promise((r) => setTimeout(r, 20));
    expect(h).not.toHaveBeenCalled();
    await driver.idle();
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("uses a custom defer (the web app passes Next's after)", async () => {
    const deferred: (() => Promise<void>)[] = [];
    const h = vi.fn(async () => {});
    const driver = createJobDriver({}, { handlers: { "t.a": h }, defer: (fn) => void deferred.push(fn) });
    await driver.enqueue("t.a", {});
    expect(deferred).toHaveLength(1);
    await deferred[0]!();
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("only the local driver exists for now", () => {
    expect(() => createJobDriver({ JOBS_DRIVER: "qstash" }, { handlers: {} })).toThrow(/qstash/);
  });
});
