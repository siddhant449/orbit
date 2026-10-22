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

// A small 8x8 blue PNG, base64, for uploads.
const SWATCH_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWPQDniGFTEMLQkATQZYQXiHm5QAAAAASUVORK5CYII=";

async function upload(page: Page, path: string, fields: Record<string, string>, name = "swatch.png", type = "image/png") {
  return page.evaluate(
    async ([p, f, n, t, b64]) => {
      const form = new FormData();
      form.set("file", new File([Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0))], n as string, { type: t as string }));
      for (const [k, v] of Object.entries(f as Record<string, string>)) form.set(k, v);
      const res = await fetch(p as string, { method: "POST", body: form });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
    [path, fields, name, type, SWATCH_PNG] as const,
  );
}

test("brand theme: confirm, extract from an image, logo, references and tags", async ({ page }) => {
  await signIn(page);
  const startBalance = (await api(page, "/api/credits")).json.balance as number;
  const request = () => ({ source: "library", prompt: "Our weekly numbers as a bar chart", visualType: "INFOGRAPHIC", useBrandColours: true, requestId: crypto.randomUUID() });

  // first use asks to confirm brand colours, and costs nothing
  const asked = await api(page, "/api/visuals", "POST", request());
  expect(asked.status).toBe(409);
  expect(asked.json).toMatchObject({ code: "needs_brand_confirmation", proposal: { decision: "NONE", accent: "#4F5FF5" } });
  expect((await api(page, "/api/credits")).json.balance).toBe(startBalance);

  // propose colours from an image, then accept them
  const extracted = await upload(page, "/api/brand-theme/extract", {});
  expect(extracted.status).toBe(200);
  const decision = await api(page, "/api/brand-theme/decision", "POST", { accept: true, proposal: extracted.json.theme });
  expect(decision.json.decision).toBe("CONFIRMED");
  expect((await api(page, "/api/brand-theme")).json.theme).toEqual(extracted.json.theme);

  // an SVG logo is refused; a PNG logo is stored and served
  expect((await upload(page, "/api/brand-theme/logo", {}, "logo.svg", "image/svg+xml")).status).toBe(415);
  const logo = await upload(page, "/api/brand-theme/logo", {});
  expect(logo.status).toBe(201);
  expect(logo.json.logoUrl).toMatch(/^\/api\/files\/public\//);
  expect((await imageSize(page, logo.json.logoUrl)).w).toBeGreaterThan(0);

  // generate with the confirmed colours, then put the logo on it
  const created = await api(page, "/api/visuals", "POST", request());
  expect(created.status).toBe(202);
  const id = created.json.visual.id as string;
  await pollDone(page, id);
  expect((await api(page, `/api/visuals/${id}/logo`, "POST", {})).status).toBe(202);
  const withLogo = await pollDone(page, id);
  expect(withLogo).toMatchObject({ currentVersion: 1, editCount: 1, error: null });
  expect((await api(page, `/api/visuals/${id}/versions`)).json.versions.map((v: { kind: string }) => v.kind)).toEqual(["GENERATED", "LOGO"]);

  // references: tagged, private, listed and filtered
  expect((await upload(page, "/api/reference-images", { title: "Clean chart", tags: "" })).status).toBe(400);
  const ref = await upload(page, "/api/reference-images", { title: "Clean chart", tags: "charts,minimal" });
  expect(ref.status).toBe(201);
  expect(ref.json.item.url).toMatch(/^\/api\/files\/[a-z0-9]+$/);
  expect((await imageSize(page, ref.json.item.url)).w).toBe(8);
  expect((await api(page, "/api/reference-images/tags")).json.tags).toEqual(["charts", "minimal"]);
  expect((await api(page, "/api/reference-images?tag=minimal")).json.items).toHaveLength(1);
  const withRef = await api(page, "/api/visuals", "POST", { ...request(), useBrandColours: false, referenceId: ref.json.item.id });
  expect(withRef.status).toBe(202);
  await pollDone(page, withRef.json.visual.id);

  // clean up
  expect((await api(page, `/api/reference-images/${ref.json.item.id}`, "DELETE")).status).toBe(204);
  expect((await api(page, "/api/brand-theme", "DELETE")).json.decision).toBe("NONE");
});

test("attach to a post: the draft follows edits and reverts, survives a reload, and detach works", async ({ page }) => {
  await signIn(page);
  // a real post written by the scripted mock model
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Draft a short LinkedIn post about pricing");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const chatId = /\/chat\/([0-9a-f-]{36})$/.exec(page.url())![1]!;
  let postId = "";
  await expect(async () => {
    postId = ((await (await page.request.get(`/api/chat/${chatId}/messages`)).json()) as { document?: { id: string } | null }).document?.id ?? "";
    expect(postId).not.toBe("");
  }).toPass({ timeout: 45_000 });

  try {
    // generate for the post
    const before = (await api(page, "/api/credits")).json.balance as number;
    const body = { source: "post", documentId: postId, prompt: "Pricing in three tiers", visualType: "INFOGRAPHIC", useBrandColours: false };
    const created = await api(page, "/api/visuals", "POST", { ...body, requestId: crypto.randomUUID() });
    expect(created.status).toBe(202);
    const id = created.json.visual.id as string;
    const done = await pollDone(page, id);
    expect((await api(page, "/api/credits")).json.balance).toBe(before - 1);

    // attach, then edit: the draft's media moves to the new version
    expect((await api(page, `/api/visuals/${id}/attach`, "POST", { documentId: postId })).status).toBe(200);
    const media0 = (await api(page, `/api/documents/${postId}/media`)).json.media;
    expect(media0).toHaveLength(1);
    expect(media0[0].url).toBe(done.imageUrl);

    await api(page, `/api/visuals/${id}/edit`, "POST", { prompt: "Use a darker background", requestId: crypto.randomUUID() });
    const edited = await pollDone(page, id);
    await page.reload();
    const media1 = (await api(page, `/api/documents/${postId}/media`)).json.media;
    expect(media1[0].url).toBe(edited.imageUrl);
    expect(await imageSize(page, media1[0].url)).toEqual({ w: 1080, h: 1350 });

    // revert to the first image: the draft follows again
    await api(page, `/api/visuals/${id}/revert`, "POST", { version: 0 });
    expect((await api(page, `/api/documents/${postId}/media`)).json.media[0].url).toBe(done.imageUrl);

    // alt text, detach
    expect((await api(page, `/api/visuals/${id}`, "PATCH", { altText: "Three pricing tiers" })).json.altText).toBe("Three pricing tiers");
    expect((await api(page, `/api/visuals/${id}/attach?documentId=${postId}`, "DELETE")).status).toBe(204);
    expect((await api(page, `/api/documents/${postId}/media`)).json.media).toEqual([]);
    await api(page, `/api/visuals/${id}`, "DELETE");
  } finally {
    await page.request.delete(`/api/chat/${chatId}`).catch(() => {});
  }
});

test("chat: suggest images -> cards -> make one (1 credit) -> image appears -> ask for an edit in chat", async ({ page }) => {
  await signIn(page);
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Draft a short LinkedIn post about pricing");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const chatId = /\/chat\/([0-9a-f-]{36})$/.exec(page.url())![1]!;
  try {
    await expect(page.getByText("Your draft is open on the right.")).toBeVisible({ timeout: 45_000 });
    const before = (await api(page, "/api/credits")).json.balance as number;

    // The assistant suggests three ideas and spends nothing.
    await box.fill("Suggest some images for this post.");
    await box.press("Enter");
    const ideas = page.locator("[data-visual-concept]");
    await expect(ideas).toHaveCount(3, { timeout: 45_000 });
    expect((await api(page, "/api/credits")).json.balance).toBe(before);

    // Reviewing a prompt is free; making the image is the click that costs a credit.
    await ideas.first().getByRole("button", { name: "Review prompt" }).click();
    await expect(ideas.first().getByLabel(/Prompt \(editing it is free\)/)).toBeVisible();
    await ideas.first().getByRole("button", { name: "Make image · 1 credit" }).click();

    // First image for this profile: confirm brand colours, which re-sends the request.
    const confirm = ideas.first().locator("[data-brand-confirm]");
    await expect(confirm).toBeVisible({ timeout: 30_000 });
    expect((await api(page, "/api/credits")).json.balance).toBe(before);
    await confirm.getByRole("button", { name: "Skip colours" }).click();

    const result = ideas.first().locator("[data-visual-result]");
    await expect(result).toBeVisible({ timeout: 60_000 });
    await expect(result.locator("img")).toHaveJSProperty("naturalWidth", 1080, { timeout: 15_000 });
    await expect(ideas.first()).toContainText("Added to your post.");
    expect((await api(page, "/api/credits")).json.balance).toBe(before - 1);

    // An edit asked for in chat is free and shows the new image.
    await box.fill("Make the background navy");
    await box.press("Enter");
    const edit = page.locator("[data-visual-edit]");
    await expect(edit).toBeVisible({ timeout: 45_000 });
    await expect(edit).toContainText("Updated.", { timeout: 60_000 });
    expect((await api(page, "/api/credits")).json.balance).toBe(before - 1);
  } finally {
    const list = (await api(page, "/api/visuals")).json?.items as { id: string }[] | undefined;
    for (const v of list ?? []) await api(page, `/api/visuals/${v.id}`, "DELETE");
    await api(page, "/api/brand-theme", "DELETE");
    await page.request.delete(`/api/chat/${chatId}`).catch(() => {});
  }
});
