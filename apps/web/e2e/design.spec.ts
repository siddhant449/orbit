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
  await expect(page.getByRole("heading", { level: 1, name: "Riso print" })).toBeVisible();
  // next-themes follows the emulated scheme once it has hydrated.
  await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /(^|\s)dark(\s|$)/ : /^((?!\bdark\b).)*$/);
}

// Tailwind's CSS pipeline lowercases hex in custom properties, so compare as upper case: the doc writes them that way.
const token = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toUpperCase(), name);

test("day print tokens", async ({ page }) => {
  await open(page, "light");
  expect(await token(page, "--paper")).toBe("#F7F6F2");
  expect(await token(page, "--surface")).toBe("#FDFCF9");
  expect(await token(page, "--ink")).toBe("#16161D");
  expect(await token(page, "--pink")).toBe("#FF4F9A");
  expect(await token(page, "--blue")).toBe("#2B3FE0");
  expect(await token(page, "--accent")).toBe("#2B3FE0");
  expect(await token(page, "--overprint")).toBe("#6B2C9E");
  expect(await token(page, "--danger")).toBe("#B4261E");
  await expect(page.locator(".text-on-blue").first()).toHaveCSS("color", "rgb(247, 246, 242)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(247, 246, 242)");
});

test("night print tokens: text on every coloured plate is dark", async ({ page }) => {
  await open(page, "dark");
  expect(await token(page, "--paper")).toBe("#121218");
  expect(await token(page, "--ink")).toBe("#ECEAE3");
  expect(await token(page, "--pink")).toBe("#FF6EB0");
  expect(await token(page, "--blue")).toBe("#6B7CFF");
  expect(await token(page, "--overprint")).toBe("#FFB5FF");
  await expect(page.locator(".text-on-blue").first()).toHaveCSS("color", "rgb(22, 22, 29)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(18, 18, 24)");
});

test("display type is Archivo at width 125, the UI face is Hanken Grotesk", async ({ page }) => {
  await open(page, "light");
  const display2 = page.getByTestId("type-display-2");
  await expect(display2).toHaveCSS("font-stretch", "125%");
  await expect(display2).toHaveCSS("font-weight", "800");
  await expect(display2).toHaveCSS("font-family", /^"?Archivo/);
  await expect(page.getByTestId("type-title-1")).toHaveCSS("font-stretch", "112%");
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
  expect(size).toBeGreaterThanOrEqual(40);
  expect(size).toBeLessThan(48);
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
  await expect(paperHex).toContainText("#F7F6F2");
  await page.getByRole("button", { name: "Night" }).click();
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(paperHex).toContainText("#121218");
  await expect(page.getByRole("button", { name: "Night" })).toHaveAttribute("aria-pressed", "true");
});

test("screenshots: 1440 and 390, day and night", async ({ page }) => {
  await open(page, "light");
  await captureSet(page, "design");
});
