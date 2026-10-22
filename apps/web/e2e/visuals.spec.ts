import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Images (F5) through the real app with the mock provider: generate -> poll -> image renders -> edit -> versions ->
 * revert, plus the safety refusal and credits. The mock provider and local disk store are set by `pnpm dev:e2e`.
 * global.setup resets the e2e user's credits, so each run starts at 30.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.setTimeout(180_000);

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/");
}

/** fetch inside the signed-in page, returns status + json. */
async function api(page: Page, path: string, method = "GET", body?: unknown) {
  return page.evaluate(
    async ([p, m, b]) => {
      const res = await fetch(p as string, { method: m as string, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { status: res.status, json: res.status === 204 ? null : await res.json().catch(() => null) };
    },
    [path, method, body] as const,
  );
}

async function pollDone(page: Page, id: string) {
  await expect
    .poll(async () => (await api(page, `/api/visuals/${id}`)).json?.status, { timeout: 60_000, intervals: [500, 1000] })
    .toMatch(/COMPLETED|FAILED/);
  return (await api(page, `/api/visuals/${id}`)).json;
}

async function imageSize(page: Page, src: string) {
  return page.evaluate(
    (s) => new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("image failed to load"));
      img.src = s;
    }),
    src,
  );
}

test("generate, poll, render, edit, versions, revert, refusal and credits", async ({ page }) => {
  await signIn(page);
  expect((await api(page, "/api/credits")).json.balance).toBe(30);

  // generate (a library image, no post, brand colours off so there is no confirmation step)
  const created = await api(page, "/api/visuals", "POST", {
    source: "library", prompt: "Three habits that fixed our hiring, as a numbered list", visualType: "INFOGRAPHIC",
    aspect: "PORTRAIT_4_5", useBrandColours: false, requestId: crypto.randomUUID(),
  });
  expect(created.status).toBe(202);
  expect(created.json.balance).toBe(29);
  const id = created.json.visual.id as string;
  const done = await pollDone(page, id);
  expect(done).toMatchObject({ status: "COMPLETED", currentVersion: 0, remainingEdits: 5 });
  expect(await imageSize(page, done.imageUrl)).toEqual({ w: 1080, h: 1350 });

  // edit is free and adds a version
  const edit = await api(page, `/api/visuals/${id}/edit`, "POST", { prompt: "Make the headline larger", requestId: crypto.randomUUID() });
  expect(edit.status).toBe(202);
  expect(edit.json.status).toBe("PROCESSING");
  const edited = await pollDone(page, id);
  expect(edited).toMatchObject({ currentVersion: 1, editCount: 1, remainingEdits: 4 });
  expect(edited.imageUrl).not.toBe(done.imageUrl);
  expect((await api(page, "/api/credits")).json.balance).toBe(29);

  // versions, then revert to v0
  const versions = (await api(page, `/api/visuals/${id}/versions`)).json.versions;
  expect(versions.map((v: { kind: string }) => v.kind)).toEqual(["GENERATED", "EDIT"]);
  const reverted = await api(page, `/api/visuals/${id}/revert`, "POST", { version: 0 });
  expect(reverted.status).toBe(200);
  expect(reverted.json).toMatchObject({ currentVersion: 2, editCount: 1, imageUrl: done.imageUrl });

  // a refused request costs nothing
  const refused = await api(page, "/api/visuals", "POST", {
    source: "library", prompt: "A photorealistic portrait of Barack Obama", visualType: "GENERAL", useBrandColours: false, requestId: crypto.randomUUID(),
  });
  expect(refused.status).toBe(422);
  expect(refused.json.code).toBe("refused");
  expect((await api(page, "/api/credits")).json.balance).toBe(29);

  // appears in the library; delete removes it
  const list = (await api(page, "/api/visuals")).json.items as { id: string }[];
  expect(list.map((v) => v.id)).toContain(id);
  expect((await api(page, `/api/visuals/${id}`, "DELETE")).status).toBe(204);
  expect((await api(page, `/api/visuals/${id}`)).status).toBe(404);
});
