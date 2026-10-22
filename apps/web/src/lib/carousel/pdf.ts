import { PDFDocument } from "pdf-lib";

/**
 * Assembles the carousel PDF (LinkedIn's document-post format): one page per slide, each page the slide's JPEG at the
 * slide's pixel size. Rendering is injected (the browser paints a canvas); between slides it yields a frame and
 * reports progress, so a long carousel never freezes the page.
 */
export async function buildCarouselPdf(opts: {
  count: number;
  size: { width: number; height: number };
  render: (index: number) => Promise<Uint8Array>;
  onProgress?: (done: number, total: number) => void;
  nextFrame: () => Promise<void>;
  title: string;
  author: string;
}): Promise<Uint8Array> {
  // updateMetadata off: otherwise pdf-lib rewrites Producer/Creator with its own name on save.
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const now = new Date();
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);
  pdf.setTitle(opts.title);
  // The person made it; Producer names the software that wrote the file, which is the PDF convention.
  pdf.setAuthor(opts.author);
  pdf.setCreator(opts.author);
  pdf.setProducer("Orbit");
  const { width, height } = opts.size;
  for (let i = 0; i < opts.count; i++) {
    await opts.nextFrame();
    const jpg = await pdf.embedJpg(await opts.render(i));
    pdf.addPage([width, height]).drawImage(jpg, { x: 0, y: 0, width, height });
    opts.onProgress?.(i + 1, opts.count);
  }
  return pdf.save();
}
