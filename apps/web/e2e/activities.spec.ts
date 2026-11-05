import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Activities, stored: a goal preset, hand counts with +1 / -1, a to-do ticked into the day strip, and a post marked as
 * posted unlocking "First post" with a bell event. Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the post comes from the scripted mock model");
test.setTimeout(240_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();
const reset = async (page: Page) => expect((await page.request.post("/api/dev/habits", { data: { reset: true } })).ok()).toBe(true);

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

test("goal preset, hand counts, a to-do in the day strip, and a posted post earns First post", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/activities");
  await expect(page.getByRole("heading", { level: 1, name: "Activities" })).toBeVisible();

  // Growth is the default; the Momentum preset changes every number.
  const goals = page.getByRole("region", { name: "This week's goals" });
  await expect(goals).toContainText("Post 5 times");
  await expect(goals).toContainText("Counted by you until LinkedIn is connected");
  await goals.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Weekly goals" });
  await dialog.getByRole("radio", { name: /Momentum/ }).check();
  await dialog.getByRole("button", { name: "Save goals" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(goals).toContainText("Post 3 times");
  await expect(goals).toContainText("25 comments");

  // +1 twice and -1 once leaves 1; it survives a reload.
  const comments = goals.locator('[data-goal="comments"]');
  await comments.getByRole("button", { name: "Add one comment" }).click();
  await expect(comments.locator("[data-count]")).toHaveText("1 / 25");
  await comments.getByRole("button", { name: "Add one comment" }).click();
  await expect(comments.locator("[data-count]")).toHaveText("2 / 25");
  await comments.getByRole("button", { name: "Remove one comment" }).click();
  await expect(comments.locator("[data-count]")).toHaveText("1 / 25");
  await page.reload();
  await expect(page.getByRole("region", { name: "This week's goals" }).locator('[data-goal="comments"] [data-count]')).toHaveText("1 / 25");
  await expect(page.getByRole("region", { name: "This week's goals" })).toContainText("Post 3 times");

  // A to-do made for today (a weekday one on weekdays) ticks into the day strip as 1/1.
  const weekend = [0, 6].includes(new Date().getUTCDay());
  await page.getByRole("button", { name: "+ Add activity" }).click();
  const add = page.getByRole("dialog", { name: "Add activity" });
  await add.getByLabel("Title").fill("Review my analytics");
  await add.getByLabel("Repeats").selectOption(weekend ? "once" : "weekdays");
  await add.getByRole("button", { name: "Add activity" }).click();
  await expect(add).toHaveCount(0);
  const todo = page.getByRole("checkbox", { name: "Review my analytics" });
  await expect(todo).toBeVisible();
  const todayCell = page.locator('[aria-current="date"]');
  await expect(todayCell.locator("[data-strip-count]")).toHaveText("0/1");
  await todo.click();
  await expect(todo).toHaveAttribute("aria-checked", "true");
  await expect(todayCell.locator("[data-strip-count]")).toHaveText("1/1");
  await page.reload();
  await expect(page.locator('[aria-current="date"] [data-strip-count]')).toHaveText("1/1");

  // Write a post with the mock model, open it and mark it as posted.
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Draft a post about MVP vs POC");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  await expect(page.getByRole("dialog", { name: "MVP versus POC" }).locator("[data-post-text]")).toBeVisible({ timeout: 60_000 });
  await page.goto("/posts");
  await page.getByRole("link", { name: /MVP versus POC/ }).first().click();
  await expect(page).toHaveURL(/\/posts\/[^/]+$/);
  const mark = page.getByRole("button", { name: "Mark as posted" });
  await expect(mark).toBeVisible({ timeout: 30_000 });
  await mark.click();
  await expect(page.getByRole("button", { name: "Posted (undo)" })).toBeVisible({ timeout: 20_000 });

  // The badge is unlocked and the bell announces it.
  await page.goto("/activities");
  await page.getByRole("button", { name: "All badges" }).click();
  const badges = page.getByRole("dialog", { name: "Badges" });
  await expect(badges.locator('[data-badge="first-post"]')).toHaveAttribute("data-earned", "true");
  await expect(badges.locator('[data-badge="posts-5"]')).toHaveAttribute("data-earned", "false");
  await expect(badges.locator('[data-badge="posts-5"]')).toContainText("Locked");
  await page.keyboard.press("Escape");
  await expect(badges).toHaveCount(0);
  await expect(page.getByRole("region", { name: "This week's goals" })).toContainText("1 / 3");
  await page.goto("/");
  const bell = page.getByRole("button", { name: /^What's New/ });
  await bell.click();
  await expect(page.getByRole("dialog").locator('[data-event="BADGE_EARNED"]')).toContainText("Badge earned: First post");
  await page.keyboard.press("Escape");

  // Undo takes the post out of the count, but the badge stays.
  await page.goto("/posts");
  await page.getByRole("link", { name: /MVP versus POC/ }).first().click();
  await page.getByRole("button", { name: "Posted (undo)" }).click();
  await expect(page.getByRole("button", { name: "Mark as posted" })).toBeVisible({ timeout: 20_000 });
  await page.goto("/activities");
  await expect(page.getByRole("region", { name: "This week's goals" })).toContainText("0 / 3");
  await page.getByRole("button", { name: "All badges" }).click();
  await expect(page.getByRole("dialog", { name: "Badges" }).locator('[data-badge="first-post"]')).toHaveAttribute("data-earned", "true");
  await page.keyboard.press("Escape");

  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "light" });
  await axeCheck(page);
});

test("activities on a phone, in both themes, with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Reduced motion keeps the entrance fade from blending colours while axe measures contrast.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/activities");
  await expect(page.getByRole("heading", { level: 1, name: "Activities" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  for (const colorScheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme });
    await axeCheck(page);
  }
  // Add activity opens with the keyboard, Esc closes it, and the dialog returns focus to the button.
  const add = page.getByRole("button", { name: "+ Add activity" });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Add activity" })).toBeVisible();
  await axeCheck(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();

  // Edit goals via keyboard: the radios are reachable and Esc closes.
  await page.getByRole("button", { name: "Edit" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Weekly goals" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});
