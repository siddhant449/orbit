import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Writing engine W2: the saved writing rules are compiled to hard checks, shown on Memories, and enforced by the final
 * review. Kleo evidence: A1 hardRules {forbidEmoji, forbidDashes, ...}, A2 (the account's dos and don'ts), L2 (the user's
 * saved voice outranks the style). Mock model; the rule line and every chat made here are removed afterwards.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(180_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();
const RULE = "No emojis";

test.beforeEach(async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) created.add(id);
  });
});

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
}

async function removeRule(page: Page) {
  await page.goto("/settings/memories");
  const del = page.getByRole("button", { name: `Delete: ${RULE}` });
  while ((await del.count()) > 0) {
    await del.first().click();
    await page.getByRole("button", { name: "Delete memory" }).click();
    await expect(page.getByText("Memory deleted").first()).toBeVisible();
    await page.reload();
  }
}

test("a saved 'No emojis' rule shows as an enforced check and fails the final review", async ({ page }) => {
  try {
    await signIn(page);
    await removeRule(page);

    // 1. Add the rule to the writing preferences; it appears as an enforced check.
    await page.goto("/settings/memories");
    const card = page.getByRole("region", { name: "Writing preferences" });
    await card.getByRole("button", { name: /Add a memory/ }).first().click();
    await page.getByLabel("New memory").fill(RULE);
    await page.getByRole("button", { name: "Add memory" }).click();
    await expect(page.getByText("Memory added")).toBeVisible();
    await page.reload();
    const enforced = page.locator("[data-enforced-checks]");
    await expect(enforced).toContainText("Enforced as checks");
    await expect(enforced.getByRole("listitem").filter({ hasText: "No emoji" })).toBeVisible();

    // 2. Draft a post, put an emoji in it by hand, then ask for a review.
    await page.goto("/");
    const box = page.getByLabel("Message", { exact: true });
    await box.fill("Draft a post about MVP vs POC");
    await box.press("Enter");
    await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
    const panel = page.getByRole("dialog", { name: "MVP versus POC" });
    await expect(panel.locator("[data-post-text]")).toContainText("Build the POC in a week", { timeout: 30_000 });
    await panel.getByRole("button", { name: "Edit" }).click();
    await panel.getByLabel("Post text").fill("Stop building the wrong thing \u{1F680}\n\nA second block.");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel.locator("[data-post-text]")).toContainText("\u{1F680}");

    await box.fill("Please review it");
    await box.press("Enter");
    const review = page.locator("[data-review-card]");
    await expect(review).toBeVisible({ timeout: 60_000 });
    const emoji = review.locator('[data-check="emoji"]');
    await expect(emoji).toHaveAttribute("data-passed", "false");
    await expect(emoji).toContainText("your rules forbid them");
    await expect(review).toContainText("failed");
    // The 8 old checks are still there.
    await expect(review.locator("[data-check]")).toHaveCount(8);
  } finally {
    // 3. Cleanup restores the rules.
    for (const id of created) await page.request.delete(`/api/chat/${id}`).catch(() => {});
    created.clear();
    await removeRule(page).catch(() => {});
  }
});
