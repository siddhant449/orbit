import { describe, expect, it } from "vitest";
import {
  applyDataPart,
  charCount,
  closePanel,
  emptyPanel,
  endStream,
  panelCue,
  POST_CHAR_LIMIT,
  settleNeedsRefetch,
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
    expect(withDocument(empty, doc)).toMatchObject({ open: true, creating: false, updating: false, doc });
    expect(withDocument(empty, null)).toMatchObject({ open: false, creating: false, updating: false, doc: null });
  });

  it("clears stream flags: an adopted stored post ends any stream that died", () => {
    let s = applyDataPart(empty, { type: "data-creating", data: true });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "Hel" } });
    s = withDocument(s, doc);
    expect(s).toMatchObject({ creating: false, updating: false, restart: false, doc });
  });

  it("doesn't reopen a panel the user closed", () => {
    const closed = closePanel(withDocument(empty, doc));
    expect(withDocument(closed, { ...doc, version: 2 }).open).toBe(false);
  });
});

describe("endStream", () => {
  it("clears creating, updating and restart and keeps the text", () => {
    let s = applyDataPart(withDocument(empty, doc), { type: "data-updating", data: true });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "Par" } });
    s = endStream(s);
    expect(s).toMatchObject({ creating: false, updating: false, restart: false, doc: { text: "Par" } });
  });
});

describe("stream guards", () => {
  it("ignores deltas after the snapshot for the same document", () => {
    let s = applyDataPart(empty, { type: "data-creating", data: true });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "Hello!" } });
    s = applyDataPart(s, { type: "data-document", data: doc });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "Hello!" } });
    expect(s.doc!.text).toBe("Hello!");
  });

  it("a replayed stream (resume) types from the start instead of doubling the text", () => {
    let s = applyDataPart(empty, { type: "data-creating", data: true });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "Hel" } });
    s = applyDataPart(s, { type: "data-creating", data: true });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "Hel" } });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "lo" } });
    expect(s.doc!.text).toBe("Hello");
  });

  it("never rolls back to an older snapshot of the same document", () => {
    const s = withDocument(empty, { ...doc, version: 3, text: "v3" });
    const next = applyDataPart(s, { type: "data-document", data: { ...doc, version: 2, text: "v2" } });
    expect(next.doc).toMatchObject({ version: 3, text: "v3" });
  });

  it("a snapshot doesn't reopen a panel the user closed; a new stream does", () => {
    let s = applyDataPart(empty, { type: "data-creating", data: true });
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "Hel" } });
    s = closePanel(s);
    s = applyDataPart(s, { type: "data-textDelta", data: { id: "d1", text: "lo" } });
    s = applyDataPart(s, { type: "data-document", data: doc });
    expect(s.open).toBe(false);
    s = applyDataPart(s, { type: "data-updating", data: true });
    expect(s.open).toBe(true);
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

describe("panelCue", () => {
  it("says the post is ready when one first settles, even if the whole burst landed at once", () => {
    // The flags were never seen as on: one render went from no post straight to version 1.
    expect(panelCue(empty, withDocument(empty, doc))).toBe("Your post is ready.");
    const partial = { ...empty, open: true, doc: { ...doc, version: 0, text: "Hel" } };
    expect(panelCue(partial, withDocument(partial, doc))).toBe("Your post is ready.");
  });

  it("announces a stream starting, and a newer version of the same post", () => {
    expect(panelCue(empty, applyDataPart(empty, { type: "data-creating", data: true }))).toBe("Creating your post…");
    const s = withDocument(empty, doc);
    expect(panelCue(s, applyDataPart(s, { type: "data-updating", data: true }))).toBe("Updating your post…");
    expect(panelCue(s, withDocument(s, { ...doc, version: 2 }))).toBe("Updated. Version 2.");
  });

  it("stays quiet otherwise", () => {
    const s = withDocument(empty, doc);
    expect(panelCue(s, s)).toBeNull();
    expect(panelCue(s, closePanel(s))).toBeNull();
    const c = applyDataPart(empty, { type: "data-creating", data: true });
    expect(panelCue(c, applyDataPart(c, { type: "data-textDelta", data: { id: "d1", text: "x" } }))).toBeNull();
  });
});

describe("settleNeedsRefetch", () => {
  it("refetches a post whose create or update stream was cut off, at any version", () => {
    expect(settleNeedsRefetch({ ...empty, doc: { ...doc, version: 0 } })).toBe(true);
    expect(settleNeedsRefetch({ ...empty, updating: true, doc: { ...doc, version: 4, text: "Trunc" } })).toBe(true);
    expect(settleNeedsRefetch({ ...empty, creating: true, doc })).toBe(true);
    expect(settleNeedsRefetch({ ...empty, restart: true, doc })).toBe(true);
  });

  it("leaves a settled post alone", () => {
    expect(settleNeedsRefetch({ ...empty, doc })).toBe(false);
    expect(settleNeedsRefetch(empty)).toBe(false);
    expect(settleNeedsRefetch({ ...empty, updating: true })).toBe(false);
  });
});
