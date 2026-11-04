import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * Angles first: a new post asked for with only a topic gets an options panel instead of a draft. Picking an angle writes
 * the post at once, opens it, and answers in one line; the question and answer stay in the thread as a small summary.
 * Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(120_000);

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

test("a bare topic shows angles; picking one writes and opens the post", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("create a post on llm");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });

  // The panel: a question, three or more angles, one suggested; nothing was written.
  const panel = page.locator("[data-options-panel]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole("heading")).toContainText("Which angle should the llm post take?");
  expect(await panel.locator("[data-option]").count()).toBeGreaterThanOrEqual(3);
  await expect(panel.locator("[data-suggested]")).toHaveCount(1);
  await expect(page.locator("[data-draft-card]")).toHaveCount(0);
  await expect(page.getByLabel("Message", { exact: true })).toHaveAttribute("placeholder", "Or tell me something else…");
  // The briefs never reach the page.
  await expect(page.locator("body")).not.toContainText("Plain words, no invented personal facts");

  // Keyboard: Escape hides the panel without sending anything.
  await panel.locator("[data-option]").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(panel.locator("[data-option]").nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.locator("[data-draft-card]")).toHaveCount(0);

  // A fresh chat to pick with the panel open.
  await page.goto("/");
  await box.fill("write the post on llm");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  const panel2 = page.locator("[data-options-panel]");
  await expect(panel2).toBeVisible({ timeout: 30_000 });
  const suggested = panel2.locator("[data-option]", { has: page.locator("[data-suggested]") });
  const label = ((await suggested.locator("[data-option-label]").textContent()) ?? "").replace("Suggested", "").trim();
  await suggested.click();

  // The pick shows as the user's message, the post opens by itself and the reply is one line.
  await expect(page.locator('[data-message="user"]').last()).toContainText(label);
  const post = page.getByRole("dialog", { name: "MVP versus POC" });
  await expect(post.locator("[data-post-text]")).toContainText("Build the POC in a week", { timeout: 40_000 });
  await expect(page.getByText("Here's your first draft. What would you like to improve?")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-draft-card]")).toHaveCount(1);
  await expect(page.locator("[data-options-panel]")).toHaveCount(0);

  // The thread keeps the question and the answer.
  const summary = page.locator("[data-options-summary]");
  await expect(summary).toContainText("Q: Which angle should the llm post take?");
  await expect(summary).toContainText(`A: ${label}`);

  // The question and answer survive a reload.
  await page.reload();
  await expect(page.locator("[data-options-summary]")).toContainText(`A: ${label}`);
});

test("typing instead of picking is the user's own angle", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("create a post on llm");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  await expect(page.locator("[data-options-panel]")).toBeVisible({ timeout: 30_000 });
  await box.fill("Make it about cost, with a draft");
  await box.press("Enter");
  await expect(page.locator("[data-options-summary]")).toContainText("A: Make it about cost, with a draft", { timeout: 30_000 });
  await expect(page.locator("[data-options-panel]")).toHaveCount(0);
});

test("an ask for suggestions opens the angles panel; picking angle 1 drafts a post", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("You decide and give me some suggestions for todays post.");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  const panel = page.locator("[data-options-panel]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  expect(await panel.locator("[data-option]").count()).toBeGreaterThanOrEqual(3);
  await panel.locator("[data-option]").first().click();
  const post = page.getByRole("dialog", { name: "MVP versus POC" });
  await expect(post.locator("[data-post-text]")).toBeVisible({ timeout: 40_000 });
  await expect(page.locator("[data-draft-card]")).toHaveCount(1);
});

test("a specific request writes directly, without the angles panel", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("create a post on why small teams should skip fine-tuning");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  await expect(page.locator("[data-draft-card]")).toHaveCount(1, { timeout: 40_000 });
  await expect(page.locator("[data-options-panel]")).toHaveCount(0);
});
