import { assertTestDatabase } from "@brandloop/db/test-db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real Postgres (the isolated test database, TEST_DATABASE_URL) and the scripted model; only Clerk and Next's `after` are faked.
const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string } | null } };
});
const pending = vi.hoisted(() => [] as (() => Promise<void>)[]);

vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => void pending.push(fn),
}));

import { claimRun, ensureAccount, getChat, getOrCreateChat, prisma } from "@brandloop/db";
import { getRunRegistry, SCRIPTED_DRAFT, SCRIPTED_TITLE } from "@brandloop/agent";
import { randomUUID } from "node:crypto";
import {
  deleteChatHandler,
  getAiModelHandler,
  putAiModelHandler,
  getChatMessagesHandler,
  getChatStreamHandler,
  getHistoryHandler,
  patchChatHandler,
  postChatHandler,
  stopChatHandler,
} from "./chat-api";
import { appOrigin, checkAttachments } from "./chat-request";

const CLERK = "user_test_webchat";
let profileId: string;
let userId: string;

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  await assertTestDatabase(prisma);
  await prisma.team.deleteMany({ where: { name: { endsWith: " (test)" }, memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}

beforeAll(async () => {
  await wipe();
  const acc = await ensureAccount({ clerkId: CLERK, email: "webchat@example.test", firstName: "Web", teamNameSuffix: " (test)" });
  profileId = acc.currentProfile!.id;
  userId = acc.user.id;
});
afterAll(wipe);
beforeEach(() => {
  env.account = { user: { id: userId }, currentProfile: { id: profileId } };
  pending.length = 0;
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AI_MOCK_MODEL", "1");
});
afterEach(() => vi.unstubAllEnvs());

const json = (body: unknown) =>
  new Request("http://test/api/chat", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

function chatBody(chatId: string, text: string, over: Record<string, unknown> = {}) {
  return {
    id: chatId,
    runId: randomUUID(),
    message: { id: randomUUID(), role: "user", parts: [{ type: "text", text }], metadata: { createdAt: new Date().toISOString() } },
    selectedKnowledgeBaseIds: [],
    selectedWritingStyleId: null,
    webSearchEnabled: false,
    ...over,
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/chat", () => {
  it("streams the mock reply and the messages route returns both messages", async () => {
    const chatId = randomUUID();
    const res = await postChatHandler(json(chatBody(chatId, "Hello")));
    expect(res.status).toBe(200);
    const sse = await res.text();
    expect(sse).toContain('"delta":" reply."');
    expect(sse).toContain("data: [DONE]");
    const msgs = await getChatMessagesHandler(new Request("http://test"), params(chatId));
    expect(msgs.status).toBe(200);
    const data = await msgs.json();
    expect(data.activeTurn).toBeNull();
    expect(data.document).toBeNull();
    expect(data.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    expect(data.messages[1].parts.some((p: { text?: string }) => p.text === "Mock reply.")).toBe(true);
    expect(data.messages[1]).not.toHaveProperty("context");
    // The new chat gets a title after the response.
    await Promise.all(pending.map((fn) => fn()));
    expect((await getChat(profileId, chatId))!.title).toBe("Mock chat");
  });

  it("drafts a post end to end with the mock model, and the messages route returns it", async () => {
    const chatId = randomUUID();
    const sse = await (await postChatHandler(json(chatBody(chatId, "Draft a short post about MVP versus POC")))).text();
    expect(sse).toContain('"type":"data-document"');
    const data = await (await getChatMessagesHandler(new Request("http://test"), params(chatId))).json();
    expect(data.document).toEqual({ id: expect.any(String), title: SCRIPTED_TITLE, version: 1, text: SCRIPTED_DRAFT });
    expect((await getChat(profileId, chatId))!.documentId).toBe(data.document.id);
  });

  it("saves memory end to end with the keyword-scripted model", async () => {
    const chatId = randomUUID();
    await (await postChatHandler(json(chatBody(chatId, "Remember that I run a design studio in Pune")))).text();
    const doc = await prisma.memoryDoc.findFirst({ where: { profileId, key: "identity/about" } });
    expect(doc?.content).toContain("I run a design studio in Pune");
  });

  it("returns 400 bad_request for an invalid body and 413 for a message over 200,000 chars", async () => {
    const bad = await postChatHandler(json({ id: "not-a-uuid" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "bad_request" });
    const notJson = await postChatHandler(new Request("http://test", { method: "POST", body: "{" }));
    expect(notJson.status).toBe(400);
    const big = await postChatHandler(json(chatBody(randomUUID(), "x".repeat(200_001))));
    expect(big.status).toBe(413);
    expect(await big.json()).toMatchObject({ code: "message_too_long" });
  });

  it("returns 409 chat_turn_active with the active turn", async () => {
    const chatId = randomUUID();
    await getOrCreateChat(profileId, userId, chatId);
    await claimRun(chatId, "busy-run", "busy-msg");
    const res = await postChatHandler(json(chatBody(chatId, "Hi")));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "chat_turn_active", activeTurn: { runId: "busy-run", requestMessageId: "busy-msg" } });
    const msgs = await (await getChatMessagesHandler(new Request("http://test"), params(chatId))).json();
    expect(msgs.activeTurn).toEqual({ runId: "busy-run", requestMessageId: "busy-msg" });
  });

  it("ignores AI_MOCK_MODEL in production: no key means 503 ai_unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await postChatHandler(json(chatBody(randomUUID(), "Hello")));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "ai_unavailable" });
  });

  it("asks for a profile first", async () => {
    env.account = { user: { id: userId }, currentProfile: null };
    expect((await postChatHandler(json(chatBody(randomUUID(), "Hi")))).status).toBe(400);
  });
});

describe("stream, stop", () => {
  it("returns 204 when no run is active and 404 for another profile's chat", async () => {
    const chatId = randomUUID();
    await getOrCreateChat(profileId, userId, chatId);
    expect((await getChatStreamHandler(new Request("http://test"), params(chatId))).status).toBe(204);
    expect((await getChatStreamHandler(new Request("http://test"), params(randomUUID()))).status).toBe(404);
  });

  it("replays an active run's stream and stops it", async () => {
    const chatId = randomUUID();
    await getOrCreateChat(profileId, userId, chatId);
    const reg = getRunRegistry();
    const runId = randomUUID();
    await claimRun(chatId, runId, "m1");
    const controller = reg.start(chatId, runId);
    let push!: ReadableStreamDefaultController<string>;
    reg.attach(chatId, runId, new ReadableStream<string>({ start: (c) => void (push = c) }));
    push.enqueue('data: {"type":"start"}\n\n');

    const replay = await getChatStreamHandler(new Request("http://test"), params(chatId));
    expect(replay.status).toBe(200);
    expect(replay.headers.get("content-type")).toContain("text/event-stream");
    expect(replay.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");

    const stopReq = (body: unknown) => new Request("http://test/api/chat/stop", { method: "POST", body: JSON.stringify(body) });
    const stopped = await stopChatHandler(stopReq({ chatId, runId }));
    expect(stopped.status).toBe(200);
    expect(await stopped.json()).toEqual({ stopped: true });
    expect(controller.signal.aborted).toBe(true);
    expect((await prisma.chat.findUnique({ where: { id: chatId } }))!.stopRequestedRunId).toBe(runId);

    push.enqueue("data: [DONE]\n\n");
    push.close();
    expect(await replay.text()).toBe('data: {"type":"start"}\n\ndata: [DONE]\n\n');
    reg.finish(chatId, runId);

    // Another profile can't stop it; a wrong run id stops nothing; junk is a 400.
    expect(await (await stopChatHandler(stopReq({ chatId, runId: "other" }))).json()).toEqual({ stopped: false });
    env.account = { user: { id: userId }, currentProfile: { id: "someone-else" } };
    expect(await (await stopChatHandler(stopReq({ chatId, runId }))).json()).toEqual({ stopped: false });
    expect((await stopChatHandler(stopReq({ chatId: 1 }))).status).toBe(400);
  });
});

describe("history, rename, pin, delete", () => {
  it("lists, renames, pins and soft-deletes chats", async () => {
    const a = randomUUID();
    const b = randomUUID();
    await getOrCreateChat(profileId, userId, a);
    await getOrCreateChat(profileId, userId, b);

    const renamed = await patchChatHandler(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ title: "  Pricing ideas  ", pinned: true }) }),
      params(a),
    );
    expect(renamed.status).toBe(200);
    const page = await (await getHistoryHandler(new Request("http://test/api/history?limit=1"))).json();
    expect(page.hasMore).toBe(true);
    expect(page.chats).toEqual([expect.objectContaining({ id: a, title: "Pricing ideas", pinned: true, documentId: null })]);
    const next = await (await getHistoryHandler(new Request(`http://test/api/history?limit=50&before=${a}`))).json();
    expect(next.chats.map((c: { id: string }) => c.id)).toContain(b);
    expect((await getHistoryHandler(new Request("http://test/api/history?limit=abc"))).status).toBe(400);

    for (const body of [{ title: "   " }, { title: "x".repeat(121) }, {}, { pinned: "yes" }]) {
      const res = await patchChatHandler(new Request("http://test", { method: "PATCH", body: JSON.stringify(body) }), params(a));
      expect(res.status).toBe(400);
    }
    const missing = await patchChatHandler(
      new Request("http://test", { method: "PATCH", body: JSON.stringify({ title: "x" }) }),
      params(randomUUID()),
    );
    expect(missing.status).toBe(404);

    expect((await deleteChatHandler(new Request("http://test"), params(a))).status).toBe(200);
    expect((await deleteChatHandler(new Request("http://test"), params(a))).status).toBe(404);
    expect((await getChatMessagesHandler(new Request("http://test"), params(a))).status).toBe(404);
  });
});

