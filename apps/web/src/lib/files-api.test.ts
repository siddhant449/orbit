import { assertTestDatabase } from "@brandloop/db/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real Postgres (the isolated test database) and a temp-dir local blob store; only Clerk is faked.
const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string; teamId: string } | null } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import { ensureAccount, getObject, prisma } from "@brandloop/db";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { deleteFileHandler, getFileHandler, postFileHandler, publicFileHandler } from "./files-api";
import { readFile, resetStoresForTest, storeFile } from "./storage";

const CLERK = "vtest_webfiles";
let root: string;
let mine: { userId: string; profileId: string; teamId: string };
let theirs: { userId: string; profileId: string; teamId: string };

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  await assertTestDatabase(prisma);
  await prisma.team.deleteMany({ where: { name: { endsWith: " (files)" }, memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}
async function account(n: number) {
  const acc = await ensureAccount({ clerkId: `${CLERK}${n}`, email: `webfiles${n}@example.test`, firstName: "Files", teamNameSuffix: " (files)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id, teamId: acc.team.id };
}
const as = (a: typeof mine) => void (env.account = { user: { id: a.userId }, currentProfile: { id: a.profileId, teamId: a.teamId } });

beforeAll(async () => {
  await wipe();
  mine = await account(1);
  theirs = await account(2);
  root = await mkdtemp(join(tmpdir(), "web-files-"));
});
afterAll(async () => {
  await wipe();
  await rm(root, { recursive: true, force: true });
});
beforeEach(() => {
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("STORAGE_LOCAL_ROOT", root);
  resetStoresForTest();
  as(mine);
});

const png = (w = 40, h = 30) => sharp({ create: { width: w, height: h, channels: 3, background: "#3366ff" } }).png().toBuffer();

function upload(bytes: Buffer, name: string, type: string, declaredExtra = 512) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  return new Request("http://test/api/files", { method: "POST", body: form, headers: { "content-length": String(bytes.length + declaredExtra) } });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method = "GET") => new Request("http://test/api/files/x", { method });

describe("POST /api/files", () => {
  it("stores a PNG in the public store, records it, and returns its id and URL", async () => {
    const res = await postFileHandler(upload(await png(), "a.png", "image/png"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ contentType: "image/png", width: 40, height: 30 });
    expect(body.url).toMatch(/^\/api\/files\/public\/p\/.+\/post_media\/[A-Za-z0-9_-]{22}\.png$/);
    const row = await getObject(mine.profileId, body.id);
    expect(row).toMatchObject({ store: "PUBLIC", kind: "POST_MEDIA", teamId: mine.teamId });
    expect(row!.key).toContain(`p/${mine.profileId}/`);
  });

  it("strips EXIF from stored images", async () => {
    const jpg = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#fff" } })
      .withExif({ IFD0: { Copyright: "secret" } })
      .jpeg()
      .toBuffer();
    const body = await (await postFileHandler(upload(jpg, "a.jpg", "image/jpeg"))).json();
    const stored = await readFile(mine.profileId, body.id);
    expect((await sharp(stored!.bytes).metadata()).exif).toBeUndefined();
  });

  it("accepts a GIF and a PDF", async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#f00" } }).gif().toBuffer();
    expect((await postFileHandler(upload(gif, "a.gif", "image/gif"))).status).toBe(201);
    const pdf = Buffer.from("%PDF-1.4\n%%EOF");
    const res = await postFileHandler(upload(pdf, "a.pdf", "application/pdf"));
    expect(res.status).toBe(201);
    expect((await res.json()).contentType).toBe("application/pdf");
  });

  it("rejects a PNG that is really a ZIP (415) and a 9 MB image (413)", async () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]);
    expect((await postFileHandler(upload(zip, "a.png", "image/png"))).status).toBe(415);
    const big = Buffer.concat([await png(), Buffer.alloc(9 * 1024 * 1024)]);
    expect((await postFileHandler(upload(big, "big.png", "image/png"))).status).toBe(413);
  });

  it("rejects unsupported types, empty files, a missing file and a missing length", async () => {
    expect((await postFileHandler(upload(Buffer.from("MZ"), "a.exe", "application/octet-stream"))).status).toBe(400);
    expect((await postFileHandler(upload(Buffer.alloc(0), "a.png", "image/png"))).status).toBe(400);
    expect((await postFileHandler(new Request("http://test/api/files", { method: "POST", body: new FormData(), headers: { "content-length": "100" } }))).status).toBe(400);
    const noLength = upload(await png(), "a.png", "image/png");
    noLength.headers.delete("content-length");
    expect((await postFileHandler(noLength)).status).toBe(411);
  });

  it("needs a profile", async () => {
    env.account = { user: { id: mine.userId }, currentProfile: null };
    expect((await postFileHandler(upload(await png(), "a.png", "image/png"))).status).toBe(400);
  });
});

