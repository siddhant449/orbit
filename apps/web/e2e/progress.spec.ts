import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck, captureSet, expectNoHorizontalScroll } from "./helpers/shots";

const email = process.env.E2E_CLERK_USER_EMAIL;

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.setTimeout(120_000);

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  // The challenge, goals and to-dos are stored now: start each test from nothing.
  expect((await page.request.post("/api/dev/habits", { data: { reset: true } })).ok()).toBe(true);
}

async function axeBothThemes(page: Page) {
  for (const colorScheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme });
    await axeCheck(page);
  }
}

test.afterEach(async ({ page }) => {
  await page.request.post("/api/dev/habits", { data: { reset: true } });
});

test("challenge: start screen, then the stored 30-day calendar with missed days and day selection", async ({ page }) => {
  await signIn(page);
  await page.goto("/challenge");
  await expect(page.getByRole("heading", { level: 1, name: "30-day challenge" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start the challenge" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start today" })).toBeVisible();
  await expect(page.getByLabel("Or choose a start date")).toBeVisible();

  // A start date in the past shows missed days, the banner and Catch up. 9 days back is always day 10 today.
  const probe = await page.request.post("/api/challenge", { data: {} });
  expect(probe.status()).toBe(201);
  const today = ((await probe.json()) as { challenge: { today: string } }).challenge.today;
  expect((await page.request.delete("/api/challenge")).ok()).toBe(true);
  const past = new Date(Date.parse(`${today}T00:00:00Z`) - 9 * 86_400_000).toISOString().slice(0, 10);
  expect((await page.request.post("/api/challenge", { data: { startDate: past } })).status()).toBe(201);
  await page.goto("/challenge");
  const cells = page.getByRole("button", { name: /^Day \d+ · / });
  await expect(cells).toHaveCount(30);
  await expect(page.locator("header .font-display")).toContainText("Day 10");
  await expect(page.getByText(/You've missed \d+ days?\./)).toBeVisible();

  // Selecting another post day swaps the format panel; a missed day offers Catch up.
  const formatHeading = page.locator("#sprint-format-title");
  const other = page.getByRole("button", { name: /The customer number/ });
  const before = await formatHeading.textContent();
  await other.click();
  await expect(other).toHaveAttribute("aria-pressed", "true");
  await expect(formatHeading).not.toHaveText(before ?? "");
  await page.getByRole("button", { name: /^Day 1 · Missed/ }).click();
  await expect(page.getByRole("button", { name: "Catch up", exact: true }).first()).toBeVisible();

  await axeBothThemes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureSet(page, "progress-challenge");
  await page.setViewportSize({ width: 1280, height: 720 });
});

test("activities: stored goals, streak, badges, strip, checklist and to-dos", async ({ page }) => {
  await signIn(page);
  await page.goto("/activities");
  await expect(page.getByRole("heading", { level: 1, name: "Activities" })).toBeVisible();
  for (const name of ["Streak", "This week's goals", "Milestones", /^Getting started/, /^Today \w{3} \d+ \w{3}$/]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  // The posts goal is counted from posted posts; the other goals are counted by hand and start at 0.
  const goals = page.getByRole("list", { name: "This week's goals" }).getByRole("listitem");
  await expect(goals.first()).toContainText(/Post \d+ times\s*\d+ \/ \d+/);
  for (const row of await goals.all()) await expect(row).toContainText(/\d+ \/ \d+/);
  await expect(page.getByRole("button", { name: "+ Add activity" })).toBeEnabled();

  // Week strip: today is marked, the next week is out of reach, the previous one is not.
  await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Next week" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.locator('[aria-current="date"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.locator('[aria-current="date"]')).toHaveCount(1);

  await page.getByRole("button", { name: "All badges" }).click();
  await expect(page.getByRole("dialog", { name: "Badges" })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("First post", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const write = page.getByRole("region", { name: /^Today / }).getByRole("link", { name: /^Write( another)?$/ });
  await expect(write).toHaveAttribute("href", "/");

  await axeBothThemes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureSet(page, "progress-activities");
});
