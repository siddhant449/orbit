import { assertTestDatabase } from "@brandloop/db/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real Postgres (the isolated test database, TEST_DATABASE_URL); only the account is faked.
const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string } | null } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import { ensureAccount, prisma } from "@brandloop/db";
import { createRateLimiter } from "./rate-limit";
import { deleteTemplateHandler, fromPostHandler, getTemplatesHandler, patchTemplateHandler, postTemplateHandler, setLikedHandler, setSavedHandler } from "./templates-api";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const CLERK = "user_webtest_templates";
let a: { userId: string; profileId: string };
let b: { userId: string; profileId: string };
const ownSlug = "webtest-own-template";

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  for (let attempt = 1; ; attempt++) {
    try {
      await assertTestDatabase(prisma);
      await prisma.template.deleteMany({ where: { slug: ownSlug } });
      await prisma.team.deleteMany({ where: { name: { endsWith: " (webtest)" }, memberships: { some: { user: users } } } });
      await prisma.user.deleteMany({ where: users });
      return;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
}

const as = (p: { userId: string; profileId: string }) => (env.account = { user: { id: p.userId }, currentProfile: { id: p.profileId } });
const list = async (qs = "") => (await getTemplatesHandler(new Request(`http://t/api/templates${qs}`))).json() as Promise<{ total: number; items: { id: string; slug: string; type: string; category: string; title: string; saved: boolean }[] }>;

beforeAll(async () => {
  await wipe();
  const one = await ensureAccount({ clerkId: `${CLERK}1`, email: "webtpl1@example.test", firstName: "A", teamNameSuffix: " (webtest)" });
  const two = await ensureAccount({ clerkId: `${CLERK}2`, email: "webtpl2@example.test", firstName: "B", teamNameSuffix: " (webtest)" });
  a = { userId: one.user.id, profileId: one.currentProfile!.id };
  b = { userId: two.user.id, profileId: two.currentProfile!.id };
  await prisma.template.create({
    data: { slug: ownSlug, type: "POST", category: "curated", title: "Webtest own template", skeleton: "A\n\nB", beats: [], why: "mine", needs: [], tags: [], system: false, profileId: a.profileId },
  });
});
afterAll(wipe);
beforeEach(() => as(a));

describe("GET /api/templates", () => {
  it("filters by type and category, searches and pages", async () => {
    const posts = await list("?type=POST&limit=10");
    expect(posts.items).toHaveLength(10);
    expect(posts.items.every((t) => t.type === "POST")).toBe(true);
    const hooks = await list("?type=HOOK&limit=5");
    expect(hooks.items.every((t) => t.type === "HOOK")).toBe(true);

    const category = posts.items[0]!.category;
    const inCategory = await list(`?type=POST&category=${category}&limit=100`);
    expect(inCategory.items.length).toBeGreaterThan(0);
    expect(inCategory.items.every((t) => t.category === category)).toBe(true);

    const page1 = await list("?type=POST&limit=5&offset=0");
    const page2 = await list("?type=POST&limit=5&offset=5");
    expect(page1.total).toBe(page2.total);
    expect(page1.items.map((t) => t.slug)).not.toEqual(page2.items.map((t) => t.slug));

    const found = await list(`?search=${encodeURIComponent(posts.items[0]!.title.slice(0, 12))}`);
    expect(found.items.some((t) => t.slug === posts.items[0]!.slug)).toBe(true);
    expect((await list("?search=zzzqqqnomatch")).total).toBe(0);
  });

  it("shows the profile its own templates and nobody else's", async () => {
    expect((await list("?search=Webtest%20own")).items.map((t) => t.slug)).toEqual([ownSlug]);
    as(b);
    expect((await list("?search=Webtest%20own")).total).toBe(0);
  });
});

describe("PUT/DELETE /api/templates/:id/save", () => {
  it("saves, lists as saved, and unsaves", async () => {
    const first = (await list("?type=POST&limit=1")).items[0]!;
    expect(first.saved).toBe(false);
    expect((await setSavedHandler(first.id, true)).status).toBe(200);
    expect((await list("?type=POST&limit=1")).items[0]!.saved).toBe(true);
    const saved = await list("?saved=1");
    expect(saved.items.map((t) => t.id)).toEqual([first.id]);
    as(b);
    expect((await list("?saved=1")).total).toBe(0);
    as(a);
    expect((await setSavedHandler(first.id, false)).status).toBe(200);
    expect((await list("?saved=1")).total).toBe(0);
  });

  it("does not save another profile's template or an unknown one", async () => {
    const own = await prisma.template.findUniqueOrThrow({ where: { slug: ownSlug } });
    as(b);
    expect((await setSavedHandler(own.id, true)).status).toBe(404);
    expect((await setSavedHandler("nope", true)).status).toBe(404);
  });
});

describe("own templates, likes and from-post", () => {
  const json = (body: unknown) => new Request("http://t/api/templates", { method: "POST", body: JSON.stringify(body) });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const input = { title: "Webtest mine", type: "POST", category: "lesson", skeleton: "I learned [lesson]." };

  it("creates, edits, likes and deletes an own template; another profile gets 404", async () => {
    const res = await postTemplateHandler(json(input));
    expect(res.status).toBe(201);
    const { template } = (await res.json()) as { template: { id: string; own: boolean } };
    expect(template.own).toBe(true);
    expect((await postTemplateHandler(json({ ...input, skeleton: "no slot" }))).status).toBe(400);
    expect((await postTemplateHandler(json({ ...input, category: "nope" }))).status).toBe(400);
    expect((await patchTemplateHandler(new Request("http://t", { method: "PATCH", body: JSON.stringify({ title: "Renamed" }) }), ctx(template.id))).status).toBe(200);
    expect(((await (await setLikedHandler(template.id, true)).json()) as { likeCount: number }).likeCount).toBe(1);
    const row = (await list("?search=Renamed&sort=popular")).items[0] as unknown as { liked: boolean; own: boolean; likeCount: number };
    expect(row).toMatchObject({ liked: true, own: true, likeCount: 1 });
    as(b);
    expect((await patchTemplateHandler(new Request("http://t", { method: "PATCH", body: "{}" }), ctx(template.id))).status).toBe(404);
    expect((await deleteTemplateHandler(new Request("http://t"), ctx(template.id))).status).toBe(404);
    expect((await setLikedHandler(template.id, true)).status).toBe(404);
    as(a);
    expect((await deleteTemplateHandler(new Request("http://t"), ctx(template.id))).status).toBe(200);
  });

  it("from-post suggests a template with the scripted client, rate limits, and 404s on another profile's post", async () => {
    const doc = await prisma.document.create({ data: { profileId: a.profileId, title: "Post" } });
    await prisma.documentVersion.create({ data: { documentId: doc.id, version: 1, text: "I used to think X. Now I do Y.", source: "AI_CREATE" } });
    const ai = {
      json: async (o: { schema: { parse: (v: unknown) => unknown } }) => o.schema.parse({ title: "T", type: "POST", category: "lesson", skeleton: "I used to [x].", why: "w" }),
      text: async () => "",
    } as never;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    const req = () => new Request("http://t/api/templates/from-post", { method: "POST", body: JSON.stringify({ documentId: doc.id }) });
    const ok = await fromPostHandler(req(), { ai, limiter });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { suggestion: { skeleton: string } }).suggestion.skeleton).toContain("[x]");
    expect(await prisma.template.count({ where: { profileId: a.profileId, system: false, title: "T" } })).toBe(0);
    expect((await fromPostHandler(req(), { ai, limiter })).status).toBe(429);
    as(b);
    expect((await fromPostHandler(req(), { ai, limiter: createRateLimiter({ limit: 5, windowMs: 60_000 }) })).status).toBe(404);
  });
});
