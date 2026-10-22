import type { Aspect, Kit, Slide, TemplateId } from "./state";

/**
 * Slide layout as a list of draw operations, in LinkedIn's pixel space (1080 wide). The preview canvas and the PDF
 * export both paint these same operations, so what the studio shows is what the PDF contains (plan O7 review focus).
 * Text measuring is injected: the browser passes a canvas `measureText`, tests pass a fixed-width fake.
 */

export type FontSpec = { face: "display" | "body"; size: number; weight: number; /** em */ tracking: number };
export type Measure = (text: string, font: FontSpec) => number;
export type Run = { text: string; accent: boolean };
export type Fill = string | { angle: number; stops: [number, string][] };

export type TextOp = { kind: "text"; x: number; y: number; align: "left" | "right"; font: FontSpec; runs: { text: string; color: string }[] };
export type Op =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: Fill }
  | { kind: "glow"; cx: number; cy: number; rx: number; ry: number; color: string }
  | { kind: "mark"; x: number; y: number; size: number; color: string }
  | { kind: "chevron"; x: number; y: number; size: number; color: string }
  | TextOp;

export type Surface = "ink" | "paper" | "accent" | "gradient" | "band";
export type Identity = { brand: string; byline: string };
export type SlideInput = {
  slide: Pick<Slide, "title" | "body">;
  index: number;
  count: number;
  template: TemplateId;
  aspect: Aspect;
  kit: Kit;
  logo: boolean;
  identity: Identity;
};

export const WIDTH = 1080;
/** Orbit's 420 px artboard sheet scaled to 1080. */
const K = WIDTH / 420;
const PAD = Math.round(36 * K);
const SMALL: FontSpec = { face: "body", size: Math.round(12 * K), weight: 400, tracking: 0 };

export function canvasSize(aspect: Aspect): { width: number; height: number } {
  return { width: WIDTH, height: aspect === "4:5" ? 1350 : 1080 };
}

/** The surface each slide sits on. "Mixed" bookends in ink, rests on paper and lifts every fourth slide in accent. */
export function surfaceFor(template: TemplateId, index: number, count: number): Surface {
  if (template !== "mixed") return template;
  if (index === 0 || index === count - 1) return "ink";
  return index % 4 === 3 ? "accent" : "paper";
}

type Palette = { bg: Fill; text: string; muted: string; faint: string; accent: string; glow: string | null; band?: string };

const ORBIT: Record<Surface, Palette> = {
  ink: { bg: "#0A0A0B", text: "#F5F4F0", muted: "#9A9A9E", faint: "#828288", accent: "#7C8AFF", glow: "rgba(79,95,245,0.5)" },
  paper: { bg: "#F5F4F0", text: "#0A0A0B", muted: "#5B5B5E", faint: "#6C6C70", accent: "#2E3FE6", glow: "rgba(79,95,245,0.42)" },
  accent: { bg: "#4F5FF5", text: "#FFFFFF", muted: "#E4E7FF", faint: "#E4E7FF", accent: "#0A0A0B", glow: null },
  gradient: {
    bg: { angle: 160, stops: [[0, "#4F5FF5"], [1, "#1A1F6E"]] },
    text: "#FFFFFF",
    muted: "#DADDFF",
    faint: "#DADDFF",
    accent: "#C9CEFF",
    glow: null,
  },
  band: { bg: "#0A0A0B", band: "#4F5FF5", text: "#F5F4F0", muted: "#9A9A9E", faint: "#828288", accent: "#7C8AFF", glow: null },
};

const PERSONAL: Record<Surface, Palette> = {
  ink: { ...ORBIT.ink, accent: "#9A9A9E", glow: null },
  paper: { ...ORBIT.paper, accent: "#6C6C70", glow: null },
  accent: { bg: "#2A2A2D", text: "#F5F4F0", muted: "#C9C8C4", faint: "#C9C8C4", accent: "#A3A3A8", glow: null },
  gradient: { ...ORBIT.gradient, bg: { angle: 160, stops: [[0, "#3A3A3E"], [1, "#0A0A0B"]] }, accent: "#A3A3A8", muted: "#C9C8C4", faint: "#C9C8C4" },
  band: { ...ORBIT.band, band: "#2A2A2D", accent: "#A3A3A8" },
};

