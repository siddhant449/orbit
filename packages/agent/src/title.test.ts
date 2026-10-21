import { getOrCreateChat, prisma } from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fakeAi, testProfile } from "./test/fixtures";
import { fallbackTitle, titleChat } from "./title";

describe("fallbackTitle", () => {
  it("takes the first six words, capped at 60 chars", () => {
    expect(fallbackTitle("Help me write a post about pricing for agencies today")).toBe("Help me write a post about");
    expect(fallbackTitle("  hi\n\nthere  ")).toBe("hi there");
    expect(fallbackTitle("a".repeat(100)).length).toBeLessThanOrEqual(60);
    expect(fallbackTitle("   ")).toBe("New chat");
  });
});

describe("titleChat", () => {
  let p: string;
  let u: string;
  beforeEach(async () => {
    await cleanup();
    ({ profileId: p, userId: u } = await testProfile());
  });
  afterAll(cleanup);

  it("uses the extract model, strips quotes and caps at 60 chars, then sets the title once", async () => {
    const chatId = randomUUID();
    await getOrCreateChat(p, u, chatId);
    const ai = fakeAi(undefined, `"Pricing post for agencies"`);
    expect(await titleChat(ai, chatId, "Help me write about pricing")).toBe("Pricing post for agencies");
    expect(ai.calls[0]!.model).toBe("extract");
    expect(ai.calls[0]!.prompt).toContain("Help me write about pricing");
    expect((await prisma.chat.findUnique({ where: { id: chatId } }))!.title).toBe("Pricing post for agencies");

    const long = fakeAi(undefined, "x".repeat(90));
    expect((await titleChat(long, chatId, "y")).length).toBe(60);
    // Not the default any more, so the title stays.
    expect((await prisma.chat.findUnique({ where: { id: chatId } }))!.title).toBe("Pricing post for agencies");
  });

  it("falls back to the first words when the model fails or returns nothing", async () => {
    const chatId = randomUUID();
    await getOrCreateChat(p, u, chatId);
    const failing = fakeAi();
    failing.text = async () => {
      throw new Error("down");
    };
    expect(await titleChat(failing, chatId, "Remember that I run a studio in Pune")).toBe("Remember that I run a studio");
    expect((await prisma.chat.findUnique({ where: { id: chatId } }))!.title).toBe("Remember that I run a studio");
    expect(await titleChat(fakeAi(undefined, "  ''  "), chatId, "Short one")).toBe("Short one");
  });
});
