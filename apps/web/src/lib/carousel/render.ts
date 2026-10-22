import { canvasSize, layoutSlide, type Fill, type FontSpec, type Measure, type Op, type SlideInput } from "./layout";

/**
 * Browser painter for the slide layout: the studio canvas, the thumbnails and the PDF export all go through
 * `paintSlide`, so they cannot drift apart. Faces are the page's own next/font families, read from the CSS variables.
 */

type Families = { display: string; body: string };

let cached: Families | null = null;
function families(): Families {
  if (cached) return cached;
  const css = getComputedStyle(document.documentElement);
  const display = css.getPropertyValue("--font-display-face").trim();
  const body = css.getPropertyValue("--font-ui").trim();
  cached = { display: display ? `${display}, system-ui, sans-serif` : "system-ui, sans-serif", body: body ? `${body}, system-ui, sans-serif` : "system-ui, sans-serif" };
  return cached;
}

/** Waits for the two faces at the weights slides use, so the first paint isn't in a fallback face. */
export async function fontsReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const f = families();
  await Promise.all([document.fonts.load(`460 100px ${f.display}`), document.fonts.load(`400 30px ${f.body}`)]).catch(() => undefined);
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string; fontStretch?: string };

function setFont(ctx: Ctx, font: FontSpec) {
  const f = families();
  ctx.font = `${font.weight} ${font.size}px ${font.face === "display" ? f.display : f.body}`;
  // Orbit sets Bricolage at wdth 88: the nearest keyword is semi-condensed (87.5).
  if ("fontStretch" in ctx) ctx.fontStretch = font.face === "display" ? "semi-condensed" : "normal";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${font.tracking * font.size}px`;
}

export function canvasMeasure(ctx: CanvasRenderingContext2D): Measure {
  return (text, font) => {
    setFont(ctx, font);
    return ctx.measureText(text).width;
  };
}

function fillStyle(ctx: CanvasRenderingContext2D, fill: Fill, w: number, h: number, x = 0, y = 0): string | CanvasGradient {
  if (typeof fill === "string") return fill;
  // CSS angle: 0deg points up, clockwise. Gradient line through the box centre, CSS-length.
  const a = (fill.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  for (const [o, c] of fill.stops) g.addColorStop(o, c);
  return g;
}

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.scale(size / 20, size / 20);
  ctx.rotate((-28 * Math.PI) / 180);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1.3;
  ctx.stroke(new Path2D("M-9 0A9 3.4 0 0 1 9 0"));
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.stroke(new Path2D("M-9 0A9 3.4 0 0 0 9 0"));
  ctx.beginPath();
  ctx.arc(0, 3.4, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawChevron(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D("M8 5l5 5-5 5"));
  ctx.restore();
}

export function paintOps(ctx: CanvasRenderingContext2D, ops: Op[]) {
  const measure = canvasMeasure(ctx);
  for (const op of ops) {
    switch (op.kind) {
      case "rect":
        ctx.fillStyle = fillStyle(ctx, op.fill, op.w, op.h, op.x, op.y);
        ctx.fillRect(op.x, op.y, op.w, op.h);
        break;
      case "glow": {
        ctx.save();
        ctx.translate(op.cx, op.cy);
        ctx.scale(1, op.ry / op.rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, op.rx);
        g.addColorStop(0, op.color);
        g.addColorStop(0.65, "rgba(79,95,245,0)");
        ctx.fillStyle = g;
        ctx.fillRect(-op.rx, -op.rx, op.rx * 2, op.rx * 2);
        ctx.restore();
        break;
      }
      case "mark":
        drawMark(ctx, op.x, op.y, op.size, op.color);
        break;
      case "chevron":
        drawChevron(ctx, op.x, op.y, op.size, op.color);
        break;
      case "text": {
        const full = op.runs.map((r) => r.text).join("");
        let x = op.align === "right" ? op.x - measure(full, op.font) : op.x;
        setFont(ctx as Ctx, op.font);
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        for (const r of op.runs) {
          ctx.fillStyle = r.color;
          ctx.fillText(r.text, x, op.y);
          x += measure(r.text, op.font);
        }
        break;
      }
    }
  }
}

/** Paints one slide into `canvas` at `pixelWidth` device pixels wide (height follows the aspect). */
export function paintSlide(canvas: HTMLCanvasElement, input: SlideInput, pixelWidth: number) {
  const { width, height } = canvasSize(input.aspect);
  const k = pixelWidth / width;
  canvas.width = Math.round(width * k);
  canvas.height = Math.round(height * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, width, height);
  paintOps(ctx, layoutSlide(input, canvasMeasure(ctx)));
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * The carousel as a PDF (LinkedIn's document post format): each slide painted by the same code as the preview, at
 * 1080 px, as a JPEG (quality 0.92: a fraction of the PNG size, no visible loss on flat colour and large type). Slide
 * text is flattened into the image. pdf-lib loads only when someone exports.
 */
export async function exportCarouselPdf(
  inputs: SlideInput[],
  meta: { title: string; author: string },
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  await fontsReady();
  const { buildCarouselPdf } = await import("./pdf");
  const canvas = document.createElement("canvas");
  const size = canvasSize(inputs[0]!.aspect);
  const bytes = await buildCarouselPdf({
    count: inputs.length,
    size,
    nextFrame,
    onProgress,
    title: meta.title,
    author: meta.author,
    render: async (i) => {
      paintSlide(canvas, inputs[i]!, size.width);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) throw new Error("This browser couldn't draw the slide.");
      return new Uint8Array(await blob.arrayBuffer());
    },
  });
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}
