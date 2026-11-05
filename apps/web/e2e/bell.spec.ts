import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * What's New bell: after the dev cron makes a fresh week (POST /api/dev/cron, mock mode only) the bell has a dot and
 * lists "This week's ideas are ready"; opening it clears the dot; Esc closes it and focus returns to the bell; axe in
 * both themes; the bell is reachable on a phone. Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: ideas come from the scripted mock");
test.setTimeout(180_000);

async function cron(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post("/api/dev/cron", { data });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { generated: number; mine: string | null };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await cron(page, { reset: true, run: false });
});
test.afterEach(async ({ page }) => {
  await cron(page, { reset: true, run: false });
});

test("the bell shows a dot for a new week's ideas, opening clears it, Esc returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  const run = await cron(page, { reset: true });
  expect(run.mine).toBe("exists"); // the cron made it (or this call did)

  await page.goto("/");
  const bell = page.getByRole("button", { name: /^What's New/ });
  await expect(bell).toBeVisible({ timeout: 30_000 });
  await expect(bell.locator("[data-bell-dot]")).toBeVisible({ timeout: 20_000 });

  await bell.click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "What's New" })).toBeVisible();
  const event = panel.locator('[data-event="IDEAS_READY"]');
  await expect(event).toContainText("This week's ideas are ready");
  await expect(event).toContainText("just now");
  await expect(panel.locator('[data-derived="ideas"]')).toContainText("5 ideas are waiting for you");
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "light" });
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "dark" });

  // Esc closes it and focus goes back to the bell; the dot is gone (the event is read, the rows were seen).
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(bell).toBeFocused();
  await expect(bell.locator("[data-bell-dot]")).toHaveCount(0);
  const after = (await (await page.request.get("/api/notifications")).json()) as { unread: number };
  expect(after.unread).toBe(0);

  // It stays clear after a reload, and the event is still listed.
  await page.reload();
  await expect(bell.locator("[data-bell-dot]")).toHaveCount(0);
  await bell.click();
  await expect(panel.locator('[data-event="IDEAS_READY"]')).toBeVisible();

  // The row links to the ideas.
  await panel.locator('[data-event="IDEAS_READY"] a').click();
  await expect(page).toHaveURL(/\/ideas$/);
});

test("the bell is on the phone header and nothing scrolls sideways", async ({ page }) => {
  await cron(page, { reset: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const bell = page.getByRole("button", { name: /^What's New/ });
  await expect(bell).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalScroll(page);
  await bell.click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "What's New" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.waitForTimeout(1500); // the home cards finish rising in before their contrast is measured
  await axeCheck(page);
  await page.keyboard.press("Escape");
  await expect(bell).toBeFocused();
});
