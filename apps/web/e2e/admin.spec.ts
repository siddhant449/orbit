import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The admin AI-usage dashboard through the real app with the scripted mock model. /admin is a plain 404 for everyone
 * who is not an admin. dev:e2e starts the server with ADMIN_EMAILS empty (nobody is an admin); this spec becomes one
 * with the `orbit-e2e-admin` cookie, which the server honours ONLY in mock mode (AI_MOCK_MODEL=1, never in production):
 * a real deployment can only grant admin through ADMIN_EMAILS. The ledger rows come from real mock chat turns.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(process.env.AI_MOCK_MODEL !== "1", "Needs AI_MOCK_MODEL=1");
test.setTimeout(180_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const PAUSED = "AI is paused for your account. Contact support.";
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
async function becomeAdmin(page: Page) {
  await page.context().addCookies([{ name: "orbit-e2e-admin", value: "1", url: new URL(page.url()).origin }]);
}
async function startChat(page: Page, text: string) {
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill(text);
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
}
const row = (page: Page) => page.locator(`[data-user-row="${email}"]`);

test("/admin is a 404 for signed-out visitors and for signed-in users who are not admins", async ({ page, browser }) => {
  const anon = await browser.newContext();
  const res = await anon.request.get("/admin", { maxRedirects: 0 });
  expect(res.status()).toBe(404);
  await anon.close();

  await signIn(page);
  const signedIn = await page.goto("/admin");
  expect(signedIn?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "AI usage" })).toHaveCount(0);
});

test("the dashboard shows totals, the chart and the user table; cap and block persist; a blocked user sees the paused message", async ({ page }) => {
  await signIn(page);
  await becomeAdmin(page);

  // Two real mock turns put rows in the ledger.
  await startChat(page, "Hello there, admin spec");
  await expect(page.locator('[data-message="assistant"]').last()).toContainText("Mock reply", { timeout: 30_000 });
  await startChat(page, "Give me three post ideas");
  await expect(page.locator('[data-message="assistant"]').last()).toBeVisible({ timeout: 30_000 });

  try {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "AI usage" })).toBeVisible();
    await expect(page.getByText("Costs are Orbit's estimates")).toBeVisible();
    // Totals, the chart and the by-feature table (ledger writes are batched, so poll the page).
    await expect(async () => {
      await page.reload();
      await expect(page.locator("[data-admin-features]").getByRole("rowheader", { name: "Chat" })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.locator("[data-admin-totals] [data-total]")).toHaveCount(3);
    await expect(page.locator("[data-total='Today (UTC)']")).not.toHaveText("$0.00");
    await expect(page.locator('[data-chart="spend"] svg[role="img"]')).toBeVisible();
    await expect(page.locator('[data-chart="spend"] rect[data-bar="chat"]').first()).toBeAttached();

    // The test user's row has real cost and tokens; the breakdown names the feature and model.
    await expect(row(page)).toBeVisible();
    await expect(row(page)).toContainText("tok");
    await row(page).getByRole("link", { name: "Breakdown" }).click();
    await expect(page.locator("[data-admin-breakdown]")).toContainText("Chat");
    await expect(page.locator("[data-admin-breakdown]")).toContainText("mock-chat");

    // Search narrows the table.
    await page.getByLabel("Search users by name or email").fill("definitely-nobody-matches");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("No users match.")).toBeVisible();
    await page.goto("/admin");

    // Edit the cap: saved, and still there after a reload.
    const cap = row(page).getByRole("textbox", { name: /Daily cap in dollars/ });
    await cap.fill("0.75");
    await row(page).getByRole("button", { name: "Save" }).click();
    await expect(row(page).getByRole("status")).toHaveText("Cap saved");
    await page.reload();
    await expect(row(page).getByRole("textbox", { name: /Daily cap in dollars/ })).toHaveValue("0.75");
    // A bad amount is refused with a message.
    await row(page).getByRole("textbox", { name: /Daily cap in dollars/ }).fill("lots");
    await row(page).getByRole("button", { name: "Save" }).click();
    await expect(row(page).getByRole("status")).toContainText("Enter a dollar amount");

    // Block AI: persists across a reload ...
    await row(page).getByRole("switch", { name: /Block AI for/ }).click();
    await expect(row(page).getByRole("status")).toHaveText("AI paused");
    await page.reload();
    await expect(row(page).getByRole("switch", { name: /Block AI for/ })).toHaveAttribute("aria-checked", "true");

    // ... and the blocked user's chat shows the paused message, with no reply.
    await page.goto("/");
    const box = page.getByLabel("Message", { exact: true });
    await box.fill("This should be refused");
    await box.press("Enter");
    await expect(page.getByText(PAUSED)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Mock reply")).toHaveCount(0);
  } finally {
    // Leave the shared test user unblocked and on the default cap, whatever happened above.
    await page.goto("/admin");
    await page.waitForLoadState("networkidle"); // hydrated, so the controlled inputs take what is typed
    const sw = row(page).getByRole("switch", { name: /Block AI for/ });
    if ((await sw.getAttribute("aria-checked")) === "true") {
      await sw.click();
      await expect(row(page).getByRole("status")).toHaveText("AI resumed");
    }
    await expect(async () => {
      await row(page).getByRole("textbox", { name: /Daily cap in dollars/ }).fill("");
      await row(page).getByRole("button", { name: "Save" }).click();
      await expect(row(page).getByRole("status")).toHaveText("Using the default cap", { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
  }
});
