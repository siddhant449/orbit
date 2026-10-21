import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AiUnavailableError, type AiClient } from "@brandloop/ai";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { assertPublicUrl, extractText, makePinnedLookup, withTimeout } from "./extract";
import { IngestError } from "./errors";
import { DOCUMENT_TYPES } from "./limits";

const fx = (name: string) => readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url));
const noAi: AiClient = {
  async json() {
    throw new AiUnavailableError();
  },
  async text() {
    throw new AiUnavailableError();
  },
};
const mime = (ext: string) => Object.entries(DOCUMENT_TYPES).find(([, e]) => e === ext)![0];

describe("extractText documents", () => {
  const cases: [string, string, string][] = [
    ["sample.pdf", ".pdf", "Pricing is a positioning decision"],
    ["sample.docx", ".docx", "Short paragraphs win on mobile"],
    ["sample.xlsx", ".xlsx", "Lead with the result"],
    ["sample.md", ".md", "Consistency beats intensity"],
  ];
  for (const [file, ext, sentence] of cases) {
    it(`${file} extracts its known sentence`, async () => {
      const text = await extractText({ kind: "document", buf: fx(file), mime: mime(ext) }, { ai: noAi });
      expect(text).toContain(sentence);
    });
  }

  it("plain text passes through", async () => {
    const text = await extractText({ kind: "document", buf: Buffer.from("just words"), mime: "text/plain" }, { ai: noAi });
    expect(text).toBe("just words");
  });

  it("rejects an unsupported document type", async () => {
    await expect(
      extractText({ kind: "document", buf: Buffer.from("x"), mime: "application/zip" }, { ai: noAi }),
    ).rejects.toThrow(/isn't supported/);
  });

  it("fails readably on a corrupt PDF", async () => {
    await expect(
      extractText({ kind: "document", buf: Buffer.from("not a pdf"), mime: "application/pdf" }, { ai: noAi }),
    ).rejects.toThrow(IngestError);
  });
});

function htmlFetch(body: string, init: ResponseInit = {}): typeof fetch {
  return (async () =>
    new Response(body, { status: 200, headers: { "content-type": "text/html" }, ...init })) as typeof fetch;
}

describe("extractText url", () => {
  it("extracts readable article text and drops chrome", async () => {
    const text = await extractText(
      { kind: "url", url: "https://example.com/post" },
      { ai: noAi, fetch: htmlFetch(fx("article.html").toString()) },
    );
    expect(text).toContain("The article fixture sentence lives here.");
    expect(text).not.toContain("copyright");
  });

  it("a 404 becomes \"Couldn't read that page\"", async () => {
    await expect(
      extractText({ kind: "url", url: "https://example.com/x" }, { ai: noAi, fetch: htmlFetch("nope", { status: 404 }) }),
    ).rejects.toThrow("Couldn't read that page");
  });

  it("a page with under 200 readable characters fails the same way", async () => {
    await expect(
      extractText(
        { kind: "url", url: "https://example.com/x" },
        { ai: noAi, fetch: htmlFetch("<html><body><p>Sign in to read.</p></body></html>") },
      ),
    ).rejects.toThrow("Couldn't read that page");
  });

  it("a PDF link fails the same way", async () => {
    await expect(
      extractText(
        { kind: "url", url: "https://example.com/a.pdf" },
        { ai: noAi, fetch: htmlFetch("%PDF-1.4", { headers: { "content-type": "application/pdf" } }) },
      ),
    ).rejects.toThrow("Couldn't read that page");
  });

  it("a network error fails the same way", async () => {
    const boom = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(extractText({ kind: "url", url: "https://example.com/x" }, { ai: noAi, fetch: boom })).rejects.toThrow(
      "Couldn't read that page",
    );
  });

  it("passes an abort signal so a slow page times out", async () => {
    let signal: AbortSignal | undefined;
    const spy = (async (_u: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Response(fx("article.html").toString(), { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    await extractText({ kind: "url", url: "https://example.com/x" }, { ai: noAi, fetch: spy });
    expect(signal).toBeDefined();
  });

  it("re-checks redirect targets against the private-network rule", async () => {
    let calls = 0;
    const redirecting = (async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
    }) as typeof fetch;
    await expect(
      extractText({ kind: "url", url: "https://example.com/x" }, { ai: noAi, fetch: redirecting }),
    ).rejects.toThrow(/private|isn't allowed/i);
    expect(calls).toBe(1);
  });
});

describe("assertPublicUrl", () => {
  it.each([
    "http://127.0.0.1/x",
    "http://localhost/x",
    "http://10.0.0.5/",
    "http://172.16.3.4/",
    "http://172.31.255.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:8.8.8.8]/",
    "http://[::127.0.0.1]/",
    "http://[64:ff9b::7f00:1]/",
    "http://[2002:7f00:1::]/",
    "http://[ff02::1]/",
    "http://[::]/",
    "http://100.64.0.1/",
    "http://192.0.0.5/",
    "http://198.18.0.1/",
    "http://198.19.255.255/",
    "http://224.0.0.1/",
    "http://240.0.0.1/",
    "http://255.255.255.255/",
    "http://printer.local/",
    "ftp://example.com/x",
    "file:///etc/passwd",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => assertPublicUrl(url)).toThrow(IngestError);
  });

  it.each(["https://example.com/a?b=1", "http://172.32.0.1/", "http://8.8.8.8/", "http://198.20.0.1/", "http://[2606:4700::1111]/"])("allows %s", (url) => {
    expect(() => assertPublicUrl(url)).not.toThrow();
  });
});

describe("extractText image", () => {
  it("sends the image to the extract model and returns its text", async () => {
    let seen: { images?: unknown[]; model?: string } = {};
    const ai: AiClient = {
      async json() {
        throw new Error("unused");
      },
      async text(opts) {
        seen = opts;
        return "A whiteboard that says: ship weekly.";
      },
    };
    const text = await extractText({ kind: "image", buf: Buffer.from("png"), mime: "image/png" }, { ai });
    expect(text).toContain("ship weekly");
    expect(seen.model).toBe("extract");
    expect(seen.images).toHaveLength(1);
  });
});


describe("url fetch hardening", () => {
  const enc = new TextEncoder();
  it("stops reading at 5 MB regardless of content-length and cancels the stream", async () => {
    let cancelled = false;
    let pulled = 0;
    const first = enc.encode(fx("article.html").toString().replace("</article>", ""));
    const filler = enc.encode("x".repeat(64 * 1024));
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(pulled === 1 ? first : filler);
      },
      cancel() {
        cancelled = true;
      },
    });
    const f = (async () => new Response(body, { headers: { "content-type": "text/html" } })) as typeof fetch;
    const text = await extractText({ kind: "url", url: "https://example.com/x" }, { ai: noAi, fetch: f });
    expect(text).toContain("The article fixture sentence lives here.");
    expect(cancelled).toBe(true);
    expect(pulled * 64 * 1024).toBeLessThan(6 * 1024 * 1024);
  });

  it("cancels redirect response bodies", async () => {
    let cancelled = false;
    const f = (async (u: unknown) => {
      if (String(u).includes("start")) {
        const body = new ReadableStream({ cancel() { cancelled = true; }, pull(c) { c.enqueue(enc.encode("r")); } });
        return new Response(body, { status: 302, headers: { location: "https://example.com/end" } });
      }
      return new Response(fx("article.html").toString(), { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    await extractText({ kind: "url", url: "https://example.com/start" }, { ai: noAi, fetch: f });
    expect(cancelled).toBe(true);
  });

  it("gives up after the redirect cap", async () => {
    let calls = 0;
    const loop = (async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: `https://example.com/${calls}` } });
    }) as typeof fetch;
    await expect(extractText({ kind: "url", url: "https://example.com/0" }, { ai: noAi, fetch: loop })).rejects.toThrow(
      "Couldn't read that page",
    );
    expect(calls).toBe(6);
  });
});

describe("makePinnedLookup (DNS rebinding)", () => {
  const call = (lookup: ReturnType<typeof makePinnedLookup>, opts: object) =>
    new Promise<{ err: Error | null; addr: unknown; family?: number }>((resolve) =>
      lookup("example.com", opts, (err: Error | null, addr: unknown, family?: number) => resolve({ err, addr, family })),
    );

  it("returns a validated public address", async () => {
    const lookup = makePinnedLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    expect(await call(lookup, {})).toMatchObject({ err: null, addr: "93.184.216.34", family: 4 });
    const all = await call(lookup, { all: true });
    expect(all.addr).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("refuses when any resolved address is private", async () => {
    const lookup = makePinnedLookup(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ]);
    expect((await call(lookup, { all: true })).err).toBeInstanceOf(IngestError);
  });
});

describe("withTimeout", () => {
  it("rejects with the readable message when the work hangs", async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).rejects.toThrow("That file took too long to read");
  });
  it("passes results through", async () => {
    await expect(withTimeout(Promise.resolve(5), 1000)).resolves.toBe(5);
  });
});

