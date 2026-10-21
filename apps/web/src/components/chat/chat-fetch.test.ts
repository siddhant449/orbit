import { afterEach, describe, expect, it, vi } from "vitest";
import { chatFetch, ChatRequestError, ChatTurnActiveError, ChatTurnCompleteError } from "./chat-fetch";

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => vi.unstubAllGlobals());

const post = () => chatFetch("/api/chat", { method: "POST", body: "{}" });

describe("chatFetch", () => {
  it("passes a streaming 200 through", async () => {
    vi.stubGlobal("fetch", reply(200, { ok: true }));
    expect((await post()).status).toBe(200);
  });

  it("throws ChatTurnActiveError with the active turn on 409 chat_turn_active", async () => {
    const activeTurn = { runId: "run_1", requestMessageId: "m1" };
    vi.stubGlobal("fetch", reply(409, { code: "chat_turn_active", cause: "busy", activeTurn }));
    const err = await post().catch((e) => e);
    expect(err).toBeInstanceOf(ChatTurnActiveError);
    expect((err as ChatTurnActiveError).activeTurn).toEqual(activeTurn);
  });

  it("defaults a missing activeTurn to null", async () => {
    vi.stubGlobal("fetch", reply(409, { code: "chat_turn_active", cause: "busy" }));
    const err = (await post().catch((e) => e)) as ChatTurnActiveError;
    expect(err.activeTurn).toBeNull();
  });

  it("throws ChatTurnCompleteError on 409 chat_turn_complete", async () => {
    vi.stubGlobal("fetch", reply(409, { code: "chat_turn_complete", cause: "This message already has a reply.", activeTurn: null }));
    const err = await post().catch((e) => e);
    expect(err).toBeInstanceOf(ChatTurnCompleteError);
    expect((err as Error).message).toBe("This message already has a reply.");
  });

  it.each([
    [413, "message_too_long", "That message is too long."],
    [400, "bad_request", "That request isn't valid."],
    [503, "ai_unavailable", "Writing isn't available right now."],
  ])("throws ChatRequestError on %i with the server's cause", async (status, code, cause) => {
    vi.stubGlobal("fetch", reply(status, { code, cause }));
    const err = (await post().catch((e) => e)) as ChatRequestError;
    expect(err).toBeInstanceOf(ChatRequestError);
    expect([err.status, err.code, err.message]).toEqual([status, code, cause]);
  });

  it("falls back to a plain message when the error body isn't JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    const err = (await post().catch((e) => e)) as ChatRequestError;
    expect([err.status, err.code, err.message]).toEqual([502, "request_failed", "That message didn't go through. Try again."]);
  });

  it("leaves GET responses (stream reconnects) to the SDK", async () => {
    vi.stubGlobal("fetch", reply(404, { code: "chat_not_found" }));
    expect((await chatFetch("/api/chat/x/stream")).status).toBe(404);
  });
});
