import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll } from "./helpers/shots";

/**
 * The post side panel (Task 9 fix round) against the keyword-scripted model: recovery after a dropped stream,
 * unsaved edits that survive closing, and where focus goes. Every chat created here is deleted afterwards; no
 * prompt asks the mock to save a memory.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(120_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
// The mock writing specialist's post (packages/agent/src/mock.ts).
const DRAFT_TITLE = "MVP versus POC";
const DRAFT_LAST = "Build the POC in a week. Ship the MVP to ten real users. Then decide.";
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

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
}

async function startDraft(page: Page): Promise<string> {
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Draft a short LinkedIn post about pricing");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  return CHAT_URL.exec(page.url())![1]!;
}

const panelOf = (page: Page) => page.getByRole("dialog", { name: DRAFT_TITLE });
const caret = (page: Page) => panelOf(page).locator("[data-post-text] > span[aria-hidden]");

test("a stream that drops before the snapshot settles on the saved post", async ({ page }) => {
  await signIn(page);
  // The first reply's stream is cut just before `data-document` (and the closing `data-creating: false`).
  let cut = false;
  await page.route(
    (url) => url.pathname === "/api/chat",
    async (route) => {
      if (route.request().method() !== "POST" || cut) return route.fallback();
      cut = true;
      const res = await route.fetch();
      const body = await res.text();
      const at = body.indexOf('data: {"type":"data-document"');
      expect(at, "the stream carries a data-document part").toBeGreaterThan(0);
      await route.fulfill({ response: res, body: body.slice(0, at) });
    },
  );
  await startDraftOnHome(page);
  const panel = panelOf(page);
  await expect(panel).toBeVisible({ timeout: 30_000 });
  // After the turn ends the panel reloads the saved post: Edit works, no caret, the ready cue was spoken.
  await expect(panel.locator("[data-post-text]")).toContainText(DRAFT_LAST);
  await expect(panel.getByRole("button", { name: "Edit" })).toBeEnabled({ timeout: 15_000 });
  await expect(panel.locator("[data-version-label]")).toContainText("Version 1");
  await expect(caret(page)).toHaveCount(0);
  await expect(page.locator("[data-post-status]")).toHaveText("Your post is ready.");
  await page.unrouteAll({ behavior: "wait" });
});

/** The home composer hands over in place; the address only moves once the first reply ends. */
async function startDraftOnHome(page: Page) {
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Draft a short LinkedIn post about pricing");
  await box.press("Enter");
}

test("unsaved edits survive closing; Cancel asks; focus returns to what opened the panel", async ({ page }) => {
  await signIn(page);
  const id = await startDraft(page);
  const panel = panelOf(page);
  await expect(panel.locator("[data-post-text]")).toContainText(DRAFT_LAST, { timeout: 30_000 });
  await expect(caret(page)).toHaveCount(0);
  await expect(page.locator("[data-post-status]")).toHaveText("Your post is ready.");

  // Close mid-edit: the text is kept and comes back.
  await panel.getByRole("button", { name: "Edit" }).click();
  const editor = panel.getByLabel("Post text");
  await editor.fill("A kept edit.");
  await panel.getByRole("button", { name: "Close post" }).click();
  await expect(panel).toHaveCount(0);
  await page.locator("header").getByRole("button", { name: "Open post" }).click();
  await expect(panel.locator("[data-kept-edit]")).toBeVisible();
  await panel.getByRole("button", { name: "Resume edit" }).click();
  await expect(editor).toHaveValue("A kept edit.");

  // Switching to the versions list and back keeps it too.
  await panel.getByRole("radio", { name: "1 version" }).click();
  await expect(panel.locator("li[data-version]")).toHaveCount(1);
  await panel.getByRole("radio", { name: "Post" }).click();
  await panel.getByRole("button", { name: "Resume edit" }).click();
  await expect(editor).toHaveValue("A kept edit.");

  // Cancel on a changed post asks in the page; Keep editing keeps the text, Discard drops it.
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.locator("[data-discard-confirm]")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await panel.getByRole("button", { name: "Keep editing" }).click();
  await expect(editor).toHaveValue("A kept edit.");
  await panel.getByRole("button", { name: "Cancel" }).click();
  await panel.getByRole("button", { name: "Discard changes" }).click();
  await expect(editor).toHaveCount(0);
  await expect(panel.locator("[data-kept-edit]")).toHaveCount(0);
  await expect(panel.locator("[data-post-text]")).toContainText(DRAFT_LAST);

  // A 409 puts focus on the choice.
  const docId = ((await (await page.request.get(`/api/chat/${id}/messages`)).json()) as { document: { id: string } }).document.id;
  expect((await page.request.patch(`/api/documents/${docId}`, { data: { text: "From another tab.", expectedVersion: 1 } })).status()).toBe(200);
  await panel.getByRole("button", { name: "Edit" }).click();
  await editor.fill("Mine.");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Save mine as version 3" })).toBeFocused();
  await panel.getByRole("button", { name: "Save mine as version 3" }).click();
  await expect(panel.locator("[data-version-label]")).toContainText("Version 3");

  // Opened from the draft card, Escape gives focus back to that button.
  await panel.getByRole("button", { name: "Close post" }).click();
  const cardButton = page.locator("[data-draft-card]").getByRole("button", { name: "Open post" });
  await cardButton.click();
  await expect(panel.getByRole("heading", { name: DRAFT_TITLE })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(cardButton).toBeFocused();

  // Phones: the header's Open post gets focus back, and tapping the overlay keeps an edit.
  await page.setViewportSize({ width: 390, height: 844 });
  const headerButton = page.locator("header").getByRole("button", { name: "Open post" });
  await headerButton.click();
  await expect(panel.getByRole("heading", { name: DRAFT_TITLE })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(headerButton).toBeFocused();
  await headerButton.click();
  await panel.getByRole("button", { name: "Edit" }).click();
  await editor.fill("Kept on a phone.");
  await page.mouse.click(195, 20);
  await expect(panel).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await headerButton.click();
  await panel.getByRole("button", { name: "Resume edit" }).click();
  await expect(editor).toHaveValue("Kept on a phone.");
  expect(created.has(id)).toBe(true);
});
