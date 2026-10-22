import { describe, expect, it } from "vitest";
import { messageKeys, waitingKey } from "./reply-keys";

type M = { id: string; role: "user" | "assistant" };
const u = (id: string): M => ({ id, role: "user" });
const a = (id: string): M => ({ id, role: "assistant" });

describe("messageKeys", () => {
  it("keys a reply by the user message it answers, so the thinking row and the reply are one element", () => {
    const all = [u("u1"), a("a1"), u("u2")];
    expect(waitingKey(all)).toBe("reply:u2");
    const next = [...all, a("a2")];
    expect(messageKeys(next).get("a2")).toBe("reply:u2");
  });

  it("keys users by id, and a reply's key never changes as later messages arrive", () => {
    const keys = messageKeys([u("u1"), a("a1"), u("u2"), a("a2")]);
    expect(keys.get("u1")).toBe("u1");
    expect(keys.get("a1")).toBe("reply:u1");
    expect(messageKeys([u("u1"), a("a1"), u("u2"), a("a2"), u("u3")]).get("a1")).toBe("reply:u1");
  });

  it("follows hidden quick-link user messages too (keys come from the full list)", () => {
    const keys = messageKeys([u("u1"), a("a1"), u("hidden"), a("a2")]);
    expect(keys.get("a2")).toBe("reply:hidden");
  });

  it("falls back to the id for a second reply in a row or a reply with no user before it", () => {
    const keys = messageKeys([a("a0"), u("u1"), a("a1"), a("a1b")]);
    expect(keys.get("a0")).toBe("a0");
    expect(keys.get("a1")).toBe("reply:u1");
    expect(keys.get("a1b")).toBe("a1b");
  });

  it("has no waiting key unless the last message is the user's", () => {
    expect(waitingKey([u("u1"), a("a1")])).toBeNull();
    expect(waitingKey([])).toBeNull();
  });
});