export function paletteFor(surface: Surface, kit: Kit): Palette {
  return (kit === "personal" ? PERSONAL : ORBIT)[surface];
}

/** `*words*` become accent runs; an unclosed star stays as text, empty stars vanish. */
export function parseAccent(text: string): Run[] {
  const runs: Run[] = [];
  const push = (t: string, accent: boolean) => {
    if (!t) return;
    const last = runs.at(-1);
    if (last && last.accent === accent) last.text += t;
    else runs.push({ text: t, accent });
  };
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("*", i);
    const close = open < 0 ? -1 : text.indexOf("*", open + 1);
    if (open < 0 || close < 0) {
      push(text.slice(i), false);
      break;
    }
    push(text.slice(i, open), false);
    push(text.slice(open + 1, close), true);
    i = close + 1;
  }
  return runs;
}

/** Greedy word wrap that keeps run boundaries. Explicit newlines break lines; trailing spaces are trimmed. */
export function wrapRuns(runs: Run[], maxWidth: number, measure: Measure, font: FontSpec): Run[][] {
  type Word = { text: string; accent: boolean; space: boolean; newline: boolean };
  const words: Word[] = [];
  for (const r of runs) {
    for (const part of r.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        for (let n = 0; n < (part.match(/\n/g)?.length ?? 0); n++) words.push({ text: "", accent: r.accent, space: false, newline: true });
        if (!part.includes("\n")) words.push({ text: " ", accent: r.accent, space: true, newline: false });
      } else words.push({ text: part, accent: r.accent, space: false, newline: false });
    }
  }

  const lines: Word[][] = [[]];
  const width = (line: Word[]) => measure(line.map((w) => w.text).join(""), font);
  for (const w of words) {
    const line = lines.at(-1)!;
    if (w.newline) {
      lines.push([]);
      continue;
    }
    if (w.space) {
      if (line.length) line.push(w);
      continue;
    }
    if (line.length && width([...line, w]) > maxWidth) lines.push([w]);
    else line.push(w);
  }

  return lines
    .map((line) => {
      while (line.at(-1)?.space) line.pop();
      const out: Run[] = [];
      for (const w of line) {
        const last = out.at(-1);
        if (last && last.accent === w.accent) last.text += w.text;
        else out.push({ text: w.text, accent: w.accent });
      }
      return out;
    })
    .filter((line, i, all) => line.length > 0 || (i > 0 && i < all.length - 1));
}

function colorRuns(line: Run[], p: Palette, base = p.text) {
  return line.map((r) => ({ text: r.text, color: r.accent ? p.accent : base }));
}

/** Fits the title: shrinks in 8 px steps until it takes at most `maxLines`, never below 56 px. */
function fitTitle(runs: Run[], start: number, maxLines: number, maxWidth: number, measure: Measure) {
  let size = start;
  for (;;) {
    const font: FontSpec = { face: "display", size, weight: 460, tracking: -0.03 };
    const lines = wrapRuns(runs, maxWidth, measure, font);
    if (lines.length <= maxLines || size <= 56) return { font, lines };
    size -= 8;
  }
}

