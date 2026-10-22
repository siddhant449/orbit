import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * Writing engine W7: hook options come as cards of different types (a forced-variety set), and picking one either starts
 * a draft from it or swaps it into the open post as a new version. Kleo evidence: WQ §2.4 (11 purposes, evidence-gated,
 * the hook picker), L8 and B-d (all five hooks were "curiosity"), EV (e) (text-only hooks). Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(150_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
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

test("hook cards of different types; picking one drafts from it, then swaps into the open post as version 2", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Write 5 hook variations for a post about hiring your first engineer");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });

  // 1. Five cards, five different types, and no raw JSON in the thread.
  const cards = page.locator("[data-hook-cards]").last().locator("[data-hook-card]");
  await expect(cards).toHaveCount(5, { timeout: 30_000 });
  const purposes = await cards.locator("[data-hook-purpose]").allTextContents();
  expect(new Set(purposes).size).toBeGreaterThanOrEqual(4);
  await expect(cards.first()).toContainText(/\d+ lines? · \d+ chars/);
  await expect(page.locator("body")).not.toContainText('"purpose"');

  // 2. Use card 3: a draft is written that opens with exactly that line.
  const third = cards.nth(2);
  const line = (await third.locator("p").textContent())!.trim();
  await third.getByRole("button", { name: /Use this hook/ }).click();
  const panel = page.getByRole("dialog", { name: "MVP versus POC" });
  const post = panel.locator("[data-post-text]");
  await expect(post).toContainText("Build the POC in a week", { timeout: 40_000 });
  expect(((await post.textContent()) ?? "").split("\n")[0]).toBe(line);
  await expect(panel.locator("[data-version-label]")).toContainText("1");

  // 3. With the post open, a new set swaps its opening: the post goes up one version.
  await box.fill("Give me hook options for this post");
  await box.press("Enter");
  const second = page.locator("[data-hook-cards]").last().locator("[data-hook-card]");
  await expect(second).toHaveCount(5, { timeout: 40_000 });
  const pick = second.nth(0);
  const newLine = (await pick.locator("p").textContent())!.trim();
  await pick.getByRole("button", { name: /Use this hook/ }).click();
  await expect(panel.locator("[data-version-label]")).toContainText("2", { timeout: 20_000 });
  expect(((await post.textContent()) ?? "").split("\n")[0]).toBe(newLine);
  await expect(post).toContainText("Build the POC in a week");
});
