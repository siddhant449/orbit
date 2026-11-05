import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Weekly ideas (For you): with no batch the page offers "Make this week's ideas" and five cards appear; Hide moves a
 * card to Hidden and Restore brings it back; Save puts it in /saves; Draft opens a chat that writes the post; the dev
 * cron (POST /api/dev/cron, mock mode only) finds the batch already there. Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: ideas come from the scripted mock");
test.setTimeout(240_000);

const FIRST_TITLE = "MVP versus POC";
const created = new Set<string>();

async function resetWeek(page: Page, run = false) {
  const res = await page.request.post("/api/dev/cron", { data: { reset: true, run } });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { generated: number; skipped: number; failed: number; mine: string | null };
}
async function wipeSaves(page: Page) {
  const saved = (await (await page.request.get("/api/saves?limit=100")).json().catch(() => ({ items: [] }))) as { items: { id: string }[] };
  for (const i of saved.items) await page.request.delete(`/api/saves/${i.id}`);
}

test.beforeEach(async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) created.add(id);
  });
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await wipeSaves(page);
  await resetWeek(page);
});
test.afterEach(async ({ page }) => {
  for (const id of created) await page.request.delete(`/api/chat/${id}`).catch(() => {});
  created.clear();
  await wipeSaves(page);
  await resetWeek(page);
});

test("make the week, hide and restore, save, draft, and the cron finds the batch", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/ideas");
  await expect(page.getByRole("heading", { level: 1, name: "For you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No ideas for this week yet" })).toBeVisible();
  await expect(page.getByLabel("New ideas every")).toBeVisible();
  await axeCheck(page);

  // Make this week's ideas: five cards.
  await page.getByRole("button", { name: "Make this week's ideas" }).click();
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(5, { timeout: 30_000 });
  await expect(cards.first().getByRole("heading", { name: FIRST_TITLE })).toBeVisible();
  await page.waitForTimeout(1200);
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "light" });
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  // The batch is stored: a reload shows the same five, and there is no button any more.
  await page.reload();
  await expect(cards).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Make this week's ideas" })).toHaveCount(0);

  // Hide one: it moves to Hidden, then Restore.
  const second = (await cards.nth(1).getByRole("heading").textContent())!;
  await cards.nth(1).getByRole("button", { name: /^Hide / }).click();
  await expect(cards).toHaveCount(4);
  const hidden = page.locator("details", { hasText: "Hidden" });
  await hidden.locator("summary").click();
  await expect(hidden.getByText(second)).toBeVisible();
  await hidden.getByRole("button", { name: `Restore ${second}` }).click();
  await expect(cards).toHaveCount(5);
  await expect(hidden).toHaveCount(0);

  // Save one: it shows in /saves.
  const first = cards.first();
  await first.locator("[data-save-trigger]").click();
  await page.locator("[data-save-menu]").getByLabel("Save to All saves").check();
  await expect(page.locator("[data-save-menu]").getByLabel("Save to All saves")).toBeChecked();
  await page.keyboard.press("Escape");
  await page.goto("/saves");
  await expect(page.locator("[data-saved-item]")).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator("[data-saved-item]").first()).toContainText(FIRST_TITLE);

  // Draft one: a chat opens and writes the post; the card then says Drafted.
  await page.goto("/ideas");
  await cards.first().getByRole("button", { name: "Draft" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(page.getByRole("dialog").locator("[data-post-text]")).not.toBeEmpty({ timeout: 60_000 });
  await page.goto("/ideas");
  await expect(cards.first().getByText("Drafted")).toBeVisible();
  await expect(cards.first().getByRole("button", { name: "Open draft" })).toBeVisible();

  // The dev cron sees this week's batch and leaves it alone.
  const run = await (await page.request.post("/api/dev/cron", { data: {} })).json();
  expect(run.mine).toBe("exists");
  await page.reload();
  await expect(cards).toHaveCount(5);
});
