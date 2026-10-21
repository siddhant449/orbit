import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const themes = [
  { name: "day", colorScheme: "light" },
  { name: "night", colorScheme: "dark" },
] as const;

/**
 * Saves `<screen>-{1440,390}-{day,night}.png` under SHOTS_DIR. Does nothing unless SHOTS=1, so ordinary runs stay
 * fast. Night print is reached with `emulateMedia`, which next-themes follows because the theme is "system".
 */
export async function captureSet(page: Page, screen: string) {
  if (process.env.SHOTS !== "1") return;
  const dir = process.env.SHOTS_DIR;
  if (!dir) throw new Error("SHOTS=1 needs SHOTS_DIR to be set");
  await mkdir(dir, { recursive: true });
  for (const { width, height } of viewports) {
    for (const { name, colorScheme } of themes) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      await expect(page.locator("html")).toHaveClass(colorScheme === "dark" ? /(^|\s)dark(\s|$)/ : /^((?!\bdark\b).)*$/);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: path.join(dir, `${screen}-${width}-${name}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  }
}

/** Fails the test on any serious or critical axe violation, listing the rules and the first nodes. */
export async function axeCheck(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = blocking
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 3).map((n) => `  ${n.target.join(" ")}\n  ${n.failureSummary}`).join("\n")}`)
    .join("\n\n");
  expect(blocking, report).toEqual([]);
}

/** The page must not scroll sideways: `documentElement.scrollWidth <= innerWidth`. */
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `scrollWidth ${scrollWidth} exceeds innerWidth ${innerWidth}`).toBeLessThanOrEqual(innerWidth);
}
