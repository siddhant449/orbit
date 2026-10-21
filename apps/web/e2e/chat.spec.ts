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
  await expect(page.getByRole("heading", { name: /What are we putting out there\?/ })).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: /What are we putting out there\?/ })).toBeVisible();
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

// The mock writing specialist's post (packages/agent/src/mock.ts SCRIPTED_TITLE / SCRIPTED_DRAFT).
const DRAFT_TITLE = "MVP versus POC";
const DRAFT_LAST = "Build the POC in a week. Ship the MVP to ten real users. Then decide.";

test("drafts a post: streams into the side panel, edits with versions, conflicts keep the user's text", async ({ page }) => {
  await signIn(page);
  const id = await startChat(page, "Draft a short LinkedIn post about pricing");
  const panel = page.getByRole("dialog", { name: DRAFT_TITLE });
  const composer = page.getByLabel("Message", { exact: true });

  // The stream opens the panel without taking focus from the composer, types the draft out, and settles on v1.
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator("[data-post-text]")).toContainText(DRAFT_LAST, { timeout: 10_000 });
  await expect(panel.locator("[data-version-label]")).toContainText("Version 1");
  await expect(panel.locator("[data-char-count]")).toHaveText(/^\d{3} \/ 3,000$/);
  await expect(composer).toBeFocused();
  await expect(page.locator("[data-post-status]")).toHaveText("Your post is ready.");
  await expect(page.locator("[data-draft-card]")).toContainText(DRAFT_TITLE);
  await expect(page.getByText("Your draft is open on the right.")).toBeVisible();

  // Edit, change a word, save: version 2.
  await panel.getByRole("button", { name: "Edit" }).click();
  const editor = panel.getByLabel("Post text");
  await expect(editor).toBeFocused();
  await editor.fill((await editor.inputValue()).replace("in a week", "in a fortnight"));
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved as version 2.")).toBeVisible();
  await expect(panel.locator("[data-version-label]")).toContainText("Version 2");
  await expect(panel.locator("[data-post-text]")).toContainText("in a fortnight");
  await expect(panel.getByRole("button", { name: "Edit" })).toBeFocused();

  // After a reload the page brings the post back: the version list shows v2 (the edit) over v1.
  await expect(page).toHaveURL(`/chat/${id}`);
  await page.reload();
  await expect(panel).toBeVisible();
  await expect(panel.locator("[data-post-text]")).toContainText("in a fortnight");
  await panel.getByRole("radio", { name: "2 versions" }).click();
  await expect(panel.locator("li[data-version]")).toHaveCount(2);
  await expect(panel.locator('li[data-version="2"]')).toContainText("Your edit");
  await expect(panel.locator('li[data-version="2"]')).toContainText("Current");
  await expect(panel.locator('li[data-version="1"]')).toContainText("Written by Orbit");
  await panel.getByRole("radio", { name: "Post" }).click();

  // Another tab saves version 3 meanwhile: our save gets a 409, the user's text stays, and they choose.
  const other = await page.request.patch(`/api/documents/${await docId(page, id)}`, {
    data: { text: "Written in another tab.", expectedVersion: 2 },
  });
  expect(other.status()).toBe(200);
  await panel.getByRole("button", { name: "Edit" }).click();
  await editor.fill("My own version of the post.");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("This post changed. Reloaded the latest version.")).toBeVisible();
  await expect(panel.locator("[data-conflict]")).toContainText("Version 3 was saved while you were editing");
  await expect(editor).toHaveValue("My own version of the post.");
  await panel.getByRole("button", { name: "Save mine as version 4" }).click();
  await expect(page.getByText("Saved as version 4.")).toBeVisible();
  await expect(panel.locator("[data-post-text]")).toHaveText("My own version of the post.");

  // A send waits while an edit is saving.
  await page.route(
    (url) => url.pathname.startsWith("/api/documents/"),
    async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      await new Promise((r) => setTimeout(r, 2000));
      await route.fallback();
    },
  );
  await panel.getByRole("button", { name: "Edit" }).click();
  await editor.fill("My own version of the post, saved slowly.");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await composer.fill("Make it shorter");
  await composer.press("Enter");
  await expect(page.getByText("Saving your edit first.")).toBeVisible();
  await expect(composer).toHaveValue("Make it shorter");
  await expect(page.getByText("Saved as version 5.")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await composer.fill("");

  // A quick link sends a hidden message that names its key and the open version.
  const notes = await userNotes(page).count();
  const sent = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/chat");
  await page.getByRole("group", { name: "Quick actions for this post" }).getByRole("button", { name: "Hook options" }).click();
  const body = (await sent).postDataJSON() as {
    quickLinkKey?: string;
    documentContext?: { version: number };
    message: { metadata?: { hideInUI?: boolean; quickLinkKey?: string } };
  };
  expect(body.quickLinkKey).toBe("hook-variations");
  expect(body.documentContext?.version).toBe(5);
  expect(body.message.metadata).toMatchObject({ hideInUI: true, quickLinkKey: "hook-variations" });
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 30_000 });
  await expect(userNotes(page)).toHaveCount(notes);

  // Restore v1 from the list: a new version 6 with the original text.
  await panel.getByRole("radio", { name: "5 versions" }).click();
  await panel.getByRole("button", { name: "Restore version 1" }).click();
  await expect(page.getByText("Restored version 1 as version 6.")).toBeVisible();
  await expect(panel.locator("[data-post-text]")).toContainText(DRAFT_LAST);

  await page.waitForTimeout(600);
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
  await axeCheck(page);
  await page.emulateMedia({ colorScheme: "light" });

  // Escape (focus inside) closes it; focus goes back to the composer. "Open post" reopens it with focus on its heading.
  await panel.getByRole("button", { name: "Copy post" }).focus();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(composer).toBeFocused();
  await page.locator("header").getByRole("button", { name: "Open post" }).click();
  await expect(panel.getByRole("heading", { name: DRAFT_TITLE })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // Phones: the panel is a modal sheet, opened on request, with no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await page.locator("header").getByRole("button", { name: "Open post" }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: DRAFT_TITLE })).toBeFocused();
  await expectNoHorizontalScroll(page);
  await page.waitForTimeout(500);
  await axeCheck(page);

  if (process.env.SHOTS === "1") {
    const dir = process.env.SHOTS_DIR!;
    await mkdir(dir, { recursive: true });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dir, "task9-panel-390-dark.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const scheme of ["dark", "light"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.reload();
      await expect(panel.locator("[data-post-text]")).toContainText(DRAFT_LAST);
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(dir, `task9-panel-1440-${scheme}.png`), animations: "disabled" });
      await panel.getByRole("button", { name: "Edit" }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(dir, `task9-editor-1440-${scheme}.png`), animations: "disabled" });
    }
    await page.emulateMedia({ colorScheme: "light" });
  }
  expect(created.has(id)).toBe(true);
});

async function docId(page: Page, chatId: string): Promise<string> {
  const res = await page.request.get(`/api/chat/${chatId}/messages`);
  return ((await res.json()) as { document: { id: string } }).document.id;
}
