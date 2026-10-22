import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Writing engine W4: the user's own style is compiled from pasted posts or a LinkedIn Shares export. The layout is
 * measured in code; the descriptive parts come from the (mock) extraction. Kleo evidence: WQ §1.3 (import, polling,
 * "unusable until ready"), A3 (ownStyles), A1 (profiles compiled from many posts with measured blocks), D §8.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the extraction runs against the scripted client");
test.setTimeout(120_000);

const post = (n: number) => `Post number ${n} about shipping.\n\nA second block that stays short.\n\n` + "A sentence about work that matters to customers. ".repeat(5);

/** Deletes the profile's own style, if there is one: its Details sheet reveals the id through the request it makes. */
async function removeOwn(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Change writing style" }).click();
  const own = page.getByRole("option", { name: /\(your style\)/ });
  if ((await own.count()) === 0) {
    await page.keyboard.press("Escape");
    return;
  }
  const seen = page.waitForResponse((r) => /\/api\/voice\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === "GET");
  await own.first().getByRole("button", { name: /^Details:/ }).click();
  const id = new URL((await seen).url()).pathname.split("/").pop()!;
  expect((await page.request.delete(`/api/voice/${id}`)).status()).toBe(204);
}

test("pasted posts, then a LinkedIn export, compile the own style; the knowledge base explains what helps", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  try {
    await removeOwn(page);

    // 1. Paste five posts.
    await page.goto("/");
    await page.getByRole("button", { name: "Change writing style" }).click();
    await page.getByRole("option", { name: /Add your style/ }).click();
    const dialog = page.getByRole("dialog", { name: "Add your style" });
    await dialog.getByLabel("Your posts", { exact: true }).fill([1, 2, 3, 4, 5].map(post).join("\n---\n"));
    await dialog.getByRole("button", { name: "Learn my style" }).click();
    await expect(dialog.locator("[data-style-status]")).toContainText("Analysing 5 posts");
    const sheet = page.getByRole("dialog", { name: "Your style" });
    await expect(sheet.locator("[data-style-layout]")).toHaveText(/Hooks ~\d+ characters/, { timeout: 30_000 });
    await expect(sheet.locator("[data-style-reference]")).toContainText("Post number");
    await sheet.getByRole("button", { name: "Close" }).click();

    // 2. Import the Shares export: the same ready state, from the file.
    await page.getByRole("button", { name: "Change writing style" }).click();
    await page.getByRole("option", { name: /Add your style/ }).click();
    await dialog.getByRole("tab", { name: "Import LinkedIn export" }).click();
    await dialog.getByLabel("Shares.csv or the export zip").setInputFiles(path.join(__dirname, "fixtures", "shares-sample.csv"));
    await dialog.getByRole("button", { name: "Learn my style" }).click();
    await expect(dialog.locator("[data-style-status]")).toBeVisible();
    const sheet2 = page.getByRole("dialog", { name: "Your style" });
    await expect(sheet2.locator("[data-style-layout]")).toHaveText(/Hooks ~\d+ characters/, { timeout: 30_000 });
    await expect(sheet2.locator("[data-style-reference]")).toContainText(/refund|email|meeting|invoice|apologise/);
    await sheet2.getByRole("button", { name: "Close" }).click();

    // 3. The knowledge base says what makes drafts better.
    await page.goto("/knowledge-base");
    await page.getByRole("button", { name: /Add/ }).first().click();
    await expect(page.locator("[data-what-helps]").last()).toContainText("What makes drafts better");
    await expect(page.locator("[data-what-helps]").last()).toContainText("A client result with numbers");
  } finally {
    // 4. Cleanup deletes the own style.
    await removeOwn(page).catch(() => {});
  }
});
