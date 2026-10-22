import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Layout audit (UI1). Opt-in: `AUDIT=1` (it is slow: every screen x 4 widths x 2 themes). Measures, per screen:
 *
 * - `hscroll`        the document scrolls sideways
 * - `overflow`       an in-flow box sticks out of a non-scrolling parent, or out of the viewport
 * - `clip`           a single-line label is cut (scrollWidth > clientWidth) without an intended ellipsis
 * - `icon-align`     an icon and its label inside a control are vertically off by more than 1 px
 * - `center`         a child of a centring flex/grid box is off-centre by more than 1 px (cross axis)
 * - `gap`            a flex row/column whose sibling gaps differ by more than 1 px (not space-between, not wrapped)
 * - `scale`          a control height not on the 4 px grid, or a gap / padding not on the 2 px half-step
 * - `toolbar-height` adjacent controls in one row with different heights
 * - `dialog-center`  an open dialog is not centred in the viewport (or its edge, for side sheets)
 * - `focus-clip`     a focusable control whose 2 px offset + 2 px focus ring would be cut by an overflow ancestor
 * - `target`         an interactive target smaller than 24 px (any width) or 44 px (390 px, primary nav and actions)
 *
 * Writes `layout-audit.json` (every issue) and `layout-audit-issues.md` (grouped) to AUDIT_DIR (default
 * test-results/layout-audit). AUDIT_SHOTS=1 also saves a screenshot per screen/width/theme there. Every chat the
 * audit makes is deleted afterwards.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
test.skip(process.env.AUDIT !== "1", "Layout audit is opt-in: AUDIT=1");
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(process.env.AI_MOCK_MODEL !== "1", "Needs AI_MOCK_MODEL=1 for the chat screens");
test.setTimeout(3_600_000);
test.use({ actionTimeout: 8_000, navigationTimeout: 90_000, trace: "off" });

const outDir = process.env.AUDIT_DIR ?? path.join("test-results", "layout-audit");
const shots = process.env.AUDIT_SHOTS === "1";
// AUDIT_WIDTHS=1440,390 and AUDIT_THEMES=dark narrow a run while iterating.
const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
].filter((v) => !process.env.AUDIT_WIDTHS || process.env.AUDIT_WIDTHS.split(",").includes(String(v.width)));
const themes = (["dark", "light"] as const).filter((t) => !process.env.AUDIT_THEMES || process.env.AUDIT_THEMES.split(",").includes(t));

const routes = (process.env.AUDIT_ROUTES?.split(",").filter((r) => r !== "none") ?? [
  "/",
  "/posts",
  "/ideas",
  "/activities",
  "/analytics",
  "/engage",
  "/strategy",
  "/inspiration",
  "/following",
  "/templates",
  "/images",
  "/saves",
  "/knowledge-base",
  "/challenge",
  "/settings",
  "/settings/integrations",
  "/settings/memories",
  "/settings/team",
  "/settings/billing",
  "/settings/community",
  "/settings/help",
  "/design",
]).filter(Boolean);

type Issue = { kind: string; screen: string; vp: string; theme: string; sel: string; detail: string };

