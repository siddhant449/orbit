import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Analytics and Engage (screens.md B7 / B10) in their real, not-connected state: honest copy, a Connect LinkedIn pill
 * to Settings → Integrations, real drafting numbers only, and Engage's "Draft a reply" opening a prefilled chat.
 * Nothing is created, so there is nothing to clean up. SHOTS=1 SHOTS_DIR=… saves insights-<screen>-<w>-<theme>.png.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.setTimeout(180_000);

// Orbit's artboard sample data must never appear (ruling A14).
const ARTBOARD = ["1,842,310", "296,540", "Why we killed the free tier", "Lena Marsh", "Tomás Ferreira", "7 with intent", "Sample data"];

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
}

async function sweep(page: Page, route: string, name: string) {
  const dir = process.env.SHOTS === "1" ? process.env.SHOTS_DIR : undefined;
  if (dir) await mkdir(dir, { recursive: true });
  for (const [theme, colorScheme] of [
    ["dark", "dark"],
    ["light", "light"],
  ] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(1800);
    await axeCheck(page);
    if (dir) await page.screenshot({ path: path.join(dir, `insights-${name}-1440-${theme}.png`), fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expectNoHorizontalScroll(page);
    if (dir && theme === "dark") await page.screenshot({ path: path.join(dir, `insights-${name}-390-${theme}.png`), fullPage: true, animations: "disabled" });
  }
}

test("analytics: not connected, real drafting numbers, connect pill", async ({ page }) => {
  await signIn(page);
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
  await expect(page.getByText("LinkedIn not connected")).toBeVisible();
  for (const label of ["Posts drafted", "Writing streak", "Revisions", "Active days"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("img", { name: /Versions saved per day|Nothing saved/ })).toBeVisible();
  const body = await page.locator("main").innerText();
  for (const s of ARTBOARD) expect(body).not.toContain(s);

  // Range switch is a keyboard-operable radio group.
  const range = page.getByRole("radiogroup", { name: "Range" });
  await range.getByRole("radio", { name: "30 days" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(range.getByRole("radio", { name: "7 days" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("img", { name: /last 7 days/ })).toBeVisible();

  await page.getByRole("link", { name: "Connect LinkedIn" }).first().click();
  await expect(page).toHaveURL(/\/settings\/integrations$/);

  await sweep(page, "/analytics", "analytics");
});

test("engage: empty queue and inbox, tabs, draft a reply opens a prefilled chat", async ({ page }) => {
  await signIn(page);
  await page.goto("/engage");
  await expect(page.getByRole("heading", { level: 1, name: "Engage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your comment queue is empty" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Leads inbox" })).toBeVisible();
  await expect(page.getByText("Orbit never comments for you.")).toBeVisible();
  const body = await page.locator("main").innerText();
  for (const s of ARTBOARD) expect(body).not.toContain(s);

  const tabs = page.getByRole("radiogroup", { name: "Engage view" });
  await tabs.getByRole("radio", { name: "Lists" }).click();
  await expect(page.getByText("use each list as a filter on", { exact: false })).toBeVisible();
  await tabs.getByRole("radio", { name: "Leads inbox" }).click();
  await expect(page.getByText("Leads come from comments on your posts, once LinkedIn is connected.")).toBeVisible();
  await tabs.getByRole("radio", { name: "Comment queue" }).click();

  const draft = page.getByRole("button", { name: "Draft a reply" });
  await expect(draft).toBeDisabled();
  const comment = `How did you measure churn? (e2e ${Date.now()})`;
  await page.getByLabel("Comment to reply to").fill(comment);
  await draft.click();
  // The first visit to "/" compiles on the dev server; allow for it.
  await expect(page).toHaveURL(/\/\?prompt=/, { timeout: 30_000 });
  // The prompt rides in `?prompt=` (≤ 2000 code points, closing quote intact) and pre-fills the home composer.
  const prompt = new URL(page.url()).searchParams.get("prompt") ?? "";
  expect(prompt.startsWith("Help me reply to this comment")).toBe(true);
  expect(prompt).toContain(comment);
  expect(Array.from(prompt).length).toBeLessThanOrEqual(2000);
  expect(prompt.endsWith('"')).toBe(true);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(prompt);
  // Pre-filled, never sent: still on home, no chat started.
  await expect(page).toHaveURL(/\/\?prompt=/);
  // Long pastes are cut with an ellipsis inside the quotes.
  await page.goto("/engage");
  await page.getByLabel("Comment to reply to").fill("word ".repeat(600));
  await page.getByRole("button", { name: "Draft a reply" }).click();
  await expect(page).toHaveURL(/\/\?prompt=/, { timeout: 30_000 });
  const long = new URL(page.url()).searchParams.get("prompt") ?? "";
  expect(Array.from(long).length).toBeLessThanOrEqual(2000);
  expect(long.endsWith('…"')).toBe(true);

  await page.goto("/engage?view=leads");
  await expect(page.getByRole("radio", { name: "Leads inbox" })).toHaveAttribute("aria-checked", "true");

  await sweep(page, "/engage", "engage");
});
