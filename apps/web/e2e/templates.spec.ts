import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The Templates library: filters, Save across reload, Use (a new chat with the template pinned), the template named on
 * the draft card, rotation on the next post, and Swap. Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(240_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();
type Item = { id: string; slug: string; title: string; category: string; needs: string[]; saved: boolean };

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

async function newPost(page: Page, startFromHome = true) {
  if (startFromHome) await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("create a post on llm");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  const panel = page.locator("[data-options-panel]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.locator("[data-option]", { has: page.locator("[data-suggested]") }).click();
  await expect(page.locator("[data-draft-card]")).toHaveCount(1, { timeout: 60_000 });
}

test("browse, save, use a template, see it on the draft card, rotate and swap", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });

  const list = (await (await page.request.get("/api/templates?type=POST&limit=100")).json()) as { items: Item[] };
  const pick = list.items.find((t) => t.needs.length === 0 && !t.saved)!;
  expect(pick).toBeTruthy();

  // The library: posts by default, filters for type and category, search.
  await page.goto("/templates");
  await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible();
  const cards = page.locator("[data-template-card]");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  const all = await cards.count();
  expect(all).toBeGreaterThan(5);
  await page.getByLabel("Category").selectOption(pick.category);
  await expect.poll(async () => cards.count()).toBeLessThan(all);
  await expect(cards.first()).toBeVisible();
  const label = ((await page.getByLabel("Category").locator("option:checked").textContent()) ?? "").trim();
  for (const text of await cards.locator("button > span:first-child").allTextContents()) expect(text.trim()).toBe(label);
  await page.getByRole("radio", { name: "Hooks" }).click();
  await expect(page.locator(`[data-template-card="${pick.slug}"]`)).toHaveCount(0);
  await page.getByRole("radio", { name: "Posts" }).click();
  await page.getByLabel("Search templates").fill(pick.title);
  const card = page.locator(`[data-template-card="${pick.slug}"]`);
  await expect(card).toBeVisible({ timeout: 15_000 });

  // The preview shows the structure.
  await card.getByRole("button", { name: pick.title }).first().click();
  await expect(page.locator("[data-template-skeleton]")).not.toBeEmpty();
  await page.keyboard.press("Escape");

  // Save persists across a reload and shows under Saved.
  await card.getByRole("button", { name: `Save ${pick.title}` }).click();
  const post = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/saves");
  await page.locator("[data-save-menu]").getByLabel("Save to All saves").check();
  expect((await post).status()).toBe(201);
  await page.keyboard.press("Escape");
  await expect(card.getByRole("button", { name: `Saved ${pick.title}` })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(page.locator(`[data-template-card="${pick.slug}"]`)).toBeVisible({ timeout: 15_000 });
  await page.request.delete(`/api/templates/${pick.id}/save`);

  // Use: a new chat with the template pinned; the draft card names it.
  await page.goto("/templates");
  await page.getByLabel("Search templates").fill(pick.title);
  await page.locator(`[data-template-card="${pick.slug}"] [data-template-use]`).click();
  await expect(page).toHaveURL(/\/\?template=/);
  await expect(page.locator("[data-format-chip]")).toContainText(pick.title);
  await newPost(page, false);
  const line = page.locator("[data-template-line]").first();
  await expect(line).toContainText(`Template: ${pick.title}`);
  await expect(page.locator("body")).not.toContainText(/\[slot\]|Skeleton to fill/);

  // Swap lists the same category; picking one restructures the open post and the card names the new template.
  await line.getByRole("button", { name: /Swap/ }).click();
  const option = page.locator("[data-swap-option]").first();
  await expect(option).toBeVisible();
  const swapTitle = ((await option.locator("span").first().textContent()) ?? "").trim();
  expect(swapTitle).not.toBe(pick.title);
  await option.click();
  await expect(page.locator('[data-message="user"]').last()).toContainText("Restructure this post");
  await expect(page.locator("[data-template-line]").first()).toContainText(`Template: ${swapTitle}`, { timeout: 60_000 });

  // The next post in the same profile gets a different template (rotation).
  await newPost(page);
  const second = (await page.locator("[data-template-title]").first().textContent())?.trim();
  expect(second).toBeTruthy();
  expect(second).not.toBe(pick.title);
  expect(second).not.toBe(swapTitle);
});
