import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

/**
 * E2E_CLERK_USER_EMAIL must be a dedicated Clerk dev-instance test user, never a real account: this setup resets it.
 *
 * On a fresh user the first signed-in visit creates the account, its team and a default profile (getAccount ->
 * ensureAccount). After that the user is brought to a known state through the app's own routes and screens: chats
 * left by an aborted run are deleted, "E2E profile …" profiles left by shell.spec are deleted, the default profile is
 * the current one, and memory lines left by memories.spec are deleted. Only one suite may use the test user at a time:
 * shell.spec switches the current profile, which every other spec reads. Specs seed anything else they need themselves (strategy.spec seeds its strategy).
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const E2E_PROFILE = /^E2E profile /;

setup.describe.configure({ mode: "serial" });

setup("clerk testing token", async () => {
  await clerkSetup();
});

setup("test user: account, default profile, no leftovers", async ({ page }) => {
  setup.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
  setup.setTimeout(120_000);

  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  // First visit provisions the account and its default profile.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /What are we putting out there\?/ })).toBeVisible({ timeout: 60_000 });

  // Profiles left by an aborted shell.spec run, deleted from the team settings screen. Deleting the current profile
  // clears the selection, so the account falls back to its oldest profile: the default one.
  await page.goto("/settings/team");
  const leftover = page.getByRole("button", { name: /^Delete E2E profile / });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  while ((await leftover.count()) > 0) {
    const name = ((await leftover.first().getAttribute("aria-label")) ?? "").replace(/^Delete /, "");
    await leftover.first().click();
    await page.getByRole("button", { name: "Delete profile" }).click();
    await expect(page.getByText(`Deleted ${name}`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Delete ${name}`, exact: true })).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Profile menu" })).not.toContainText(E2E_PROFILE);

  // Memory lines left by an aborted memories.spec run ("Runs a … design studio <stamp>"), deleted from the Memories screen.
  await page.goto("/settings/memories");
  await expect(page.getByRole("heading", { level: 1, name: "Memories" })).toBeVisible();
  const staleLine = page.getByRole("button", { name: /^Delete: Runs a (6-person )?design studio [a-z0-9]+$/ });
  while ((await staleLine.count()) > 0) {
    const label = (await staleLine.first().getAttribute("aria-label")) ?? "";
    await staleLine.first().click();
    await page.getByRole("button", { name: "Delete memory" }).click();
    await expect(page.getByText("Memory deleted")).toBeVisible();
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  }

  // Chats left by an aborted run, deleted through the chat API.
  for (;;) {
    const res = await page.request.get("/api/history?limit=100");
    expect(res.ok(), `GET /api/history: ${res.status()}`).toBe(true);
    const { chats } = (await res.json()) as { chats: { id: string }[] };
    if (chats.length === 0) break;
    for (const { id } of chats) {
      const del = await page.request.delete(`/api/chat/${id}`);
      expect(del.ok(), `DELETE /api/chat/${id}: ${del.status()}`).toBe(true);
    }
  }
});
