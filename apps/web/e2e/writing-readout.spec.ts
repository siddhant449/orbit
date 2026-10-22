import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Writing engine W1: the phone layout readout under the post in the side panel, against the keyword-scripted model.
 * Kleo evidence: WQ §6 (measured layout), A1 mobileFormatting (50 characters per line). Every chat created here is deleted.
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

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
}

test("the panel shows the post's phone layout and updates it while editing", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Draft a post about MVP vs POC");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });

  const panel = page.getByRole("dialog", { name: "MVP versus POC" });
  await expect(panel.locator("[data-post-text]")).toContainText("Build the POC in a week", { timeout: 30_000 });

  // The scripted opening line is 79 characters: two lines on a phone, but the promise still sits before "see more".
  const layout = panel.getByRole("group", { name: "Post layout" });
  await expect(layout).toContainText("Hook · 2 lines on mobile");
  await expect(layout).toContainText("3 blocks");
  await expect(layout).toContainText("Fits before see more");

  await panel.getByRole("button", { name: "Edit" }).click();
  const editor = panel.getByLabel("Post text");
  // A short hook is one line.
  await editor.fill("Stop building the wrong thing.\n\nA second block.");
  await expect(layout).toContainText("Hook · 1 line on mobile");
  // A 300-character first paragraph pushes the promise past the fold.
  await editor.fill(`${"Founders keep building proofs of concept. ".repeat(8).trim()}\n\nThe point comes late.`);
  await expect(layout).toContainText("Promise is after the fold");
  await expect(layout).not.toContainText("Fits before see more");
  // A list is named when the post has one.
  await editor.fill("Short hook.\n\nThree checks:\n- one\n- two\n- three\n\nDone.");
  await expect(layout).toContainText("List");
});
