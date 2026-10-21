import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const email = process.env.E2E_CLERK_USER_EMAIL;

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");

test("writing style: search, select, persist; add-your-style validation", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");

  await page.getByRole("button", { name: "Change writing style" }).click();
  await page.getByRole("combobox", { name: "Search writing styles" }).fill("Odalys");
  await expect(page.getByRole("option", { name: /Odalys Brennan/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Callum Strand/ })).toHaveCount(0);

  if (process.env.SHOTS === "1") {
    const dir = "../../.superpowers/sdd/plan/shots";
    await page.getByRole("combobox", { name: "Search writing styles" }).fill("");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${dir}/voice-1440.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${dir}/voice-390.png` });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("combobox", { name: "Search writing styles" }).fill("Odalys");
  }

  await page.keyboard.press("Enter");
  await expect(page.getByText("Writing style: Odalys Brennan")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("group", { name: "Selected writing style" })).toContainText("Odalys Brennan");

  await page.getByRole("button", { name: "Change writing style" }).click();
  await page.getByRole("option", { name: /Add your style/ }).click();
  const post = "x".repeat(210);
  await page.getByLabel("Your posts").fill(`${post}\n---\n${post}`);
  await page.getByRole("button", { name: "Learn my style" }).click();
  await expect(page.getByRole("alert")).toHaveText("Paste at least 3 posts of 200+ characters");
});
