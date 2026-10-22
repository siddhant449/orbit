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
  it("is ready while the passage occurs once in the open post", () => {
    expect(proposalStatus(p, doc("Old hook.\n\nBody."))).toBe("ready");
  });
  it("is applied when the passage is gone and the replacement is there", () => {
    expect(proposalStatus(p, doc("New hook.\n\nBody."))).toBe("applied");
  });
  it("is stale when the passage is gone or now appears twice", () => {
    expect(proposalStatus(p, doc("Something else."))).toBe("stale");
    expect(proposalStatus(p, doc("Old hook. Old hook."))).toBe("stale");
  });
  it("is ready when the panel holds another post or none (the server decides)", () => {
    expect(proposalStatus(p, null)).toBe("ready");
    expect(proposalStatus(p, doc("Something else.", "d2"))).toBe("ready");
    expect(proposalStatus(p, { ...doc("Something else."), version: 0 })).toBe("ready");
  });
});
