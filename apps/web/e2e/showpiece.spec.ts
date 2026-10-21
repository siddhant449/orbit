import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck, captureSet, expectNoHorizontalScroll } from "./helpers/shots";

// Task R2★ showpiece: shell + home. Accessible names are load-bearing (riso-system.md section 12).
const email = process.env.E2E_CLERK_USER_EMAIL;
const HEADING = "What are we writing today?";

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");

async function signInHome(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
}

test("home heading keeps its exact accessible name while the letters animate", async ({ page }) => {
  await signInHome(page);
  const heading = page.getByRole("heading", { level: 1, name: HEADING, exact: true });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveAttribute("aria-label", HEADING);
  // The letters are split for the kinetic set-in, each layer hidden from assistive tech.
  expect(await heading.locator(".kinetic__layer").count()).toBe(3);
  await expect(heading.locator(".kinetic__layer").first()).toHaveAttribute("aria-hidden", "true");
  // Interaction-critical controls exist from the first frame.
  await expect(page.getByLabel("Message")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(page.getByRole("list", { name: "Ways to start" }).getByRole("button")).toHaveCount(5);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("no animated canvas, final frames only", async ({ page }) => {
    await signInHome(page);
    await page.mouse.move(600, 400);
    await page.waitForTimeout(1500);
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("[data-dither]")).toHaveCount(0);
    await expect(page.locator(".dither--static")).toHaveCount(1);
    const running = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getTiming().duration as number) > 1).length,
    );
    expect(running).toBe(0);
    await expect(page.locator(".kinetic__letter").first()).toHaveCSS("animation-name", "none");
    // Lenis does not smooth under reduced motion: one wheel tick moves the sheet within a frame.
    await page.goto("/settings/memories");
    const moved = await page.evaluate(async () => {
      const sheet = document.querySelector<HTMLElement>("[data-sheet] .lenis");
      if (!sheet) return "no-lenis";
      return sheet.classList.contains("lenis-smooth") ? "smooth" : "native";
    });
    expect(moved).toBe("native");
  });
});

test("axe: no serious or critical violations on home, day and night", async ({ page }) => {
  await signInHome(page);
  await page.waitForTimeout(1500);
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  await axeCheck(page);
});

test("390 px: no horizontal scroll, drawer opens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInHome(page);
  await page.waitForTimeout(1200);
  await expectNoHorizontalScroll(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoHorizontalScroll(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Posts" })).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("route change: focus moves to the new heading or the main landmark, instantly", async ({ page }) => {
  await signInHome(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Posts" }).click();
  await expect(page).toHaveURL(/\/posts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Posts" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = document.activeElement;
        return a?.tagName === "H1" || a?.tagName === "MAIN";
      }),
    )
    .toBe(true);
  // No page transition: nothing is animating in the sheet after the swap.
  const animating = await page.evaluate(() =>
    document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target;
      return a.playState === "running" && !!target && !!document.querySelector("[data-sheet]")?.contains(target);
    }).length,
  );
  expect(animating).toBe(0);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "New chat" }).click();
  await expect(page.getByRole("heading", { name: HEADING })).toBeVisible();
});

test("sidebar collapses to the rail and expands again", async ({ page }) => {
  await signInHome(page);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Sidebar" }).getByRole("link", { name: "Posts" })).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
});

test("screenshots: 1440 and 390, day and night", async ({ page }) => {
  await signInHome(page);
  await page.waitForTimeout(1600);
  await captureSet(page, "showpiece");
});
