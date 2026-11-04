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
import { getSavesHandler, patchSaveHandler, postSaveHandler, postSpaceHandler } from "./saves-api";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const CLERK = "user_webtest_saves";
let a: { userId: string; profileId: string };
let b: { userId: string; profileId: string };
let docA: string;

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  for (let attempt = 1; ; attempt++) {
    try {
      await assertTestDatabase(prisma);
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
const json = (body: unknown) => new Request("http://t/api/saves", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  await wipe();
  const one = await ensureAccount({ clerkId: `${CLERK}1`, email: "websave1@example.test", firstName: "A", teamNameSuffix: " (webtest)" });
  const two = await ensureAccount({ clerkId: `${CLERK}2`, email: "websave2@example.test", firstName: "B", teamNameSuffix: " (webtest)" });
  a = { userId: one.user.id, profileId: one.currentProfile!.id };
  b = { userId: two.user.id, profileId: two.currentProfile!.id };
  docA = (await prisma.document.create({ data: { profileId: a.profileId, title: "Mine" } })).id;
});
afterAll(wipe);
beforeEach(() => as(a));

describe("saves API", () => {
  it("POST /api/saves validates kind and refId ownership", async () => {
    expect((await postSaveHandler(json({ kind: "NOPE", snapshot: {} }))).status).toBe(400);
    expect((await postSaveHandler(json({ kind: "POST", snapshot: {} }))).status).toBe(400);
    expect((await postSaveHandler(json({ kind: "POST", refId: docA, snapshot: { title: "Mine" } }))).status).toBe(201);
    as(b);
    expect((await postSaveHandler(json({ kind: "POST", refId: docA, snapshot: { title: "Mine" } }))).status).toBe(404);
    expect((await postSaveHandler(json({ kind: "TEMPLATE", refId: "nope", snapshot: {} }))).status).toBe(404);
    expect((await postSaveHandler(json({ kind: "HOOK", snapshot: { text: "x".repeat(9000) } }))).status).toBe(413);
  });

  it("PATCH /api/saves/:id moves an item between spaces", async () => {
    const mk = async (name: string) => ((await (await postSpaceHandler(json({ name }))).json()) as { space: { id: string } }).space.id;
    const [s1, s2] = [await mk("One"), await mk("Two")];
    const { item } = (await (await postSaveHandler(json({ kind: "HOOK", snapshot: { text: "hook" }, spaceIds: [s1] }))).json()) as { item: { id: string } };
    const patch = (spaceIds: string[]) => patchSaveHandler(new Request("http://t", { method: "PATCH", body: JSON.stringify({ spaceIds }) }), ctx(item.id));
    expect(((await (await patch([s2])).json()) as { item: { spaceIds: string[] } }).item.spaceIds).toEqual([s2]);
    const inOne = (await (await getSavesHandler(new Request(`http://t/api/saves?space=${s1}`))).json()) as { items: unknown[] };
    expect(inOne.items).toHaveLength(0);
    as(b);
    expect((await patch([])).status).toBe(404);
    expect((await getSavesHandler(new Request(`http://t/api/saves?space=${s1}`))).status).toBe(404);
  });

  it("rate limit returns 429 with the friendly message", async () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect((await postSaveHandler(json({ kind: "IDEA", snapshot: { text: "one" } }), { limiter })).status).toBe(201);
    const res = await postSaveHandler(json({ kind: "IDEA", snapshot: { text: "two" } }), { limiter });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(((await res.json()) as { error: string }).error).toMatch(/Try again shortly/);
  });
});
