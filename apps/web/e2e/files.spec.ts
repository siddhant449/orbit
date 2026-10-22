import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * File storage (F4 L1) through the real app: upload a PNG, load it by its public URL in an <img>, fetch it by id,
 * refuse a ZIP disguised as a PNG, delete it. The dev server uses the local disk adapter (never the hosted bucket).
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.setTimeout(120_000);

const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("upload, render by URL, fetch by id, reject a fake image, delete", async ({ page }) => {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");

  const uploaded = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.set("file", new File([bytes], "dot.png", { type: "image/png" }));
    const res = await fetch("/api/files", { method: "POST", body: form });
    return { status: res.status, body: await res.json() };
  }, TINY_PNG);
  expect(uploaded.status).toBe(201);
  const { id, url } = uploaded.body as { id: string; url: string };
  expect(url).toMatch(/^\/api\/files\/public\/p\//);

  // The image renders from its public URL.
  const loaded = await page.evaluate(
    (src) =>
      new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error("image failed to load"));
        img.src = src;
      }),
    url,
  );
  expect(loaded).toEqual({ w: 1, h: 1 });

  const byId = await page.request.get(`/api/files/${id}`);
  expect(byId.status()).toBe(200);
  expect(byId.headers()["content-type"]).toBe("image/png");

  const fake = await page.evaluate(async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], "zip.png", { type: "image/png" }));
    return (await fetch("/api/files", { method: "POST", body: form })).status;
  });
  expect(fake).toBe(415);

  expect((await page.request.delete(`/api/files/${id}`)).status()).toBe(204);
  expect((await page.request.get(`/api/files/${id}`)).status()).toBe(404);
});