/** Runs in the page: returns every measurable layout issue on the current screen. */
function measure(vpWidth: number): Omit<Issue, "screen" | "vp" | "theme">[] {
  const out: { kind: string; sel: string; detail: string }[] = [];
  const seen = new Set<string>();
  const px = (v: string) => parseFloat(v) || 0;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  // Label/icon centring compares line boxes, not canvas ink metrics: rasterised "HHHHHH" probes (UI1) showed Geist
  // labels flex-centred in pills sit within 0.5 px of the box centre (pixel quantisation), while canvas
  // fontBoundingBox metrics over-reported a 1.4 px offset, so an ink-based check here would chase a phantom.
  const sel = (el: Element): string => {
    const parts: string[] = [];
    let e: Element | null = el;
    for (let i = 0; e && i < 4 && e !== document.body; i++, e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      const label = e.getAttribute("aria-label") ?? e.getAttribute("data-slot") ?? e.getAttribute("role");
      if (e.id && !/^(radix|«|:r)/.test(e.id)) s += `#${e.id}`;
      else if (label) s += `[${label.slice(0, 30)}]`;
      else {
        const cls = (e.getAttribute("class") ?? "").split(/\s+/).filter((c) => c && !c.includes(":") && !c.includes("["))[0];
        if (cls) s += `.${cls}`;
      }
      parts.unshift(s);
    }
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
    return parts.join(" > ") + (text ? ` "${text}"` : "");
  };
  const push = (kind: string, el: Element, detail: string) => {
    const key = `${kind}|${sel(el)}|${detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, sel: sel(el), detail });
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && px(cs.opacity) > 0.01 && !el.closest("[aria-hidden=true],[inert],.sr-only");
  };
  const isScroller = (cs: CSSStyleDeclaration, axis: "x" | "y") => {
    const o = axis === "x" ? cs.overflowX : cs.overflowY;
    return o === "auto" || o === "scroll" || o === "hidden" || o === "clip";
  };
  const inFlow = (cs: CSSStyleDeclaration) => cs.position !== "absolute" && cs.position !== "fixed" && cs.float === "none";
  const all = Array.from(document.querySelectorAll("body *")).filter(
    (el) => !(el instanceof SVGElement && !(el instanceof SVGSVGElement)) && !el.closest("svg > *,[data-audit-ignore],.cl-internal-b3fm6y,nextjs-portal"),
  );
  const vis = all.filter(visible);

  if (document.documentElement.scrollWidth > innerWidth + 0.5)
    push("hscroll", document.documentElement, `scrollWidth ${document.documentElement.scrollWidth} > ${innerWidth}`);

  const controlSel = 'button, a[href], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, [role=button], [role=radio], [role=tab], [role=menuitem], [role=switch], [role=checkbox]';

  for (const el of vis) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const parent = el.parentElement;

    // overflow out of the viewport (not inside a horizontal scroller) or out of a non-scrolling parent
    if (inFlow(cs) && parent && cs.display !== "contents") {
      let scrollerX = false;
      for (let a = parent; a && a !== document.body; a = a.parentElement!) {
        const acs = getComputedStyle(a);
        if (isScroller(acs, "x") || acs.position === "fixed") {
          scrollerX = true;
          break;
        }
      }
      if (!scrollerX && (r.right > vpWidth + 1 || r.left < -1)) push("overflow", el, `outside viewport: ${r1(r.left)}..${r1(r.right)} of ${vpWidth}`);
      const pcs = getComputedStyle(parent);
      const pr = parent.getBoundingClientRect();
      if (!isScroller(pcs, "x") && pcs.display !== "contents" && px(cs.marginLeft) >= 0 && px(cs.marginRight) >= 0 && el.tagName !== "BR") {
        const over = Math.max(r.right - pr.right, pr.left - r.left);
        if (over > 1.5 && r.width <= vpWidth) push("overflow", el, `sticks out of parent by ${r1(over)}px (w ${r1(r.width)} in ${r1(pr.width)})`);
      }
    }

    // clipped single-line labels
    const singleLine = cs.whiteSpace === "nowrap" || cs.whiteSpace === "pre";
    if (singleLine && (cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 2) {
      const intended = cs.textOverflow === "ellipsis" || el.getAttribute("title");
      push(intended ? "truncated" : "clip", el, `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
    }
    if (el.matches(controlSel) && cs.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis")
      push("clip", el, `control content ${el.scrollWidth} > ${el.clientWidth}`);

    // icon / label alignment inside controls and pills
    if (/flex/.test(cs.display) && !cs.flexDirection.startsWith("column")) {
      const kids = Array.from(el.children).filter(visible);
      const icon = kids.find((k) => k instanceof SVGSVGElement || (k.children.length === 1 && k.firstElementChild instanceof SVGSVGElement && k.getBoundingClientRect().height < 30));
      const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.textContent!.trim());
      const textKid = kids.find((k) => k !== icon && !k.querySelector("svg,img") && (k.textContent ?? "").trim() && k.getBoundingClientRect().height < 30);
      let textRect: DOMRect | null = null;
      if (textNodes.length) {
        const range = document.createRange();
        range.selectNodeContents(textNodes[0]!);
        const rects = range.getClientRects();
        if (rects.length === 1) textRect = rects[0]!;
      } else if (textKid) {
        const range = document.createRange();
        range.selectNodeContents(textKid);
        const rects = Array.from(range.getClientRects()).filter((x) => x.height > 0);
        if (rects.length >= 1 && rects.every((x) => Math.abs(x.top - rects[0]!.top) < 1)) textRect = rects[0]!;
      }
      if (icon && textRect && cs.alignItems !== "baseline") {
        const ir = icon.getBoundingClientRect();
        const textEl = textNodes.length ? el : textKid!;
        const fs = px(getComputedStyle(textEl).fontSize);
        const d = ir.top + ir.height / 2 - (textRect.top + textRect.height / 2);
        if (Math.abs(d) > 1.01 && ir.height <= fs * 2.2) push("icon-align", el, `icon centre ${d > 0 ? "+" : ""}${r1(d)}px vs label line box`);
      }
    }
    // centring: children of an align-items:center flex row (cross axis) or place-items:center grid
    const isFlex = /flex/.test(cs.display);
    const isGrid = /grid/.test(cs.display);
    if ((isFlex && cs.alignItems === "center" && !cs.flexWrap.startsWith("wrap")) || (isGrid && cs.alignItems === "center" && cs.justifyItems === "center")) {
      const col = isFlex && cs.flexDirection.startsWith("column");
      const ct = r.top + px(cs.borderTopWidth) + px(cs.paddingTop);
      const cb = r.bottom - px(cs.borderBottomWidth) - px(cs.paddingBottom);
      const cl = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
      const cr = r.right - px(cs.borderRightWidth) - px(cs.paddingRight);
      for (const k of Array.from(el.children).filter(visible)) {
        const kcs = getComputedStyle(k);
        if (!inFlow(kcs) || (kcs.alignSelf !== "auto" && kcs.alignSelf !== "center")) continue;
        const kr = k.getBoundingClientRect();
        const mt = px(kcs.marginTop) - px(kcs.marginBottom);
        const ml = px(kcs.marginLeft) - px(kcs.marginRight);
        if (!col || isGrid) {
          const d = kr.top + kr.height / 2 - mt / 2 - (ct + cb) / 2;
          if (Math.abs(d) > 1.01 && cb - ct >= kr.height) push("center", k, `vertical offset ${r1(d)}px in ${r1(cb - ct)}px box`);
        }
        if (col || isGrid) {
          const d = kr.left + kr.width / 2 - ml / 2 - (cl + cr) / 2;
          if (Math.abs(d) > 1.01 && cr - cl >= kr.width) push("center", k, `horizontal offset ${r1(d)}px in ${r1(cr - cl)}px box`);
        }
      }
    }
    // circular / square icon controls: the glyph must sit in the middle of the box
    if (el.matches(controlSel) && Math.abs(r.width - r.height) < 1 && r.width <= 56) {
      const svg = el.querySelector(":scope > svg, :scope > span > svg");
      if (svg && !(el.textContent ?? "").trim()) {
        const sr = svg.getBoundingClientRect();
        const dx = sr.left + sr.width / 2 - (r.left + r.width / 2);
        const dy = sr.top + sr.height / 2 - (r.top + r.height / 2);
        if (Math.abs(dx) > 1.01 || Math.abs(dy) > 1.01) push("center", el, `icon off-centre dx ${r1(dx)} dy ${r1(dy)}`);
      }
    }

    // sibling gap consistency in flex rows / columns
    if (isFlex && !cs.flexWrap.startsWith("wrap") && !/space-(between|around|evenly)/.test(cs.justifyContent)) {
      const kids = Array.from(el.children).filter((k) => visible(k) && inFlow(getComputedStyle(k)));
      const col = cs.flexDirection.startsWith("column");
      // columns: only uniform lists (same tag and class on every child); mixed stacks group by proximity on purpose
      const uniform = kids.every((k) => k.tagName === kids[0]!.tagName && k.getAttribute("class") === kids[0]!.getAttribute("class"));
      if (kids.length >= 3 && (!col || uniform)) {
        const gaps: number[] = [];
        for (let i = 1; i < kids.length; i++) {
          const a = kids[i - 1]!.getBoundingClientRect();
          const b = kids[i]!.getBoundingClientRect();
          if (getComputedStyle(kids[i]!).marginLeft === "auto" || getComputedStyle(kids[i]!).marginTop === "auto") continue;
          gaps.push(col ? b.top - a.bottom : b.left - a.right);
        }
        if (gaps.length >= 2 && Math.max(...gaps) - Math.min(...gaps) > 1.01)
          push("gap", el, `${col ? "column" : "row"} gaps ${gaps.map(r1).join("/")}`);
      }
    }

    // spacing scale for controls and layout gaps
    if (el.matches(controlSel) && !el.matches("textarea, a:not([class])") && cs.display !== "inline") {
      const h = r.height;
      const range = document.createRange();
      range.selectNodeContents(el);
      const textRects = Array.from(range.getClientRects()).filter((x) => x.height > 0 && x.width > 0);
      const lh = px(cs.lineHeight) || px(cs.fontSize) * 1.5;
      const multiLine = textRects.length > 0 && Math.max(...textRects.map((x) => x.bottom)) - Math.min(...textRects.map((x) => x.top)) > lh * 1.6;
      const c2 = cs;
      const boxed = el.matches("input, select") || px(c2.borderTopWidth) > 0 || !/rgba\(0, 0, 0, 0\)|transparent/.test(c2.backgroundColor);
      if (boxed && !multiLine && h >= 16 && h <= 64 && Math.abs(h - Math.round(h / 4) * 4) > 0.5 && !el.closest("[contenteditable],.cl-rootBox,.prose"))
        push("scale", el, `control height ${r1(h)} not on 4px grid`);
      for (const p of ["paddingLeft", "paddingRight"] as const) {
        const v = px(cs[p]);
        if (v > 0 && v % 2 > 0.01) push("scale", el, `${p} ${v} not on 2px half-step`);
      }
    }
    if ((isFlex || isGrid) && cs.gap !== "normal") {
      for (const g of cs.gap.split(" ")) {
        const v = px(g);
        if (v > 0 && v % 2 > 0.01) push("scale", el, `gap ${v} not on 2px half-step`);
      }
    }

    // focus ring clipped by an overflow ancestor (2 px offset + 2 px ring = 4 px around the box)
    if (el.matches(controlSel) && !el.matches("[tabindex='-1']") && !el.closest("[contenteditable]")) {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        const clipX = isScroller(acs, "x");
        const clipY = isScroller(acs, "y");
        if (!clipX && !clipY) continue;
        const ar = a.getBoundingClientRect();
        const inner = { l: ar.left + px(acs.borderLeftWidth), r: ar.right - px(acs.borderRightWidth), t: ar.top + px(acs.borderTopWidth), b: ar.bottom - px(acs.borderBottomWidth) };
        // the real :focus-visible ring (the audit pressed Tab first, so programmatic focus is keyboard focus)
        (el as HTMLElement).focus({ preventScroll: true });
        const fcs = getComputedStyle(el);
        const ring = fcs.outlineStyle !== "none" ? px(fcs.outlineWidth) + px(fcs.outlineOffset) : 0;
        const shadow = Math.max(0, ...Array.from(fcs.boxShadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px(?! *inset)(?![^,]*inset)/g), (m) => px(m[4]!)));
        (el as HTMLElement).blur();
        const need = Math.max(ring, shadow);
        if (need <= 0) break;
        // only flag when the control is at the scroll container's visible edge (otherwise it scrolls into view)
        const cut: string[] = [];
        if (clipX && r.left - need < inner.l - 0.5 && r.left >= inner.l - 1) cut.push(`left ${r1(r.left - inner.l)}`);
        if (clipX && r.right + need > inner.r + 0.5 && r.right <= inner.r + 1) cut.push(`right ${r1(inner.r - r.right)}`);
        if (clipY && r.top - need < inner.t - 0.5 && r.top >= inner.t - 1) cut.push(`top ${r1(r.top - inner.t)}`);
        if (clipY && r.bottom + need > inner.b + 0.5 && r.bottom <= inner.b + 1) cut.push(`bottom ${r1(inner.b - r.bottom)}`);
        if (cut.length) push("focus-clip", el, `${r1(need)}px ring cut by ${a.tagName.toLowerCase()}.${(a.getAttribute("class") ?? "").split(" ")[0]} (${cut.join(", ")} px room)`);
        break;
      }
    }

    // target size
    if (el.matches(controlSel) && cs.display !== "inline" && !el.closest("p, li > p, .prose, [data-message] p")) {
      if (r.width < 24 || r.height < 24) push("target", el, `target ${r1(r.width)}x${r1(r.height)} < 24`);
      else if (vpWidth <= 390 && el.closest("nav, header, [role=toolbar], form") && (r.height < 44 && r.width < 44))
        push("target-44", el, `mobile target ${r1(r.width)}x${r1(r.height)} < 44`);
    }
  }

  // adjacent controls in one row with different heights: controls reachable from a flex row through nested flex rows
  // (a toolbar's left group and its send button count as one row)
  const ctrlSel = "button, a[class], input:not([type=checkbox]):not([type=radio]), select, [role=button], [role=radiogroup], [role=group]";
  const isRow = (e: Element) => {
    const c = getComputedStyle(e);
    return (/flex/.test(c.display) && !c.flexDirection.startsWith("column") && !c.flexWrap.startsWith("wrap")) || c.display === "contents";
  };
  const collect = (e: Element, acc: Element[]) => {
    for (const k of Array.from(e.children)) {
      if (!visible(k) && getComputedStyle(k).display !== "contents") continue;
      if (k.matches(ctrlSel)) acc.push(k);
      else if (isRow(k) || k.tagName === "LI") collect(k, acc);
    }
    return acc;
  };
  for (const row of vis.filter((e) => isRow(e) && !e.matches(ctrlSel) && !(e.parentElement && isRow(e.parentElement) && !e.parentElement.matches(ctrlSel)))) {
    const hasBox = (k: Element) => {
      const c = getComputedStyle(k);
      return k.matches("input, select, [role=radiogroup]") || px(c.borderTopWidth) > 0 || !/rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor) || c.boxShadow !== "none";
    };
    const ctrls = collect(row, []).filter((k) => !k.closest("[contenteditable]") && hasBox(k));
    const groups = new Map<number, Element[]>();
    for (const k of ctrls) {
      const kr = k.getBoundingClientRect();
      const key = Math.round((kr.top + kr.height / 2) / 8);
      groups.set(key, [...(groups.get(key) ?? []), k]);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const hs = g.map((k) => k.getBoundingClientRect().height);
      if (Math.max(...hs) - Math.min(...hs) > 1.01 && Math.max(...hs) > 22)
        push("toolbar-height", row, `heights ${hs.map(r1).join("/")} (${g.map((k) => (k.getAttribute("aria-label") ?? k.textContent ?? "").trim().slice(0, 14)).join(" | ")})`);
    }
  }

  // dialogs: centred, or flush with an edge for sheets
  for (const d of Array.from(document.querySelectorAll("[role=dialog],[role=alertdialog]")).filter(visible)) {
    const r = d.getBoundingClientRect();
    const dx = r.left + r.width / 2 - innerWidth / 2;
    const dy = r.top + r.height / 2 - innerHeight / 2;
    const sheet = r.right >= innerWidth - 1 || r.left <= 1 || r.bottom >= innerHeight - 1;
    if (!sheet && (Math.abs(dx) > 1.01 || Math.abs(dy) > 1.01)) push("dialog-center", d, `off-centre dx ${r1(dx)} dy ${r1(dy)}`);
  }
  return out;
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish?.()));
}

