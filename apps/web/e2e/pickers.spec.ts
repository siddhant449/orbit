import { execFileSync } from "node:child_process";
import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { resolveTestDatabaseUrl } from "../../../packages/db/src/test-db";

/**
 * Typed answers to a picker and research that cannot complete. A typed ordinal ("2nd", "3") or a clear label is a pick of
 * that option; any other text is the user's own angle; an angles request always shows an angles panel; and when research
 * fails the post is still written, with a calm step label. Mock model.
 *
 * (Seeding below is shared with writing-ideas.spec.ts.) Writing engine W11: "post ideas" is its own step. The server gives every idea a different piece of the user's material
 * (knowledge item, story, strategy pillar) before anything is written, and the turn ends on a picker: 5 ideas, each with a
 * source badge. Picking one writes the post at once. A task framing ("skip personal details ...") teaches memory nothing.
 * Kleo evidence: L13, A7/WQ §5, EV (b), Q1. Mock model.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the chat runs against the scripted mock model");
test.setTimeout(150_000);

const CHAT_URL = /\/chat\/([0-9a-f-]{36})$/;
const created = new Set<string>();
const items: string[] = [];

async function memoryVersion(page: Page): Promise<number> {
  return ((await (await page.request.get("/api/user-memory")).json()) as { version: number }).version;
}

test.beforeEach(async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) created.add(id);
  });
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
  // The user's own material: two knowledge items, a story in memory and a strategy (the isolated test database).
  const body = (lead: string) => `${lead} ${"The team wrote down what happened, what they changed and what they would keep. ".repeat(10)}`;
  for (const [title, content] of [["Client onboarding teardown", body("We cut onboarding from nine steps to four.")], ["Pricing page experiment", body("A flat price beat tiers in our test.")]]) {
    const res = await page.request.post("/api/knowledge-base", { data: { type: "TEXT", title, content } });
    items.push(((await res.json()) as { item: { id: string } }).item.id);
  }
  await page.request.patch("/api/user-memory", {
    data: { target: "identity/story", content: "- Lost a client by overpromising a deadline in year one\n- Hired a designer before an engineer", expectedVersion: await memoryVersion(page) },
  });
  execFileSync("pnpm", ["--filter", "@brandloop/db", "exec", "tsx", "prisma/dev-seed-strategy.ts", email!], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: resolveTestDatabaseUrl() },
  });
});
test.afterEach(async ({ page }) => {
  for (const id of created) await page.request.delete(`/api/chat/${id}`).catch(() => {});
  created.clear();
  for (const id of items.splice(0)) await page.request.delete(`/api/knowledge-base/${id}`).catch(() => {});
  await page.request.patch("/api/user-memory", { data: { target: "identity/story", content: null, expectedVersion: await memoryVersion(page) } }).catch(() => {});
});


async function askIdeas(page: Page) {
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Give me 5 post ideas for this week");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  const panel = page.locator("[data-options-panel]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator("[data-option]")).toHaveCount(5);
  return panel;
}
const labelOf = async (panel: ReturnType<Page["locator"]>, i: number) =>
  ((await panel.locator("[data-option]").nth(i).locator("[data-option-label]").textContent()) ?? "").replace("Suggested", "").trim();

test("typing 2nd on the ideas picker picks idea 2", async ({ page }) => {
  const panel = await askIdeas(page);
  const label = await labelOf(panel, 1);
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("2nd");
  await box.press("Enter");
  await expect(page.locator('[data-message="user"]').last()).toContainText(label);
  await expect(page.getByRole("dialog", { name: "MVP versus POC" }).locator("[data-post-text]")).toContainText("Build the POC in a week", { timeout: 40_000 });
  await expect(page.locator("[data-draft-card]")).toHaveCount(1);
  await expect(page.locator("[data-options-summary]")).toContainText(`A: ${label}`);
  await expect(page.locator("body")).not.toContainText("paste");
  await page.reload();
  await expect(page.locator("[data-options-summary]")).toContainText(`A: ${label}`);
});

test("typing 3 on an angles panel picks angle 3; own words are the user's angle", async ({ page }) => {
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("create a post on llm");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  const panel = page.locator("[data-options-panel]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const label = await labelOf(panel, 2);
  await box.fill("3");
  await box.press("Enter");
  await expect(page.locator("[data-options-summary]")).toContainText(`A: ${label}`, { timeout: 30_000 });
  await expect(page.getByRole("dialog", { name: "MVP versus POC" }).locator("[data-post-text]")).toContainText("Build the POC in a week", { timeout: 40_000 });

  // A second chat: a custom angle is used as it is typed, and nothing asks the user to paste anything.
  await page.goto("/");
  await box.fill("create a post on llm");
  await box.press("Enter");
  await expect(page.locator("[data-options-panel]")).toBeVisible({ timeout: 30_000 });
  const own = "Make it about why small teams should skip fine-tuning first";
  await box.fill(own);
  await box.press("Enter");
  await expect(page.locator("[data-options-summary]")).toContainText(`A: ${own}`, { timeout: 30_000 });
  await expect(page.locator("[data-draft-card]")).toHaveCount(1, { timeout: 40_000 });
  await expect(page.locator("body")).not.toContainText("paste");
});

test("asking for angles while ideas are shown opens an angles panel", async ({ page }) => {
  await askIdeas(page);
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("give me some angles");
  await box.press("Enter");
  const panels = page.locator("[data-options-panel]");
  await expect(panels.getByRole("heading")).toContainText("Which angle should the", { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText("paste");
  await expect(page.locator("[data-draft-card]")).toHaveCount(0);
});

test("when research fails the post is still written, with a calm step and a sources note", async ({ page }) => {
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Write a short post about what happened in AI this week for small agencies [e2e:research-fails]");
  await box.press("Enter");
  await expect(page).toHaveURL(CHAT_URL, { timeout: 30_000 });
  await expect(page.getByRole("dialog", { name: "MVP versus POC" }).locator("[data-post-text]")).toContainText("Build the POC in a week", { timeout: 60_000 });
  await expect(page.locator("[data-draft-card]")).toHaveCount(1);
  await expect(page.getByText("Live sources were unavailable")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Worked through/ }).first().click();
  await expect(page.getByText("Went ahead without research")).toBeVisible();
  await expect(page.getByText("Couldn't research that")).toHaveCount(0);
  await expect(page.locator("[data-research-card]")).toHaveCount(0);
});
