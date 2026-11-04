import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Saves and spaces: make the space "Hooks I like", save a template and a hook into it and a post to All saves only,
 * see 3 in All saves and 2 in the space, reorder by keyboard, delete the space (the items stay), check axe in both
 * themes and no sideways scroll at 390 px. Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(240_000);

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
  await wipeSaves(page);
});

type Item = { id: string; kind: string; snapshot: { title?: string; text?: string } };
async function wipeSaves(page: Page) {
  const spaces = (await (await page.request.get("/api/spaces")).json().catch(() => ({ spaces: [] }))) as { spaces: { id: string }[] };
  for (const s of spaces.spaces) await page.request.delete(`/api/spaces/${s.id}`);
  const saved = (await (await page.request.get("/api/saves?limit=100")).json().catch(() => ({ items: [] }))) as { items: Item[] };
  for (const i of saved.items) await page.request.delete(`/api/saves/${i.id}`);
}

test("save a template, a hook and a post; a space holds two; reorder by keyboard; delete the space", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await wipeSaves(page);

  // The space: made from the sidebar's + on the Templates page.
  await page.goto("/templates");
  await page.getByRole("button", { name: "New space" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Hooks I like");
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.locator("[data-spaces-nav]").getByRole("link", { name: "Hooks I like" })).toBeVisible();

  // A template into the space.
  const card = page.locator("[data-template-card]").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator("[data-save-trigger]").click();
  const menu = page.locator("[data-save-menu]");
  await menu.getByLabel("Hooks I like").check();
  await expect(menu.getByLabel("Save to All saves")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // A hook from a mock chat into the space; using another hook makes a post.
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Write 5 hook variations for a post about hiring your first engineer");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  const cards = page.locator("[data-hook-cards]").last().locator("[data-hook-card]");
  await expect(cards).toHaveCount(5, { timeout: 30_000 });
  await cards.nth(0).locator("[data-save-trigger]").click();
  await page.locator("[data-save-menu]").getByLabel("Hooks I like").check();
  await expect(page.locator("[data-save-menu]").getByLabel("Save to All saves")).toBeChecked();
  await page.keyboard.press("Escape");
  await cards.nth(2).getByRole("button", { name: /Use this hook/ }).click();
  await expect(page.getByRole("dialog").locator("[data-post-text]")).toContainText("Build the POC in a week", { timeout: 40_000 });

  // A post to All saves only.
  await page.goto("/posts");
  const postSave = page.locator("[data-save-trigger]").first();
  await expect(postSave).toBeVisible({ timeout: 30_000 });
  await postSave.click();
  await page.locator("[data-save-menu]").getByLabel("Save to All saves").check();
  await expect(page.locator("[data-save-menu]").getByLabel("Save to All saves")).toBeChecked();
  await page.keyboard.press("Escape");

  // All saves lists three; the space lists two.
  await page.goto("/saves");
  const rows = page.locator("[data-saved-item]");
  await expect(rows).toHaveCount(3, { timeout: 20_000 });
  await expect(page.getByRole("radio", { name: "Posts" })).toBeVisible();
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "light" });
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "dark" });

  const spaces = (await (await page.request.get("/api/spaces")).json()) as { spaces: { id: string; name: string; itemCount: number }[] };
  const space = spaces.spaces.find((s) => s.name === "Hooks I like")!;
  expect(space.itemCount).toBe(2);
  await page.goto(`/saves?space=${space.id}`);
  await expect(page.getByRole("heading", { name: "Hooks I like", level: 1 })).toBeVisible();
  await expect(rows).toHaveCount(2, { timeout: 20_000 });
  const order = () => rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-saved-kind")));
  const before = await order();

  // Reorder by keyboard: open the second row's Move menu, choose Move up.
  const second = rows.nth(1);
  await second.locator("[data-move-trigger]").focus();
  await page.keyboard.press("Enter");
  const put = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/order"));
  await page.getByRole("button", { name: "Move up" }).click();
  expect((await put).ok()).toBe(true);
  await expect.poll(order).toEqual([before[1], before[0]]);
  await page.reload();
  await expect.poll(order).toEqual([before[1], before[0]]);
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "light" });
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "dark" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.goto("/saves");
  await expect(rows).toHaveCount(3);
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  // Delete the space: the items stay in All saves.
  await page.goto(`/saves?space=${space.id}`);
  await page.getByRole("button", { name: "Delete space" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete space" }).click();
  await expect(page).toHaveURL(/\/saves$/);
  await expect(rows).toHaveCount(3, { timeout: 20_000 });
  await expect(page.locator("[data-spaces-nav]").getByRole("link", { name: "Hooks I like" })).toHaveCount(0);
});
