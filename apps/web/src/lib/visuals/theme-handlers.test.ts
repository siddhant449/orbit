import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string; teamId: string } | null } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import { getCredits, getObject, getTheme, prisma } from "@brandloop/db";
import { mockImageProvider, type GenerateOptions, type ImageProvider } from "@brandloop/visuals";
import sharp from "sharp";
import { getFileHandler } from "@/lib/files-api";
import { idleJobs } from "@/lib/jobs";
import { getStores } from "@/lib/storage";
import { createVisualHandler } from "./handlers";
import { deleteReferenceHandler, listReferencesHandler, postReferenceHandler, tagsHandler } from "./reference-handlers";
import { decisionHandler, deleteLogoHandler, deleteThemeHandler, extractHandler, getThemeHandler, postLogoHandler, putThemeHandler } from "./theme-handlers";
import { installVisualsEnv, makeAccount, wipe, type TestAccount } from "./test-helpers";

const PREFIX = "vtest_vtheme";
let a: TestAccount;
let b: TestAccount;
let cleanup: () => Promise<void>;
const as = (x: TestAccount) => void (env.account = { user: { id: x.userId }, currentProfile: { id: x.profileId, teamId: x.teamId } });

const png = (w = 40, h = 30, bg = "#3366ff") => sharp({ create: { width: w, height: h, channels: 3, background: bg } }).png().toBuffer();
function upload(path: string, bytes: Buffer, name: string, type: string, fields: Record<string, string | string[]> = {}, extra = 512) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) form.append(k, x);
  return new Request(`http://t${path}`, { method: "POST", body: form, headers: { "content-length": String(bytes.length + extra) } });
}
const json = (payload: unknown, method = "POST") => new Request("http://t/x", { method, body: JSON.stringify(payload) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await wipe(PREFIX);
  a = await makeAccount(PREFIX, 1);
  b = await makeAccount(PREFIX, 2);
});
afterAll(async () => {
  await wipe(PREFIX);
});
beforeEach(async () => {
  as(a);
  await prisma.brandTheme.deleteMany({ where: { profileId: { in: [a.profileId, b.profileId] } } });
  await prisma.referenceImage.deleteMany({ where: { profileId: { in: [a.profileId, b.profileId] } } });
  await prisma.visual.deleteMany({ where: { teamId: a.teamId } });
  await prisma.creditAccount.upsert({ where: { teamId: a.teamId }, create: { teamId: a.teamId, balance: 30 }, update: { balance: 30, periodStartedAt: new Date() } });
  cleanup = await installVisualsEnv();
});
afterEach(async () => {
  await idleJobs();
  await cleanup();
});

const generate = (over: Record<string, unknown> = {}) =>
  createVisualHandler(json({ source: "library", prompt: "A simple list", visualType: "INFOGRAPHIC", useBrandColours: true, requestId: crypto.randomUUID(), ...over }));

