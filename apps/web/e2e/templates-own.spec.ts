import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { axeCheck } from "./helpers/shots";

/**
 * Own templates: create one with a [slot] (shown with "You"), like it, draft a post with it ("Used 1 time"), turn a post
 * into a template with the mock model (the form is prefilled and saves only on confirm), delete with a confirmation. Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(240_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const NAME = "E2E my format";
const created = new Set<string>();
type T = { id: string; title: string; own: boolean };

test.beforeEach(async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) created.add(id);
  });
});
async function wipeOwn(page: Page) {
  const list = (await (await page.request.get("/api/templates?limit=100&sort=newest")).json()) as { items: T[] };
  for (const t of list.items.filter((x) => x.own)) await page.request.delete(`/api/templates/${t.id}`);
}
test.afterEach(async ({ page }) => {
  for (const id of created) await page.request.delete(`/api/chat/${id}`).catch(() => {});
  created.clear();
  await wipeOwn(page);
});

test("create, like, use, save a post as a template, and delete", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await wipeOwn(page);

  // Create: a skeleton without a [slot] is refused; with one it is saved and shown with "You".
  await page.goto("/templates");
  await page.getByRole("button", { name: "+ New template" }).click();
  const form = page.locator("[data-template-form]");
  await form.getByLabel("Name", { exact: true }).fill(NAME);
  await form.getByLabel("Template text").fill("No slot in this one.");
  await expect(form.getByRole("button", { name: "Save template" })).toBeDisabled();
  await form.getByLabel("Template text").fill("The one thing I got wrong about [topic].\n\nI used to [old belief]. Now I [new habit].");
  await expect(form.locator("[data-slot]")).toHaveCount(3);
  await axeCheck(page);
  await form.getByRole("button", { name: "Save template" }).click();
  await expect(form).toHaveCount(0);
  await page.getByLabel("Sort", { exact: true }).selectOption("newest");
  const card = page.locator("[data-template-card]", { has: page.getByText(NAME, { exact: true }) });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.locator("[data-template-own]")).toHaveText(/You/);

  // Like: the count goes to 1 and survives a reload.
  const like = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/like"));
  await card.getByRole("button", { name: `Like ${NAME}` }).click();
  expect((await like).ok()).toBe(true);
  await expect(card.locator("[data-like-count]")).toHaveText("1");
  await expect(card.getByRole("button", { name: `Unlike ${NAME}` })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByLabel("Sort", { exact: true }).selectOption("newest");
  await expect(card.locator("[data-like-count]")).toHaveText("1", { timeout: 20_000 });
  await expect(card.locator("[data-template-used]")).toHaveText("Used 0 times");

  // Use: draft a post with it; the card then says "Used 1 time".
  await card.locator("[data-template-use]").click();
  await expect(page).toHaveURL(/\/\?template=/);
  await expect(page.locator("[data-format-chip]")).toContainText(NAME);
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("create a post on llm");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  const panel = page.locator("[data-options-panel]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.locator("[data-option]", { has: page.locator("[data-suggested]") }).click();
  await expect(page.locator("[data-draft-card]")).toHaveCount(1, { timeout: 60_000 });
  await page.goto("/templates");
  await page.getByLabel("Sort", { exact: true }).selectOption("newest");
  await expect(card.locator("[data-template-used]")).toHaveText("Used 1 time", { timeout: 20_000 });

  // Save as template from the post: the form comes prefilled; nothing is saved until confirmed.
  const before = ((await (await page.request.get("/api/templates?limit=100&sort=newest")).json()) as { items: T[] }).items.filter((t) => t.own).length;
  await page.goto("/posts");
  await page.locator('a[href^="/posts/"]').first().click();
  await page.getByRole("button", { name: "Save as template" }).click();
  await expect(form).toBeVisible({ timeout: 30_000 });
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue("Lesson from a mistake");
  await expect(form.getByLabel("Template text")).toHaveValue(/\[A surprising result in one line\]/);
  await form.getByRole("button", { name: "Cancel" }).click();
  const unchanged = ((await (await page.request.get("/api/templates?limit=100&sort=newest")).json()) as { items: T[] }).items.filter((t) => t.own).length;
  expect(unchanged).toBe(before);
  await page.getByRole("button", { name: "Save as template" }).click();
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.getByRole("button", { name: "Save template" }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(async () => ((await (await page.request.get("/api/templates?limit=100&sort=newest")).json()) as { items: T[] }).items.filter((t) => t.own).length).toBe(before + 1);

  // Delete asks first.
  await page.goto("/templates");
  await page.getByLabel("Sort", { exact: true }).selectOption("newest");
  await card.getByRole("button", { name: `Delete ${NAME}` }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(`Delete ${NAME}?`);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: `Delete ${NAME}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete template" }).click();
  await expect(card).toHaveCount(0, { timeout: 20_000 });
});
