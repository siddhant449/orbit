import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Writing engine W5: the writer returns blocks that the server renders (lists stay adjacent), and a post that needs facts
 * the user never gave asks for them instead of inventing. Kleo evidence: L1 (asks for missing facts), K1/K8/K9 (adjacent
 * lists, 2-4 line blocks), WQ §6 (O1's one-line blocks), A2 (match structure to post type). Mock model.
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

async function ask(page: Page, text: string) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill(text);
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
}

test("a framework post comes with an adjacent list, and the readout names it", async ({ page }) => {
  await ask(page, "Draft a post about MVP vs POC");
  const panel = page.getByRole("dialog", { name: "MVP versus POC" });
  const text = panel.locator("[data-post-text]");
  await expect(text).toContainText("Build the POC in a week", { timeout: 30_000 });
  const raw = (await text.textContent()) ?? "";
  expect(raw).toContain("- A POC asks: can this work?\n- An MVP asks: will anyone use it?");
  expect(raw).not.toMatch(/- A POC asks: can this work\?\n\n/);
  await expect(panel.getByRole("group", { name: "Post layout" })).toContainText("List");
});

test("a post that needs facts asks for them and creates nothing", async ({ page }) => {
  await ask(page, "Draft a post about my first hire [e2e:needs-facts]");
  const reply = page.locator('[data-message="assistant"]').last();
  await expect(reply).toContainText("Who was your first hire", { timeout: 30_000 });
  await expect(reply).toContainText("What changed for the team after they joined?");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-draft-card]")).toHaveCount(0);
});
