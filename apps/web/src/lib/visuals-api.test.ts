import { describe, expect, it, vi } from "vitest";
import {
  attachVisual, createVisual, deleteVisual, editVisual, getCredits, listVisuals, pollVisual, uploadReference, VisualsApiError, type Fetch,
} from "./visuals-api";

const visual = (over: Record<string, unknown> = {}) => ({
  id: "v1", status: "PENDING", imageUrl: null, currentVersion: 0, editCount: 0, maxEdits: 5, remainingEdits: 5, error: null,
  aspect: "PORTRAIT_4_5", type: "INFOGRAPHIC", altText: null, documentId: null, activeOp: "generate", createdAt: "2026-10-22T10:00:00.000Z", ...over,
});
const reply = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });
const fakeFetch = (...responses: Response[]) => {
  const f = vi.fn(async () => responses.shift() ?? reply({}, 500));
  return f as unknown as Fetch & typeof f;
};

describe("visuals-api", () => {
  it("createVisual posts the request with a request id and parses the 202", async () => {
    const f = fakeFetch(reply({ visual: visual(), balance: 29 }, 202));
    const out = await createVisual({ prompt: "p", visualType: "INFOGRAPHIC", documentId: "d1" }, f);
    expect(out.balance).toBe(29);
    const [path, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/visuals");
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ source: "post", documentId: "d1", prompt: "p", visualType: "INFOGRAPHIC" });
    expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/);
    const lib = fakeFetch(reply({ visual: visual(), balance: 29 }, 202));
    await createVisual({ prompt: "p", visualType: "GENERAL", requestId: "fixed-request-id" }, lib);
    expect(JSON.parse((lib.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ source: "library", requestId: "fixed-request-id" });
  });

  it("errors carry the status, the code and the extra fields", async () => {
    const f = fakeFetch(reply({ error: "You're out of image credits for now.", code: "out_of_credits", balance: 0, refillsAt: "2026-11-01T00:00:00.000Z" }, 402));
    const err = await createVisual({ prompt: "p", visualType: "GENERAL" }, f).catch((e) => e);
    expect(err).toBeInstanceOf(VisualsApiError);
    expect(err).toMatchObject({ status: 402, code: "out_of_credits", message: "You're out of image credits for now.", details: { balance: 0 } });
  });

  it("a response that drifts from the contract fails loudly", async () => {
    await expect(getCredits(fakeFetch(reply({ balance: "many" })))).rejects.toThrow();
  });

  it("pollVisual polls until COMPLETED, reports each update and does not sleep after the last", async () => {
    const f = fakeFetch(reply(visual({ status: "PROCESSING" })), reply(visual({ status: "PROCESSING" })), reply(visual({ status: "COMPLETED", imageUrl: "/img.png" })));
    const seen: string[] = [];
    const sleep = vi.fn(async () => {});
    const out = await pollVisual("v1", { f, onUpdate: (v) => seen.push(v.status), sleep, intervalMs: 3000 });
    expect(out).toMatchObject({ timedOut: false, visual: { status: "COMPLETED", imageUrl: "/img.png" } });
    expect(seen).toEqual(["PROCESSING", "PROCESSING", "COMPLETED"]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("pollVisual stops on FAILED and gives up after the cap, keeping the last state", async () => {
    expect((await pollVisual("v1", { f: fakeFetch(reply(visual({ status: "FAILED", error: "nope" }))) })).visual.error).toBe("nope");
    const f = fakeFetch(...Array.from({ length: 5 }, () => reply(visual({ status: "PROCESSING" }))));
    const out = await pollVisual("v1", { f, giveUpMs: 0, sleep: async () => {} });
    expect(out.timedOut).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("edit, attach, delete and library use the documented routes", async () => {
    const f = fakeFetch(
      reply(visual({ status: "PROCESSING", activeOp: "edit" }), 202),
      reply({ media: { id: "m1", documentId: "d1", visualId: "v1", position: 0, altText: null, frozen: false } }),
      reply(null, 204),
      reply({ items: [{ ...visual(), documentTitle: "Post" }], nextCursor: null }),
    );
    expect((await editVisual("v1", "bigger", f)).activeOp).toBe("edit");
    expect((await attachVisual("v1", "d1", f)).media.position).toBe(0);
    await deleteVisual("v1", f);
    expect((await listVisuals({ documentId: "d1", limit: 5 }, f)).items[0]!.documentTitle).toBe("Post");
    expect(f.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(["/api/visuals/v1/edit", "/api/visuals/v1/attach", "/api/visuals/v1", "/api/visuals?documentId=d1&limit=5"]);
  });

  it("uploadReference sends multipart with the title and comma-joined tags", async () => {
    const f = fakeFetch(reply({ item: { id: "r1", title: "T", tags: ["a", "b"], width: 1, height: 1, createdAt: "x", url: "/api/files/x" } }, 201));
    const item = await uploadReference(new File([new Uint8Array([1])], "a.png", { type: "image/png" }), "T", ["a", "b"], f);
    expect(item.id).toBe("r1");
    const body = (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(body.get("title")).toBe("T");
    expect(body.get("tags")).toBe("a,b");
    expect(body.get("file")).toBeInstanceOf(File);
  });
});
