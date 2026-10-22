import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck } from "./helpers/shots";

/**
 * Edit proposals (feature 02, task 10) against the keyword-scripted model: "punchier" makes the mock call
 * proposeDocumentEdits on the post's first line; Apply writes it through the apply route, once. Every chat created
 * here is deleted afterwards; no prompt asks the mock to save a memory.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(120_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
// The mock writing specialist's post and the mock editor's replacement opening (packages/agent/src/mock.ts).
const DRAFT_TITLE = "MVP versus POC";
const DRAFT_FIRST = "Most founders build a proof of concept when they need a minimum viable product.";
const SCRIPTED_HOOK = "Founders: stop building proofs of concept.";
const created = new Set<string>();

test.beforeEach(async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) created.add(id);
  });
});

test.afterEach(async ({ page }) => {
  for (const id of created) await page.request.delete(`/api/chat/${id}`).catch(() => {});
  created.clear();
});

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
}

type Stored = { messages: { role: string; parts: { type: string; toolCallId?: string }[] }[]; document: { id: string; version: number } | null };

test("applies an edit proposal once: the panel moves to the next version, and a second apply is refused", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  const composer = page.getByLabel("Message", { exact: true });
  await composer.fill("Draft a short LinkedIn post about pricing");
  await composer.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  const chatId = CHAT_URL.exec(page.url())![1]!;
  const panel = page.getByRole("dialog", { name: DRAFT_TITLE });
  await expect(panel.locator("[data-version-label]")).toContainText("Version 1", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 30_000 });

  // The proposal arrives as a card: the passage as the post has it, struck through, then the replacement.
  await composer.fill("Make the opening punchier");
  await composer.press("Enter");
  const card = page.getByRole("region", { name: "Suggested edit" });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator("del[data-proposal-target]")).toHaveText(DRAFT_FIRST);
  await expect(card.locator("ins[data-proposal-replacement]")).toHaveText(SCRIPTED_HOOK);
  await expect(page.getByText("Here is a punchier opening. Apply it if you like it.")).toBeVisible();
  // Suggesting changes nothing: the post is still version 1.
  await expect(panel.locator("[data-version-label]")).toContainText("Version 1");
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 30_000 });
  await axeCheck(page);

  // Apply: version 2 with the new opening, in the panel and on the server.
  await card.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Applied as version 2.").first()).toBeVisible();
  await expect(panel.locator("[data-version-label]")).toContainText("Version 2");
  await expect(panel.locator("[data-post-text]")).toContainText(SCRIPTED_HOOK);
  await expect(panel.locator("[data-post-text]")).not.toContainText(DRAFT_FIRST);
  await expect(card.getByRole("button", { name: "Apply" })).toHaveCount(0);

  // After a reload the card knows from the saved version that it was applied, and offers no Apply.
  await page.reload();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("Applied to the post.");
  await expect(card.getByRole("button", { name: "Apply" })).toHaveCount(0);

  // Applying the same proposal again (another tab, a replayed click) is refused, and the post stays at version 2.
  const stored = (await (await page.request.get(`/api/chat/${chatId}/messages`)).json()) as Stored;
  const toolCallId = stored.messages
    .flatMap((m) => m.parts)
    .find((p) => p.type === "tool-proposeDocumentEdits")!.toolCallId!;
  const again = await page.request.post(`/api/documents/${stored.document!.id}/apply-proposal`, {
    data: { chatId, toolCallId, expectedVersion: 2 },
  });
  expect(again.status()).toBe(409);
  expect(((await again.json()) as { code: string }).code).toBe("already_applied");
  expect(stored.document!.version).toBe(2);
});
