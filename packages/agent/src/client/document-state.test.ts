import { describe, expect, it } from "vitest";
import {
  applyDataPart,
  charCount,
  emptyPanel,
  POST_CHAR_LIMIT,
  withDocument,
  type PanelState,
} from "./document-state";

const empty: PanelState = emptyPanel();
const doc = { id: "d1", title: "T", version: 1, text: "Hello!" };

describe("applyDataPart", () => {
  it("assembles a streamed draft and settles on the snapshot", () => {
    let s = applyDataPart(empty, { type: "data-creating", data: true });
    expect(s).toMatchObject({ open: true, creating: true, doc: null });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "Hel" } });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "lo" } });
    expect(s.doc!.text).toBe("Hello");
    expect(s.doc!.id).toBe("d1");
    expect(s.open).toBe(true);
    s = applyDataPart(s, { type: "data-document", data: { id: "d1", title: "T", version: 1, text: "Hello!" } });
    expect(s).toMatchObject({ creating: false, updating: false, doc: { text: "Hello!", version: 1, title: "T" } });
    s = applyDataPart(s, { type: "data-creating", data: false });
    expect(s).toMatchObject({ open: true, creating: false, doc: { text: "Hello!" } });
  });

  it("ignores deltas for another document", () => {
    const s0 = applyDataPart(withDocument(empty, doc), { type: "data-updating", data: true });
    expect(s0).toMatchObject({ open: true, updating: true });
    const s1 = applyDataPart(s0, { type: "data-textDelta", data: { id: "other", text: "zzz" } });
    expect(s1.doc).toEqual(doc);
  });

  it("ignores deltas when not creating and no document matches", () => {
    expect(applyDataPart(empty, { type: "data-textDelta", data: { id: "d1", text: "x" } })).toEqual(empty);
  });

  it("restarts the text on an update's first delta, then appends", () => {
    let s = applyDataPart(withDocument(empty, doc), { type: "data-updating", data: true });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "New " } });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "text" } });
    expect(s.doc).toMatchObject({ id: "d1", text: "New text", version: 1 });
    s = applyDataPart(s, { type: "data-document", data: { id: "d1", title: "T", version: 2, text: "New text" } });
    expect(s).toMatchObject({ updating: false, doc: { version: 2 } });
  });

  it("clears the flags when creating ends without a document", () => {
    let s = applyDataPart(empty, { type: "data-creating", data: true });
    s = applyDataPart(s, { type: "data-creating", data: false });
    expect(s).toMatchObject({ creating: false, doc: null });
  });

  it("ignores unknown parts and malformed data", () => {
    const s = withDocument(empty, doc);
    expect(applyDataPart(s, { type: "text", data: "hi" })).toBe(s);
    expect(applyDataPart(s, { type: "data-document", data: { id: 3 } })).toBe(s);
    expect(applyDataPart(s, { type: "data-textDelta", data: null })).toBe(s);
    expect(applyDataPart(s, { type: "data-creating", data: "yes" })).toBe(s);
  });
});

describe("withDocument", () => {
  it("opens on a document and closes with none", () => {
    expect(withDocument(empty, doc)).toEqual({ open: true, creating: false, updating: false, doc });
    expect(withDocument(empty, null)).toEqual(empty);
  });
});

describe("charCount", () => {
  it("flags posts over 3,000 chars", () => {
    expect(POST_CHAR_LIMIT).toBe(3000);
    expect(charCount("a".repeat(3001))).toEqual({ count: 3001, over: true });
    expect(charCount("a".repeat(3000))).toEqual({ count: 3000, over: false });
    expect(charCount("")).toEqual({ count: 0, over: false });
  });
});
