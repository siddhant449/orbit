import { describe, expect, it } from "vitest";
import { canvasSize, layoutSlide, parseAccent, surfaceFor, wrapRuns, type FontSpec, type Measure, type TextOp } from "./layout";

const mono: Measure = (text, font) => text.length * font.size * 0.5;
const font: FontSpec = { face: "display", size: 10, weight: 460, tracking: 0 };
const identity = { brand: "Northwind", byline: "Ada Park · Founder" };

describe("parseAccent", () => {
  it("splits *starred* words into accent runs", () => {
    expect(parseAccent("Free users cost us more than *they taught us.*")).toEqual([
      { text: "Free users cost us more than ", accent: false },
      { text: "they taught us.", accent: true },
    ]);
  });

  it("keeps an unclosed star as text", () => {
    expect(parseAccent("5 * 3 = 15")).toEqual([{ text: "5 * 3 = 15", accent: false }]);
  });

  it("drops empty stars", () => {
    expect(parseAccent("a ** b")).toEqual([{ text: "a  b", accent: false }]);
  });
});

describe("wrapRuns", () => {
  it("wraps greedily on spaces and keeps accent runs across lines", () => {
    // 5 px per char; 60 px fits 12 chars.
    const lines = wrapRuns([{ text: "one two ", accent: false }, { text: "three four five", accent: true }], 60, mono, font);
    expect(lines.map((l) => l.map((r) => r.text).join(""))).toEqual(["one two", "three four", "five"]);
    expect(lines[1]).toEqual([{ text: "three four", accent: true }]);
    expect(lines[0]).toEqual([{ text: "one two", accent: false }]);
  });

  it("puts an overlong word on its own line instead of looping", () => {
    expect(wrapRuns([{ text: "supercalifragilistic ok", accent: false }], 40, mono, font).map((l) => l[0]!.text)).toEqual([
      "supercalifragilistic",
      "ok",
    ]);
  });

  it("honours explicit newlines", () => {
    expect(wrapRuns([{ text: "a\nb", accent: false }], 400, mono, font).length).toBe(2);
  });
});

describe("surfaceFor", () => {
  it("follows the template, and mixes ink, paper and accent like the artboard", () => {
    expect(surfaceFor("ink", 2, 6)).toBe("ink");
    expect(surfaceFor("band", 0, 3)).toBe("band");
    expect(Array.from({ length: 6 }, (_, i) => surfaceFor("mixed", i, 6))).toEqual(["ink", "paper", "paper", "accent", "paper", "ink"]);
  });
});

describe("canvasSize", () => {
  it("is 1080 wide at LinkedIn's 4:5 and 1:1", () => {
    expect(canvasSize("4:5")).toEqual({ width: 1080, height: 1350 });
    expect(canvasSize("1:1")).toEqual({ width: 1080, height: 1080 });
  });
});

describe("layoutSlide", () => {
  const base = { identity, template: "ink" as const, aspect: "4:5" as const, kit: "orbit" as const, logo: true };
  const texts = (ops: ReturnType<typeof layoutSlide>) => ops.filter((o): o is TextOp => o.kind === "text");
  const line = (t: TextOp) => t.runs.map((r) => r.text).join("");

  it("draws the counter, brand, byline and swipe cue", () => {
    const ops = layoutSlide({ ...base, slide: { title: "Hello", body: "" }, index: 0, count: 3 }, mono);
    const all = texts(ops).map(line);
    expect(all).toEqual(expect.arrayContaining(["1 / 3", "Northwind", "Ada Park · Founder", "Swipe", "Hello"]));
    expect(ops.some((o) => o.kind === "mark")).toBe(true);
  });

  it("drops the swipe cue on the last slide and the logo when it's off", () => {
    const ops = layoutSlide({ ...base, logo: false, slide: { title: "End", body: "" }, index: 2, count: 3 }, mono);
    expect(texts(ops).map(line)).not.toContain("Swipe");
    expect(ops.some((o) => o.kind === "mark")).toBe(false);
  });

  it("colours accent runs and keeps everything inside the safe area", () => {
    const ops = layoutSlide({ ...base, slide: { title: "Cost us *more*", body: "Body copy here" }, index: 1, count: 3 }, mono);
    const accent = texts(ops).flatMap((t) => t.runs).find((r) => r.text === "more");
    expect(accent?.color).toBe("#7C8AFF");
    for (const t of texts(ops)) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThanOrEqual(1350);
    }
  });

  it("shrinks a long title until it fits its line budget", () => {
    const long = "word ".repeat(60).trim();
    const ops = layoutSlide({ ...base, slide: { title: long, body: "" }, index: 0, count: 1 }, mono);
    const title = texts(ops).filter((t) => t.font.face === "display");
    expect(title[0]!.font.size).toBeLessThan(104);
  });

  it("goes monochrome on the personal kit", () => {
    const ops = layoutSlide({ ...base, kit: "personal", slide: { title: "Cost us *more*", body: "" }, index: 1, count: 3 }, mono);
    expect(ops.some((o) => o.kind === "glow")).toBe(false);
    const accent = texts(ops).flatMap((t) => t.runs).find((r) => r.text === "more");
    expect(accent?.color).not.toBe("#7C8AFF");
  });

  it("splits the band template into an ink top and an accent band", () => {
    const ops = layoutSlide({ ...base, template: "band", slide: { title: "Top", body: "Bottom" }, index: 1, count: 3 }, mono);
    const rects = ops.filter((o) => o.kind === "rect");
    expect(rects).toHaveLength(2);
    const title = texts(ops).find((t) => line(t) === "Top")!;
    const body = texts(ops).find((t) => line(t) === "Bottom")!;
    expect(title.y).toBeLessThan(1350 * 0.6);
    expect(body.y).toBeGreaterThan(1350 * 0.6);
  });

  it("shows a placeholder when a slide has no words yet", () => {
    const ops = layoutSlide({ ...base, slide: { title: "", body: "" }, index: 0, count: 1 }, mono);
    expect(texts(ops).map(line)).toContain("Add a title");
  });
});
