import { assertTestDatabase } from "@brandloop/db/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string; teamId: string } | null } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import { ensureAccount, prisma } from "@brandloop/db";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHandler, deleteHandler, getHandler, listHandler, patchHandler, pdfHandler } from "./carousels-api";
import { resetStoresForTest } from "./storage";

const CLERK = "vtest_webcar";
let root: string;
let mine: { userId: string; profileId: string; teamId: string };
let theirs: typeof mine;

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  await assertTestDatabase(prisma);
  await prisma.team.deleteMany({ where: { name: { endsWith: " (car)" }, memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}
async function account(n: number) {
  const acc = await ensureAccount({ clerkId: `${CLERK}${n}`, email: `webcar${n}@example.test`, firstName: "Car", teamNameSuffix: " (car)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id, teamId: acc.team.id };
}
const as = (a: typeof mine) => void (env.account = { user: { id: a.userId }, currentProfile: { id: a.profileId, teamId: a.teamId } });

beforeAll(async () => {
  await wipe();
  mine = await account(1);
  theirs = await account(2);
  root = await mkdtemp(join(tmpdir(), "web-car-"));
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

const content = { title: "T", template: "ink", aspect: "4:5", options: { kit: "orbit", logo: false }, slides: [{ id: "a", title: "Hi", body: "There" }] };
const json = (method: string, body: unknown) => new Request("http://test/x", { method, body: body === null ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/carousels", () => {
  it("creates, lists, reads, saves with expectedRevision (409 when stale) and deletes", async () => {
    const created = await createHandler(json("POST", content));
    expect(created.status).toBe(201);
    const c = await created.json();
    expect(c).toMatchObject({ revision: 1, title: "T" });
    expect((await (await listHandler()).json()).carousels).toHaveLength(1);
    expect((await getHandler(json("GET", null), ctx(c.id))).status).toBe(200);

    const saved = await patchHandler(json("PATCH", { ...content, title: "U", expectedRevision: 1 }), ctx(c.id));
    expect(await saved.json()).toMatchObject({ title: "U", revision: 2 });
    const stale = await patchHandler(json("PATCH", { ...content, expectedRevision: 1 }), ctx(c.id));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "carousel_conflict", revision: 2 });

    as(theirs);
    expect((await getHandler(json("GET", null), ctx(c.id))).status).toBe(404);
    expect((await deleteHandler(json("DELETE", null), ctx(c.id))).status).toBe(404);
    as(mine);
    expect((await deleteHandler(json("DELETE", null), ctx(c.id))).status).toBe(204);
    expect((await getHandler(json("GET", null), ctx(c.id))).status).toBe(404);
  });

  it("rejects invalid and oversized bodies", async () => {
    expect((await createHandler(json("POST", { ...content, template: "nope" }))).status).toBe(400);
    expect((await createHandler(json("POST", { ...content, title: "x".repeat(200) }))).status).toBe(400);
    expect((await createHandler(json("POST", { ...content, slides: [{ id: "a", title: "x".repeat(70_000), body: "" }] }))).status).toBe(413);
    expect((await patchHandler(json("PATCH", content), ctx("whatever"))).status).toBe(400);
  });

  it("attaches to the profile's own post only", async () => {
    const c = await (await createHandler(json("POST", content))).json();
    const doc = await prisma.document.create({ data: { profileId: mine.profileId, title: "P" } });
    const other = await prisma.document.create({ data: { profileId: theirs.profileId, title: "Q" } });
    expect((await (await patchHandler(json("PATCH", { documentId: doc.id }), ctx(c.id))).json()).documentId).toBe(doc.id);
    expect((await patchHandler(json("PATCH", { documentId: other.id }), ctx(c.id))).status).toBe(404);
  });

  it("stores an uploaded PDF publicly and returns its URL; refuses non-PDFs and other profiles", async () => {
    const c = await (await createHandler(json("POST", content))).json();
    const pdf = (bytes: Buffer) => new Request("http://test/x", { method: "POST", body: new Uint8Array(bytes), headers: { "content-length": String(bytes.length) } });
    const ok = await pdfHandler(pdf(Buffer.from("%PDF-1.4\n%%EOF")), ctx(c.id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).pdfUrl).toMatch(/carousel_pdf\/[A-Za-z0-9_-]{22}\.pdf$/);
    expect((await (await getHandler(json("GET", null), ctx(c.id))).json()).pdfUrl).toBeTruthy();
    expect((await pdfHandler(pdf(Buffer.from("not a pdf at all")), ctx(c.id))).status).toBe(415);
    as(theirs);
    expect((await pdfHandler(pdf(Buffer.from("%PDF-1.4")), ctx(c.id))).status).toBe(404);
  });
});
