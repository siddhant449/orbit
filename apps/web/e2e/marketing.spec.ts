import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Marketing is served from the app origin: signed out, "/" is REWRITTEN to /welcome (the URL stays "/"), the nav has
 * exactly one action (Sign in), and /privacy and /terms are public. Signed in, "/" is the app home.
 */
test.setTimeout(180_000);

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('"/" shows the marketing hero with only a Sign in nav action, URL unchanged', async ({ page }) => {
    await page.goto("/");
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Put your");
    const header = page.getByRole("banner");
    await expect(header.getByRole("link")).toHaveCount(2); // logo + Sign in
    await expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    await expect(header.getByRole("link", { name: "Get started" })).toHaveCount(0);
    await expect(page.locator("main [data-placeholder]").first()).toBeAttached();
    await expect(page.locator('footer a[href="/privacy"]')).toHaveCount(1);
    await expect(page.locator('a[href^="http://localhost:4321"]')).toHaveCount(0);
  });

  test("/privacy and /terms load without signing in", async ({ page }) => {
    for (const [path, title] of [["/privacy", "Privacy"], ["/terms", "Terms"]] as const) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    }
  });

  test("other app routes still go to sign-in", async ({ page }) => {
    await page.goto("/posts");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  // Reduced motion + networkidle, as the old marketing suite: axe must not sample a reveal mid-animation.
  for (const width of [1440, 390]) {
    test(`/welcome at ${width}: axe has no serious or critical issues, no horizontal scroll`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto("/welcome", { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await axeCheck(page);
    });
  }
});

test.describe("signed in", () => {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");

  test('"/" is the app home, not the marketing page', async ({ page }) => {
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email! });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /What are we putting out there\?/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  });
});
