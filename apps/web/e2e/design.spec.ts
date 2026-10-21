import { expect, test, type Page } from "@playwright/test";
import { axeCheck, captureSet, expectNoHorizontalScroll } from "./helpers/shots";

// /design is public outside production, so these specs run without signing in. A production build serves a 404
// there (see page.test.tsx), so the whole file is skipped against one.
test.beforeEach(async ({ request }) => {
  const res = await request.get("/design");
  test.skip(res.status() === 404, "/design is not found in production builds");
});

async function open(page: Page, colorScheme: "light" | "dark", width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme });
  await page.goto("/design");
  await expect(page.getByRole("heading", { level: 1, name: "Drafting table" })).toBeVisible();
  // next-themes follows the emulated scheme once it has hydrated.
  await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /(^|\s)dark(\s|$)/ : /^((?!\bdark\b).)*$/);
}

// Tailwind's CSS pipeline lowercases hex in custom properties, so compare as upper case: the doc writes them that way.
const token = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toUpperCase(), name);

test("day tokens: paper, graphite, hairlines, signal", async ({ page }) => {
  await open(page, "light");
  expect(await token(page, "--paper")).toBe("#F3F1EC");
  expect(await token(page, "--surface")).toBe("#FBFAF7");
  expect(await token(page, "--ink")).toBe("#1C1C1C");
  expect(await token(page, "--line")).toBe("#C9C6BF");
  expect(await token(page, "--signal")).toBe("#E5482A");
  expect(await token(page, "--signal-ink")).toBe("#B2351C");
  // Primary actions are graphite, danger is the signal text tone.
  expect(await token(page, "--accent")).toBe("#1C1C1C");
  expect(await token(page, "--danger")).toBe("#B2351C");
  await expect(page.locator(".text-on-ink").first()).toHaveCSS("color", "rgb(243, 241, 236)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(243, 241, 236)");
});

test("night tokens: drafting at night, same signal rule", async ({ page }) => {
  await open(page, "dark");
  expect(await token(page, "--paper")).toBe("#15161A");
  expect(await token(page, "--ink")).toBe("#E8E6E1");
  expect(await token(page, "--line")).toBe("#34363C");
  expect(await token(page, "--signal")).toBe("#E5482A");
  expect(await token(page, "--signal-ink")).toBe("#F0674D");
  await expect(page.locator(".text-on-ink").first()).toHaveCSS("color", "rgb(21, 22, 26)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(21, 22, 26)");
});

test("display type is tight Archivo (width 92), the UI face is Hanken Grotesk", async ({ page }) => {
  await open(page, "light");
  const display2 = page.getByTestId("type-display-2");
  await expect(display2).toHaveCSS("font-stretch", "92%");
  await expect(display2).toHaveCSS("font-weight", "700");
  await expect(display2).toHaveCSS("font-family", /^"?Archivo/);
  await expect(page.getByTestId("type-title-1")).toHaveCSS("font-stretch", "96%");
  await expect(page.getByTestId("type-title-2")).toHaveCSS("font-stretch", "100%");
  await expect(page.getByTestId("type-body")).toHaveCSS("font-family", /^"?Hanken Grotesk/);
  await expect(page.getByTestId("type-caption")).toHaveCSS("font-variant-numeric", "tabular-nums");
  // Both families really loaded, and no monospace face sneaks in.
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family);
  });
  expect(loaded.some((f) => /Archivo/.test(f))).toBe(true);
  expect(loaded.some((f) => /Hanken/.test(f))).toBe(true);
});

test("display samples shrink with the 390 px clamp", async ({ page }) => {
  await open(page, "light", 390, 844);
  const size = await page.getByTestId("type-display-1").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(36);
  expect(size).toBeLessThan(44);
});

test("axe: no serious or critical violations in day or night print", async ({ page }) => {
  await open(page, "light");
  await axeCheck(page);
  await open(page, "dark");
  await axeCheck(page);
});

test("no horizontal scroll at 390 px", async ({ page }) => {
  await open(page, "light", 390, 844);
  await expectNoHorizontalScroll(page);
  await open(page, "dark", 390, 844);
  await expectNoHorizontalScroll(page);
});

test("theme switch flips the tokens and shows the live value", async ({ page }) => {
  await open(page, "light");
  const paperHex = page.getByRole("listitem").filter({ hasText: "--paper" }).first();
  await expect(paperHex).toContainText("#F3F1EC");
  await page.getByRole("button", { name: "Night" }).click();
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(paperHex).toContainText("#15161A");
  await expect(page.getByRole("button", { name: "Night" })).toHaveAttribute("aria-pressed", "true");
});

test("screenshots: 1440 and 390, day and night", async ({ page }) => {
  await open(page, "light");
  await captureSet(page, "design");
});
