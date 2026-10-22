import { describe, expect, it } from "vitest";
import { carouselReducer, initialCarousel, MAX_SLIDES, parseDraft, serializeDraft, type CarouselState } from "./state";

let n = 0;
const ids = () => `s${++n}`;

function withSlides(titles: string[]): CarouselState {
  let s = initialCarousel();
  for (const title of titles) s = carouselReducer(s, { type: "add", id: ids(), slide: { title, body: "" } });
  return s;
}

describe("carouselReducer", () => {
  it("starts empty with the ink template at 4:5", () => {
    const s = initialCarousel();
    expect(s.slides).toEqual([]);
    expect(s.activeId).toBeNull();
    expect(s.template).toBe("ink");
    expect(s.aspect).toBe("4:5");
  });

  it("adds after the active slide and selects it", () => {
    const s = withSlides(["a", "b"]);
    const first = s.slides[0]!.id;
    const t = carouselReducer(carouselReducer(s, { type: "select", id: first }), { type: "add", id: "new" });
    expect(t.slides.map((x) => x.title)).toEqual(["a", "", "b"]);
    expect(t.activeId).toBe("new");
  });

  it("refuses to add past the slide limit", () => {
    const s = withSlides(Array.from({ length: MAX_SLIDES }, (_, i) => `t${i}`));
    expect(carouselReducer(s, { type: "add", id: "x" })).toBe(s);
  });

  it("duplicates a slide right after it", () => {
    const s = withSlides(["a", "b"]);
    const a = s.slides[0]!;
    const t = carouselReducer(s, { type: "duplicate", id: a.id, newId: "copy" });
    expect(t.slides.map((x) => x.id)).toEqual([a.id, "copy", s.slides[1]!.id]);
    expect(t.slides[1]!.title).toBe("a");
    expect(t.activeId).toBe("copy");
  });

  it("deletes and selects the neighbour", () => {
    const s = withSlides(["a", "b", "c"]);
    const [a, b, c] = s.slides;
    const t = carouselReducer(carouselReducer(s, { type: "select", id: b!.id }), { type: "delete", id: b!.id });
    expect(t.slides.map((x) => x.id)).toEqual([a!.id, c!.id]);
    expect(t.activeId).toBe(c!.id);
    const u = carouselReducer(carouselReducer(t, { type: "select", id: c!.id }), { type: "delete", id: c!.id });
    expect(u.activeId).toBe(a!.id);
    expect(carouselReducer(u, { type: "delete", id: a!.id }).activeId).toBeNull();
  });

  it("moves a slide by an offset, clamped at the ends", () => {
    const s = withSlides(["a", "b", "c"]);
    const a = s.slides[0]!.id;
    expect(carouselReducer(s, { type: "move", id: a, by: 1 }).slides.map((x) => x.title)).toEqual(["b", "a", "c"]);
    expect(carouselReducer(s, { type: "move", id: a, by: -1 })).toBe(s);
    expect(carouselReducer(s, { type: "move", id: a, by: 5 }).slides.map((x) => x.title)).toEqual(["b", "c", "a"]);
  });

  it("moves a slide to an index", () => {
    const s = withSlides(["a", "b", "c"]);
    const c = s.slides[2]!.id;
    expect(carouselReducer(s, { type: "moveTo", id: c, index: 0 }).slides.map((x) => x.title)).toEqual(["c", "a", "b"]);
  });

  it("edits a slide's title and body", () => {
    const s = withSlides(["a"]);
    const id = s.slides[0]!.id;
    const t = carouselReducer(s, { type: "edit", id, patch: { body: "more" } });
    expect(t.slides[0]).toMatchObject({ title: "a", body: "more" });
  });

  it("replaces every slide with generated ones and selects the first", () => {
    const s = withSlides(["old"]);
    const t = carouselReducer(s, { type: "replace", slides: [{ id: "g1", title: "x", body: "" }, { id: "g2", title: "y", body: "z" }] });
    expect(t.slides.map((x) => x.id)).toEqual(["g1", "g2"]);
    expect(t.activeId).toBe("g1");
  });

  it("loads a whole state (a restored draft, an undo)", () => {
    const saved = withSlides(["kept"]);
    expect(carouselReducer(initialCarousel(), { type: "load", state: saved })).toBe(saved);
  });

  it("sets design options", () => {
    let s = initialCarousel();
    s = carouselReducer(s, { type: "set", patch: { template: "mixed", aspect: "1:1", kit: "personal", logo: false } });
    expect(s).toMatchObject({ template: "mixed", aspect: "1:1", kit: "personal", logo: false });
  });
});

describe("drafts", () => {
  it("round-trips through serialize and parse", () => {
    const s = withSlides(["a", "b"]);
    expect(parseDraft(serializeDraft(s))).toEqual(s);
  });

  it("rejects garbage and unknown versions", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 99, state: {} }))).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 1, state: { slides: "nope" } }))).toBeNull();
  });

  it("repairs a dangling active id", () => {
    const s = withSlides(["a"]);
    const raw = JSON.stringify({ v: 1, state: { ...s, activeId: "gone" } });
    expect(parseDraft(raw)!.activeId).toBe(s.slides[0]!.id);
  });
});
