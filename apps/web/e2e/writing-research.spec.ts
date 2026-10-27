import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Writing engine W9: "this week" requests are researched through dated sources inside a window that is never widened;
 * items outside it are listed as excluded, an invented URL is dropped, the post names only researched dates and ends with a
 * Sources line. Kleo evidence: L5 (dated primary sources, exclusions, `Sources:` in the post), L13 (old results reused).
 * Mock model and the frozen fakeResearchProvider fixture: no search is paid for.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(150_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const REQUEST = "Write a short post about what happened in AI this week for small agencies";

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

test("a this-week request shows a dated research step, an exclusion, and a post with researched dates and a Sources line", async ({ page }) => {
  await ask(page, REQUEST);
  const card = page.locator("[data-research-card]");
  await expect(card).toBeVisible({ timeout: 40_000 });
  await expect(card.locator("[data-research-window]")).not.toBeEmpty();
  const items = card.locator("[data-research-item]");
  // The invented URL is dropped, the stale item is excluded: Monday..today holds the first one or two items.
  expect(await items.count()).toBeGreaterThanOrEqual(1);
  expect(await items.count()).toBeLessThanOrEqual(2);
  await expect(card.locator("[data-research-excluded]")).toContainText("Excluded: 1");
  await expect(card).not.toContainText("invented.example");
  await expect(card).not.toContainText("unconfirmed rumour");
  // The stale item is only listed under Excluded, never among the dated items.
  await expect(items.filter({ hasText: "Quill" })).toHaveCount(0);

  const [dayText] = ((await items.first().textContent()) ?? "").match(/^\d{1,2} [A-Z][a-z]{2}/) ?? [];
  expect(dayText).toBeTruthy();
  const [day, mon] = dayText!.split(" ") as [string, string];
  const month = MONTHS.find((m) => m.startsWith(mon))!;

  const panel = page.getByRole("dialog", { name: "MVP versus POC" });
  const text = panel.locator("[data-post-text]");
  await expect(text).toContainText(`${day} ${month}`, { timeout: 40_000 });
  // The post streams in: read it once the Sources line is complete.
  await expect(text).toContainText("https://northwind.example/models");
  const raw = (await text.textContent()) ?? "";
  expect(raw).toMatch(/\n\nSources: Northwind Labs \(\d{1,2} [A-Z][a-z]{2}\) https:\/\/northwind\.example\/models$/);
  expect(raw).not.toContain("quill.example");
  expect(raw).not.toContain("invented.example");
});

test("with web search off the reply says so and no research step appears", async ({ page }) => {
  await ask(page, "Hello there");
  await expect(page.locator('[data-message="assistant"]').last()).toBeVisible({ timeout: 30_000 });
  const toggle = page.getByRole("button", { name: "Web search" });
  if ((await toggle.getAttribute("aria-pressed")) === "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill(REQUEST);
  await box.press("Enter");
  const reply = page.locator('[data-message="assistant"]').last();
  await expect(reply).toContainText("Web search is off", { timeout: 40_000 });
  await expect(page.locator("[data-research-card]")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
