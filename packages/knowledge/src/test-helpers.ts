import { AiUnavailableError, type AiClient } from "@brandloop/ai";
import { ensureAccount, prisma } from "@brandloop/db";
import type { UploadStore } from "./upload-store";

export async function cleanupTestData() {
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
  await prisma.knowledgeChunk.deleteMany({ where: { sourceId: { startsWith: "test_" } } });
}

export async function testProfile(n: number): Promise<string> {
  const acc = await ensureAccount({
    clerkId: `user_test_kn${n}`,
    email: `kn${n}@example.test`,
    firstName: "Kn",
    teamNameSuffix: " (test)",
  });
  return acc.currentProfile!.id;
}

export function fakeAi(summary = "A short summary."): AiClient & { texts: number } {
  const ai = {
    texts: 0,
    async json(): Promise<never> {
      throw new Error("json not expected");
    },
    async text() {
      ai.texts++;
      return summary;
    },
  };
  return ai as AiClient & { texts: number };
}

export const unavailableAi: AiClient = {
  async json() {
    throw new AiUnavailableError();
  },
  async text() {
    throw new AiUnavailableError();
  },
};

export function memoryStore(): UploadStore & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  let n = 0;
  return {
    files,
    async put(buf) {
      const key = `mem${++n}.bin`;
      files.set(key, buf);
      return key;
    },
    async get(key) {
      const b = files.get(key);
      if (!b) throw new Error("missing");
      return b;
    },
    async delete(key) {
      files.delete(key);
    },
  };
}

export const WORDS_120 = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
