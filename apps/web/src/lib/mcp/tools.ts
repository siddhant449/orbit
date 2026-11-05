import {
  createAssistantDocument,
  DocumentError,
  DocumentVersionConflict,
  getBinding,
  getDocument,
  getStrategy,
  getTemplateBySlug,
  isAgentWritable,
  listDocumentVersions,
  listIdeaWeeks,
  listMemory,
  listPosts,
  listTemplates,
  memoryLines,
  editMemoryLine,
  AccountError,
  saveDocumentVersion,
  saveItem,
  SavesError,
  type TemplateType,
} from "@brandloop/db";
import {
  checkMemoryFact,
  learningGuard,
  MEMORY_CATEGORIES,
  readKBText,
  saveMemoryFacts,
  searchKBText,
  strategyMarkdown,
} from "@brandloop/agent";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createUsageLimiter, defaultCounterStore, type UsageLimiter } from "@brandloop/ai";

export const MCP_LIMIT = 60;
export const MCP_WINDOW_SEC = 10 * 60;
export const RATE_LIMITED_MESSAGE = "Orbit is getting a lot of requests from your assistant. Wait a minute and try again.";
export const NO_PROFILE_MESSAGE = "Choose which profile AI assistants act as in Orbit → Settings → Integrations.";

// 60 calls per profile per 10 minutes, shared by every tool, counted in the shared counter store (Upstash in production, so it holds across instances).
const globalLimiter = globalThis as unknown as { __mcpToolLimiter?: UsageLimiter };
const defaultLimiter = () => (globalLimiter.__mcpToolLimiter ??= createUsageLimiter({ store: defaultCounterStore() }));

export type McpToolDeps = { limiter?: UsageLimiter };
export type McpToolResult = { text: string; isError?: boolean };

type Run<S extends z.ZodType> = (profileId: string, input: z.infer<S>) => Promise<McpToolResult | unknown>;
export type McpToolDef<S extends z.ZodType = z.ZodType> = {
  name: string;
  title: string;
  description: string;
  schema: S;
  readOnly: boolean;
  run: Run<S>;
};

const def = <S extends z.ZodType>(d: McpToolDef<S>): McpToolDef => d as unknown as McpToolDef;

// A tool returns either plain text (`plain`, `fail`) or any JSON value. The brand keeps a JSON value with its own `text` field (a post) from being taken for plain text.
const BRAND = Symbol("mcp-result");
type Branded = McpToolResult & { [BRAND]: true };
const plain = (text: string): McpToolResult => ({ [BRAND]: true, text }) as Branded;
const fail = (text: string): McpToolResult => ({ [BRAND]: true, text, isError: true }) as Branded;
const isResult = (v: unknown): v is McpToolResult => typeof v === "object" && v !== null && BRAND in v;
const NOT_FOUND = (what: string) => fail(`No ${what} with that id in this profile.`);
const excerpt = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}…` : text);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** `<memory path>#<line>`, the id list_memories gives each line. */
const MEMORY_ID = /^([a-z0-9-]+(?:\/[a-z0-9-]+)*)#(\d{1,5})$/;

