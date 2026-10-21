import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyUpload } from "./verify-upload";

const fx = (n: string) => readFileSync(new URL(`../test/fixtures/${n}`, import.meta.url));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const GIF = Buffer.from("GIF89a....");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

describe("verifyUpload", () => {
  it("accepts documents whose bytes match", () => {
    expect(verifyUpload(fx("sample.pdf"), "application/pdf")).toBe("application/pdf");
    expect(verifyUpload(fx("sample.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBeTruthy();
    expect(verifyUpload(fx("sample.xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBeTruthy();
    expect(verifyUpload(Buffer.from("hello"), "text/plain")).toBe("text/plain");
    expect(verifyUpload(fx("sample.md"), "text/markdown")).toBe("text/markdown");
  });

  it("returns the sniffed image type, not the declared one", () => {
    expect(verifyUpload(PNG, "image/jpeg")).toBe("image/png");
    expect(verifyUpload(JPG, "image/png")).toBe("image/jpeg");
    expect(verifyUpload(GIF, "image/png")).toBe("image/gif");
    expect(verifyUpload(WEBP, "image/png")).toBe("image/webp");
  });

  it("rejects mismatches", () => {
    expect(verifyUpload(Buffer.from("MZ not a pdf"), "application/pdf")).toBeNull();
    expect(verifyUpload(Buffer.from("plain"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBeNull();
    expect(verifyUpload(Buffer.from("not an image"), "image/png")).toBeNull();
    expect(verifyUpload(PNG, "application/pdf")).toBeNull();
    expect(verifyUpload(fx("sample.pdf"), "image/png")).toBeNull();
    expect(verifyUpload(Buffer.from([0x68, 0x00, 0x69]), "text/plain")).toBeNull(); // NUL byte: binary
  });
});
