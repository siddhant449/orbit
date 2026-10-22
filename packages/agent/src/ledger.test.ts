import { describe, expect, it } from "vitest";
import { nextActiveTask, renderActiveTask, type TurnOutcome } from "./ledger";
import type { ActiveTask } from "./types";

let ids = 0;
const newId = () => `task_${++ids}`;
const next = (prev: ActiveTask | null, turn: TurnOutcome) => nextActiveTask(prev, turn, newId);
const outcome = (over: Partial<TurnOutcome> = {}): TurnOutcome => ({
  requestMessageId: "m1",
  requestText: "Write a post about hiring slowly",
  assistantText: "Here is your draft.",
  status: "finished",
  toolResults: [],
  handoffs: [],
  artifact: null,
  flow: null,
  picker: null,
  now: new Date("2026-10-21T09:00:00Z"),
  ...over,
});
const h = (over: Partial<ActiveTask["handoffs"][number]> = {}): ActiveTask["handoffs"][number] => ({
  id: "call_h",
  specialist: "writing",
  readiness: "ready",
  confidence: "high",
  parentAction: "create-document",
  requestDigest: "abc",
  hasMissingInput: false,
  missingFacts: [],
  ...over,
});

describe("nextActiveTask", () => {
  it("completes a task when a document was created", () => {
    const t = next(null, outcome({ toolResults: [{ toolName: "createDocument", ok: true }], assistantText: "Done. Want a different hook?" }));
    expect(t.status).toBe("completed");
    expect(t.version).toBe(1);
    expect(t.attempt).toBe(1);
    expect(t.completedActions).toEqual(["createDocument"]);
    expect(t.updatedAt).toBe("2026-10-21T09:00:00.000Z");
  });

  it("stays active when a handoff is missing input, then continues the same task", () => {
    const t1 = next(null, outcome({ handoffs: [h({ hasMissingInput: true })] }));
    const t2 = next(t1, outcome({}));
    expect(t1.status).toBe("active");
    expect(t2.taskId).toBe(t1.taskId);
    expect(t2.attempt).toBe(2);
    expect(t2.status).toBe("completed");
  });

  it("stays active when the reply ends in a question and records it", () => {
    const t = next(null, outcome({ assistantText: "Got it. Which client story should I use?" }));
    expect(t.status).toBe("active");
    expect(t.pendingQuestion).toBe("Which client story should I use?");
  });

  it("stays active when a handoff needs user input", () => {
    expect(next(null, outcome({ handoffs: [h({ readiness: "needs-user-input" })] })).status).toBe("active");
  });

  it("starts a new task after a completed one but keeps the artifact", () => {
    const t1 = next(null, outcome({ artifact: { id: "d1", title: "Hiring" }, toolResults: [{ toolName: "createDocument", ok: true }] }));
    const t2 = next(t1, outcome({ requestText: "Now something else" }));
    expect(t2.taskId).not.toBe(t1.taskId);
    expect(t2.attempt).toBe(1);
    expect(t2.artifact).toEqual({ id: "d1", title: "Hiring" });
    expect(t2.handoffs).toEqual([]);
  });

  it("fails on abort", () => {
    expect(next(null, outcome({ status: "aborted" })).status).toBe("failed");
    expect(next(null, outcome({ status: "error" })).status).toBe("failed");
  });

  it("stays active with a pending picker and stores the flow it was given", () => {
    const t = next(
      null,
      outcome({
        picker: { id: "call_p", question: "Which angle?" },
        flow: { id: "ideas-for-me", step: "start" },
        assistantText: "Pick one.",
      }),
    );
    expect(t.status).toBe("active");
    expect(t.pendingPicker).toEqual({ id: "call_p", question: "Which angle?" });
    expect(t.pendingQuestion).toBe("Which angle?");
    expect(t.flow).toEqual({ id: "ideas-for-me", step: "start" });
  });

  it("caps recentDirections at 5 and completedActions at 10", () => {
    let t: ActiveTask | null = null;
    for (let i = 0; i < 8; i++) {
      t = next(
        t,
        outcome({
          requestMessageId: `m${i}`,
          requestText: `direction ${i}`,
          toolResults: [
            { toolName: "searchKB", ok: true },
            { toolName: "readKB", ok: true },
            { toolName: "saveMemory", ok: false },
          ],
        }),
      );
    }
    expect(t!.recentDirections).toHaveLength(5);
    expect(t!.recentDirections.at(-1)).toEqual({ text: "direction 7", messageId: "m7" });
    expect(t!.completedActions).toHaveLength(10);
    expect(t!.completedActions).not.toContain("saveMemory");
    expect(t!.latestRequest).toBe("direction 7");
    expect(t!.requestMessageId).toBe("m7");
  });
});

describe("renderActiveTask", () => {
  it("renders none and a full ledger", () => {
    expect(renderActiveTask(null)).toBe("No active task.");
    const t = next(null, outcome({ artifact: { id: "d1", title: "Hiring" }, assistantText: "Which story?" }));
    const s = renderActiveTask(t);
    expect(s).toContain("status: active");
    expect(s).toContain("attempt: 1");
    expect(s).toContain("artifact: d1 | Hiring");
    expect(s).toContain("latest request: Write a post about hiring slowly");
    expect(s).toContain("pending question: Which story?");
  });

  it("keeps the writer's missing facts while it waits, and clears them afterwards", () => {
    const waiting = nextActiveTask(null, outcome({ handoffs: [h({ readiness: "needs-user-input", hasMissingInput: true, missingFacts: ["Who?", "When?"] })] }), () => "t1");
    expect(waiting.missingFacts).toEqual(["Who?", "When?"]);
    expect(renderActiveTask(waiting)).toContain("missing facts: Who? | When?");
    const done = nextActiveTask(waiting, outcome({ toolResults: [{ toolName: "createDocument", ok: true }] }), () => "t2");
    expect(done.missingFacts).toEqual([]);
  });
});
