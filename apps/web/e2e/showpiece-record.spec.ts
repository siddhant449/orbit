import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Records the showpiece walkthrough (task-r2star-brief.md, Step 3) to SHOTS_DIR/showpiece.webm (+ .mp4 when ffmpeg
 * exists) and saves key frames. Opt in with RECORD=1 so the ordinary serial suite stays fast.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const dir = process.env.SHOTS_DIR ?? path.resolve(__dirname, "../../../.superpowers/sdd/plan-ui-redesign/shots");

test.skip(process.env.RECORD !== "1", "Set RECORD=1 to record the showpiece walkthrough");
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.setTimeout(180_000);
test.use({ viewport: { width: 1440, height: 900 }, video: { mode: "on", size: { width: 1440, height: 900 } } });

const shot = (page: Page, name: string) => page.screenshot({ path: path.join(dir, `showpiece-${name}.png`) });

test("showpiece walkthrough", async ({ page }) => {
  mkdirSync(dir, { recursive: true });
  const video = page.video();

  // 1. Sign in, load home and let the entry sequence play.
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.mouse.move(1100, 620);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What are we writing today?" })).toBeVisible();
  await page.waitForTimeout(1800);
  await shot(page, "1440-day");

  // 2. Move the pointer across the hero and over the nav rows.
  await page.mouse.move(420, 560, { steps: 30 });
  await page.mouse.move(980, 420, { steps: 40 });
  await page.mouse.move(700, 640, { steps: 30 });
  await page.waitForTimeout(300);
  for (const label of ["Posts", "Ideas", "Activities", "Analytics"]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label }).hover();
    await page.waitForTimeout(420);
  }
  await shot(page, "1440-day-nav-hover");

  // 3. Hover the starter tickets.
  for (const label of ["Find ideas", "Draft a post", "Improve a draft", "Review my posts", "Learn the basics"]) {
    await page.getByRole("button", { name: label }).hover();
    await page.waitForTimeout(360);
  }

  // 4. Send is disabled while the composer is empty: hover it, then type and hover again to show the plate press.
  await page.getByRole("button", { name: "Send" }).hover({ force: true });
  await page.waitForTimeout(500);
  await page.getByLabel("Message").click();
  await page.keyboard.type("A lesson from this week: ", { delay: 40 });
  await page.getByRole("button", { name: "Send" }).hover();
  await page.waitForTimeout(500);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await shot(page, "1440-day-send-hover");
  await page.getByLabel("Message").fill("");

  // 5. Command palette.
  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder("Search pages and profiles…")).toBeVisible();
  await page.waitForTimeout(600);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(500);
  await shot(page, "1440-day-palette");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 6. Navigate to memories and back: routes switch instantly (user decision 2026-10-21).
  await page.getByRole("button", { name: "Profile menu" }).hover();
  await page.waitForTimeout(300);
  await page.goto("/settings/memories");
  await expect(page.getByRole("heading", { level: 1, name: "Memories" })).toBeVisible();
  await page.mouse.move(700, 500, { steps: 20 });
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(900);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(700);
  await shot(page, "1440-day-memories");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "New chat" }).click();
  await expect(page.getByRole("heading", { name: "What are we writing today?" })).toBeVisible();
  await page.waitForTimeout(1600);

  // 7. Collapse and expand the sidebar.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.waitForTimeout(900);

  // Night print at 1440.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  await page.mouse.move(900, 560, { steps: 30 });
  await page.waitForTimeout(1200);
  await shot(page, "1440-night");
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(400);

  // 8. 390 × 844: the drawer.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(900);
  await shot(page, "390-day");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.waitForTimeout(800);
  await shot(page, "390-day-drawer");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(600);
  await shot(page, "390-night-drawer");
  await page.getByRole("button", { name: "Close navigation" }).click();
  await page.waitForTimeout(500);
  await shot(page, "390-night");
  await page.waitForTimeout(600);

  await page.close();
  if (video) {
    const webm = path.join(dir, "showpiece.webm");
    await video.saveAs(webm);
    const ffmpeg = ["/home/siddhant/.local/bin/ffmpeg", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"].find((p) => existsSync(p));
    if (ffmpeg) {
      execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", path.join(dir, "showpiece.mp4")]);
    }
  }
});
