import { getOrCreateChat, saveAssistantMessage } from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, testContext } from "../test/fixtures";
import {
  PostWritingPayload,
  findHandoff,
  requestDigest,
  specialistOutputSchema,
  stampEnvelope,
  type SpecialistOutput,
} from "./envelope";

const now = new Date("2026-10-21T09:00:00Z");
const out: SpecialistOutput<{ readiness: "ready"; title: string; hook: string; draft: string; clarifyingQuestion: null }> = {
  summary: "A short post",
  findings: ["Uses the MVP story"],
  recommendation: "Create it",
  missingInput: [],
  confidence: "medium",
  parentAction: "create-document",
  payload: { readiness: "ready", title: "T", hook: "H", draft: "Draft", clarifyingQuestion: null },
};

beforeEach(cleanup);
afterAll(cleanup);

describe("handoff envelope", () => {
  it("stamps proposal-only authority, the tool call id, a 64-hex digest and source revisions", () => {
    const e = stampEnvelope("post-writing", out, {
      toolCallId: "call_1",
      taskId: "t1",
      request: "Write about X",
      document: { id: "d1", version: 2 },
      now,
    });
    expect(e).toMatchObject({
      specialist: "post-writing",
      authority: "proposal-only",
      handoffId: "call_1",
      taskId: "t1",
      createdAt: now.toISOString(),
      sourceRevisions: { document: { id: "d1", version: 2 } },
      payload: { draft: "Draft" },
    });
    expect(e.requestDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(requestDigest("post-writing", "Write about X")).toBe(e.requestDigest);
    expect(requestDigest("final-review", "Write about X")).not.toBe(e.requestDigest);
    expect(stampEnvelope("post-writing", out, { toolCallId: "c", taskId: "t", request: "r", document: null, now }).sourceRevisions).toEqual({});
  });

  it("validates the specialist output shape and its payload limits", () => {
    const schema = specialistOutputSchema(PostWritingPayload);
    expect(schema.safeParse(out).success).toBe(true);
    expect(schema.safeParse({ ...out, findings: Array(9).fill("f") }).success).toBe(false);
    expect(schema.safeParse({ ...out, missingInput: Array(6).fill("m") }).success).toBe(false);
    expect(schema.safeParse({ ...out, payload: { ...out.payload, draft: "x".repeat(3_501) } }).success).toBe(false);
    expect(schema.safeParse({ ...out, payload: { ...out.payload, title: "x".repeat(121) } }).success).toBe(false);
    expect(schema.safeParse({ ...out, confidence: "very" }).success).toBe(false);
  });

  it("finds a handoff in this turn first, then in the chat's stored delegate parts, never another chat's", async () => {
    const ctx = await testContext({ chatId: randomUUID() });
    await getOrCreateChat(ctx.profileId, ctx.userId, ctx.chatId);
    const live = stampEnvelope("post-writing", out, { toolCallId: "call_live", taskId: "t", request: "r", document: null, now });
    ctx.handoffs.set("call_live", live);
    expect(await findHandoff(ctx, "call_live")).toBe(live);

    const stored = stampEnvelope("post-writing", out, { toolCallId: "call_old", taskId: "t", request: "r", document: null, now });
    await saveAssistantMessage(ctx.chatId, {
      id: randomUUID(),
      runId: "r1",
      parts: [
        { type: "tool-delegateWriting", toolCallId: "call_old", state: "output-available", input: {}, output: stored },
        { type: "tool-searchKB", toolCallId: "call_kb", state: "output-available", input: {}, output: stored },
        { type: "tool-delegateWriting", toolCallId: "call_failed", state: "output-available", input: {}, output: "Failed: x" },
      ],
      metadata: null,
      context: null,
    });
    expect(await findHandoff(ctx, "call_old")).toMatchObject({ handoffId: "call_old", payload: { draft: "Draft" } });
    expect(await findHandoff(ctx, "call_kb")).toBeNull();
    expect(await findHandoff(ctx, "call_failed")).toBeNull();
    expect(await findHandoff(ctx, "nope")).toBeNull();

    // Another chat of the same profile can't borrow it.
    const other = await testContext({ chatId: randomUUID(), profileId: ctx.profileId, userId: ctx.userId });
    await getOrCreateChat(ctx.profileId, ctx.userId, other.chatId);
    expect(await findHandoff(other, "call_old")).toBeNull();
  });
});
