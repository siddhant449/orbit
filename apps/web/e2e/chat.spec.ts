import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * Chat screen (feature 02, task 7) against the keyword-scripted model. The signed-in user is a real dev profile:
 * every chat created here is deleted afterwards, and no prompt asks the mock to save a memory.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
if (!mock) console.log("chat.spec skipped: run with AI_MOCK_MODEL=1 (and the dev server started with AI_MOCK_MODEL=1)");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(120_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();

// Every chat id the page POSTs is recorded, so cleanup holds even when a test fails before the address changes.
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

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
}

/** Sends from the home composer and waits for the address to become the chat's. Returns the chat id. */
async function startChat(page: Page, text: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Message", { exact: true }).fill(text);
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  return CHAT_URL.exec(page.url())![1]!;
}

const userNotes = (page: Page) => page.locator('[data-message="user"]');
const liveReply = (page: Page) => page.locator('[data-message="assistant"][data-live]');

test("starts on home, shows tool activity, keeps the history, manages the chat from the sidebar", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await page.getByLabel("Message", { exact: true }).fill("Search my knowledge for onboarding notes");
  await page.getByLabel("Message", { exact: true }).press("Enter");

  // The landing composer hands over to the chat in place; the reply is live in the margin.
  await expect(page.getByRole("heading", { name: "What are we writing today?" })).toHaveCount(0);
  await expect(userNotes(page)).toHaveText(["You: Search my knowledge for onboarding notes"]);
  await expect(page.locator("[data-tool-row]").filter({ hasText: "Searched your knowledge" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Here is what I found in your knowledge base.")).toBeVisible();
  await expect(liveReply(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Reply ready.");

  await expect(page).toHaveURL(CHAT_URL);
  const id = CHAT_URL.exec(page.url())![1]!;
  expect(created.has(id)).toBe(true);
  const row = page.getByRole("complementary", { name: "Sidebar" }).locator(`a[href="/chat/${id}"]`);
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-current", "page");
  // The composer keeps focus through the address change.
  await expect(page.getByLabel("Message", { exact: true })).toBeFocused();

  await page.reload();
  await expect(userNotes(page)).toHaveCount(1);
  await expect(page.locator("[data-tool-row]").filter({ hasText: "Searched your knowledge" })).toBeVisible();
  await expect(page.getByText("Here is what I found in your knowledge base.")).toBeVisible();

  await page.waitForTimeout(800);
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "light" });

  // Rename, pin, delete from the row menu.
  const title = (await row.innerText()).trim();
  await page.getByRole("button", { name: `Chat options, ${title}` }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const stamp = Date.now().toString(36);
  await page.getByLabel("Chat title").fill(`Onboarding notes ${stamp}`);
  await page.getByLabel("Chat title").press("Enter");
  await expect(row).toHaveText(`Onboarding notes ${stamp}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Onboarding notes ${stamp}`);

  await page.getByRole("button", { name: `Chat options, Onboarding notes ${stamp}` }).click();
  await page.getByRole("menuitem", { name: "Pin" }).click();
  await expect(page.getByText("Chat pinned")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pinned", level: 3 })).toBeVisible();

  await page.getByRole("button", { name: `Chat options, Onboarding notes ${stamp}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete chat" }).click();
  await expect(page.getByText("Chat deleted")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(`a[href="/chat/${id}"]`)).toHaveCount(0);
});

test("renders markdown safely and streams live", async ({ page }) => {
  await signIn(page);
  const id = await startChat(page, "Show me some markdown");
  await expect(page.getByRole("heading", { name: "Three ways to open the post" })).toBeVisible();

  const guide = page.getByRole("link", { name: "the guide" });
  await expect(guide).toHaveAttribute("href", "https://example.com/guide");
  await expect(guide).toHaveAttribute("rel", "noopener noreferrer");
  await expect(guide).toHaveAttribute("target", "_blank");
  // A javascript: link keeps its text and loses its target.
  await expect(page.getByText("this one")).toBeVisible();
  await expect(page.getByRole("link", { name: "this one" })).toHaveCount(0);
  await expect(page.locator('[data-message="assistant"]').getByText(/^\d+ words$/)).toBeVisible();

  // A second send streams visibly: the reply is live (signal tip, caret) until it ends.
  await page.getByLabel("Message", { exact: true }).fill("More markdown please");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(liveReply(page)).toHaveCount(1);
  await expect(page.locator(".md--streaming")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(liveReply(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoHorizontalScroll(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 720 });

  if (process.env.SHOTS === "1") {
    const dir = process.env.SHOTS_DIR!;
    await mkdir(dir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Three ways to open the post" }).first()).toBeVisible();
    await expect(page.locator(".md h3")).toHaveCount(2);
    await expect(page.locator(".md p.whitespace-pre-wrap")).toHaveCount(0);
    await expect(page.getByRole("complementary", { name: "Sidebar" }).locator(`a[href="/chat/${id}"]`)).toBeVisible();
    await page.waitForTimeout(800);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dir, "chat-complete-1440-day.png"), animations: "disabled" });
  }
  expect(created.has(id)).toBe(true);
});

test("shows 409 recovery: a refused send comes back to the composer, rapid sends make one bubble", async ({ page }) => {
  await signIn(page);
  const id = await startChat(page, "Hello there");
  await expect(page.getByText("Mock reply.")).toBeVisible();

  // The server says another message's turn is still running (a second send while the first runs): the client
  // tells the user, resumes, and hands the refused text back without showing it as sent.
  const stored = (await (await page.request.get(`/api/chat/${id}/messages`)).json()) as { messages: { id: string; role: string }[] };
  const firstId = stored.messages.find((m) => m.role === "user")!.id;
  let refused = 0;
  await page.route(
    (url) => url.pathname === "/api/chat",
    async (route) => {
      if (route.request().method() !== "POST" || refused > 0) return route.fallback();
      refused++;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          code: "chat_turn_active",
          cause: "This chat is still finishing its last reply.",
          activeTurn: { runId: "00000000-0000-4000-8000-000000000000", requestMessageId: firstId },
        }),
      });
    },
  );
  await page.getByLabel("Message", { exact: true }).fill("Second message");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(page.getByText("This chat is still finishing its last reply.")).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Second message");
  await expect(userNotes(page)).toHaveCount(1);
  await expect(userNotes(page).filter({ hasText: "Second message" })).toHaveCount(0);
  // Recovery settles on the stored chat: still one exchange, nothing waiting.
  await expect(page.locator('[data-message="assistant"][data-live]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  await page.unrouteAll({ behavior: "wait" });

  // Pressing Enter twice in a row sends once.
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(page.getByText("Mock reply.")).toHaveCount(2, { timeout: 30_000 });
  await expect(userNotes(page).filter({ hasText: "Second message" })).toHaveCount(1);
  await page.reload();
  await expect(userNotes(page)).toHaveText(["You: Hello there", "You: Second message"]);

  // A refused message (413) goes back to the composer with the server's reason, and no "Try again".
  await page.route(
    (url) => url.pathname === "/api/chat",
    (route) =>
      route.request().method() !== "POST"
        ? route.fallback()
        : route.fulfill({
            status: 413,
            contentType: "application/json",
            body: JSON.stringify({ code: "message_too_long", cause: "That message is too long. Keep it under 200,000 characters." }),
          }),
  );
  await page.getByLabel("Message", { exact: true }).fill("Too long, pretend");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "That message is too long." })).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("Too long, pretend");
  await expect(userNotes(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("New chat while the first reply streams on home starts fresh", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await page.getByLabel("Message", { exact: true }).fill("Give me markdown");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(page.locator(".md--streaming")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("main").getByRole("link", { name: "New chat" }).click();
  await expect(page.getByRole("heading", { name: "What are we writing today?" })).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  expect(created.size).toBe(1);
});

test("stop ends a live reply and keeps what was written", async ({ page }) => {
  await signIn(page);
  await startChat(page, "Hi");
  await expect(page.getByText("Mock reply.")).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill("Write some markdown for me");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(page.locator(".md--streaming")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(liveReply(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(page.locator('[data-message="assistant"]')).toHaveCount(2);
});
