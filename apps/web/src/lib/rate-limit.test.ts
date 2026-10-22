import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows `limit` hits per key in a sliding window, then reports when to retry", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect(limiter.take("a")).toEqual({ ok: true });
    t = 100;
    expect(limiter.take("a")).toEqual({ ok: true });
    t = 200;
    expect(limiter.take("a")).toEqual({ ok: false, retryAfterMs: 800 });
    expect(limiter.take("b")).toEqual({ ok: true });
    t = 1001;
    expect(limiter.take("a")).toEqual({ ok: true });
  });
});
