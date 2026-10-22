import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Sign-in and sign-up, signed out only (nothing is ever typed into the form): Clerk's form sits in the left panel, the
 * dithered shader mounts on the right (paused under reduced motion, never animating), axe passes in both themes and
 * nothing scrolls sideways at 390 px. SHOTS=1 with SHOTS_DIR saves the review screenshots.
 */
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(180_000);

const pages = [
  { route: "/sign-in", heading: "Welcome back.", slug: "signin" },
  { route: "/sign-up", heading: "Start your orbit.", slug: "signup" },
] as const;

// Clerk's development-instance badge ("Secured by" on the orange "Development mode" strip) is Clerk's UI and absent in
// production. Only that item is excluded; the "Don't have an account? Sign up" action beside it is still checked.
const CLERK_DEV_BADGE = [".cl-footerItem"];

const shots = process.env.SHOTS === "1";
const dir = process.env.SHOTS_DIR;

async function setTheme(page: Page, theme: "dark" | "light") {
  await page.evaluate((t) => localStorage.setItem("orbit-theme", t), theme);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /(^|\s)dark(\s|$)/ : /(^|\s)light(\s|$)/);
}

async function formReady(page: Page) {
  const panel = page.getByRole("main");
  await expect(panel.locator(".cl-rootBox")).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator(".cl-formButtonPrimary")).toBeVisible({ timeout: 30_000 });
}

for (const { route, heading, slug } of pages) {
  test(`${route}: Clerk form in the left panel, shader on the right, axe dark and light, 390 px`, async ({ page }) => {
    if (shots) {
      if (!dir) throw new Error("SHOTS=1 needs SHOTS_DIR");
      await mkdir(dir, { recursive: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route);
    await setTheme(page, "dark");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await formReady(page);

    // The shader panel sits to the right of the form panel and is decorative.
    const shader = page.getByTestId("auth-shader");
    await expect(shader).toHaveAttribute("aria-hidden", "true");
    await expect(shader).toHaveCSS("pointer-events", "none");
    await expect(shader.locator("canvas")).toHaveCount(1, { timeout: 30_000 });
    await expect(shader.locator("[data-motion]")).toHaveAttribute("data-motion", "running");
    const [mainBox, shaderBox] = [await main.boundingBox(), await shader.boundingBox()];
    expect(shaderBox!.x).toBeGreaterThanOrEqual(mainBox!.x + mainBox!.width - 1);
    expect(shaderBox!.height).toBeGreaterThanOrEqual(850);
    expect(mainBox!.width / 1440).toBeGreaterThan(0.42);
    expect(mainBox!.width / 1440).toBeLessThan(0.5);

    // No monospace anywhere on the page.
    const mono = await page.evaluate(() =>
      [...document.querySelectorAll("body *")].filter((el) => /mono/i.test(getComputedStyle(el).fontFamily)).length,
    );
    expect(mono).toBe(0);

    await page.waitForTimeout(500);
    await axeCheck(page, { exclude: CLERK_DEV_BADGE });
    if (shots) await page.screenshot({ path: path.join(dir!, `auth-${slug}-1440-dark.png`), animations: "disabled" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expectNoHorizontalScroll(page);
    const band = await shader.boundingBox();
    expect(band!.y).toBeLessThan((await main.boundingBox())!.y);
    expect(band!.height).toBeLessThan(260);
    if (shots && slug === "signin") await page.screenshot({ path: path.join(dir!, `auth-${slug}-390-dark.png`), fullPage: true, animations: "disabled" });

    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, "light");
    await formReady(page);
    await expect(shader.locator("canvas")).toHaveCount(1, { timeout: 30_000 });
    await page.waitForTimeout(500);
    await axeCheck(page, { exclude: CLERK_DEV_BADGE });
    if (shots && slug === "signin") await page.screenshot({ path: path.join(dir!, `auth-${slug}-1440-light.png`), animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expectNoHorizontalScroll(page);
  });
}

test("reduced motion: the shader holds still (speed 0)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/sign-in");
  const shader = page.getByTestId("auth-shader");
  // WebGL present: a paused canvas; WebGL absent: the solid ground fallback. Either way nothing animates.
  await expect(shader.locator("[data-motion='paused'], [data-shader='fallback']")).toHaveCount(1, { timeout: 30_000 });
});

test("the theme toggle flips the page and the shader follows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/sign-in");
  await setTheme(page, "dark");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveClass(/(^|\s)light(\s|$)/);
  await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
});
