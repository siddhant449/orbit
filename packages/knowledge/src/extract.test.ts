import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AiUnavailableError, type AiClient } from "@brandloop/ai";
import { assertPublicUrl, extractText } from "./extract";
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
    "http://printer.local/",
    "ftp://example.com/x",
    "file:///etc/passwd",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => assertPublicUrl(url)).toThrow(IngestError);
  });

  it.each(["https://example.com/a?b=1", "http://172.32.0.1/", "http://8.8.8.8/"])("allows %s", (url) => {
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
