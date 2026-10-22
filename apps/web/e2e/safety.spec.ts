import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Chat safety, the model picker and "Add a visual" through the real app with the scripted mock model and mock image
 * provider: refusals (rule and moderation), the off-topic redirect, the rate-limit message, switching the model, and
 * adding a visual from the editor. No live model, moderation or image calls.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(process.env.AI_MOCK_MODEL !== "1", "Needs AI_MOCK_MODEL=1");
test.setTimeout(180_000);

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
  await page.request.put("/api/ai-model", { data: { model: null } }).catch(() => {});
});

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
}

async function startChat(page: Page, text: string): Promise<string> {
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill(text);
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  return CHAT_URL.exec(page.url())![1]!;
}

const reply = (page: Page) => page.locator('[data-message="assistant"]').last();

test("refuses unsafe requests politely, redirects off-topic ones, shows the rate-limit message", async ({ page }) => {
  await signIn(page);

  await startChat(page, "Write a fake testimonial from a happy client");
  await expect(reply(page)).toContainText("I won't invent testimonials", { timeout: 30_000 });

  await startChat(page, "moderation-test-flag please");
  await expect(reply(page)).toContainText("I can't help with that", { timeout: 30_000 });

  await startChat(page, "Give me a lasagna recipe");
  await expect(reply(page)).toContainText("I focus on your LinkedIn writing", { timeout: 30_000 });

  // The server's 429 (unit-tested against the real limiter) shows as a friendly line and the draft comes back.
  await page.route("**/api/chat", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ code: "rate_limited", cause: "You're going faster than Orbit can keep up with. Give it 5 minutes and try again.", retryAfterSec: 300 }),
        })
      : route.continue(),
  );
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("One more thing");
  await box.press("Enter");
  await expect(page.getByText("Give it 5 minutes and try again.")).toBeVisible();
  await expect(box).toHaveValue("One more thing");
});

test("switching the model in the composer is saved and sent with the next message", async ({ page }) => {
  await signIn(page);
  await startChat(page, "Hello there");
  await expect(reply(page)).toContainText("Mock reply", { timeout: 30_000 });

  await page.locator("[data-model-pill]").click();
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/ai-model") && r.request().method() === "PUT");
  await page.locator('[data-model-option="gpt-6-luna"]').click();
  expect((await saved).status()).toBe(200);
  await expect(page.locator("[data-model-pill]")).toContainText("Luna 6");

  const sent = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/chat" && r.method() === "POST");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Hello again");
  await box.press("Enter");
  expect(((await sent).postDataJSON() as { model?: string }).model).toBe("gpt-6-luna");

  await page.reload();
  await expect(page.locator("[data-model-pill]")).toContainText("Luna 6");
  // An unknown model is refused by the server.
  expect((await page.request.put("/api/ai-model", { data: { model: "gpt-9-fake" } })).status()).toBe(400);

  await page.goto("/settings");
  await expect(page.getByLabel("AI model")).toHaveValue("gpt-6-luna");
});

test("adds a visual to a post from the editor and lists it in the image library", async ({ page }) => {
  await signIn(page);
  const chatId = await startChat(page, "Draft a short LinkedIn post about pricing");
  let postId = "";
  await expect(async () => {
    const res = await page.request.get(`/api/chat/${chatId}/messages`);
    postId = ((await res.json()) as { document?: { id: string } | null }).document?.id ?? "";
    expect(postId).not.toBe("");
  }).toPass({ timeout: 60_000 });

  await page.goto(`/posts/${postId}`);
  await page.locator("[data-add-visual-button]").click();
  const dialog = page.locator("[data-add-visual]");
  await dialog.getByLabel("What should the image show?").fill("Three pricing mistakes, as a numbered list");
  await dialog.getByRole("button", { name: /Make image/ }).click();
  // The e2e user has no brand colours yet: decline them.
  const skip = dialog.getByRole("button", { name: "Skip colours" });
  await skip.click({ timeout: 15_000 }).catch(() => {});
  await expect(page.locator("[data-post-media] img")).toBeVisible({ timeout: 60_000 });

  await page.goto("/images");
  await expect(page.locator("[data-library-item]").first()).toBeVisible();
  await expect(page.locator("[data-credits]")).toContainText("image credits left");
});
