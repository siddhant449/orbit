import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Carousel studio (O7, p07 / p20). Runs against the mock model (AI_MOCK_MODEL=1): "Generate slides" returns the
 * scripted five slides. Nothing reaches the database; the spec clears its browser draft at the end.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.setTimeout(180_000);

// Worktrees sit two levels deeper than the main checkout, so the folder is configurable.
const SHOTS = process.env.SHOTS_DIR ?? "../../.superpowers/sdd/ai-core/shots";
const rows = (page: Page) => page.locator("[data-slide-row]");
const rowTitles = (page: Page) => rows(page).locator("button[aria-keyshortcuts]").allInnerTexts();
const clearDraft = (page: Page) => page.evaluate(() => localStorage.removeItem("orbit-carousel-draft"));

test("carousel studio: generate, edit, reorder, export, restore", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/posts/carousel/new");
  await clearDraft(page);
  await page.reload();

  await expect(page.getByRole("heading", { level: 1, name: "New carousel" })).toBeVisible();
  await expect(page.getByText("Not saved yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Attach to post" })).toHaveAttribute("aria-disabled", "true");

  // Generate from a topic (mock model).
  await page.getByLabel("Post or topic").fill("Most founders build a proof of concept when they need a minimum viable product.");
  await page.getByRole("button", { name: "Generate slides" }).click();
  // The first call compiles the route in dev.
  await expect(rows(page)).toHaveCount(5, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Most founders build the wrong thing first, in five slides");
  await expect(page.getByRole("img", { name: /^Slide 1 of 5: Most founders build the wrong thing first/ })).toBeVisible();

  // Edit the active slide: the canvas's name follows.
  await page.getByLabel("Slide 1 title").fill("Founders build the *wrong* thing");
  await page.getByLabel("Supporting line").fill("Here is why.");
  await expect(page.getByRole("img", { name: "Slide 1 of 5: Founders build the wrong thing. Here is why." })).toBeVisible();

  // Add, duplicate, delete.
  await page.getByRole("button", { name: "Add slide" }).click();
  await expect(rows(page)).toHaveCount(6);
  await expect(page.getByLabel("Slide 2 title")).toBeFocused();
  await page.getByLabel("Slide 2 title").fill("Inserted");
  await page.getByRole("button", { name: "Duplicate slide" }).click();
  await expect(rows(page)).toHaveCount(7);
  await page.getByRole("button", { name: "Delete slide" }).click();
  await expect(rows(page)).toHaveCount(6);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows(page)).toHaveCount(7);
  await page.getByRole("button", { name: "Delete slide" }).click();
  await expect(rows(page)).toHaveCount(6);

  // Keyboard reorder: Alt+ArrowDown moves "Inserted" from 2 to 3, focus stays on it.
  const inserted = rows(page).nth(1).locator("button[aria-keyshortcuts]");
  await inserted.focus();
  await page.keyboard.press("Alt+ArrowDown");
  expect((await rowTitles(page))[2]).toContain("Inserted");
  await expect(rows(page).nth(2).locator("button[aria-keyshortcuts]")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(rows(page).nth(1).locator("button[aria-keyshortcuts]")).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "Move slide down" }).click();
  expect((await rowTitles(page))[1]).toContain("Inserted");

  // Design options.
  await page.getByRole("radio", { name: "Square 1:1" }).click();
  await expect(page.locator("[data-slide-canvas]")).toHaveClass(/aspect-square/);
  await page.getByRole("radio", { name: "Portrait 4:5" }).click();
  await page.getByRole("radio", { name: /Mixed/ }).click();
  await expect(page.getByRole("radio", { name: /Mixed/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("switch", { name: "Logo on slides" }).click();
  await expect(page.getByRole("switch", { name: "Logo on slides" })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("switch", { name: "Logo on slides" }).click();

  // Rewrite through the mock replaces the slides (and can be undone).
  await page.getByRole("button", { name: "Fewer words" }).click();
  await expect(rows(page)).toHaveCount(5, { timeout: 15_000 });
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows(page)).toHaveCount(6);

  // Export: a real PDF with one page per slide.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const file = await (await download).path();
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(6);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 1080, height: 1350 });

  // The browser draft survives a reload.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(rows(page)).toHaveCount(6);

  // Accessibility and layout, dark and light; screenshots when SHOTS=1.
  await page.mouse.move(0, 0);
  for (const colorScheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme });
    await axeCheck(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoHorizontalScroll(page);

  if (process.env.SHOTS === "1") {
    await mkdir(SHOTS, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    for (const [w, h, scheme] of [
      [1440, 900, "dark"],
      [1440, 900, "light"],
      [390, 844, "dark"],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/carousel-${w}-${scheme}.png`, fullPage: true, animations: "disabled" });
    }
    await clearDraft(page);
    await page.reload();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${SHOTS}/carousel-empty-1440-dark.png`, fullPage: true, animations: "disabled" });
  }

  await clearDraft(page);
});