async function xlsxWith(sheets: string[][][]): Promise<Buffer> {
  const z = new JSZip();
  z.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  z.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  z.file("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((_, i) => `<sheet name="S${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  z.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`);
  sheets.forEach((rows, i) =>
    z.file(`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => `<c r="${String.fromCharCode(65 + ci)}${ri + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`),
  );
  return z.generateAsync({ type: "nodebuffer" });
}
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("spreadsheet limits", () => {
  it("reads only the first 10 sheets", async () => {
    const buf = await xlsxWith(Array.from({ length: 12 }, (_, i) => [[`marker-sheet-${i + 1}`]]));
    const text = await extractText({ kind: "document", buf, mime: XLSX_MIME }, { ai: noAi });
    expect(text).toContain("marker-sheet-10");
    expect(text).not.toContain("marker-sheet-11");
  });

  it("caps rows per sheet", async () => {
    const buf = await xlsxWith([Array.from({ length: 6000 }, (_, i) => [`row-${i}`])]);
    const text = await extractText({ kind: "document", buf, mime: XLSX_MIME }, { ai: noAi });
    expect(text).toContain("row-4999");
    expect(text).not.toContain("row-5000");
  });

  it("stops at the character cap", async () => {
    const buf = await xlsxWith([Array.from({ length: 4000 }, (_, i) => [`r${i} ` + "x".repeat(200)])]);
    const text = await extractText({ kind: "document", buf, mime: XLSX_MIME }, { ai: noAi, maxChars: 10_000 });
    expect(text.length).toBeLessThanOrEqual(10_000);
    expect(text.length).toBeGreaterThan(5_000);
  });
});

