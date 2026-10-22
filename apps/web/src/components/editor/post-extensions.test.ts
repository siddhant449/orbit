import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/react";
import { postExtensions, pmText } from "./post-extensions";
import { docToText, textToDoc } from "./post-format";

const schema = getSchema(postExtensions());

describe("post schema", () => {
  it("has only what LinkedIn can show", () => {
    expect(Object.keys(schema.nodes).sort()).toEqual(["doc", "hardBreak", "paragraph", "text"]);
    expect(Object.keys(schema.marks)).toEqual([]);
  });

  it.each(["", "One.", "A\nB\n\nC", "a\n\n\nb", "\n\nlead", "trail\n\n", "• one\n• two"])(
    "reads %j back from the ProseMirror tree exactly",
    (text) => {
      const node = schema.nodeFromJSON(textToDoc(text));
      expect(pmText(node)).toBe(text);
      expect(docToText(node.toJSON())).toBe(text);
    },
  );
});
