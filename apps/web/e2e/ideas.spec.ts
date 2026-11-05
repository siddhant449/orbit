import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Ideas (screens.md B11): "Make this week's ideas" against the scripted mock (packages/agent/src/mock.ts
 * SCRIPTED_IDEAS); the batch is stored. The weekly flow is in ideas-weekly.spec.ts.
 * Nothing should start a chat here; any chat that does is deleted afterwards.
 * With SHOTS=1 and SHOTS_DIR, captures ideas-* at 1440 dark/light and 390 dark.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: ideas come from the scripted mock");
test.setTimeout(300_000);

const FIRST_TITLE = "MVP versus POC";
const created = new Set<string>();
const shots = process.env.SHOTS === "1" ? process.env.SHOTS_DIR : undefined;

async function shot(page: Page, name: string) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `ideas-${name}.png`), fullPage: true, animations: "disabled" });
}

test.beforeEach(async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) created.add(id);
  });
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
});

test.afterEach(async ({ page }) => {
  for (const id of created) await page.request.delete(`/api/chat/${id}`).catch(() => {});
  created.clear();
});

test("For you makes this week's ideas from the stored batch and links nothing to a chat until Draft", async ({ page }) => {
  await page.request.post("/api/dev/cron", { data: { reset: true, run: false } });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/ideas");
  await expect(page.getByRole("heading", { level: 1, name: "For you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No ideas for this week yet" })).toBeVisible();
  await axeCheck(page);
  await shot(page, "empty-1440-dark");

  await page.getByRole("button", { name: "Make this week's ideas" }).click();
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(5, { timeout: 30_000 });
  await expect(cards.first().getByRole("heading", { name: FIRST_TITLE })).toBeVisible();
  await page.waitForTimeout(1200);
  await axeCheck(page);
  await shot(page, "1440-dark");

  await page.emulateMedia({ colorScheme: "light" });
  await axeCheck(page);
  await shot(page, "1440-light");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await expectNoHorizontalScroll(page);
  await shot(page, "390-dark");
  await page.setViewportSize({ width: 1440, height: 900 });

  // Nothing started a chat; the batch is stored, so a reload shows the same five.
  expect(created.size).toBe(0);
  await page.reload();
  await expect(cards).toHaveCount(5);
  await page.request.post("/api/dev/cron", { data: { reset: true, run: false } });
});

test("the library screens show honest empty states", async ({ page }) => {
  for (const [route, title] of [
    ["/inspiration", "Swipe file"],
    ["/following", "Following"],
  ] as const) {
    for (const colorScheme of ["dark", "light"] as const) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("Coming soon")).toBeVisible();
      await expect(page.getByRole("article")).toHaveCount(0);
      await axeCheck(page);
      if (route === "/inspiration") await shot(page, `swipe-1440-${colorScheme}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoHorizontalScroll(page);
    if (route === "/inspiration") await shot(page, "swipe-390-dark");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/inspiration");
  await page.getByRole("link", { name: "Get this week's ideas" }).click();
  await expect(page).toHaveURL(/\/ideas$/);
});