export function layoutSlide(input: SlideInput, measure: Measure): Op[] {
  const { width: W, height: H } = canvasSize(input.aspect);
  const surface = surfaceFor(input.template, input.index, input.count);
  const p = paletteFor(surface, input.kit);
  const ops: Op[] = [];
  const inner = W - PAD * 2;
  const square = input.aspect === "1:1";

  // Ground.
  const split = Math.round(H * 0.6);
  if (surface === "band") {
    ops.push({ kind: "rect", x: 0, y: 0, w: W, h: split, fill: p.bg });
    ops.push({ kind: "rect", x: 0, y: split, w: W, h: H - split, fill: p.band! });
  } else ops.push({ kind: "rect", x: 0, y: 0, w: W, h: H, fill: p.bg });
  if (p.glow) ops.push({ kind: "glow", cx: W * 0.9, cy: H, rx: 360 * K, ry: 260 * K, color: p.glow });

  // Top row: mark + brand, counter.
  const topY = PAD + SMALL.size * 0.8;
  let brandX = PAD;
  if (input.logo) {
    const size = Math.round(16 * K);
    ops.push({ kind: "mark", x: PAD, y: topY - size * 0.68, size, color: p.accent });
    brandX += size + Math.round(8 * K);
  }
  if (input.identity.brand) ops.push({ kind: "text", x: brandX, y: topY, align: "left", font: SMALL, runs: [{ text: input.identity.brand, color: p.muted }] });
  ops.push({ kind: "text", x: W - PAD, y: topY, align: "right", font: SMALL, runs: [{ text: `${input.index + 1} / ${input.count}`, color: p.faint }] });

  // Bottom row: byline, swipe cue (band's lower half is accent, so it reads in the band's colours).
  const bottomY = H - PAD;
  const footColor = surface === "band" ? "#FFFFFF" : p.muted;
  if (input.identity.byline) ops.push({ kind: "text", x: PAD, y: bottomY, align: "left", font: SMALL, runs: [{ text: input.identity.byline, color: footColor }] });
  if (input.index < input.count - 1) {
    const chev = Math.round(12 * K);
    ops.push({ kind: "chevron", x: W - PAD - chev, y: bottomY - chev * 0.85, size: chev, color: footColor });
    ops.push({ kind: "text", x: W - PAD - chev - Math.round(6 * K), y: bottomY, align: "right", font: SMALL, runs: [{ text: "Swipe", color: footColor }] });
  }

  // Words.
  const cover = input.index === 0;
  const empty = !input.slide.title.trim() && !input.slide.body.trim();
  const titleRuns = empty ? [{ text: "Add a title", accent: false }] : parseAccent(input.slide.title.trim());
  const titleColor = empty ? p.faint : p.text;
  const start = Math.round((cover ? 40 : 34) * K) - (square ? 8 : 0);
  const { font: titleFont, lines: titleLines } = fitTitle(titleRuns, start, cover ? 6 : square ? 4 : 5, inner, measure);
  const titleLead = titleFont.size * 0.95;

  const bodyFont: FontSpec = { face: "body", size: Math.round((square ? 13 : 14) * K), weight: 400, tracking: 0 };
  const bodyLead = bodyFont.size * 1.4;
  const bodyLines = input.slide.body.trim() ? wrapRuns(parseAccent(input.slide.body.trim()), inner, measure, bodyFont).slice(0, 8) : [];
  const gap = bodyLines.length ? Math.round(14 * K) : 0;

  const titleBlock = titleLines.length * titleLead;
  const bodyBlock = bodyLines.length * bodyLead;
  // Baseline of the first title line sits ~0.78 of a line below the block top.
  const emitTitle = (top: number) =>
    titleLines.forEach((line, i) =>
      ops.push({ kind: "text", x: PAD, y: top + titleFont.size * 0.78 + i * titleLead, align: "left", font: titleFont, runs: colorRuns(line, p, titleColor) }),
    );
  const emitBody = (top: number, color: string, accentColor: string) =>
    bodyLines.forEach((line, i) =>
      ops.push({
        kind: "text",
        x: PAD,
        y: top + bodyFont.size * 0.9 + i * bodyLead,
        align: "left",
        font: bodyFont,
        runs: line.map((r) => ({ text: r.text, color: r.accent ? accentColor : color })),
      }),
    );

  if (surface === "band") {
    emitTitle(split - Math.round(18 * K) - titleBlock);
    emitBody(split + Math.round(20 * K), "#FFFFFF", "#0A0A0B");
  } else {
    const areaTop = topY + Math.round(24 * K);
    const areaBottom = bottomY - SMALL.size - Math.round(24 * K);
    const block = titleBlock + gap + bodyBlock;
    const top = Math.max(areaTop, areaTop + (areaBottom - areaTop - block) / 2);
    emitTitle(top);
    emitBody(top + titleBlock + gap, p.muted, p.accent);
  }
  return ops;
}

/** CSS background for a slide thumbnail or template swatch. */
export function surfaceSwatch(surface: Surface, kit: Kit): string {
  const p = paletteFor(surface, kit);
  if (surface === "band") return `linear-gradient(${p.bg as string} 60%, ${p.band} 60%)`;
  if (typeof p.bg === "string") return p.bg;
  return `linear-gradient(${p.bg.angle}deg, ${p.bg.stops.map(([o, c]) => `${c} ${o * 100}%`).join(", ")})`;
}
