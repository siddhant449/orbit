import { describe, expect, it } from "vitest";
import { docToText, offsetToPos, posToOffset, textToDoc, toggleLinePrefix } from "./post-format";

const samples = [
  "",
  "One line.",
  "Free users cost us more than they taught us.\n\nNot in money. In attention.",
  "Support\n- 61% of tickets\n- 4% of revenue",
  "Hook.\n\n\nThree newlines in a row.",
  "a\n\n\n\nb",
  "\n\nLeading blank lines",
  "Trailing newline\n",
  "Trailing blank paragraph\n\n",
  "  Indented  with   spaces  ",
  "Tabs\tand emoji 🚀 and • bullets",
  "\n",
];

describe("textToDoc / docToText", () => {
  it.each(samples)("round-trips %j exactly", (text) => {
    expect(docToText(textToDoc(text))).toBe(text);
  });

  it("maps blank-line gaps to paragraphs and single newlines to hard breaks", () => {
    expect(textToDoc("A\nB\n\nC")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A" }, { type: "hardBreak" }, { type: "text", text: "B" }] },
        { type: "paragraph", content: [{ type: "text", text: "C" }] },
      ],
    });
  });

  it("keeps an empty post as one empty paragraph", () => {
    expect(textToDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("normalises Windows line endings", () => {
    expect(docToText(textToDoc("A\r\n\r\nB\r\nC"))).toBe("A\n\nB\nC");
  });

  it("flattens anything LinkedIn can't show (lists, headings, marks) to plain text", () => {
    const pasted = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title", marks: [{ type: "bold" }] }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
          ],
        },
        {
          type: "orderedList",
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] }],
        },
      ],
    };
    expect(docToText(pasted)).toBe("Title\n\n• one\n• two\n\n1. first");
  });
});

describe("posToOffset / offsetToPos", () => {
  it("is pos - 1 inside paragraphs, hard breaks included", () => {
    // "AB\nC\n\nD": doc pos 1 = before A; the second paragraph's content starts at 1 + 4 + 2 = 7.
    const text = "AB\nC\n\nD";
    expect(posToOffset(text, 1)).toBe(0);
    expect(posToOffset(text, 4)).toBe(3);
    expect(posToOffset(text, 7)).toBe(6);
    expect(text.slice(posToOffset(text, 7))).toBe("D");
  });

  it("clamps to the text", () => {
    expect(posToOffset("abc", 0)).toBe(0);
    expect(posToOffset("abc", 99)).toBe(3);
    expect(offsetToPos("abc", -4)).toBe(1);
    expect(offsetToPos("abc", 99)).toBe(4);
    expect(offsetToPos("abc", 2)).toBe(3);
  });
});

describe("toggleLinePrefix", () => {
  it("adds bullets to every line the selection touches", () => {
    const text = "Intro\n\nSupport\nTickets\nRevenue\n\nEnd";
    const from = text.indexOf("upport");
    const to = text.indexOf("Revenue") + 2;
    const out = toggleLinePrefix(text, from, to, "bullet");
    expect(out.text).toBe("Intro\n\n• Support\n• Tickets\n• Revenue\n\nEnd");
    expect(out.text.slice(out.from, out.to)).toBe("upport\n• Tickets\n• Re");
  });

  it("removes bullets when every touched line has one", () => {
    const out = toggleLinePrefix("• a\n• b", 0, 7, "bullet");
    expect(out.text).toBe("a\nb");
  });

  it("numbers lines and skips blank ones", () => {
    const text = "one\n\ntwo\nthree";
    expect(toggleLinePrefix(text, 0, text.length, "number").text).toBe("1. one\n\n2. two\n3. three");
    expect(toggleLinePrefix("1. one\n2. two", 0, 13, "number").text).toBe("one\ntwo");
  });

  it("swaps one list style for the other", () => {
    expect(toggleLinePrefix("• a\n• b", 0, 7, "number").text).toBe("1. a\n2. b");
  });

  it("works on the caret's line", () => {
    const out = toggleLinePrefix("a\nbc\nd", 3, 3, "bullet");
    expect(out.text).toBe("a\n• bc\nd");
    expect(out.from).toBe(5);
    expect(out.to).toBe(5);
  });
});
