import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/** Carousel save (O7): create, autosave into /posts/carousel/<id>, reload shows it, it appears on /posts with a badge. */
const email = process.env.E2E_CLERK_USER_EMAIL;
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.setTimeout(180_000);

test.afterEach(async ({ page }) => {
  const res = await page.request.get("/api/carousels").catch(() => null);
  const list = res?.ok() ? ((await res.json()) as { carousels: { id: string }[] }).carousels : [];
  for (const c of list) await page.request.delete(`/api/carousels/${c.id}`).catch(() => {});
});

test("a new carousel saves, reopens by URL and shows on the posts board", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/posts/carousel/new");
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("orbit-carousel-draft")) localStorage.removeItem(k);
  });
  await page.reload();

  await page.getByLabel("Post or topic").fill("Most founders build a proof of concept when they need a minimum viable product.");
  await page.getByRole("button", { name: "Generate slides" }).click();
  await expect(page.locator("[data-slide-row]")).toHaveCount(5, { timeout: 30_000 });

  await page.getByLabel("Slide 1 title").fill("Saved carousel headline");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/posts\/carousel\/[a-z0-9]+$/, { timeout: 15_000 });
  await expect(page.getByTestId("carousel-save-note")).toContainText("Saved to your posts");
  const id = new URL(page.url()).pathname.split("/").pop()!;

  // An edit autosaves.
  await page.getByLabel("Slide 1 title").fill("Saved carousel headline v2");
  await expect.poll(async () => (await (await page.request.get(`/api/carousels/${id}`)).json()).revision, { timeout: 15_000 }).toBeGreaterThan(1);

  await page.reload();
  await expect(page.locator("[data-slide-row]")).toHaveCount(5);
  await expect(page.getByLabel("Slide 1 title")).toHaveValue("Saved carousel headline v2");

  await page.goto("/posts");
  const card = page.getByRole("link", { name: /Saved carousel headline v2/ }).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Carousel");
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/posts/carousel/${id}$`));
});