describe("zip and pdf limits", () => {
  it("rejects a docx declaring over 100 MB uncompressed", async () => {
    const z = new JSZip();
    z.file("word/document.xml", "<w/>");
    const buf = await z.generateAsync({ type: "nodebuffer" });
    const cd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    buf.writeUInt32LE(200 * 1024 * 1024, cd + 24);
    await expect(extractText({ kind: "document", buf, mime: DOCX_MIME }, { ai: noAi })).rejects.toThrow(
      /too large to read safely/,
    );
  });

  it("rejects a docx with more than 2000 entries", async () => {
    const z = new JSZip();
    for (let i = 0; i < 2001; i++) z.file(`f${i}.txt`, "a");
    const buf = await z.generateAsync({ type: "nodebuffer" });
    await expect(extractText({ kind: "document", buf, mime: DOCX_MIME }, { ai: noAi })).rejects.toThrow(
      /too large to read safely/,
    );
  });

  it("rejects an xlsx zip bomb the same way", async () => {
    const z = new JSZip();
    for (let i = 0; i < 2001; i++) z.file(`f${i}.txt`, "a");
    const buf = await z.generateAsync({ type: "nodebuffer" });
    await expect(extractText({ kind: "document", buf, mime: XLSX_MIME }, { ai: noAi })).rejects.toThrow(
      /too large to read safely/,
    );
  });

  it("rejects a PDF with more than 500 pages", async () => {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 501; i++) pdf.addPage();
    const buf = Buffer.from(await pdf.save());
    await expect(extractText({ kind: "document", buf, mime: "application/pdf" }, { ai: noAi })).rejects.toThrow(
      /too many pages/,
    );
  });
});
