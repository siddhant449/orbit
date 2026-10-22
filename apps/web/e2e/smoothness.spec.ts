import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Smoothness (S1): client navigation fades the main region in (no flash of a skeleton, no layout shift, nothing
 * replays on tab return), reduced motion turns the fade off, and a streaming reply survives a tab switch and grows in
 * place from its "Thinking" row. Runs against the TEST database server; the chat parts need AI_MOCK_MODEL=1.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";

test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.setTimeout(120_000);

const created = new Set<string>();
test.beforeEach(async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) created.add(id);
  });
  // Layout shifts, CSS animation starts and visibility changes, from the first script on.
  await page.addInitScript(() => {
    const w = window as unknown as { __s1: { shifts: { t: number; v: number }[]; anim: { t: number; name: string }[] } };
    w.__s1 = { shifts: [], anim: [] };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
        if (!e.hadRecentInput) w.__s1.shifts.push({ t: e.startTime, v: e.value });
    }).observe({ type: "layout-shift", buffered: true });
    document.addEventListener("animationstart", (e) => w.__s1.anim.push({ t: performance.now(), name: (e as AnimationEvent).animationName }), true);
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

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Sidebar" });

/** Starts sampling, once per frame, how visible a route skeleton is, and returns a reader for the result. */
async function watchSkeleton(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __sk: { t0: number; visibleMs: number; last: number; stop: boolean } };
    w.__sk = { t0: performance.now(), visibleMs: 0, last: performance.now(), stop: false };
    const tick = (now: number) => {
      const sk = document.querySelector("main [data-route-loading]");
      if (sk && Number.parseFloat(getComputedStyle(sk).opacity) > 0.01) w.__sk.visibleMs += now - w.__sk.last;
      w.__sk.last = now;
      if (!w.__sk.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () =>
    page.evaluate(() => {
      const w = window as unknown as { __sk: { t0: number; visibleMs: number; stop: boolean } };
      w.__sk.stop = true;
      return { visibleMs: w.__sk.visibleMs, t0: w.__sk.t0 };
    });
}

const shiftsSince = (page: Page, t0: number) =>
  page.evaluate((t0) => {
    const w = window as unknown as { __s1: { shifts: { t: number; v: number }[] } };
    return w.__s1.shifts.filter((s) => s.t >= t0).reduce((a, s) => a + s.v, 0);
  }, t0);

/** Hides the page and shows it again the way a tab switch does (document visibility, then window focus). */
async function switchTabAway(page: Page, awayMs: number) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("blur"));
  });
  await page.waitForTimeout(awayMs);
  return page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>).visibilityState;
    delete (document as unknown as Record<string, unknown>).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    return performance.now();
  });
}

test("client navigation: the main region fades in, nothing flashes or shifts, the sidebar stays still", async ({ page }) => {
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1000);

  for (const { name, h1 } of [
    { name: "Posts", h1: /^Posts/ },
    { name: "Analytics", h1: /./ },
    { name: "Activities", h1: /Activities/ },
    { name: "Ideas", h1: /For you/ },
  ]) {
    const read = await watchSkeleton(page);
    const started = Date.now();
    await sidebar(page).getByRole("link", { name, exact: true }).first().click();
    await expect(page.locator("main h1")).toHaveText(h1, { timeout: 20_000 });
    await expect(page.locator("main [data-route-loading]")).toHaveCount(0);
    const navMs = Date.now() - started;
    await page.waitForTimeout(400);
    const { visibleMs, t0 } = await read();
    // A skeleton either stays hidden (fast load) or is shown long enough to read; never a sub-150 ms flash.
    expect(visibleMs === 0 || visibleMs >= 150, `${name}: skeleton visible ${Math.round(visibleMs)} ms`).toBe(true);
    expect(await shiftsSince(page, t0), `${name}: layout shift`).toBeLessThan(0.05);
    expect(navMs, `${name}: navigation took ${navMs} ms`).toBeLessThan(15_000);
    // The fade is on, short, and only on the main region's view.
    const view = page.locator("main [data-route-view]");
    await expect(view).toHaveCount(1);
    await expect(view).toHaveClass(/route-view--enter/);
    const duration = await view.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(Number.parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000)).toBeLessThanOrEqual(200);
    expect(await page.locator("aside[aria-label='Sidebar']").evaluate((el) => el.getAnimations({ subtree: false }).length)).toBe(0);
  }
  // Keyboard and screen-reader users land on the new screen's heading, even when a skeleton came first.
  await expect(page.locator("main h1")).toBeFocused();
});