export const MCP_TOOLS: McpToolDef[] = [
  def({
    name: "get_strategy",
    title: "Get content strategy",
    description: "Read the user's content strategy: goal, positioning, content pillars and formats.",
    schema: z.object({}),
    readOnly: true,
    run: async (profileId) => {
      const row = await getStrategy(profileId);
      return plain(row ? strategyMarkdown(row) : "No content strategy has been set up for this profile yet.");
    },
  }),
  def({
    name: "list_ideas",
    title: "List post ideas",
    description: "The post ideas Orbit generated, newest week first. Ideas the user hid are left out.",
    schema: z.object({ weeks: z.number().int().min(1).max(8).optional() }),
    readOnly: true,
    run: async (profileId, { weeks }) => {
      const found = await listIdeaWeeks(profileId, { weeks: weeks ?? 2 });
      return {
        weeks: found.map((w) => ({
          weekStartOn: w.weekStartOn,
          ideas: w.ideas.filter((i) => !i.hidden).map((i) => ({ id: i.id, category: i.category, title: i.title, detail: i.detail, drafted: i.drafted })),
        })),
      };
    },
  }),
  def({
    name: "search_knowledge",
    title: "Search knowledge base",
    description: "Search the user's knowledge base (notes, documents, links) for passages that match the query.",
    schema: z.object({ query: z.string().trim().min(1).max(300) }),
    readOnly: true,
    run: async (profileId, { query }) => plain(await searchKBText(profileId, null, query, 5)),
  }),
  def({
    name: "read_knowledge",
    title: "Read knowledge item",
    description: "Read one knowledge base item in full, by the id search_knowledge gave.",
    schema: z.object({ id: z.string().trim().min(1).max(100) }),
    readOnly: true,
    run: async (profileId, { id }) => {
      const text = await readKBText(profileId, id);
      return text.startsWith("Failed:") ? fail(text) : plain(text);
    },
  }),
  def({
    name: "list_memories",
    title: "List memories",
    description: "What Orbit remembers about the user, one line each with an id update_memory accepts.",
    schema: z.object({}),
    readOnly: true,
    run: async (profileId) => {
      const docs = await listMemory(profileId);
      return {
        memories: docs
          .filter((d) => d.content.trim())
          .flatMap((d) => memoryLines(d.content).map((l) => ({ id: `${d.key}#${l.index}`, path: `${d.key}.md`, text: l.text }))),
      };
    },
  }),
  def({
    name: "list_posts",
    title: "List posts",
    description: "The user's posts, most recently edited first, with a short excerpt of each.",
    schema: z.object({ status: z.enum(["draft", "posted"]).optional(), limit: z.number().int().min(1).max(50).optional() }),
    readOnly: true,
    run: async (profileId, { status, limit }) => {
      const { posts } = await listPosts(profileId, { limit: 500, textMax: 400 });
      const wanted = status ? posts.filter((p) => (status === "posted" ? p.postedAt : !p.postedAt)) : posts;
      return {
        posts: wanted.slice(0, limit ?? 20).map((p) => ({ id: p.id, title: p.title, status: p.postedAt ? "posted" : "draft", excerpt: excerpt(p.text, 300), updatedAt: iso(p.updatedAt) })),
      };
    },
  }),
  def({
    name: "read_post",
    title: "Read post",
    description: "Read one post in full: its current text and version history.",
    schema: z.object({ id: z.string().trim().min(1).max(100) }),
    readOnly: true,
    run: async (profileId, { id }) => {
      const doc = await getDocument(profileId, id);
      if (!doc) return NOT_FOUND("post");
      const versions = await listDocumentVersions(profileId, id);
      return {
        id: doc.id,
        title: doc.title,
        text: doc.text,
        status: doc.postedAt ? "posted" : "draft",
        version: doc.currentVersion,
        versions: versions.map((v) => ({ version: v.version, source: v.source, note: v.changeSummary, createdAt: iso(v.createdAt) })),
      };
    },
  }),
  def({
    name: "list_templates",
    title: "List templates",
    description: "Post and hook templates: Orbit's own and the user's. Filter by type (HOOK or POST), category or a search word.",
    schema: z.object({ type: z.enum(["HOOK", "POST"]).optional(), category: z.string().trim().max(60).optional(), search: z.string().trim().max(100).optional() }),
    readOnly: true,
    run: async (profileId, { type, category, search }) => {
      const { items, total } = await listTemplates({ ownerProfileId: profileId, type: type as TemplateType | undefined, category, search, limit: 30 });
      return { total, templates: items.map((t) => ({ slug: t.slug, type: t.type, category: t.category, title: t.title, skeleton: excerpt(t.skeleton, 200), own: t.own })) };
    },
  }),
  def({
    name: "read_template",
    title: "Read template",
    description: "Read one template in full, by its slug.",
    schema: z.object({ slug: z.string().trim().min(1).max(100) }),
    readOnly: true,
    run: async (profileId, { slug }) => {
      const t = await getTemplateBySlug(slug);
      // Another profile's own template is "not found", exactly like a missing one.
      if (!t || (!t.system && t.profileId !== profileId)) return NOT_FOUND("template");
      return { slug: t.slug, type: t.type, category: t.category, title: t.title, skeleton: t.skeleton, why: t.why, own: !t.system };
    },
  }),
  def({
    name: "create_draft",
    title: "Create draft post",
    description: "Save a new draft post in the user's Posts. It is never published; the user reviews and posts it themselves.",
    schema: z.object({ title: z.string().trim().min(1).max(120), text: z.string().min(1).max(5000) }),
    readOnly: false,
    run: async (profileId, { title, text }) => {
      const doc = await createAssistantDocument(profileId, { title, text });
      return { id: doc.id, title: doc.title, version: doc.currentVersion, message: "Draft saved in the user's Posts." };
    },
  }),
  def({
    name: "edit_post",
    title: "Edit post",
    description: "Change a post's text. This saves a new version; the previous version stays and the user can restore it.",
    schema: z.object({ id: z.string().trim().min(1).max(100), text: z.string().min(1).max(5000), note: z.string().trim().max(200).optional() }),
    readOnly: false,
    run: async (profileId, { id, text, note }) => {
      const doc = await getDocument(profileId, id);
      if (!doc) return NOT_FOUND("post");
      try {
        const saved = await saveDocumentVersion(profileId, id, { text, source: "ASSISTANT", changeSummary: note, expectedVersion: doc.version });
        return { id: saved.id, version: saved.currentVersion, message: "Saved as a new version. The previous version is still there." };
      } catch (err) {
        if (err instanceof DocumentVersionConflict) return fail("The post changed while you were editing. Read it again and retry.");
        if (err instanceof DocumentError) return err.code === "not_found" ? NOT_FOUND("post") : fail(err.message);
        throw err;
      }
    },
  }),
  def({
    name: "save_idea",
    title: "Save idea",
    description: "Save a post idea to the user's saved items.",
    schema: z.object({ title: z.string().trim().min(1).max(120), detail: z.string().trim().min(1).max(1000) }),
    readOnly: false,
    run: async (profileId, { title, detail }) => {
      try {
        const item = await saveItem(profileId, { kind: "IDEA", snapshot: { title, text: detail } });
        return { id: item.id, message: "Idea saved." };
      } catch (err) {
        if (err instanceof SavesError) return fail(err.message);
        throw err;
      }
    },
  }),
  def({
    name: "add_memory",
    title: "Add memory",
    description:
      "Remember one lasting fact the user told you about themselves, in the third person (for example \"Runs a six-person design studio\"). Orbit refuses requests, questions and passing remarks.",
    schema: z.object({ text: z.string().trim().min(1).max(1000), category: z.enum(MEMORY_CATEGORIES.filter((c) => c !== "topic") as [string, ...string[]]).optional() }),
    readOnly: false,
    run: async (profileId, { text, category }) => {
      // The fact is the only words there are to judge, so the guard reads it as the user's own statement.
      const result = await saveMemoryFacts(profileId, { category: (category ?? "about") as "about", topic: null, facts: [text] }, text);
      return result.startsWith("✓") ? plain(result) : fail(result);
    },
  }),
  def({
    name: "update_memory",
    title: "Update memory",
    description: "Replace one remembered line, by the id list_memories gave. Goes through the same checks as add_memory.",
    schema: z.object({ id: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(1000) }),
    readOnly: false,
    run: async (profileId, { id, text }) => {
      const m = MEMORY_ID.exec(id);
      if (!m) return fail("That isn't a memory id. Use an id from list_memories.");
      const key = m[1]!;
      const index = Number(m[2]);
      if (key.startsWith("strategy/")) return fail(`${key}.md mirrors the content strategy and can't be changed here.`);
      if (!isAgentWritable(key)) return fail(`${key}.md can't be changed from an assistant.`);
      const check = checkMemoryFact(text);
      if (!check.ok) return fail(check.reason === "refusal" ? "Refused: that reads like an assistant reply, not a fact about the user. Nothing was changed." : "Refused: a memory must be 8 to 500 characters. Nothing was changed.");
      const verdict = learningGuard(text, [check.text]);
      if (verdict.allowed.length === 0) return fail(`Refused: ${verdict.refused[0]?.reason ?? "not a lasting fact about the user"}. Nothing was changed.`);
      const doc = (await listMemory(profileId)).find((d) => d.key === key);
      const line = doc ? memoryLines(doc.content).find((l) => l.index === index) : undefined;
      if (!line) return NOT_FOUND("memory line");
      try {
        await editMemoryLine(profileId, key, index, check.text, line.text);
      } catch (err) {
        if (err instanceof AccountError) return fail("That memory changed in the meantime. List memories again and retry.");
        throw err;
      }
      return { id, message: "Memory updated." };
    },
  }),
];

