import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const email = process.env.E2E_CLERK_USER_EMAIL;

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");

test("memories: add, edit, delete a line; import dialog shows the prompt", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/settings/memories");

  // Empty state offers "Add a memory"; otherwise the Identity card does.
  await page.getByRole("button", { name: "Add a memory" }).first().click();
  await page.getByLabel("New memory").fill("Runs a design studio");
  await page.getByRole("button", { name: "Add memory" }).click();
  await expect(page.getByText("Memory added")).toBeVisible();

  await page.reload();
  const row = page.getByRole("button", { name: "Edit: Runs a design studio" });
  await expect(row).toBeVisible();

  if (process.env.SHOTS === "1") {
    const dir = "../../.superpowers/sdd/plan/shots";
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${dir}/memories-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${dir}/memories-390.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await row.click();
  const editor = page.getByLabel("Edit memory");
  await editor.fill("Runs a 6-person design studio");
  await editor.press("Enter");
  await expect(page.getByText("Memory updated")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Edit: Runs a 6-person design studio" })).toBeVisible();

  await page.getByRole("button", { name: "Delete: Runs a 6-person design studio" }).click();
  await page.getByRole("button", { name: "Delete memory" }).click();
  await expect(page.getByText("Memory deleted")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Runs a 6-person design studio")).toHaveCount(0);

  // Import dialog: prompt is shown, then cancel.
  await page.getByRole("button", { name: "Import memories" }).first().click();
  await page.getByRole("button", { name: "How to get your memories" }).click();
  await expect(page.getByTestId("import-prompt")).toContainText("List everything you know about me");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("import-prompt")).toHaveCount(0);
});
