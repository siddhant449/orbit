import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

// A user in your Clerk development instance, e.g. e2e+clerk_test@example.com.
const email = process.env.E2E_CLERK_USER_EMAIL;

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");

test("signed-in shell: create and switch profiles, save settings", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "What are we writing today?" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Posts" })).toBeVisible();

  const profileName = `E2E profile ${Date.now()}`;
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Add profile" }).click();
  await page.getByLabel("Profile name").fill(profileName);
  await page.getByRole("button", { name: "Add profile" }).click();
  await expect(page.getByText(`Switched to ${profileName}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Profile menu" })).toContainText(profileName);

  await page.goto("/settings");
  await page.getByLabel("Timezone").selectOption("Europe/Berlin");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Timezone")).toHaveValue("Europe/Berlin");

  // Clean up the profile we made so the test can run again.
  await page.goto("/settings/team");
  await page.getByRole("button", { name: `Delete ${profileName}` }).click();
  await page.getByRole("button", { name: "Delete profile" }).click();
  await expect(page.getByText(`Deleted ${profileName}`)).toBeVisible();
});

test("command palette opens with Ctrl+K and navigates", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Search pages and profiles…").fill("templates");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole("navigation", { name: "Ideas" })).toBeVisible();
});
