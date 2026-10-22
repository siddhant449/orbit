import { describe, expect, it } from "vitest";
import { knowledgePayload, knowledgeStatus, knowledgeTypeLabel, wordCount } from "./knowledge-view";

describe("knowledgeStatus", () => {
  it("maps each ingest status to an honest pill", () => {
    expect(knowledgeStatus("PROCESSING")).toEqual({ label: "Indexing", tone: "neutral" });
    expect(knowledgeStatus("READY")).toEqual({ label: "Ready", tone: "accent" });
    expect(knowledgeStatus("FAILED")).toEqual({ label: "Couldn't read", tone: "danger" });
  });
});

describe("knowledgeTypeLabel", () => {
  it("names every type in plain words", () => {
    expect(["TEXT", "DOCUMENT", "URL", "VIDEO", "IMAGE"].map((t) => knowledgeTypeLabel(t as never))).toEqual([
      "Note",
      "Document",
      "Web page",
      "Video",
      "Image",
    ]);
  });
});

describe("knowledgePayload", () => {
  it("a link becomes a URL item, trimmed (video ingest is not built, so links are always web pages)", () => {
    expect(knowledgePayload({ kind: "link", url: "  https://example.com/a  ", title: "", content: "" })).toEqual({
      type: "URL",
      url: "https://example.com/a",
    });
    expect(knowledgePayload({ kind: "link", url: "https://youtu.be/x", title: "", content: "" }).type).toBe("URL");
  });

  it("a note becomes a TEXT item with its trimmed title and body", () => {
    expect(knowledgePayload({ kind: "note", url: "", title: " Pricing ", content: " body " })).toEqual({
      type: "TEXT",
      title: "Pricing",
      content: "body",
    });
  });
});

describe("wordCount", () => {
  it("counts whitespace-separated words like the API does", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
    expect(wordCount(" one  two\nthree\tfour ")).toBe(4);
  });
});
