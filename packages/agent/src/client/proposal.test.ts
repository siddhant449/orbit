import { describe, expect, it } from "vitest";
import { parseProposal, proposalStatus } from "./proposal";

const output = {
  proposalId: "call_p",
  documentId: "d1",
  documentVersion: 2,
  targetText: "Old hook.",
  replacement: "New hook.",
  instruction: "Punchier",
};
const doc = (text: string, id = "d1") => ({ id, title: "T", version: 3, text });

describe("parseProposal", () => {
  it("reads a completed proposal output and rejects anything else", () => {
    expect(parseProposal(output)).toEqual(output);
    expect(parseProposal("STALE_SELECTED_PASSAGE: …")).toBeNull();
    expect(parseProposal({ ...output, targetText: 3 })).toBeNull();
    expect(parseProposal(null)).toBeNull();
  });
});

describe("proposalStatus", () => {
  const p = parseProposal(output)!;
  const none: string[] = [];
  it("is applied from the stored marker, never from the text", () => {
    // An expanding edit keeps the passage inside its replacement: the text alone would offer Apply again.
    const expanding = parseProposal({ ...output, replacement: "Old hook. And more." })!;
    expect(proposalStatus(expanding, doc("Old hook. And more.\n\nBody."), ["call_p"])).toBe("applied");
    // A deletion leaves no trace in the text.
    const deletion = parseProposal({ ...output, replacement: "" })!;
    expect(proposalStatus(deletion, doc("Body."), ["call_p"])).toBe("applied");
    expect(proposalStatus(p, doc("New hook.\n\nBody."), none)).toBe("stale");
  });
  it("is ready while the passage occurs once and the proposal isn't applied", () => {
    expect(proposalStatus(p, doc("Old hook.\n\nBody."), none)).toBe("ready");
  });
  it("is stale when the passage is gone or now appears twice (overlaps count)", () => {
    expect(proposalStatus(p, doc("Something else."), none)).toBe("stale");
    expect(proposalStatus(p, doc("Old hook. Old hook."), none)).toBe("stale");
    const overlap = parseProposal({ ...output, targetText: "ha ha" })!;
    expect(proposalStatus(overlap, doc("ha ha ha"), none)).toBe("stale");
  });
  it("is checking while the applied ids haven't loaded, unless the passage is plainly there", () => {
    expect(proposalStatus(p, doc("Old hook.\n\nBody."), null)).toBe("ready");
    expect(proposalStatus(p, doc("New hook.\n\nBody."), null)).toBe("checking");
  });
  it("is ready when the panel holds another post or none (the server decides)", () => {
    expect(proposalStatus(p, null, null)).toBe("ready");
    expect(proposalStatus(p, doc("Something else.", "d2"), none)).toBe("ready");
    expect(proposalStatus(p, { ...doc("Something else."), version: 0 }, none)).toBe("ready");
  });
});