test("layout audit: every screen at four widths in both themes", async ({ page }) => {
  await mkdir(outDir, { recursive: true });
  const issues: Issue[] = [];
  const createdChats = new Set<string>();
  page.on("request", (req) => {
    if (req.method() !== "POST" || new URL(req.url()).pathname !== "/api/chat") return;
    const id = (req.postDataJSON() as { id?: string } | null)?.id;
    if (id) createdChats.add(id);
  });

  async function audit(screen: string, prepare?: () => Promise<void>) {
    for (const theme of themes) {
      for (const vp of viewports) {
        await page.setViewportSize(vp);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        if (prepare) await prepare();
        await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
        await settle(page);
        await page.keyboard.press("Shift");
        await page.keyboard.press("Tab");
        const found = await page.evaluate(measure, vp.width);
        for (const f of found) issues.push({ ...f, screen, vp: `${vp.width}`, theme });
        if (shots) await page.screenshot({ path: path.join(outDir, `${screen}-${vp.width}-${theme}.png`), fullPage: true, animations: "disabled" });
      }
    }
    await writeFile(path.join(outDir, "layout-audit.partial.json"), JSON.stringify(issues));
  }

  // Signed out: auth screens.
  for (const route of process.env.AUDIT_ROUTES ? [] : ["/sign-in", "/sign-up"]) {
    await page.goto(route);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await audit(route.slice(1), async () => {
      await page.goto(route);
      await expect(page.getByRole("heading").first()).toBeVisible();
    });
  }

  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  // Recovery for an interrupted earlier run: AUDIT_CLEAN_SINCE=<ISO> deletes the audit chats started after it.
  const since = process.env.AUDIT_CLEAN_SINCE;
  if (since) {
    const res = await page.request.get("/api/history?limit=50");
    const { chats } = (await res.json()) as { chats: { id: string; title: string; createdAt?: string; lastActivityAt: string }[] };
    for (const c of chats)
      if (new Date(c.createdAt ?? c.lastActivityAt) >= new Date(since) && ["MVP versus POC", "Mock chat"].includes(c.title)) await page.request.delete(`/api/chat/${c.id}`);
  }

  for (const route of routes) {
    const name = route === "/" ? "home" : route.slice(1).replace(/\//g, "-");
    await audit(name, async () => {
      await page.goto(route);
      await expect(page.locator("h1").first()).toBeVisible();
    });
  }

  if (process.env.AUDIT_CHAT !== "0") {
    try {
      // Short thread with the post panel open, then the editor for that post.
      await page.setViewportSize(viewports[0]!);
      await page.goto("/");
      const box = page.getByLabel("Message", { exact: true });
      await box.fill("Draft a short LinkedIn post about pricing");
      await box.press("Enter");
      await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/, { timeout: 30_000 });
      const chatUrl = page.url();
      const panel = page.getByRole("dialog", { name: "MVP versus POC" });
      await expect(panel).toBeVisible({ timeout: 30_000 });
      const editorHref = await panel.getByRole("link", { name: "Open in editor" }).first().getAttribute("href");
      await audit("chat-document-panel", async () => {
        await page.goto(chatUrl);
        await expect(page.locator('[data-message="assistant"]').first()).toBeVisible();
        if (!(await panel.isVisible())) await page.getByRole("link", { name: /MVP versus POC/ }).first().click().catch(() => {});
      });
      await audit("chat-short", async () => {
        await page.goto(chatUrl);
        await expect(page.locator('[data-message="assistant"]').first()).toBeVisible();
        if (await panel.isVisible()) await page.keyboard.press("Escape");
      });

      // Long thread: a few more turns, including a proposal.
      await page.goto(chatUrl);
      if (await panel.isVisible()) await page.keyboard.press("Escape");
      for (const text of ["Search my knowledge for onboarding notes", "Make the hook sharper", "Search my knowledge for pricing notes"]) {
        const thread = page.getByLabel("Message", { exact: true });
        await thread.fill(text);
        await thread.press("Enter");
        await expect(page.getByRole("status")).toHaveText("Reply ready.", { timeout: 30_000 });
        if (await panel.isVisible()) await page.keyboard.press("Escape");
      }
      await audit("chat-long", async () => {
        await page.goto(chatUrl);
        await expect(page.locator('[data-message="assistant"]').first()).toBeVisible();
        if (await panel.isVisible()) await page.keyboard.press("Escape");
      });

      if (editorHref) {
        await audit("post-editor", async () => {
          await page.goto(editorHref);
          await expect(page.locator("h1, [aria-label='Post title']").first()).toBeVisible();
        });
      }
    } finally {
      for (const id of createdChats) await page.request.delete(`/api/chat/${id}`).catch(() => {});
    }
  }

  await writeFile(path.join(outDir, "layout-audit.json"), JSON.stringify(issues, null, 2));
  const byKind = new Map<string, Issue[]>();
  for (const i of issues) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  const lines = [`# Layout audit (${issues.length} findings)`, ""];
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`## ${kind} (${list.length})`, "");
    const grouped = new Map<string, Issue[]>();
    for (const i of list) grouped.set(`${i.sel} — ${i.detail}`, [...(grouped.get(`${i.sel} — ${i.detail}`) ?? []), i]);
    for (const [k, g] of grouped) lines.push(`- ${k}  [${[...new Set(g.map((i) => i.screen))].join(",")} @ ${[...new Set(g.map((i) => `${i.vp}${i.theme[0]}`))].join(",")}]`);
    lines.push("");
  }
  await writeFile(path.join(outDir, "layout-audit-issues.md"), lines.join("\n"));
  // The audit records; it does not gate. Phase 2 reruns it and reads the counts.
  console.log(`layout audit: ${issues.length} findings → ${outDir}`);
});
