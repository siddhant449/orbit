import { assertTestDatabase } from "@brandloop/db/test-db";
import type { AiClient } from "@brandloop/ai";
import { fakeEmbedder } from "@brandloop/ai/testing";
import { ensureAccount, prisma } from "@brandloop/db";
import type { TurnContext } from "../context";

/** Every fixture user starts with this, so cleanup never touches other packages' test data. */
const CLERK_PREFIX = "user_test_agent";

/** A fresh user, team and profile. Same `n` in one run returns the same profile (call `cleanup` between tests). */
export async function testProfile(n = 1): Promise<{ userId: string; profileId: string }> {
  const acc = await ensureAccount({
    clerkId: `${CLERK_PREFIX}${n}`,
    email: `agent${n}@example.test`,
    firstName: "Agent",
    teamNameSuffix: " (test)",
  });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id };
}

export async function cleanup(): Promise<void> {
  const users = { clerkId: { startsWith: CLERK_PREFIX } };
  await assertTestDatabase(prisma);
  await prisma.team.deleteMany({ where: { name: { endsWith: " (test)" }, memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}

type AiCall = { model: string; system: string; prompt: string; abortSignal?: AbortSignal };

/**
 * A scripted AiClient. `json` returns `json` (or its result when it is a function); `text` returns `text`.
 * Every call is recorded in `calls`. Schemas are not applied, so tests control the shape exactly.
 */
export function fakeAi(
  json?: unknown | ((opts: AiCall) => unknown),
  text = "Fake text.",
): AiClient & { calls: AiCall[] } {
  const calls: AiCall[] = [];
  const ai = {
    calls,
    async json<T>(opts: AiCall): Promise<T> {
      const call = { model: opts.model, system: opts.system, prompt: opts.prompt, abortSignal: opts.abortSignal };
      calls.push(call);
      return (typeof json === "function" ? (json as (o: AiCall) => unknown)(call) : json) as T;
    },
    async text(opts: AiCall): Promise<string> {
      calls.push({ model: opts.model, system: opts.system, prompt: opts.prompt });
      return text;
    },
  };
  return ai as AiClient & { calls: AiCall[] };
}

/** A turn context on a fresh test profile (n = 1 unless `over` supplies ids). */
export async function testContext(over: Partial<TurnContext> = {}): Promise<TurnContext> {
  const ids = over.profileId && over.userId ? { profileId: over.profileId, userId: over.userId } : await testProfile();
  return {
    profileId: ids.profileId,
    userId: ids.userId,
    chatId: "chat_test",
    runId: "run_test",
    requestMessageId: "msg_test",
    taskId: "task_test",
    ai: fakeAi(),
    embedder: fakeEmbedder(),
    selections: { knowledgeIds: [], writingStyleId: null, webSearchEnabled: true, quickLinkKey: null },
    writer: null,
    handoffs: new Map(),
    documentRef: { current: null },
    documentContext: null,
    now: () => new Date("2026-10-21T09:00:00Z"),
    ...over,
  };
}
