import { expect, test, type Page } from "@playwright/test";
import { axeCheck, captureSet, expectNoHorizontalScroll } from "./helpers/shots";

// /design is public outside production, so these specs run without signing in. A production build serves a 404
// there (see page.test.tsx), so the whole file is skipped against one.
test.beforeEach(async ({ request }) => {
  const res = await request.get("/design");
  test.skip(res.status() === 404, "/design is not found in production builds");
});

const HEADING = { level: 1, name: "Orbit design system" } as const;

async function open(page: Page, colorScheme: "light" | "dark", width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme });
  await page.goto("/design");
  await expect(page.getByRole("heading", HEADING)).toBeVisible();
  // Contexts start on "Auto" (playwright.config.ts): next-themes follows the emulated scheme once it has hydrated.
  await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /(^|\s)dark(\s|$)/ : /(^|\s)light(\s|$)/);
}

// Tailwind's CSS pipeline lowercases hex in custom properties, so compare as upper case: the doc writes them that way.
const token = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toUpperCase(), name);

test.describe("with no stored theme", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("dark is the default, even when the OS asks for light; Light theme switches and persists", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/design");
    await expect(page.getByRole("heading", HEADING)).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
    expect(await token(page, "--ground")).toBe("#0E0E10");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(14, 14, 16)");
    await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Light theme" }).click();
    await expect(page.locator("html")).toHaveClass(/(^|\s)light(\s|$)/);
    expect(await token(page, "--ground")).toBe("#F5F4F0");
    await expect(page.getByRole("button", { name: "Light theme" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("orbit-theme"))).toBe("light");

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/(^|\s)light(\s|$)/);
    await expect(page.getByRole("button", { name: "Light theme" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "System theme" }).click();
    await expect(page.getByRole("button", { name: "System theme" })).toHaveAttribute("aria-pressed", "true");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test("the no-JS paint is dark", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "light" });
    const page = await context.newPage();
    await page.goto("/design");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(14, 14, 16)");
    await context.close();
  });
});

test("dark and light token values (system §2, with the §2.4 AA substitutions)", async ({ page }) => {
  await open(page, "dark");
  expect(await token(page, "--panel")).toBe("#151517");
  expect(await token(page, "--text")).toBe("#F5F4F0");
  expect(await token(page, "--text-3")).toBe("#828288");
  expect(await token(page, "--accent")).toBe("#4F5FF5");
  expect(await token(page, "--accent-hover")).toBe("#5566F7");
  expect(await token(page, "--accent-text")).toBe("#7C8AFF");
  // Drafting aliases resolve to Orbit tokens until O4.
  await expect(page.locator("body")).toHaveCSS("color", "rgb(245, 244, 240)");
  const swatch = page.locator("section[aria-labelledby='tokens-dark'] [data-token='--ground']");
  await expect(swatch).toContainText("#0E0E10");

  await open(page, "light");
  expect(await token(page, "--ground")).toBe("#F5F4F0");
  // The CSS pipeline may shorten #FFFFFF to #FFF.
  expect(await token(page, "--panel")).toMatch(/^#FFF(FFF)?$/);
  expect(await token(page, "--text-3")).toBe("#6C6C70");
  expect(await token(page, "--accent-text")).toBe("#2E3FE6");
  // The forced-dark card keeps dark values on a light page.
  await expect(swatch).toContainText("#0E0E10");
});

test("type: Bricolage Grotesque with exact axes, Geist for UI", async ({ page }) => {
  await open(page, "dark");
  await expect(page.getByTestId("type-page-title")).toHaveCSS("font-variation-settings", /"opsz" 72, "wdth" 90/);
  await expect(page.getByTestId("type-page-title")).toHaveCSS("font-weight", "460");
  await expect(page.getByTestId("type-display")).toHaveCSS("font-variation-settings", /"opsz" 96, "wdth" 88/);
  await expect(page.getByTestId("type-display")).toHaveCSS("font-size", "112px");
  await expect(page.getByTestId("type-panel-title")).toHaveCSS("font-variation-settings", /"opsz" 48, "wdth" 90/);
  await expect(page.getByTestId("type-stat-xl")).toHaveCSS("font-variation-settings", /"opsz" 96, "wdth" 85/);
  await expect(page.getByTestId("type-display")).toHaveCSS("font-family", /Bricolage/);
  await expect(page.getByTestId("type-body")).toHaveCSS("font-family", /Geist/);
  await expect(page.getByTestId("type-mono-data")).toHaveCSS("font-family", /ui-monospace/);
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
  });
  expect(loaded.some((f) => /Bricolage/.test(f))).toBe(true);
  expect(loaded.some((f) => /Geist/.test(f))).toBe(true);
});

test("components: ring label, segmented radios, one-element buttons", async ({ page }) => {
  await open(page, "dark");
  await expect(page.getByRole("img", { name: "Sprint progress, 2 of 30" })).toHaveCount(2);
  const view = page.getByRole("radiogroup", { name: "View, dark sample" });
  await view.getByRole("radio", { name: "Board" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(view.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
  await expect(view.getByRole("radio", { name: "List" })).toBeFocused();
  await expect(page.locator(".btn__face")).toHaveCount(0);
  // The focus ring is accent text.
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible").first()).toHaveCSS("outline-color", "rgb(124, 138, 255)");
});

test("axe: no serious or critical violations in dark or light", async ({ page }) => {
  await open(page, "dark");
  await page.waitForTimeout(2000);
  await axeCheck(page);
  await open(page, "light");
  await page.waitForTimeout(2000);
  await axeCheck(page);
});

test("no horizontal scroll at 390 px", async ({ page }) => {
  await open(page, "dark", 390, 844);
  await expectNoHorizontalScroll(page);
  await open(page, "light", 390, 844);
  await expectNoHorizontalScroll(page);
});

test("screenshots: 1440 and 390, dark and light", async ({ page }) => {
  await open(page, "dark");
  await page.waitForTimeout(2000);
  await captureSet(page, "design");
});

test.describe("with Light stored", () => {
  test.use({
    // The OS asks for dark; the stored choice must still win on first paint.
    colorScheme: "dark",
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin, localStorage: [{ name: "orbit-theme", value: "light" }] }],
    },
  });

  test("first paint is light: the class and ground are set by DOMContentLoaded, before hydration", async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { __firstPaint: unknown }).__firstPaint = {
          cls: document.documentElement.className,
          bg: getComputedStyle(document.body).backgroundColor,
        };
      });
    });
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    const first = await page.waitForFunction(() => (window as unknown as { __firstPaint?: { cls: string; bg: string } }).__firstPaint);
    const { cls, bg } = (await first.jsonValue()) as { cls: string; bg: string };
    expect(cls).toMatch(/(^|\s)light(\s|$)/);
    expect(bg).toBe("rgb(245, 244, 240)");
  });
});
