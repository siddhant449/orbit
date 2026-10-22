import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck, captureSet, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Posts board, list and week calendar (screens.md B5 / B6) against a real post written by the scripted mock model.
 * The chat created here is deleted afterwards, which also takes its post off the board.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the post comes from the scripted mock model");
test.setTimeout(180_000);

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
});

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
}

async function startDraft(page: Page): Promise<string> {
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Draft a short LinkedIn post about pricing");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  return CHAT_URL.exec(page.url())![1]!;
}

async function both(page: Page) {
  // Let the view's entrance rise settle so axe reads final colours, not a mid-fade.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  for (const colorScheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme });
    await axeCheck(page);
  }
  await page.emulateMedia({ colorScheme: "dark" });
}

test("board, list and calendar show the real post and honest empty columns", async ({ page }) => {
  await signIn(page);
  const chatId = await startDraft(page);
  const card = () => page.getByRole("main").locator(`a[href="/chat/${chatId}"]`);

  // Board: the post sits in All posts and Draft once the mock has written it.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(async () => {
    await page.goto("/posts");
    await expect(page.getByRole("region", { name: "Board columns" }).locator(`a[href="/chat/${chatId}"]`)).toHaveCount(2, { timeout: 2_000 });
  }).toPass({ timeout: 45_000 });
  await expect(page.getByRole("heading", { level: 1, name: /^Posts \d+$/ })).toBeVisible();
  const draft = page.getByRole("region", { name: "Board columns" }).getByRole("region", { name: /^Draft/ });
  await expect(draft.locator(`a[href="/chat/${chatId}"]`)).toContainText("Draft");
  await expect(page.getByText("Scheduling arrives with LinkedIn publishing.", { exact: false })).toBeVisible();
  await expect(page.getByText("Nothing published yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "All labels" })).toHaveAttribute("aria-disabled", "true");
  await expectNoHorizontalScroll(page);
  await both(page);
  await captureSet(page, "posts-board");

  // Search filters locally.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("Search posts").fill("zzzz-no-such-post");
  await expect(page.getByText("No posts match your search.").first()).toBeVisible();
  await expect(card()).toHaveCount(0);
  await page.getByLabel("Search posts").fill("");

  // Segmented control: List by click, Calendar by arrow key, both reflected in the address.
  await page.getByRole("radio", { name: "List" }).click();
  await expect(page).toHaveURL(/\/posts\?view=list$/);
  await expect(card()).toHaveCount(1);
  await expect(card()).toContainText("v");
  await expectNoHorizontalScroll(page);
  await both(page);
  await captureSet(page, "posts-list");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("radio", { name: "List" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/posts\?view=calendar$/);

  // Calendar: the post at its last-edit hour, labelled as such; the week moves and comes back.
  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  await expect(grid.locator(`a[href="/chat/${chatId}"]`)).toContainText("Last edited");
  await expect(page.getByRole("complementary", { name: /Drafts/ }).locator(`a[href="/chat/${chatId}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/);
  await expect(grid.locator(`a[href="/chat/${chatId}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(/\/posts\?view=calendar$/);
  await expectNoHorizontalScroll(page);
  await both(page);
  await captureSet(page, "posts-calendar");

  // Keyboard: the grid is one tab stop; arrows move to an open slot later this week, Enter plans a post there.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Next week" }).click();
  const first = grid.locator('[data-slot][tabindex="0"]');
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("aria-label", /^Plan a post for /);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/\?prompt=/);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(/^Help me draft a LinkedIn post I plan to publish on \w+day, \d{1,2} \w+ \d{4} at \d{1,2}:00 \(.+\)\. It's about $/);
});
