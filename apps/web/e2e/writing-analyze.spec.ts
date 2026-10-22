import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Writing engine W10: analyzePost rates six criteria (the fold and rules ratings come from code), ranks the fixes on the
 * server and keeps cosmetic notes out of the top three. Kleo evidence: L12 (analyzePost's five fixed criteria), L9/L10
 * (the wrong draft rated, then a failed scorecard), EV (f) (a nitpick in Orbit's top three). Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(150_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();
const RULE = "Don't use em dashes";

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

test("a pasted draft with an em dash under 'No em dashes': six criteria, the dash line first, the cosmetic note under Optional", async ({ page }) => {
  try {
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email! });
    await removeRule(page);
    await page.getByRole("region", { name: "Writing preferences" }).getByRole("button", { name: /Add a memory/ }).first().click();
    await page.getByLabel("New memory").fill(RULE);
    await page.getByRole("button", { name: "Add memory" }).click();
    await expect(page.getByText("Memory added")).toBeVisible();

    await page.goto("/");
    const box = page.getByLabel("Message", { exact: true });
    await box.fill("Analyze this:\nStop building the wrong thing.\n\nWe shipped in a week — then waited for users.\n\nPick the harder question first.");
    await box.press("Enter");
    await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });

    const card = page.locator("[data-analysis-card]");
    await expect(card).toBeVisible({ timeout: 40_000 });
    await expect(card).toContainText("Analysis of the draft you pasted");
    await expect(card.locator("[data-criterion]")).toHaveCount(6);
    await expect(card.locator('[data-criterion="voice-rules"]')).toHaveAttribute("data-rating", "needs-work");
    await expect(card.locator("[data-top-fix]").first().locator("blockquote")).toHaveText("We shipped in a week — then waited for users.");
    await expect(card.locator("[data-top-fix]").first()).toContainText("We shipped in a week, then waited for users.");
    // The cosmetic note is folded away under Optional, not in the top fixes.
    const optional = card.locator("details[data-optional]");
    await expect(optional).not.toHaveAttribute("open", "");
    await expect(card.locator("[data-top-fixes]")).not.toContainText("warmer");
    await optional.locator("summary").click();
    await expect(optional).toContainText("The closing line could be a little warmer.");
  } finally {
    for (const id of created) await page.request.delete(`/api/chat/${id}`).catch(() => {});
    created.clear();
    await removeRule(page).catch(() => {});
  }
});