describe("GET /api/files/:id", () => {
  it("streams a private object with no-store to its owner and 404s for another profile", async () => {
    const stored = await storeFile(mine.profileId, mine.teamId, "REFERENCE", await png(), "image/png");
    expect(stored.url).toBeNull();
    const res = await getFileHandler(req(), ctx(stored.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(40);

    as(theirs);
    expect((await getFileHandler(req(), ctx(stored.id))).status).toBe(404);
    expect((await deleteFileHandler(req("DELETE"), ctx(stored.id))).status).toBe(404);
  });

  it("serves public objects immutable, and 404s an unknown id", async () => {
    const stored = await storeFile(mine.profileId, mine.teamId, "VISUAL", await png(), "image/png");
    const res = await getFileHandler(req(), ctx(stored.id));
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((await getFileHandler(req(), ctx("nope"))).status).toBe(404);
  });
});

describe("DELETE /api/files/:id", () => {
  it("soft-deletes for the owner; the object is then gone", async () => {
    const stored = await storeFile(mine.profileId, mine.teamId, "POST_MEDIA", await png(), "image/png");
    expect((await deleteFileHandler(req("DELETE"), ctx(stored.id))).status).toBe(204);
    expect((await getFileHandler(req(), ctx(stored.id))).status).toBe(404);
    expect((await deleteFileHandler(req("DELETE"), ctx(stored.id))).status).toBe(404);
  });
});

describe("storeFile", () => {
  it("deletes the blob when recording fails, so no orphan is left", async () => {
    await expect(storeFile("no-such-profile", mine.teamId, "VISUAL", await png(), "image/png")).rejects.toThrow();
    const left = await readdir(join(root, "public"), { recursive: true }).catch(() => []);
    expect(left.filter((f) => /\.png$/.test(String(f))).filter((f) => String(f).includes("no-such-profile"))).toEqual([]);
  });

  it("records width, height, size and a sha256", async () => {
    const bytes = await png(64, 32);
    const stored = await storeFile(mine.profileId, mine.teamId, "VISUAL", bytes, "image/png");
    const row = await getObject(mine.profileId, stored.id);
    expect(row).toMatchObject({ width: 64, height: 32, bytes: bytes.length, store: "PUBLIC" });
    expect(row!.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("GET /api/files/public/[...key] (dev only)", () => {
  it("serves a public object by key outside production, never a private one, and 404s in production", async () => {
    const pub = await storeFile(mine.profileId, mine.teamId, "VISUAL", await png(), "image/png");
    const key = (await getObject(mine.profileId, pub.id))!.key;
    const res = await publicFileHandler(req(), { params: Promise.resolve({ key: key.split("/") }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");

    const priv = await storeFile(mine.profileId, mine.teamId, "REFERENCE", await png(), "image/png");
    const privKey = (await getObject(mine.profileId, priv.id))!.key;
    expect((await publicFileHandler(req(), { params: Promise.resolve({ key: privKey.split("/") }) })).status).toBe(404);
    expect((await publicFileHandler(req(), { params: Promise.resolve({ key: ["..", "x"] }) })).status).toBe(404);

    vi.stubEnv("NODE_ENV", "production");
    expect((await publicFileHandler(req(), { params: Promise.resolve({ key: key.split("/") }) })).status).toBe(404);
  });
});