test("reduced motion: navigation swaps the screen with no fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
  await sidebar(page).getByRole("link", { name: "Posts", exact: true }).first().click();
  await expect(page.locator("main h1")).toHaveText(/^Posts/, { timeout: 20_000 });
  const view = page.locator("main [data-route-view]");
  expect(await view.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await view.evaluate((el) => el.getAnimations().length)).toBe(0);
});

test("tab return: no entrance replays, no loading state, no scroll jump, at most one refresh", async ({ page }) => {
  await signIn(page);
  for (const route of ["/", "/analytics", "/activities", "/posts"]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible({ timeout: 60_000 });
    // Let the first-paint entrance finish.
    await page.waitForTimeout(2500);
    const before = await page.evaluate(() => {
      const scroller = document.querySelector("main .lenis") as HTMLElement | null;
      (window as unknown as { __h1: Element | null }).__h1 = document.querySelector("main h1");
      return scroller?.scrollTop ?? 0;
    });
    const requests: string[] = [];
    const onRequest = (r: { url: () => string; resourceType: () => string }) => {
      if (["fetch", "xhr", "document"].includes(r.resourceType())) requests.push(new URL(r.url()).pathname);
    };
    page.on("request", onRequest);
    const back = await switchTabAway(page, 1500);
    await page.waitForTimeout(1500);
    page.off("request", onRequest);
    const after = await page.evaluate((back) => {
      const w = window as unknown as { __s1: { anim: { t: number; name: string }[] }; __h1: Element | null };
      const scroller = document.querySelector("main .lenis") as HTMLElement | null;
      return {
        replays: w.__s1.anim.filter((a) => a.t >= back && /rise|reveal|route-enter|msg-arrive|ring-draw|line-rise/.test(a.name)).map((a) => a.name),
        sameHeading: document.querySelector("main h1") === w.__h1,
        skeleton: document.querySelectorAll("main [data-route-loading]").length,
        scroll: scroller?.scrollTop ?? 0,
      };
    }, back);
    expect(after.replays, `${route}: animations replayed on return`).toEqual([]);
    expect(after.sameHeading, `${route}: the screen re-mounted`).toBe(true);
    expect(after.skeleton).toBe(0);
    expect(after.scroll).toBe(before);
    const ours = requests.filter((p) => p.startsWith("/api/") || !p.startsWith("/v1/"));
    expect(ours.length, `${route}: requests on return: ${ours.join(", ")}`).toBeLessThanOrEqual(1);
  }
});

test("streaming: the thinking row becomes the reply in place, and the reply survives a tab switch", async ({ page }) => {
  test.skip(!mock, "Needs AI_MOCK_MODEL=1 (the paced scripted reply)");
  await signIn(page);
  await page.goto("/");
  const box = page.getByLabel("Message", { exact: true });
  await box.fill("Give me markdown, slowly");
  await box.press("Enter");
  const live = page.locator('[data-message="assistant"][data-live]');
  await expect(live).toHaveCount(1, { timeout: 30_000 });
  await live.evaluate((el) => ((window as unknown as { __reply: Element }).__reply = el));
  await expect(live.locator(".md")).toBeVisible({ timeout: 30_000 });
  // Same element: the thinking row wasn't swapped for a new one when the first words came in.
  expect(await live.evaluate((el) => el === (window as unknown as { __reply: Element }).__reply)).toBe(true);

  const t0 = await page.evaluate(() => performance.now());
  await switchTabAway(page, 1500);
  await expect(page.locator('[data-message="assistant"][data-live]')).toHaveCount(0, { timeout: 60_000 });
  const reply = page.locator('[data-message="assistant"]').last();
  await expect(reply).toContainText("Cut the first sentence");
  await expect(reply.getByRole("link", { name: "the guide" })).toBeVisible();
  expect(await reply.evaluate((el) => el === (window as unknown as { __reply: Element }).__reply)).toBe(true);
  expect(await shiftsSince(page, t0)).toBeLessThan(0.05);
});
