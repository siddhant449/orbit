import { describe, expect, it } from "vitest";
import { gatedToolNames } from "./gate";

const ALL = [
  "viewMemory", "readMemory", "searchMemory", "saveMemory", "searchKB", "readKB", "presentOptions",
  "delegateWriting", "createDocument", "delegateEditing", "updateDocument", "proposeDocumentEdits", "getPostVersions",
  "generateHooks", "generateIdeas", "analyzePost", "searchTemplates", "readTemplate", "researchTopic",
];
const doc = { id: "d", title: "T", version: 1, text: "Post" };
const gate = (over: { doc?: boolean; picked?: boolean; text?: string }) =>
  gatedToolNames({ documentRef: { current: over.doc ? doc : null }, pickedAngle: over.picked ? { question: "q", label: "l", brief: "b" } : null, userText: over.text ?? "hello" }, ALL);
const dropped = (names: string[]) => ALL.filter((n) => !names.includes(n)).sort();

describe("tool gating table", () => {
  it("open post: no new drafts or templates, edit tools stay", () => {
    expect(dropped(gate({ doc: true }))).toEqual(["createDocument", "delegateWriting", "readTemplate", "searchTemplates"]);
  });
  it("no post: edit tools go, drafting tools stay", () => {
    const names = gate({});
    expect(dropped(names)).toEqual(["delegateEditing", "getPostVersions", "proposeDocumentEdits", "updateDocument"]);
    expect(names).toContain("delegateWriting");
    expect(names).toContain("createDocument");
    expect(names).toContain("searchTemplates");
  });
  it("picked angle without a post: write now, but pickers and research stay", () => {
    const names = gate({ picked: true });
    expect(dropped(names)).toEqual(["analyzePost", "delegateEditing", "generateHooks", "generateIdeas", "getPostVersions", "proposeDocumentEdits", "readTemplate", "searchTemplates", "updateDocument"]);
    for (const keep of ["delegateWriting", "createDocument", "searchKB", "readMemory", "researchTopic", "presentOptions"]) expect(names).toContain(keep);
  });
  it("picked angle with a post open: the edit path is whole", () => {
    const names = gate({ doc: true, picked: true });
    for (const keep of ["updateDocument", "presentOptions", "generateHooks"]) expect(names).toContain(keep);
  });
  it("an ideas request drops templates only", () => {
    expect(dropped(gate({ text: "give me post ideas for this week" }))).toEqual(["delegateEditing", "getPostVersions", "proposeDocumentEdits", "readTemplate", "searchTemplates", "updateDocument"]);
  });
  it("never removes the always-needed memory and KB tools", () => {
    for (const s of [gate({}), gate({ doc: true }), gate({ picked: true })]) for (const n of ["viewMemory", "readMemory", "searchMemory", "saveMemory", "searchKB", "readKB"]) expect(s).toContain(n);
  });
});