const BY_NAME = new Map(MCP_TOOLS.map((t) => [t.name, t]));

/**
 * One tool call for one user: the profile comes from the user's binding (never from the arguments), the per-profile
 * limiter runs before anything is read, and the arguments are validated against the tool's schema.
 */
export async function callMcpTool(userId: string, name: string, args: unknown, deps: McpToolDeps = {}): Promise<McpToolResult> {
  const tool = BY_NAME.get(name);
  if (!tool) return fail(`Unknown tool: ${name}`);
  const binding = await getBinding(userId);
  if (!binding) return fail(NO_PROFILE_MESSAGE);
  const gate = await (deps.limiter ?? defaultLimiter()).take("mcp", binding.profileId, { limit: MCP_LIMIT, windowSec: MCP_WINDOW_SEC });
  if (!gate.ok) return fail(RATE_LIMITED_MESSAGE);
  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) return fail(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`);
  const out = await tool.run(binding.profileId, parsed.data);
  return isResult(out) ? { text: out.text, ...(out.isError ? { isError: true } : {}) } : { text: JSON.stringify(out, null, 2) };
}

/** Registers every tool on an MCP server. The user comes from the verified token (`authInfo.extra.userId`), never from a tool argument. */
export function registerMcpTools(server: McpServer, deps: McpToolDeps = {}): void {
  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.schema as z.ZodObject,
        annotations: { readOnlyHint: tool.readOnly, destructiveHint: false, openWorldHint: false },
      },
      async (args: unknown, ctx: { http?: { authInfo?: { extra?: Record<string, unknown> } } }) => {
        const userId = ctx.http?.authInfo?.extra?.userId;
        if (typeof userId !== "string") return { content: [{ type: "text" as const, text: "Not signed in." }], isError: true };
        const res = await callMcpTool(userId, tool.name, args, deps);
        return { content: [{ type: "text" as const, text: res.text }], ...(res.isError ? { isError: true } : {}) };
      },
    );
  }
}
