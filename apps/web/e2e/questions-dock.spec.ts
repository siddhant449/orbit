import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * Questions in the dock: when the writer needs details only the user knows, the questions show above the composer (not as
 * a wall of text), the composer answers them one by one, and one normal message carries every answer. Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(120_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();
const SPRINT =
  "Day 1 of my 30-day sprint: The origin story. Help me write this post. Why you do this work at all.\n\nShape:\n1. The moment\n2. The turn\n3. The point\n\nIf you need details only I would know, ask me one or two short questions first, then draft it.";

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

test("questions show in the dock; answers go out as one message and the draft follows", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill(SPRINT);
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });

  const dock = page.locator("[data-question-dock]");
  await expect(dock).toBeVisible({ timeout: 40_000 });
  await expect(dock.locator("[data-question-count]")).toHaveText("Question 1 of 2");
  await expect(dock.locator("[data-question-text]")).toContainText("Who was your first hire");
  expect(await dock.locator("[data-suggestion]").count()).toBe(2);

  // No research for a personal prompt; the row does not claim a draft; the reply does not repeat the questions.
  await expect(page.getByText("Researched with dated sources")).toHaveCount(0);
  await expect(page.getByText("Draft ready")).toHaveCount(0);
  await expect(page.getByText("A couple of details only you know, then I'll draft it.")).toBeVisible();
  await expect(page.locator('[data-message="assistant"]').last()).not.toContainText("Who was your first hire");

  // A suggestion fills answer 1; the dock moves to question 2 (no suggestions there).
  await dock.locator("[data-suggestion]").first().click();
  await expect(dock.locator("[data-question-count]")).toHaveText("Question 2 of 2");
  await expect(dock.locator("[data-answered]")).toContainText("Q1 answered");
  await expect(dock.locator("[data-suggestion]")).toHaveCount(0);
  await expect(page.locator('[data-message="user"]')).toHaveCount(1);

  // Typing answers the current question; the last answer sends one message.
  await box.fill("We could finally ship twice as often.");
  await box.press("Enter");
  const reply = page.locator('[data-message="user"]').last();
  await expect(reply).toContainText("Here are my answers:", { timeout: 30_000 });
  await expect(reply).toContainText("1. Who was your first hire");
  await expect(reply).toContainText("We could finally ship twice as often.");
  await expect(page.locator('[data-message="user"]')).toHaveCount(2);
  await expect(dock).toHaveCount(0);

  const post = page.getByRole("dialog", { name: "MVP versus POC" });
  await expect(post.locator("[data-post-text]")).toBeVisible({ timeout: 40_000 });
  await expect(page.locator("[data-draft-card]")).toHaveCount(1);
});

test("Escape closes the dock and the plain chat works", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill(SPRINT);
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  const dock = page.locator("[data-question-dock]");
  await expect(dock).toBeVisible({ timeout: 40_000 });
  await dock.locator("[data-suggestion]").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(dock.locator("[data-suggestion]").nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dock).toHaveCount(0);
  await box.fill("Just hello");
  await box.press("Enter");
  await expect(page.locator('[data-message="user"]').last()).toContainText("Just hello");
});
