import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck, captureSet, expectNoHorizontalScroll } from "./helpers/shots";

const email = process.env.E2E_CLERK_USER_EMAIL;

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.setTimeout(120_000);

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
}

async function axeBothThemes(page: Page) {
  for (const colorScheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme });
    await axeCheck(page);
  }
}

test("sprint: 30-day calendar, day selection, draft link starts a chat with the format", async ({ page }) => {
  await signIn(page);
  await page.goto("/challenge");
  await expect(page.getByRole("heading", { level: 1, name: "30-day sprint" })).toBeVisible();
  await expect(page.getByText("Preview from today.")).toBeVisible();

  const cells = page.getByRole("button", { name: /^Day \d+ · / });
  await expect(cells).toHaveCount(30);

  // Day 1 is today in the preview; when today is a weekend the panel shows the next weekday's format.
  const formatHeading = page.locator("#sprint-format-title");
  await expect(formatHeading).not.toHaveText("");

  // Selecting another post day swaps the format panel.
  const other = page.getByRole("button", { name: /The customer number/ });
  const before = await formatHeading.textContent();
  await other.click();
  await expect(other).toHaveAttribute("aria-pressed", "true");
  await expect(formatHeading).not.toHaveText(before ?? "");

  // Keep today as day 1, then end the sprint through the confirmation. The link carries today in the profile's
  // timezone, which the date maths below starts from.
  const keep = page.getByRole("link", { name: "Keep today as day 1" });
  const today = (await keep.getAttribute("href"))!.match(/start=(\d{4}-\d{2}-\d{2})$/)![1]!;
  await keep.click();
  await expect(page).toHaveURL(new RegExp(`/challenge\\?start=${today}$`));
  await page.getByRole("button", { name: "End sprint" }).click();
  await expect(page.getByRole("alertdialog", { name: "End this sprint?" })).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "End sprint" }).click();
  await expect(page).toHaveURL(/\/challenge$/);

  // A start date in the past shows missed days and the catch-up action.
  const past = new Date(Date.parse(`${today}T00:00:00Z`) - 9 * 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/challenge?start=${past}`);
  await expect(page.getByText(/Pick up where you left off\.|On track\./)).toBeVisible();
  await expect(page.getByText("Day 10/30")).toBeVisible();

  await axeBothThemes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/challenge");
  await captureSet(page, "progress-challenge");
  await page.setViewportSize({ width: 1280, height: 720 });

  // "Draft today's post" prefills the home composer with the day's own format prompt (`/?prompt=`, never auto-sent).
  // The first post day: day 1, or the following Monday when the preview starts on a weekend.
  const firstPost = page.getByRole("button", { name: /^Day \d+ · / }).filter({ hasNotText: "No post planned" }).first();
  const n = (await firstPost.textContent())!.match(/^Day (\d+)/)![1];
  await firstPost.click();
  const title = (await formatHeading.textContent())!;
  const draft = page.getByRole("link", { name: /Draft (today's|this) post/ });
  const href = (await draft.getAttribute("href"))!;
  expect(href).toMatch(/^\/\?prompt=/);
  const prompt = new URL(href, "http://x").searchParams.get("prompt")!;
  expect(prompt).toContain(`Day ${n} of my 30-day sprint`);
  expect(prompt).toContain(title);
  expect([...prompt].length).toBeLessThanOrEqual(2000);
  // Following it pre-fills the home composer and sends nothing (no chat request, still on home).
  let sent = false;
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/chat") sent = true;
  });
  await draft.click();
  await expect(page).toHaveURL(/\/\?prompt=/, { timeout: 30_000 });
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(prompt);
  await page.waitForTimeout(500);
  expect(sent).toBe(false);
  await expect(page).toHaveURL(/\/\?prompt=/);
});

test("activities: derived streak, goals, milestones, strip and checklist", async ({ page }) => {
  await signIn(page);
  await page.goto("/activities");
  await expect(page.getByRole("heading", { level: 1, name: "Activities" })).toBeVisible();
  for (const name of ["Streak", "This week's goals", "Milestones", /^Getting started/, /^Today \w{3} \d+ \w{3}$/]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  // The drafts goal is counted; every other goal row shows a count or says it isn't tracked yet.
  const goals = page.getByRole("list", { name: "This week's goals" }).getByRole("listitem");
  await expect(goals.first()).toContainText(/Draft \d+ posts\s*\d+ \/ \d+/);
  for (const row of await goals.all()) await expect(row).toContainText(/\d+ \/ \d+|Not tracked yet/);
  await expect(page.getByRole("button", { name: "Add activity" })).toHaveAttribute("aria-disabled", "true");

  // Week strip: today is marked, the next week is out of reach, the previous one is not.
  await expect(page.locator('[aria-current="date"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Next week" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.locator('[aria-current="date"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.locator('[aria-current="date"]')).toHaveCount(1);

  await page.getByRole("button", { name: "All badges" }).click();
  await expect(page.getByRole("dialog", { name: "Badges" })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("First draft")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const draft = page.getByRole("region", { name: /^Today / }).getByRole("link", { name: /^Draft( another)?$/ });
  await expect(draft).toHaveAttribute("href", /^\/\?prompt=/);
  expect(new URL((await draft.getAttribute("href"))!, "http://x").searchParams.get("prompt")).toContain("30-day sprint");

  await axeBothThemes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureSet(page, "progress-activities");
});
