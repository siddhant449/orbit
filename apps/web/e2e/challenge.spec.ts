import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * The stored 30-day challenge: Start today, the sidebar card, Continue opens the day's chat and the mock draft, Mark as
 * posted makes the day Posted (1 of 22), End with a confirmation shows the summary, Start again. Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the day's chat runs against the scripted mock model");
test.setTimeout(240_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();

type View = { today: string; days: { dayNumber: number; date: string; formatId: string | null }[] };
async function challenge(page: Page): Promise<View | null> {
  return ((await (await page.request.get("/api/challenge")).json()) as { challenge: View | null }).challenge;
}
const reset = async (page: Page) => expect((await page.request.post("/api/dev/habits", { data: { reset: true } })).ok()).toBe(true);
const card = (page: Page) => page.locator('a[href="/challenge"]').filter({ hasText: "30-day challenge" }).first();

test.beforeEach(async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) created.add(id);
  });
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await reset(page);
});
test.afterEach(async ({ page }) => {
  for (const id of created) await page.request.delete(`/api/chat/${id}`).catch(() => {});
  created.clear();
  await reset(page);
});

test("start, continue into the day's draft, mark as posted, end, start again", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/challenge");
  await expect(page.getByRole("heading", { level: 1, name: "30-day challenge" })).toBeVisible();
  await expect(card(page)).toContainText("Not started");
  await expect(page.getByRole("heading", { name: "Start the challenge" })).toBeVisible();
  await axeCheck(page);

  // Start today. On a weekend today is a rest day, so the run starts on the Friday before and the Friday is caught up.
  await page.getByRole("button", { name: "Start today" }).click();
  await expect(page.getByRole("button", { name: "End challenge" })).toBeVisible({ timeout: 30_000 });
  let c = (await challenge(page))!;
  let today = c.days.find((d) => d.date === c.today)!;
  if (!today.formatId) {
    await page.getByRole("button", { name: "End challenge" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "End challenge" }).click();
    const d = new Date(`${c.today}T00:00:00Z`);
    const friday = new Date(d.getTime() - ((d.getUTCDay() + 2) % 7) * 86_400_000).toISOString().slice(0, 10);
    expect((await page.request.post("/api/challenge", { data: { startDate: friday } })).status()).toBe(201);
    await page.goto("/challenge");
    c = (await challenge(page))!;
    today = c.days.find((d) => d.formatId)!; // the Friday: day 1
  }
  const n = today.dayNumber;
  const isToday = today.date === c.today;

  // The sidebar card and the header show the day and 0 of 22.
  await expect(card(page)).toContainText(`Day ${c.days.find((d) => d.date === c.today)!.dayNumber}`);
  await expect(card(page)).toContainText("0 of 22 posted");
  await expect(page.getByText("0 of 22 posted").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Day \d+ · / })).toHaveCount(30);
  if (n === 1) await expect(card(page)).toContainText("Day 1 · ");

  // Continue (or Catch up) opens the day's chat, which asks its questions; the answers bring the mock draft.
  await page.getByRole("button", { name: new RegExp(`^Day ${n} · `) }).click();
  await page.getByRole("button", { name: isToday ? "Continue" : "Catch up", exact: true }).first().click();
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  const dock = page.locator("[data-question-dock]");
  await expect(dock).toBeVisible({ timeout: 40_000 });
  await dock.locator("[data-suggestion]").first().click();
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("We could finally ship twice as often.");
  await box.press("Enter");
  await expect(page.getByRole("dialog", { name: "MVP versus POC" }).locator("[data-post-text]")).toBeVisible({ timeout: 60_000 });

  // Back on the challenge the day is in progress; mark it as posted from the day panel.
  await page.goto("/challenge");
  await page.getByRole("button", { name: new RegExp(`^Day ${n} · `) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Day ${n} · (Today · )?In progress`) })).toBeVisible();
  await page.getByRole("button", { name: "Mark as posted" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Day ${n} · (Today · )?Posted`) })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("1 of 22 posted").first()).toBeVisible();
  await expect(card(page)).toContainText("1 of 22 posted", { timeout: 20_000 });
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "light" });
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "dark" });

  // End with the confirmation: the summary shows the count, and Start again begins a new run.
  await page.getByRole("button", { name: "End challenge" }).click();
  const confirm = page.getByRole("alertdialog", { name: "End this challenge?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "End challenge" }).click();
  await expect(page.getByRole("heading", { name: "Challenge ended" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
  await expect(card(page)).toContainText("Not started", { timeout: 20_000 });
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(page.getByRole("button", { name: "End challenge" })).toBeVisible({ timeout: 30_000 });
  await expect(card(page)).toContainText("0 of 22 posted", { timeout: 20_000 });
  expect((await page.request.get("/api/challenge")).ok()).toBe(true);
});

test("the challenge works on a phone and posting twice is safe", async ({ page }) => {
  expect((await page.request.post("/api/challenge", { data: {} })).status()).toBe(201);
  expect((await page.request.post("/api/challenge", { data: {} })).status()).toBe(409);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/challenge");
  await expect(page.getByRole("button", { name: "End challenge" })).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalScroll(page);
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "light" });
  await axeCheck(page);
  await page.getByRole("button", { name: "End challenge" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
