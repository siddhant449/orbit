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

  // Keep today as day 1, then end the sprint through the confirmation.
  await page.getByRole("link", { name: "Keep today as day 1" }).click();
  await expect(page).toHaveURL(/\/challenge\?start=\d{4}-\d{2}-\d{2}$/);
  await page.getByRole("button", { name: "End sprint" }).click();
  await expect(page.getByRole("alertdialog", { name: "End this sprint?" })).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "End sprint" }).click();
  await expect(page).toHaveURL(/\/challenge$/);

  // A start date in the past shows missed days and the catch-up action.
  const past = new Date(Date.now() - 9 * 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/challenge?start=${past}`);
  await expect(page.getByText(/You've missed \d+ days?\.|Keep the chain going\./)).toBeVisible();
  await expect(page.getByText("Day 10/30")).toBeVisible();

  await axeBothThemes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/challenge");
  await captureSet(page, "progress-challenge");
  await page.setViewportSize({ width: 1280, height: 720 });

  // "Draft today's post" opens home and sends the format prompt. The request is stopped before it reaches the
  // server, so the shared test user gets no new chat or draft.
  let sent: { messages?: { parts?: { text?: string }[] }[]; message?: { parts?: { text?: string }[] } } | null = null;
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() === "POST") {
      sent = route.request().postDataJSON();
      await route.abort();
    } else await route.continue();
  });
  await page.getByRole("button", { name: /^Day 1 · / }).click();
  const draft = page.getByRole("link", { name: /Draft (today's|this) post/ });
  const href = await draft.getAttribute("href");
  expect(href).toMatch(/^\/\?draft=[a-z-]+&day=1$/);
  await draft.click();
  await expect.poll(() => sent !== null, { timeout: 20_000 }).toBe(true);
  expect(JSON.stringify(sent)).toContain("Day 1 of my 30-day sprint");
  await expect(page).not.toHaveURL(/draft=/);
});

test("activities: derived streak, goals, milestones, strip and checklist", async ({ page }) => {
  await signIn(page);
  await page.goto("/activities");
  await expect(page.getByRole("heading", { level: 1, name: "Activities" })).toBeVisible();
  for (const name of ["Streak", "This week's goals", "Milestones", /^Getting started/, /^Today \w{3} \d+ \w{3}$/]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByText("Not tracked yet")).toHaveCount(3);
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
  await expect(draft).toHaveAttribute("href", /^\/\?draft=[a-z-]+$/);

  await axeBothThemes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureSet(page, "progress-activities");
});
