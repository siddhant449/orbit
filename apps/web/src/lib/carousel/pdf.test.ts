import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildCarouselPdf } from "./pdf";

// A 4×5 px JPEG (Pillow, quality 92).
const JPEG = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAAFAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8xKKKKAP/2Q==", "base64"));

describe("buildCarouselPdf", () => {
  it("makes one page per slide at the slide's size, yielding and reporting progress between slides", async () => {
    const progress: [number, number][] = [];
    let frames = 0;
    const bytes = await buildCarouselPdf({
      count: 3,
      size: { width: 1080, height: 1350 },
      render: async () => JPEG,
      onProgress: (done, total) => progress.push([done, total]),
      nextFrame: async () => {
        frames++;
      },
      title: "Ship it, in three slides",
      author: "Ada Park",
    });
    // Loading with updateMetadata on would stamp pdf-lib over the fields under test.
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getPage(2).getSize()).toEqual({ width: 1080, height: 1350 });
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(frames).toBe(3);
    expect(pdf.getTitle()).toBe("Ship it, in three slides");
    expect(pdf.getAuthor()).toBe("Ada Park");
    expect(pdf.getCreator()).toBe("Ada Park");
    expect(pdf.getProducer()).toBe("Orbit");
  });
});
