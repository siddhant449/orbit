import { describe, expect, it } from "vitest";
import { closingLine, editClosingLine, FIRST_DRAFT_LINE } from "./closing";

const created = { toolName: "createDocument", output: { id: "d", title: "T", kind: "text", success: true, postContent: "Body" } };
const edited = (over: object = {}) => ({ toolName: "updateDocument", output: { success: true, contentChanged: true, changeSummary: "Shortened the opening line", ...over } });

describe("closingLine", () => {
  it("ends a picked-angle turn with the fixed first-draft line", () => {
    expect(closingLine({ steps: [{ toolResults: [created] }], pickedAngle: true, userText: "x" })).toBe(FIRST_DRAFT_LINE);
  });
  it("leaves a draft without a picked angle to the model", () => {
    expect(closingLine({ steps: [{ toolResults: [created] }], pickedAngle: false, userText: "x" })).toBeNull();
  });
  it("leaves failed or question-back creates to the model", () => {
    expect(closingLine({ steps: [{ toolResults: [{ toolName: "createDocument", output: { status: "needs-user-input", missingInput: ["a"] } }] }], pickedAngle: true, userText: "x" })).toBeNull();
    expect(closingLine({ steps: [{ toolResults: [{ toolName: "createDocument", output: "Failed: nope" }] }], pickedAngle: true, userText: "x" })).toBeNull();
  });
  it("lets the model disclose a skipped research step", () => {
    const skipped = { toolName: "researchTopic", output: "Skipped: no live sources" };
    expect(closingLine({ steps: [{ toolResults: [skipped] }, { toolResults: [created] }], pickedAngle: true, userText: "x" })).toBeNull();
  });
  it("builds the edit line from the change summary", () => {
    expect(closingLine({ steps: [{ toolResults: [edited()] }], pickedAngle: false, userText: "make it punchier" })).toBe("Done: shortened the opening line.");
    expect(editClosingLine("")).toBe("Done. I've updated the post.");
  });
  it("leaves unchanged edits, failures and questions to the model", () => {
    expect(closingLine({ steps: [{ toolResults: [edited({ contentChanged: false })] }], pickedAngle: false, userText: "x" })).toBeNull();
    expect(closingLine({ steps: [{ toolResults: [{ toolName: "updateDocument", output: "EDIT_REQUIREMENTS_MISSED: x" }] }], pickedAngle: false, userText: "x" })).toBeNull();
    expect(closingLine({ steps: [{ toolResults: [edited()] }], pickedAngle: false, userText: "shorter? and is it good" })).toBeNull();
  });
  it("does nothing mid-turn", () => {
    expect(closingLine({ steps: [{ toolResults: [{ toolName: "delegateWriting", output: {} }] }], pickedAngle: true, userText: "x" })).toBeNull();
    expect(closingLine({ steps: [], pickedAngle: true, userText: "x" })).toBeNull();
  });
});
