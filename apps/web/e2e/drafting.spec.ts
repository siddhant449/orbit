import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Drafting-table rollout gate: every route passes axe (serious / critical) in day and night, has no horizontal scroll
 * at 390 px, and (with SHOTS=1) is captured at 1440 and 390 in both themes as `drafting-<route>-<w>-<theme>.png`.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.setTimeout(420_000);

const appRoutes = [
  "/",
  "/posts",
  "/ideas",
  "/activities",
  "/analytics",
  "/strategy",
  "/inspiration",
  "/following",
  "/templates",
  "/images",
  "/saves",
  "/knowledge-base",
  "/challenge",
  "/settings",
  "/settings/integrations",
  "/settings/memories",
  "/settings/team",
  "/settings/billing",
  "/settings/community",
  "/settings/help",
];
const slug = (route: string) => (route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-"));

test("every route: axe day and night, 390 px, screenshots", async ({ page }) => {
  const shots = process.env.SHOTS === "1";
  const dir = process.env.SHOTS_DIR;
  if (shots && !dir) throw new Error("SHOTS=1 needs SHOTS_DIR");
  if (shots) await mkdir(dir!, { recursive: true });

  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });

  const routes = [...appRoutes, "/design"];
  for (const route of routes) {
    for (const [theme, colorScheme] of [
      ["day", "light"],
      ["night", "dark"],
    ] as const) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.goto(route);
      await expect(page.locator("main h1, h1").first()).toBeVisible();
      await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /(^|\s)dark(\s|$)/ : /^((?!\bdark\b).)*$/);
      await page.waitForTimeout(route === "/" ? 1500 : 700);
      await axeCheck(page);
      if (shots) await page.screenshot({ path: path.join(dir!, `drafting-${slug(route)}-1440-${theme}.png`), fullPage: true, animations: "disabled" });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      await expectNoHorizontalScroll(page);
      if (shots) await page.screenshot({ path: path.join(dir!, `drafting-${slug(route)}-390-${theme}.png`), fullPage: true, animations: "disabled" });
    }
  }
});

test("sign-in: axe day and night, 390 px, screenshots", async ({ browser }) => {
  const shots = process.env.SHOTS === "1";
  const dir = process.env.SHOTS_DIR;
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const [theme, colorScheme] of [
    ["day", "light"],
    ["night", "dark"],
  ] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme });
    await page.goto("/sign-in");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await page.waitForTimeout(800);
    // Clerk's development-instance footer badge ("Secured by", "Development mode") is Clerk's UI and absent in production.
    await axeCheck(page, { exclude: [".cl-footer"] });
    if (shots) await page.screenshot({ path: path.join(dir!, `drafting-sign-in-1440-${theme}.png`), fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expectNoHorizontalScroll(page);
    if (shots) await page.screenshot({ path: path.join(dir!, `drafting-sign-in-390-${theme}.png`), fullPage: true, animations: "disabled" });
  }
  await context.close();
});
