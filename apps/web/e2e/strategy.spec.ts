import { execFileSync } from "node:child_process";
import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const email = process.env.E2E_CLERK_USER_EMAIL;

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");

test.setTimeout(90_000);
test("strategy: sections render, mix sums to 100, tagline edit persists", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");

  execFileSync("pnpm", ["--filter", "@brandloop/db", "exec", "tsx", "prisma/dev-seed-strategy.ts", email!], {
    stdio: "inherit",
  });

  await page.goto("/strategy");
  for (const name of ["Strategy foundation", "Content mix", "Audience balance", "Formats and cadence", "Recurring series"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }

  const values = await page.getByTestId("mix-percent").evaluateAll((els) => els.map((e) => Number((e as HTMLInputElement).value)));
  expect(values).toHaveLength(5);
  expect(values.reduce((a, b) => a + b, 0)).toBe(100);

  // Hovering a segment highlights its legend row.
  const chart = page.getByRole("group", { name: "Content mix chart" });
  await chart.scrollIntoViewIfNeeded();
  const svg = (await chart.boundingBox())!;
  await page.mouse.move(svg.x + svg.width / 2 + 12, svg.y + svg.height * 0.15);
  await expect(page.getByTestId("mix-row").first()).toHaveClass(/bg-surface-sunk/);

  if (process.env.SHOTS === "1") {
    const dir = "../../.superpowers/sdd/plan/shots";
    await page.mouse.move(0, 0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${dir}/strategy-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${dir}/strategy-390.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  const tagline = `Design systems people use ${Date.now()}`;
  await page.getByRole("button", { name: "Edit tagline" }).click();
  await page.getByLabel("tagline", { exact: true }).fill(tagline);
  await page.getByLabel("tagline", { exact: true }).press("Enter");
  await expect(page.getByText("Strategy saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Edit tagline" })).toHaveText(tagline);
});