describe("request caps", () => {
  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    postChatHandler(new Request("http://localhost:3000/api/chat", { method: "POST", body, headers, duplex: "half" } as RequestInit));
  const file = (url: string) => ({ type: "file", mediaType: "image/png", url });
  const withParts = (parts: unknown[]) => JSON.stringify(chatBody(randomUUID(), "x", { message: { id: randomUUID(), role: "user", parts } }));

  it("rejects a declared content-length over the cap with 413 before reading", async () => {
    const res = await post("{}", { "content-length": String(2_000_000) });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "request_too_large" });
  });

  it("rejects an undeclared body that streams past the cap with 413", async () => {
    const chunk = new TextEncoder().encode("x".repeat(100_000));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent++ < 30) c.enqueue(chunk);
        else c.close();
      },
    });
    const res = await post(stream as unknown as BodyInit);
    expect(res.status).toBe(413);
  });

  it("caps parts at 20 and file parts at 10", async () => {
    const text = { type: "text", text: "hi" };
    expect((await post(withParts(Array.from({ length: 21 }, () => text)))).status).toBe(400);
    expect((await post(withParts([text, ...Array.from({ length: 11 }, () => file("/api/files/a.png"))]))).status).toBe(400);
  });

  it("rejects data: URLs, URLs over 2048 chars and foreign origins", async () => {
    const text = { type: "text", text: "hi" };
    for (const url of [
      "data:image/png;base64,AAAA",
      `/api/files/${"a".repeat(2050)}`,
      "https://evil.example.com/api/files/a.png",
      "/some/other/path.png",
      "javascript:alert(1)",
    ]) {
      const res = await post(withParts([text, file(url)]));
      expect(res.status, url).toBe(400);
    }
  });

  it("accepts same-origin upload paths and allowlisted blob origins", async () => {
    vi.stubEnv("BLOB_PUBLIC_ORIGIN", "https://blob.example.com, https://cdn.example.com");
    const text = { type: "text", text: "hi" };
    for (const url of ["/api/files/a.png", "http://localhost:3000/api/files/b.png", "https://cdn.example.com/x/y.png"]) {
      const res = await post(withParts([text, file(url)]));
      expect(res.status, url).toBe(200);
      await res.text();
    }
  });
});

