import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { measurePost } from "@brandloop/agent/client";

/**
 * Writing engine W6: with "No emojis" in the rules, a draft whose first version has an emoji and an over-long block
 * is polished before it is saved, and an edit afterwards still passes. Kleo evidence: A1 finalChecks, L11/L12 (proofread
 * and analyse after drafting), EV run 4 (c) (a 3-sentence paragraph broke a 1-2 sentence rule), WQ §8.3 (validate, retry
 * once with the violations listed). Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(180_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();
const RULE = "No emojis";

test.beforeEach(async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) created.add(id);
  });
});

async function removeRule(page: Page) {
  await page.goto("/settings/memories");
  const del = page.getByRole("button", { name: `Delete: ${RULE}` });
  while ((await del.count()) > 0) {
    await del.first().click();
    await page.getByRole("button", { name: "Delete memory" }).click();
    await expect(page.getByText("Memory deleted").first()).toBeVisible();
    await page.reload();
  }
}

test("a draft with an emoji and a long block is polished before it is saved", async ({ page }) => {
  try {
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email! });
    await removeRule(page);
    await page.getByRole("region", { name: "Writing preferences" }).getByRole("button", { name: /Add a memory/ }).first().click();
    await page.getByLabel("New memory").fill(RULE);
    await page.getByRole("button", { name: "Add memory" }).click();
    await expect(page.getByText("Memory added")).toBeVisible();

    // 1. The first writer output has an emoji and a 5-line block; the saved post has neither.
    await page.goto("/");
    const box = page.getByLabel("Message", { exact: true });
    await box.fill("Draft a post about the wrong thing [e2e:emoji-draft]");
    await box.press("Enter");
    await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
    const panel = page.getByRole("dialog", { name: "MVP versus POC" });
    const post = panel.locator("[data-post-text]");
    await expect(post).toContainText("Pick the harder question first", { timeout: 30_000 });
    const text = (await post.textContent()) ?? "";
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(measurePost(text).maxBlockMobileLines).toBeLessThanOrEqual(3);

    // 2. The steps disclosure says what was fixed.
    await page.getByRole("button", { name: /^Worked through \d+ steps?/ }).first().click();
    await expect(page.locator("[data-step-detail]").first()).toHaveText(/Polished: fixed 2 layout issues/);

    // 3. "Make it shorter" saves version 2, which still passes.
    await box.fill("Make it shorter");
    await box.press("Enter");
    await expect(panel.locator("[data-version-label]")).toContainText("2", { timeout: 30_000 });
    const id = CHAT_URL.exec(page.url())![1]!;
    const docId = (await (await page.request.get(`/api/chat/${id}`)).json().catch(() => ({}))) as { documentId?: string };
    if (docId.documentId) {
      const doc = (await (await page.request.get(`/api/documents/${docId.documentId}`)).json()) as { version: number; text: string };
      expect(doc.version).toBe(2);
      expect(doc.text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(measurePost(doc.text).maxBlockMobileLines).toBeLessThanOrEqual(3);
    }
  } finally {
    for (const id of created) await page.request.delete(`/api/chat/${id}`).catch(() => {});
    created.clear();
    await removeRule(page).catch(() => {});
  }
});
