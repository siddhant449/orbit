import { clerk } from "@clerk/testing/playwright";
import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { axeCheck, expectNoHorizontalScroll } from "./helpers/shots";

/**
 * AI assistant connector: the settings screen (URL and copy, ChatGPT and Codex tabs, the "acts as" select, connected
 * assistants and Disconnect) and the MCP endpoint. The draft it creates stays in Posts (posts have no delete route), like the other specs. No real OAuth: the mock server reads the test header
 * `x-orbit-e2e-mcp-user` instead of a token. A request without it is refused, even with the session cookie.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const mock = process.env.AI_MOCK_MODEL === "1";
test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a Clerk dev-instance test user");
test.skip(!mock, "Needs AI_MOCK_MODEL=1: the MCP test header only works on the mock server");
test.setTimeout(240_000);

const TOOLS = [
  "add_memory", "create_draft", "edit_post", "get_strategy", "list_ideas", "list_memories", "list_posts", "list_templates",
  "read_knowledge", "read_post", "read_template", "save_idea", "search_knowledge", "update_memory",
];

let clerkId = "";
let clientId = "";

async function rpc(page: Page, method: string, params: unknown, id: number, withHeader = true): Promise<APIResponse> {
  return page.request.post("/api/mcp", {
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(withHeader ? { "x-orbit-e2e-mcp-user": clerkId, "x-orbit-e2e-mcp-client": clientId } : {}),
    },
    data: { jsonrpc: "2.0", id, method, params },
  });
}
/** The JSON-RPC reply, whether the server answered with JSON or a single event-stream message. */
async function result(res: APIResponse) {
  const body = await res.text();
  const raw = res.headers()["content-type"]?.includes("event-stream") ? body.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? "" : body;
  return JSON.parse(raw) as { result?: any; error?: unknown };
}

test.beforeEach(async ({ page }) => {
  clientId = `e2e-${Date.now()}`;
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email! });
  await page.goto("/settings/integrations");
  type W = { Clerk?: { user?: { id: string } } };
  await page.waitForFunction(() => Boolean((window as unknown as W).Clerk?.user?.id));
  clerkId = await page.evaluate(() => (window as unknown as W).Clerk!.user!.id);
});
test("settings: URL, tabs, binding and connected assistants", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/settings/integrations");

  const url = `${new URL(page.url()).origin}/api/mcp`;
  await expect(page.getByLabel("Server URL")).toHaveValue(url);
  await page.getByRole("button", { name: "Copy URL" }).click();
  await expect(page.getByText("Server URL copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

  // Tabs: ChatGPT and Codex only.
  await expect(page.getByRole("tab")).toHaveText(["ChatGPT", "Codex"]);
  await expect(page.getByRole("tabpanel")).toContainText("Developer mode");
  await page.getByRole("tab", { name: "ChatGPT" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Codex" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Add command", { exact: true })).toHaveText(`codex mcp add orbit --url ${url}`);
  await expect(page.locator("body")).not.toContainText(/claude|cursor/i);
  await axeCheck(page);

  // Binding persists after a reload.
  const select = page.getByLabel("AI assistants act as");
  const current = await select.inputValue();
  const target = (await select.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value))).find((v) => v !== current) ?? current;
  await select.selectOption(target);
  await expect(page.getByText("Profile saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("AI assistants act as")).toHaveValue(target);
  await page.getByLabel("AI assistants act as").selectOption(current);
  await expect(page.getByText("Profile saved")).toBeVisible();

  // Light theme and 390 px.
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expectNoHorizontalScroll(page);
  await axeCheck(page);

  // A request from an assistant lists it; Disconnect then makes its calls 401.
  const ok = await rpc(page, "tools/list", {}, 1);
  expect(ok.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Connected assistants" })).toBeVisible();
  await page.getByRole("button", { name: /^Disconnect/ }).first().click();
  await expect(page.getByText("Disconnected AI assistant")).toBeVisible();
  expect((await rpc(page, "tools/list", {}, 2)).status()).toBe(401);

  // Disconnected assistants stay listed; Reconnect lets them call again.
  await page.reload();
  await expect(page.getByText("Disconnected", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /^Reconnect/ }).first().click();
  await expect(page.getByText("Reconnected AI assistant")).toBeVisible();
  expect((await rpc(page, "tools/list", {}, 3)).status()).toBe(200);
  await axeCheck(page);
});

test("the endpoint lists the tools, creates a draft, and refuses without a token", async ({ page }) => {
  // Without the header the endpoint is 401, even with this browser's signed-in session cookie.
  const refused = await rpc(page, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }, 1, false);
  expect(refused.status()).toBe(401);
  expect(refused.headers()["www-authenticate"]).toContain("resource_metadata=");

  const init = await rpc(page, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }, 2);
  expect(init.status()).toBe(200);
  expect((await result(init)).result.serverInfo.name).toBe("orbit");

  const list = await result(await rpc(page, "tools/list", {}, 3));
  expect((list.result.tools as { name: string }[]).map((t) => t.name).sort()).toEqual([...TOOLS].sort());

  const title = `E2E MCP draft ${Date.now()}`;
  const made = await result(await rpc(page, "tools/call", { name: "create_draft", arguments: { title, text: "Written by a connected assistant." } }, 4));
  expect(made.result.isError).toBeFalsy();
  const post = JSON.parse(made.result.content[0].text) as { id: string };

  await page.goto("/posts?view=list");
  await expect(page.getByText(title).first()).toBeVisible();

  const edited = await result(await rpc(page, "tools/call", { name: "edit_post", arguments: { id: post.id, text: "Edited by a connected assistant.", note: "Tightened" } }, 5));
  expect(JSON.parse(edited.result.content[0].text).version).toBe(2);
  const read = await result(await rpc(page, "tools/call", { name: "read_post", arguments: { id: post.id } }, 6));
  expect(JSON.parse(read.result.content[0].text).versions).toHaveLength(2);
});