describe("cross-profile access", () => {
  it("profile B gets 404 on profile A's existing chat for stream and messages", async () => {
    const chatId = randomUUID();
    await (await postChatHandler(json(chatBody(chatId, "Hello")))).text();
    const other = await ensureAccount({ clerkId: `${CLERK}_b`, email: "webchat-b@example.test", firstName: "B", teamNameSuffix: " (test)" });
    env.account = { user: { id: other.user.id }, currentProfile: { id: other.currentProfile!.id } };
    expect((await getChatStreamHandler(new Request("http://test"), params(chatId))).status).toBe(404);
    expect((await getChatMessagesHandler(new Request("http://test"), params(chatId))).status).toBe(404);
  });
});

describe("attachment origin (fix round 2)", () => {
  const text = { type: "text", text: "hi" };
  const send = (origin: string, parts: unknown[]) =>
    postChatHandler(
      new Request(`${origin}/api/chat`, {
        method: "POST",
        body: JSON.stringify(chatBody(randomUUID(), "x", { message: { id: randomUUID(), role: "user", parts } })),
      }),
    );
  const file = (url: string, mediaType = "image/png") => ({ type: "file", mediaType, url });

  it("never trusts the request's Host: a spoofed origin's absolute URL is refused, relative paths resolve to APP_URL", async () => {
    vi.stubEnv("APP_URL", "https://app.brandloop.test");
    const spoof = "http://169.254.169.254";
    expect((await send(spoof, [text, file(`${spoof}/api/files/x.png`)])).status).toBe(400);
    expect((await send("http://localhost:3000", [text, file("http://localhost:3000/api/files/x.png")])).status).toBe(400);
    const chatId = randomUUID();
    const ok = await postChatHandler(
      new Request(`${spoof}/api/chat`, {
        method: "POST",
        body: JSON.stringify(chatBody(chatId, "x", { message: { id: randomUUID(), role: "user", parts: [text, file("/api/files/x.png")] } })),
      }),
    );
    expect(ok.status).toBe(200);
    await ok.text();
    const stored = await prisma.message.findFirst({ where: { chatId, role: "USER" } });
    expect(JSON.stringify(stored!.parts)).toContain("https://app.brandloop.test/api/files/x.png");
    expect(JSON.stringify(stored!.parts)).not.toContain("169.254");
  });

  it("refuses every file part in production when APP_URL is unset (unit level: no real model is built)", () => {
    const body = chatBody(randomUUID(), "x", { message: { id: "m", role: "user", parts: [text, file("/api/files/x.png")] } });
    expect(appOrigin({ NODE_ENV: "production" })).toBeNull();
    expect(appOrigin({ NODE_ENV: "production", APP_URL: "https://app.brandloop.test/some/path" })).toBe("https://app.brandloop.test");
    expect(appOrigin({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(appOrigin({ NODE_ENV: "development", APP_URL: "not a url" })).toBeNull();
    expect(checkAttachments(body as never, { NODE_ENV: "production" })).toBeNull();
    expect(checkAttachments({ ...body, message: { ...body.message, parts: [text] } } as never, { NODE_ENV: "production" })).not.toBeNull();
  });

  it("only accepts image and PDF media types", async () => {
    expect((await send("http://localhost:3000", [text, file("/api/files/x.txt", "text/plain")])).status).toBe(400);
    expect((await send("http://localhost:3000", [text, file("/api/files/x.html", "text/html")])).status).toBe(400);
    for (const mt of ["image/jpeg", "image/gif", "image/webp", "application/pdf"]) {
      const res = await send("http://localhost:3000", [text, file("/api/files/x", mt)]);
      expect(res.status, mt).toBe(200);
      await res.text();
    }
  });
});

describe("stop body cap", () => {
  it("refuses a stop body over 8 KB", async () => {
    const res = await stopChatHandler(
      new Request("http://test/api/chat/stop", { method: "POST", body: JSON.stringify({ chatId: "x".repeat(9000), runId: "r" }) }),
    );
    expect(res.status).toBe(413);
  });
});

describe("AI model pick", () => {
  const put = (model: unknown) =>
    putAiModelHandler(new Request("http://test/api/ai-model", { method: "PUT", body: JSON.stringify({ model }), headers: { "content-type": "application/json" } }));

  it("lists the allowlist, saves a valid pick per profile and rejects anything else", async () => {
    const first = await (await getAiModelHandler()).json();
    expect(first).toMatchObject({ model: null, default: "gpt-6.1-sol" });
    expect(first.models.map((m: { id: string }) => m.id)).toContain("gpt-6-luna");
    expect((await put("gpt-6-luna")).status).toBe(200);
    expect((await (await getAiModelHandler()).json()).model).toBe("gpt-6-luna");
    expect((await put("gpt-9-fake")).status).toBe(400);
    expect((await put("")).status).toBe(400);
    expect((await (await getAiModelHandler()).json()).model).toBe("gpt-6-luna");
    expect((await put(null)).status).toBe(200);
    expect((await (await getAiModelHandler()).json()).model).toBeNull();
  });

  it("POST /api/chat rejects a model outside the allowlist", async () => {
    const res = await postChatHandler(json(chatBody(randomUUID(), "hi", { model: "gpt-9-fake" })));
    expect(res.status).toBe(400);
    expect((await res.json()).cause).toMatch(/isn't available/);
    const ok = await postChatHandler(json(chatBody(randomUUID(), "hi", { model: "gpt-6-luna" })));
    expect(ok.status).toBe(200);
    await ok.text();
  });
});
