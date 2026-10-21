import { describe, expect, it } from "vitest";
import {
  CORE_KEYS,
  SECTION_META,
  isAgentWritable,
  keyToPath,
  pathToKey,
  renderCoreSections,
  renderMemoryFile,
  renderMemoryIndex,
  replaceOnce,
  searchMemoryLines,
  sectionMeta,
} from "./memory-tree";

describe("section metadata", () => {
  it("covers the fixed sections", () => {
    expect(Object.keys(SECTION_META).sort()).toEqual([
      "identity/about",
      "identity/personal",
      "identity/story",
      "strategy/themes",
      "voice/style",
      "writing/rules",
    ]);
    expect(sectionMeta("identity/about").description).toBe("Who the user is: role, company, positioning");
    expect(CORE_KEYS).toEqual(["identity/about", "identity/personal", "identity/story", "writing/rules"]);
  });

  it("generates titles and descriptions for topics and notes", () => {
    expect(sectionMeta("topics/design-systems")).toEqual({
      title: "Design Systems",
      description: "What the user knows and thinks about design systems",
    });
    expect(sectionMeta("notes/launch-plan")).toEqual({
      title: "Launch Plan",
      description: "Notes the user asked to keep about launch plan",
    });
  });

  it("falls back to a generic entry for unknown keys", () => {
    const meta = sectionMeta("audiences/founders");
    expect(meta.title).toBe("Founders");
    expect(meta.description.length).toBeGreaterThan(0);
  });
});

describe("paths", () => {
  it("adds and strips the .md suffix", () => {
    expect(keyToPath("identity/about")).toBe("identity/about.md");
    expect(pathToKey("identity/about.md")).toBe("identity/about");
    expect(pathToKey("identity/about")).toBe("identity/about");
  });

  it("parses paths safely", () => {
    expect(pathToKey("identity/about.md")).toBe("identity/about");
    expect(pathToKey("../etc/passwd")).toBeNull();
    expect(pathToKey("Identity/About.md")).toBeNull();
    expect(pathToKey("identity/about.md.md")).toBeNull();
    expect(pathToKey("/identity/about.md")).toBeNull();
    expect(pathToKey("")).toBeNull();
    expect(pathToKey(".md")).toBeNull();
    expect(isAgentWritable("strategy/themes")).toBe(false);
    expect(isAgentWritable("topics/pricing")).toBe(true);
  });

  it("limits what the agent may write", () => {
    for (const key of ["identity/about", "identity/personal", "identity/story", "writing/rules", "voice/style", "notes/ideas"]) {
      expect(isAgentWritable(key)).toBe(true);
    }
    for (const key of ["strategy/themes", "strategy/other", "audiences/founders", "topics", "topics/a/b", "identity/other"]) {
      expect(isAgentWritable(key)).toBe(false);
    }
  });
});

describe("renderMemoryIndex", () => {
  it("renders the index grouped by folder with descriptions and dates", () => {
    const out = renderMemoryIndex([
      { key: "identity/about", updatedAt: new Date("2026-10-21T10:00:00Z") },
      { key: "topics/design-systems", updatedAt: new Date("2026-10-20T10:00:00Z") },
    ]);
    expect(out).toBe(
      "identity/\n  identity/about.md, Who the user is: role, company, positioning (updated 2026-10-21)\n" +
        "topics/\n  topics/design-systems.md, What the user knows and thinks about design systems (updated 2026-10-20)",
    );
  });

  it("is stable regardless of input order and returns an empty string for no docs", () => {
    const a = { key: "identity/about", updatedAt: new Date("2026-10-21T10:00:00Z") };
    const b = { key: "identity/story", updatedAt: new Date("2026-10-19T10:00:00Z") };
    const c = { key: "voice/style", updatedAt: new Date("2026-10-18T10:00:00Z") };
    expect(renderMemoryIndex([c, b, a])).toBe(renderMemoryIndex([a, b, c]));
    expect(renderMemoryIndex([c, b, a]).split("\n").filter((l) => !l.startsWith(" "))).toEqual(["identity/", "voice/"]);
    expect(renderMemoryIndex([])).toBe("");
  });
});

describe("renderMemoryFile", () => {
  it("renders a file with the verbatim header", () => {
    expect(renderMemoryFile({ key: "voice/style", content: "## Rhythm\n- Short" }, 7).split("\n")[0]).toMatch(
      /^\[memory file: voice\/style\.md \| title: Voice and style \| description: .+ \| version: 7\]$/,
    );
  });

  it("states that the body is verbatim, then a blank line, then the exact body", () => {
    const body = "## Rhythm\n- Short\n  - nested";
    const lines = renderMemoryFile({ key: "voice/style", content: body }, 3).split("\n");
    expect(lines[1]).toBe(
      "(everything below this line is the stored file content, verbatim; editMemory find text must match it exactly)",
    );
    expect(lines[2]).toBe("");
    expect(lines.slice(3).join("\n")).toBe(body);
  });
});

describe("renderCoreSections", () => {
  it("renders only core sections, in core order, skipping blank ones", () => {
    const out = renderCoreSections([
      { key: "writing/rules", content: "- Be brief" },
      { key: "topics/pricing", content: "- Not core" },
      { key: "identity/personal", content: "   " },
      { key: "identity/about", content: "- Runs a studio" },
    ]);
    expect(out).toBe(
      "[memory file: identity/about.md | description: Who the user is: role, company, positioning]\n- Runs a studio\n\n" +
        "[memory file: writing/rules.md | description: " +
        sectionMeta("writing/rules").description +
        "]\n- Be brief",
    );
    expect(renderCoreSections([])).toBe("");
  });
});

describe("searchMemoryLines", () => {
  it("ranks lines matching more query terms first", () => {
    const hits = searchMemoryLines(
      [{ key: "identity/about", content: "- Runs a studio\n- Runs a design studio in Pune" }],
      "design studio",
    );
    expect(hits[0]).toEqual({ path: "identity/about.md", text: "Runs a design studio in Pune" });
    expect(hits).toHaveLength(2);
  });

  it("ignores case, non-bullet lines and lines with no matching term, and honours the limit", () => {
    const docs = [
      { key: "topics/a", content: "## Heading about Pricing\n- PRICING tiers\n- Something else\n- more pricing notes" },
    ];
    expect(searchMemoryLines(docs, "pricing").map((h) => h.text)).toEqual(["PRICING tiers", "more pricing notes"]);
    expect(searchMemoryLines(docs, "pricing", 1)).toHaveLength(1);
    expect(searchMemoryLines(docs, "   ")).toEqual([]);
  });
});

describe("replaceOnce", () => {
  it("reports 0 and 2 matches", () => {
    expect(replaceOnce("a b a", "a", "x")).toEqual({ ok: false, count: 2 });
    expect(replaceOnce("a b", "c", "x")).toEqual({ ok: false, count: 0 });
    expect(replaceOnce("a b", "b", "c")).toEqual({ ok: true, content: "a c" });
  });

  it("treats the replacement literally and refuses an empty find", () => {
    expect(replaceOnce("price", "price", "$& $1")).toEqual({ ok: true, content: "$& $1" });
    expect(replaceOnce("a - b", " - b", "")).toEqual({ ok: true, content: "a" });
    expect(replaceOnce("abc", "", "x")).toEqual({ ok: false, count: 0 });
  });
});
