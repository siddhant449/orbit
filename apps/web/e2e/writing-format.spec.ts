import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * Writing engine W8: a framework or template picked in the composer's Format menu rides on the next message only and
 * steers the draft's structure. Kleo evidence: WQ §2.1-2.2 (selectedFrameworkId / selectedTemplateId sent by the composer,
 * slot skeletons), A2 (match structure to post type), K2 (a numbered list under a colon set-up). Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(120_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();

test.beforeEach(async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) created.add(id);
  });
});
test.afterEach(async ({ page }) => {
  for (const id of created) await page.request.delete(`/api/chat/${id}`).catch(() => {});
  created.clear();
});

test("picking a format shows a chip, rides on the next message only, and shapes the draft", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Hello there");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  await expect(page.getByText("Mock reply.")).toBeVisible({ timeout: 30_000 });

  // 1. Pick a structure from the Format menu.
  await page.getByRole("button", { name: "Format", exact: true }).click();
  await page.getByRole("textbox", { name: "Search formats" }).fill("myth");
  await page.getByRole("option", { name: /Myth, truth, proof/ }).click();
  const chip = page.locator("[data-format-chip]");
  await expect(chip).toContainText("Myth, truth, proof");

  // 2. The request carries selectedFormatId, the draft has a numbered list, and the chip clears.
  const request = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/chat");
  await box.fill("Draft a post about MVP myths");
  await box.press("Enter");
  expect(((await request).postDataJSON() as { selectedFormatId?: string }).selectedFormatId).toBe("myth-truth");
  await expect(chip).toHaveCount(0);
  const panel = page.getByRole("dialog", { name: "MVP versus POC" });
  const post = panel.locator("[data-post-text]");
  await expect(post).toContainText("Three things an MVP actually is", { timeout: 30_000 });
  expect((await post.textContent()) ?? "").toMatch(/\n1\. A test of one risky assumption\n2\. A way to hear/);

  // 3. The next message carries no format.
  const next = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/chat");
  await box.fill("Hello again");
  await box.press("Enter");
  expect(((await next).postDataJSON() as { selectedFormatId?: string | null }).selectedFormatId ?? null).toBeNull();
});
