import { prisma, upsertMemory } from "@brandloop/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PRESET_VOICES } from "../../../db/prisma/presets";
import type { TurnContext } from "../context";
import type { HandoffEnvelope, PostWriting } from "../specialists/envelope";
import { cleanup, fakeAi, testContext } from "../test/fixtures";
import { renderBlocks, type WriterBlock } from "../writing/render";
import { delegateWritingRun } from "./delegate";

let ctx: TurnContext;
beforeEach(async () => {
  await cleanup();
  ctx = await testContext();
});
afterAll(cleanup);

const BLOCKS: WriterBlock[] = [
  { kind: "hook", lines: ["Your first hire is a bet on you."] },
  { kind: "bullets", lines: ["Three things to settle first:", "The problem they own", "What you will decide", "How you will know"] },
  { kind: "close", lines: ["Write the role down before you write the ad."] },
];

const model = (over: Record<string, unknown> = {}, blocks: WriterBlock[] = BLOCKS) => ({
  summary: "A post.",
  findings: [],
  recommendation: "Create it.",
  missingInput: [],
  confidence: "medium",
  parentAction: "create-document",
  payload: { readiness: "ready", title: "First hire", postType: "framework", blocks, facts: [], missingFacts: [], clarifyingQuestion: null, ...over },
});

const run = async (input: Partial<Parameters<typeof delegateWritingRun>[1]> = {}) =>
  (await delegateWritingRun(ctx, { request: "Write a post about hiring a first engineer for founders.", ...input }, "call_w")) as HandoffEnvelope<PostWriting>;

describe("delegateWriting (writer v2)", () => {
  it("renders the draft and the hook from the blocks on the server", async () => {
    ctx.ai = fakeAi(model());
    const out = await run();
    expect(out.payload.draft).toBe(renderBlocks(BLOCKS, { bullet: "-", numbered: true }));
    expect(out.payload.draft).toContain("Three things to settle first:\n- The problem they own\n- What you will decide");
    expect(out.payload.hook).toBe("Your first hire is a bet on you.");
    expect(out.payload.postType).toBe("framework");
    expect(ctx.handoffs.get("call_w")).toBe(out);
  });

  it("ignores a model override the user did not ask for, and honours one they did", async () => {
    await upsertMemory(ctx.profileId, "writing/rules", "- No emojis", "USER");
    const ai = fakeAi(model());
    ctx.ai = ai;
    ctx.userText = "draft it";
    await run({ overrides: { allowEmoji: true, allowHashtags: null, allowDashes: null, allowPostscript: null, allowLinks: null } });
    expect(ai.calls[0]!.prompt).toContain("No emoji.");
    expect(ai.calls[0]!.prompt).not.toMatch(/this turn the user asked to allow/i);
    ctx.userText = "draft it and add a couple of emojis this time";
    await run({ overrides: { allowEmoji: true, allowHashtags: null, allowDashes: null, allowPostscript: null, allowLinks: null } });
    expect(ai.calls[1]!.prompt).toMatch(/this turn the user asked to allow: emoji/i);
    expect(ai.calls[1]!.prompt).not.toContain("No emoji.");
  });

  it("flags an unsupported number and a first-person claim in the findings", async () => {
    ctx.ai = fakeAi(model({}, [{ kind: "hook", lines: ["We cut churn by 37%."] }, { kind: "prose", lines: ["I hired my first engineer last spring."] }]));
    const out = await run({ personalDetails: "none" });
    const findings = out.findings.join("\n");
    expect(findings).toMatch(/Rule check \(hard\).*37%/);
    expect(findings).toMatch(/personal experience/i);
  });

  it("accepts numbers the request supplies", async () => {
    ctx.ai = fakeAi(model({}, [{ kind: "hook", lines: ["Churn fell by 37%."] }, { kind: "prose", lines: ["It took 90 days."] }]));
    const out = await run({ request: "Write a post about how churn fell by 37% in 90 days after the onboarding rewrite." });
    expect(out.findings.join("\n")).not.toMatch(/Not in the request/);
  });

  it("passes needs-user-input and the missing facts through", async () => {
    ctx.ai = fakeAi(model({ readiness: "needs-user-input", missingFacts: ["Who was the hire?", "When?"], clarifyingQuestion: "Who was the hire?" }, []));
    const out = await run();
    expect(out.payload.readiness).toBe("needs-user-input");
    expect(out.payload.missingFacts).toEqual(["Who was the hire?", "When?"]);
  });

  it("gives the writer the compiled style and records its profile version", async () => {
    const profile = structuredClone(PRESET_VOICES[0]!.profile);
    profile.signatureMoves.push({ label: "Postscript nudge", pattern: "P.S. [one-line offer]", useWhen: "closing" });
    const style = await prisma.voiceStyle.create({
      data: { profileId: ctx.profileId, kind: "OWN", name: "Mine", guide: "g", styleProfile: profile as never, profileVersion: 2 },
    });
    await upsertMemory(ctx.profileId, "writing/rules", "- Never add a P.S.", "USER");
    const ai = fakeAi(model());
    ctx.ai = ai;
    ctx.selections.writingStyleId = style.id;
    const out = await run();
    expect(out.sourceRevisions.style).toEqual({ voiceStyleId: style.id, profileVersion: 2 });
    const prompt = ai.calls[0]!.prompt;
    expect(prompt).toContain("<style>");
    expect(prompt).toContain(profile.voiceTarget.slice(0, 40));
    expect(prompt).not.toContain("Postscript nudge");
    expect(out.findings.join("\n")).toMatch(/Style rule left out: Postscript nudge/);
  });

  it("returns EXISTING_POST without a model call when the chat already has a post", async () => {
    const ai = fakeAi(model());
    ctx.ai = ai;
    ctx.documentRef.current = { id: "d", title: "T", version: 1, text: "x" };
    expect(await delegateWritingRun(ctx, { request: "Write a post about hiring a first engineer." }, "c")).toMatch(/EXISTING_POST|already/i);
    expect(ai.calls).toHaveLength(0);
  });
});