describe("brand theme", () => {
  it("GET returns the default Orbit palette with decision NONE; PUT validates and confirms; DELETE resets", async () => {
    const def = await (await getThemeHandler()).json();
    expect(def).toMatchObject({ decision: "NONE", source: "default", logoUrl: null, theme: { accent: "#4F5FF5" } });
    const colours = { ...def.theme, accent: "#112233" };
    const put = await putThemeHandler(json({ theme: colours }, "PUT"));
    expect(put.status).toBe(200);
    expect(await put.json()).toMatchObject({ decision: "CONFIRMED", theme: { accent: "#112233" } });
    expect((await putThemeHandler(json({ theme: { ...colours, accent: "blue" } }, "PUT"))).status).toBe(400);
    expect((await putThemeHandler(json({ theme: { accent: "#112233" } }, "PUT"))).status).toBe(400);
    expect(await (await deleteThemeHandler()).json()).toMatchObject({ decision: "NONE", theme: { accent: "#4F5FF5" } });
  });

  it("decision: accept saves the proposal as CONFIRMED and skip sets SKIPPED; after either, POST /api/visuals no longer returns 409", async () => {
    expect((await generate()).status).toBe(409);
    const proposal = (await (await getThemeHandler()).json()).theme;
    expect(await (await decisionHandler(json({ accept: true, proposal: { ...proposal, accent: "#0F6FFF" } }))).json()).toMatchObject({ decision: "CONFIRMED", theme: { accent: "#0F6FFF" } });
    expect((await generate()).status).toBe(202);
    await idleJobs();
    await deleteThemeHandler();
    expect((await generate()).status).toBe(409);
    expect(await (await decisionHandler(json({ accept: false }))).json()).toMatchObject({ decision: "SKIPPED" });
    expect((await generate()).status).toBe(202);
    expect((await decisionHandler(json({ accept: "yes" }))).status).toBe(400);
  });

  it("extract returns a proposed theme from an image, saves nothing and costs nothing", async () => {
    const img = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#F4EFE6" } })
      .composite([{ input: { create: { width: 80, height: 80, channels: 3, background: "#2B50E6" } }, left: 20, top: 20 }]).png().toBuffer();
    const res = await extractHandler(upload("/api/brand-theme/extract", img, "brand.png", "image/png"));
    expect(res.status).toBe(200);
    const { theme } = await res.json();
    expect(Object.keys(theme).sort()).toEqual(["accent", "background", "bar", "bodyText", "caption", "headline", "highlightBar", "line"]);
    expect(theme.background).toMatch(/^#[0-9A-F]{6}$/);
    expect((await getTheme(a.profileId)).decision).toBe("NONE");
    expect((await getCredits(a.teamId)).balance).toBe(30);
    expect((await extractHandler(upload("/api/brand-theme/extract", Buffer.from("not an image"), "x.png", "image/png"))).status).toBe(415);
  });
});

describe("logo upload", () => {
  it("stores a trimmed PNG in the PUBLIC store as LOGO, capped at 1,024 px, and shows its URL", async () => {
    const wide = await sharp({ create: { width: 2000, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: { create: { width: 1400, height: 400, channels: 4 as const, background: "#ff0000" } }, left: 300, top: 200 }]).png().toBuffer();
    const res = await postLogoHandler(upload("/api/brand-theme/logo", wide, "logo.png", "image/png"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.logoUrl).toMatch(/^\/api\/files\/public\/p\/.+\/logo\//);
    const theme = await getTheme(a.profileId);
    const obj = await getObject(a.profileId, theme.logoObjectId!);
    expect(obj).toMatchObject({ kind: "LOGO", store: "PUBLIC", contentType: "image/png", width: 1024, height: 293 });
  });

  it("replacing the logo soft-deletes the old file; DELETE clears it", async () => {
    await postLogoHandler(upload("/api/brand-theme/logo", await png(100, 100, "#ff0000"), "a.png", "image/png"));
    const first = (await getTheme(a.profileId)).logoObjectId!;
    await postLogoHandler(upload("/api/brand-theme/logo", await png(100, 100, "#00ff00"), "b.png", "image/png"));
    const second = (await getTheme(a.profileId)).logoObjectId!;
    expect(second).not.toBe(first);
    expect((await prisma.storageObject.findUnique({ where: { id: first } }))?.deletedAt).toBeInstanceOf(Date);
    expect((await (await deleteLogoHandler()).json()).logoUrl).toBeNull();
    expect((await getTheme(a.profileId)).logoObjectId).toBeNull();
  });

  it("an SVG logo gives 415, as do GIFs and look-alike files; oversize gives 413; no length gives 411", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    expect((await postLogoHandler(upload("/api/brand-theme/logo", svg, "logo.svg", "image/svg+xml"))).status).toBe(415);
    expect((await postLogoHandler(upload("/api/brand-theme/logo", svg, "logo.png", "image/png"))).status).toBe(415); // svg bytes under a png name
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#f00" } }).gif().toBuffer();
    expect((await postLogoHandler(upload("/api/brand-theme/logo", gif, "logo.gif", "image/gif"))).status).toBe(415);
    expect((await postLogoHandler(upload("/api/brand-theme/logo", Buffer.from([0x50, 0x4b, 3, 4, 0, 0]), "logo.png", "image/png"))).status).toBe(415);
    const big = Buffer.concat([await png(), Buffer.alloc(2.5 * 1024 * 1024)]);
    expect((await postLogoHandler(upload("/api/brand-theme/logo", big, "logo.png", "image/png"))).status).toBe(413);
    const noLength = upload("/api/brand-theme/logo", await png(), "logo.png", "image/png");
    noLength.headers.delete("content-length");
    expect((await postLogoHandler(noLength)).status).toBe(411);
    expect((await getTheme(a.profileId)).logoObjectId).toBeNull();
  });

  it("a flat single-colour logo (which can't be trimmed) still works", async () => {
    expect((await postLogoHandler(upload("/api/brand-theme/logo", await png(60, 60, "#123456"), "flat.png", "image/png"))).status).toBe(201);
  });
});

describe("reference images", () => {
  it("a reference upload writes to the PRIVATE store only, with validated title and tags, and is served via /api/files", async () => {
    const res = await postReferenceHandler(upload("/api/reference-images", await png(300, 200), "ref.png", "image/png", { title: " Clean chart ", tags: "Charts, dark" }));
    expect(res.status).toBe(201);
    const { item } = await res.json();
    expect(item).toMatchObject({ title: "Clean chart", tags: ["charts", "dark"], width: 300, height: 200 });
    expect(item.url).toMatch(/^\/api\/files\/[a-z0-9]+$/);
    const row = await prisma.storageObject.findFirstOrThrow({ where: { profileId: a.profileId, kind: "REFERENCE" }, orderBy: { createdAt: "desc" } });
    expect(row).toMatchObject({ store: "PRIVATE", url: null });
    expect(await getStores().public.get(row.key)).toBeNull();
    expect(await getStores().private.get(row.key)).not.toBeNull();
    const served = await getFileHandler(new Request("http://t"), ctx(row.id));
    expect(served.headers.get("cache-control")).toBe("private, no-store");
    as(b);
    expect((await getFileHandler(new Request("http://t"), ctx(row.id))).status).toBe(404);
  });

  it("rejects a missing title, no tags, too many tags, a long tag and bad files, without writing a file", async () => {
    const before = await prisma.storageObject.count({ where: { profileId: a.profileId, kind: "REFERENCE" } });
    const img = await png();
    for (const fields of [{ title: "", tags: "a" }, { title: "ok", tags: "" }, { title: "ok", tags: "1,2,3,4,5,6,7,8,9" }, { title: "ok", tags: "x".repeat(25) }, { title: "x".repeat(81), tags: "a" }]) {
      expect((await postReferenceHandler(upload("/api/reference-images", img, "r.png", "image/png", fields))).status, JSON.stringify(fields).slice(0, 40)).toBe(400);
    }
    expect((await postReferenceHandler(upload("/api/reference-images", Buffer.from("MZ"), "r.png", "image/png", { title: "t", tags: "a" }))).status).toBe(415);
    expect((await postReferenceHandler(upload("/api/reference-images", img, "r.svg", "image/svg+xml", { title: "t", tags: "a" }))).status).toBe(415);
    expect(await prisma.storageObject.count({ where: { profileId: a.profileId, kind: "REFERENCE" } })).toBe(before);
  });

  it("tags returns this profile's distinct tags only; list filters; another profile's reference is 404", async () => {
    const add = async (title: string, tags: string[]) =>
      (await (await postReferenceHandler(upload("/api/reference-images", await png(), "r.png", "image/png", { title, tags }))).json()).item.id as string;
    const one = await add("Pricing", ["tables", "charts"]);
    await add("Growth", ["charts"]);
    as(b);
    await add("Secret", ["secret"]);
    expect((await (await tagsHandler()).json()).tags).toEqual(["secret"]);
    expect((await deleteReferenceHandler(new Request("http://t", { method: "DELETE" }), ctx(one))).status).toBe(404);
    as(a);
    expect((await (await tagsHandler()).json()).tags).toEqual(["charts", "tables"]);
    expect((await (await listReferencesHandler(new Request("http://t/api/reference-images?tag=tables"))).json()).items.map((i: { id: string }) => i.id)).toEqual([one]);
    expect((await deleteReferenceHandler(new Request("http://t", { method: "DELETE" }), ctx(one))).status).toBe(204);
    expect((await (await listReferencesHandler(new Request("http://t/api/reference-images"))).json()).items).toHaveLength(1);
  });

  it("generating with a reference sends its bytes to the provider; another profile's reference is refused before any debit", async () => {
    const seen: GenerateOptions[] = [];
    const base = mockImageProvider();
    const spy: ImageProvider = { ...base, generate: async (o) => { seen.push(o); return base.generate(o); } };
    await cleanup();
    cleanup = await installVisualsEnv(spy, {
      loadReference: (await import("./deps")).getVisualDeps().loadReference,
    });
    const ref = (await (await postReferenceHandler(upload("/api/reference-images", await png(300, 200), "r.png", "image/png", { title: "Style", tags: "a" }))).json()).item.id as string;
    const res = await generate({ useBrandColours: false, referenceId: ref });
    expect(res.status).toBe(202);
    await idleJobs();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.references).toHaveLength(1);
    expect(seen[0]!.prompt).toMatch(/reference image is supplied/i);

    as(b);
    await prisma.creditAccount.upsert({ where: { teamId: b.teamId }, create: { teamId: b.teamId, balance: 30 }, update: { balance: 30 } });
    const refused = await generate({ useBrandColours: false, referenceId: ref });
    expect(refused.status).toBe(422);
    expect((await refused.json()).code).toBe("reference_not_found");
    expect((await getCredits(b.teamId)).balance).toBe(30);
  });
});
