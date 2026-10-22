import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Ideas (screens.md B11): "Generate this week's ideas" against the scripted mock (packages/agent/src/mock.ts
 * SCRIPTED_IDEAS); a regenerate avoids the ideas already shown; "Draft this" links home with `?prompt=` (ruling A22).
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

test("generates this week's ideas and drafts one in a new chat", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/ideas");
  await expect(page.getByRole("heading", { level: 1, name: "For you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing generated this week yet" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Built from" })).toBeVisible();
  await axeCheck(page);
  await shot(page, "empty-1440-dark");

  // Pick 3 with the keyboard, then generate.
  await page.getByRole("radio", { name: "5" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "3" })).toBeChecked();
  await page.getByRole("button", { name: "Generate this week's ideas" }).click();
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(3, { timeout: 30_000 });
  await expect(cards.first().getByRole("heading", { name: FIRST_TITLE })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate new ideas" })).toBeEnabled();
  await page.waitForTimeout(1200);
  await axeCheck(page);
  await shot(page, "1440-dark");

  // Five, in light.
  await page.getByRole("radio", { name: "5" }).click();
  await page.getByRole("button", { name: "Generate new ideas" }).click();
  await expect(cards).toHaveCount(5, { timeout: 30_000 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(1200);
  await axeCheck(page);
  await shot(page, "1440-light");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await expectNoHorizontalScroll(page);
  await shot(page, "390-dark");
  await page.setViewportSize({ width: 1440, height: 900 });

  // Draft this (ruling A22): a link home with the idea in ?prompt=; the merge wires it to a prefilled composer that is
  // never auto-sent. The regenerate avoided the three ideas already shown, so the first card is a new one.
  await expect(cards.first().getByRole("heading", { name: FIRST_TITLE })).toHaveCount(0);
  const draft = cards.first().getByRole("link", { name: "Draft this" });
  const href = (await draft.getAttribute("href"))!;
  expect(href.startsWith("/?prompt=")).toBe(true);
  const prompt = decodeURIComponent(href.slice("/?prompt=".length));
  expect(prompt).toMatch(/^Draft a LinkedIn post from this idea: /);
  expect([...prompt].length).toBeLessThanOrEqual(2000);
  await draft.click();
  await expect(page).toHaveURL(/\/\?prompt=/);
  expect(created.size).toBe(0);

  // Back on Ideas, this tab still has the last set (no regeneration needed).
  await page.goto("/ideas");
  await expect(cards).toHaveCount(5);
});

test("the library screens show honest empty states", async ({ page }) => {
  for (const [route, title] of [
    ["/inspiration", "Swipe file"],
    ["/following", "Following"],
    ["/templates", "Hooks"],
    ["/saves", "All saves"],
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
