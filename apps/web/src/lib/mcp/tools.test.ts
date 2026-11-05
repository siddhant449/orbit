import { assertTestDatabase } from "@brandloop/db/test-db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real Postgres (the isolated test database); no model is called.
vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
});

import { createKnowledge, createTemplate, ensureAccount, listDocumentVersions, prisma, setBinding } from "@brandloop/db";
import { createRateLimiter } from "@/lib/rate-limit";
import { callMcpTool, MCP_TOOLS } from "./tools";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const CLERK = "user_webtest_mcp";
type Acc = { userId: string; profileId: string; teamId: string };
let a: Acc;
let b: Acc;

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

async function make(tag: string): Promise<Acc> {
  const acc = await ensureAccount({ clerkId: `${CLERK}_${tag}`, email: `${CLERK}_${tag}@example.test`, firstName: "M", teamNameSuffix: " (webtest)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id, teamId: acc.team.id };
}

const limiter = () => createRateLimiter({ limit: 1000, windowMs: 60_000 });
const call = (who: Acc, name: string, args: Record<string, unknown> = {}, deps: { limiter?: ReturnType<typeof limiter> } = {}) =>
  callMcpTool(who.userId, name, args, { limiter: deps.limiter ?? limiter() });
const json = (r: { text: string }) => JSON.parse(r.text);
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

beforeAll(wipe);
beforeEach(async () => {
  await wipe();
  a = await make("a");
  b = await make("b");
});
afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe("mcp tools", () => {
  it("no tool name contains publish, schedule or delete", () => {
    expect(MCP_TOOLS.map((t) => t.name).sort()).toEqual(
      [
        "add_memory", "create_draft", "edit_post", "get_strategy", "list_ideas", "list_memories", "list_posts", "list_templates",
        "read_knowledge", "read_post", "read_template", "save_idea", "search_knowledge", "update_memory",
      ].sort(),
    );
    for (const t of MCP_TOOLS) expect(t.name).not.toMatch(/publish|schedule|delete|remove/i);
  });

  it("every tool rejects ids from another profile", async () => {
    // Profile B owns a post, a knowledge item, a private template and a memory line.
    const post = json(await call(b, "create_draft", { title: "B post", text: "B secret text" }));
    const item = await createKnowledge(b.profileId, { type: "TEXT", title: "B notes", content: words(120) });
    const tpl = await createTemplate(b.profileId, { title: "B template", type: "HOOK", category: "mine", skeleton: "B skeleton [topic]" });
    await call(b, "add_memory", { text: "Runs a six-person studio in Pune" });
    const memories = json(await call(b, "list_memories"));
    expect(memories.memories.length).toBeGreaterThan(0);

    // User A (profile A) cannot reach any of it by id.
    const read = await call(a, "read_post", { id: post.id });
    expect(read.isError).toBe(true);
    expect(read.text).not.toContain("B secret text");

    const edit = await call(a, "edit_post", { id: post.id, text: "hijacked" });
    expect(edit.isError).toBe(true);
    expect(json(await call(b, "read_post", { id: post.id })).text).toBe("B secret text");

    const kb = await call(a, "read_knowledge", { id: item.id });
    expect(kb.isError).toBe(true);
    expect(kb.text).not.toContain("w1");

    const rt = await call(a, "read_template", { slug: tpl.slug });
    expect(rt.isError).toBe(true);
    expect(rt.text).not.toContain("B skeleton");

    const upd = await call(a, "update_memory", { id: memories.memories[0].id, text: "Lives on the moon permanently" });
    expect(upd.isError).toBe(true);
    expect(json(await call(b, "list_memories")).memories[0].text).toContain("Pune");

    // Lists never include B's data.
    expect(json(await call(a, "list_posts")).posts).toHaveLength(0);
    expect((await call(a, "list_templates", { search: "B template" })).text).not.toContain("B skeleton");
    expect(json(await call(a, "list_memories")).memories).toHaveLength(0);
    expect((await call(a, "search_knowledge", { query: "w1" })).text).not.toContain(item.id);
  });

  it("an assistant bound to another profile acts only as that profile", async () => {
    const second = await prisma.profile.create({ data: { teamId: a.teamId, ownerUserId: a.userId, name: "Second" } });
    const first = json(await call(a, "create_draft", { title: "First", text: "On the first profile" }));
    await setBinding(a.userId, second.id);
    expect(json(await call(a, "list_posts")).posts).toHaveLength(0);
    expect((await call(a, "read_post", { id: first.id })).isError).toBe(true);
    await call(a, "create_draft", { title: "Second", text: "On the second profile" });
    expect(await prisma.document.count({ where: { profileId: second.id } })).toBe(1);
    expect(await prisma.document.count({ where: { profileId: a.profileId } })).toBe(1);
  });

  it("create_draft makes a post with source ASSISTANT", async () => {
    const made = json(await call(a, "create_draft", { title: "Hello", text: "A draft from an assistant" }));
    const versions = await listDocumentVersions(a.profileId, made.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.source).toBe("ASSISTANT");
    expect((await call(a, "create_draft", { title: "x".repeat(121), text: "ok" })).isError).toBe(true);
    expect((await call(a, "create_draft", { title: "ok", text: "x".repeat(5001) })).isError).toBe(true);
  });

  it("edit_post makes a new version and keeps the old one", async () => {
    const made = json(await call(a, "create_draft", { title: "Hello", text: "Version one" }));
    const edited = json(await call(a, "edit_post", { id: made.id, text: "Version two", note: "Tightened" }));
    expect(edited.version).toBe(2);
    const versions = await listDocumentVersions(a.profileId, made.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0]!.changeSummary).toBe("Tightened");
    const stored = await prisma.documentVersion.findMany({ where: { documentId: made.id }, orderBy: { version: "asc" }, select: { text: true } });
    expect(stored.map((v) => v.text)).toEqual(["Version one", "Version two"]);
  });

  it("add_memory goes through the learning guard", async () => {
    const ok = await call(a, "add_memory", { text: "Runs a six-person design studio" });
    expect(ok.isError).toBeFalsy();
    expect(json(await call(a, "list_memories")).memories.map((m: { text: string }) => m.text)).toContain("Runs a six-person design studio");

    const writing = await call(a, "add_memory", { text: "Wants a post about hiring for this post" });
    expect(writing.isError).toBe(true);
    expect(writing.text).toMatch(/Refused/);
    const passing = await call(a, "add_memory", { text: "Might move to Berlin someday maybe" });
    expect(passing.isError).toBe(true);
    const question = await call(a, "add_memory", { text: "I'm sorry, but I can't help with that request." });
    expect(question.isError).toBe(true);
    expect(json(await call(a, "list_memories")).memories).toHaveLength(1);
  });

  it("update_memory changes one line through the guard", async () => {
    await call(a, "add_memory", { text: "Runs a six-person design studio" });
    const [line] = json(await call(a, "list_memories")).memories;
    const done = await call(a, "update_memory", { id: line.id, text: "Runs an eight-person design studio" });
    expect(done.isError).toBeFalsy();
    expect(json(await call(a, "list_memories")).memories[0].text).toBe("Runs an eight-person design studio");
    const bad = await call(a, "update_memory", { id: line.id, text: "Write a post about hiring for this post" });
    expect(bad.isError).toBe(true);
    expect((await call(a, "update_memory", { id: "strategy/themes#0", text: "Something about themes here" })).isError).toBe(true);
  });

  it("save_idea saves once and list_ideas reads the weekly ideas", async () => {
    const one = json(await call(a, "save_idea", { title: "Hiring lessons", detail: "What I learned hiring my first engineer" }));
    const two = json(await call(a, "save_idea", { title: "Hiring lessons", detail: "What I learned hiring my first engineer" }));
    expect(two.id).toBe(one.id);
    expect(await prisma.savedItem.count({ where: { profileId: a.profileId, kind: "IDEA" } })).toBe(1);
    expect(json(await call(a, "list_ideas", { weeks: 2 })).weeks).toEqual([]);
    expect((await call(a, "list_ideas", { weeks: 9 })).isError).toBe(true);
  });

  it("the rate limit answers with the friendly message", async () => {
    const tight = createRateLimiter({ limit: 2, windowMs: 60_000 });
    await call(a, "list_memories", {}, { limiter: tight });
    await call(a, "list_memories", {}, { limiter: tight });
    const third = await call(a, "list_memories", {}, { limiter: tight });
    expect(third.isError).toBe(true);
    expect(third.text).toMatch(/a lot of requests/i);
    // Another profile has its own allowance.
    expect((await call(b, "list_memories", {}, { limiter: tight })).isError).toBeFalsy();
  });
});
