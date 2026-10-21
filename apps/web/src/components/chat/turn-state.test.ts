import { describe, expect, it } from "vitest";
import { handleTurnActive, TurnState } from "./turn-state";

type M = { id: string; role: "user" | "assistant"; parts: { type: string; text?: string }[] };
const user = (id: string, text: string): M => ({ id, role: "user", parts: [{ type: "text", text }] });
const bot = (id: string): M => ({ id, role: "assistant", parts: [{ type: "text", text: "ok" }] });

/** Runs the transport's request preparation the way `DefaultChatTransport` does for a send. */
function send(turn: TurnState, messages: M[]) {
  return turn.prepare({ id: "chat_1", messages, body: undefined });
}

describe("TurnState.prepare", () => {
  it("sends only the newest message with the selections and a fresh run id, and tracks it", () => {
    const turn = new TurnState(null);
    turn.update({ selectedKnowledgeBaseIds: ["k1"], selectedWritingStyleId: "v1", webSearchEnabled: false });
    const { body } = send(turn, [user("m1", "Hi"), bot("r1"), user("m2", "Again")]);
    expect(body).toMatchObject({
      id: "chat_1",
      message: { id: "m2" },
      selectedKnowledgeBaseIds: ["k1"],
      selectedWritingStyleId: "v1",
      webSearchEnabled: false,
    });
    expect((body as { runId: string }).runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(turn.run()).toBe((body as { runId: string }).runId);
    expect(turn.pending()).toBe("m2");
  });
});

describe("handleTurnActive (409 chat_turn_active)", () => {
  it("drops a second send refused while another message's turn runs, and hands its text back", () => {
    const turn = new TurnState(null);
    const messages = [user("m1", "First"), user("m2", "Second")];
    send(turn, messages);
    const out = handleTurnActive(turn, messages, { runId: "run_live", requestMessageId: "m1" });
    expect(out.messages.map((m) => m.id)).toEqual(["m1"]);
    expect(out.draft).toBe("Second");
    // Stop now targets the live run, and the refused message is no longer pending.
    expect(turn.run()).toBe("run_live");
    expect(turn.pending()).toBeNull();
  });

  it("keeps the message when the running turn is answering it (already stored)", () => {
    const turn = new TurnState(null);
    const messages = [user("m1", "First")];
    send(turn, messages);
    const out = handleTurnActive(turn, messages, { runId: "run_live", requestMessageId: "m1" });
    expect(out.messages).toBe(messages);
    expect(out.draft).toBeNull();
    expect(turn.run()).toBe("run_live");
    expect(turn.pending()).toBe("m1");
  });

  it("drops and restores with an unknown active turn", () => {
    const turn = new TurnState(null);
    const messages = [bot("r0"), user("m2", "Hello")];
    send(turn, messages);
    const out = handleTurnActive(turn, messages, null);
    expect(out.messages.map((m) => m.id)).toEqual(["r0"]);
    expect(out.draft).toBe("Hello");
    expect(turn.run()).toBeNull();
  });

  it("restores nothing for blank text and leaves the list alone without a pending message", () => {
    const blank = new TurnState(null);
    const withBlank = [user("m3", "   ")];
    send(blank, withBlank);
    expect(handleTurnActive(blank, withBlank, null)).toEqual({ messages: [], draft: null });

    const idle = new TurnState(null);
    const list = [user("m1", "x")];
    expect(handleTurnActive(idle, list, null)).toEqual({ messages: list, draft: null });
  });
});
