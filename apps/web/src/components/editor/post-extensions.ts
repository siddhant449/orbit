import { Extension, type AnyExtension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Slice, type Node as PMNode } from "@tiptap/pm/model";
import { docToText, textToDoc, type PostNode } from "./post-format";
import { foldPoint } from "./fold";

/** The document's plain text, read straight off the ProseMirror tree (same mapping as `docToText`). */
export function pmText(doc: PMNode): string {
  const parts: string[] = [];
  doc.forEach((p) => parts.push(p.textBetween(0, p.content.size, "", "\n")));
  return parts.join("\n\n");
}

const foldKey = new PluginKey<DecorationSet>("postFold");

function foldWidget(): HTMLElement {
  const el = document.createElement("span");
  el.className = "post-fold";
  el.contentEditable = "false";
  el.setAttribute("data-fold-line", "");
  el.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "post-fold__label";
  label.textContent = "…see more · fold line";
  el.appendChild(label);
  return el;
}

function foldDecorations(doc: PMNode): DecorationSet {
  const at = foldPoint(pmText(doc));
  if (at === null) return DecorationSet.empty;
  // A document position is the text offset + 1 (post-format.ts).
  return DecorationSet.create(doc, [Decoration.widget(at + 1, foldWidget, { side: 1, key: "fold", ignoreSelection: true })]);
}

/** Draws LinkedIn's "…see more" fold (210 characters) inside the editor, moving with the text. */
const FoldLine = Extension.create({
  name: "postFold",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: foldKey,
        state: {
          init: (_, state) => foldDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? foldDecorations(tr.doc) : old),
        },
        props: { decorations: (state) => foldKey.getState(state) },
      }),
    ];
  },
});

/**
 * Plain-text clipboard: copying gives the post as LinkedIn will show it, and pasting text keeps single line breaks as
 * line breaks (ProseMirror's default turns every line into a paragraph). Pasted HTML is reduced to paragraphs and
 * breaks by the schema itself.
 */
const PlainClipboard = Extension.create({
  name: "postClipboard",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          clipboardTextSerializer: (slice) => docToText({ content: slice.content.toJSON() as PostNode[] }),
          clipboardTextParser: (text, _ctx, _plain, view) => {
            const doc = view.state.schema.nodeFromJSON(textToDoc(text));
            return new Slice(doc.content, 1, 1);
          },
        },
      }),
    ];
  },
});

/** What LinkedIn can show: paragraphs and line breaks. No headings, marks, lists, code or links. */
export function postExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      blockquote: false,
      bold: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      italic: false,
      listItem: false,
      listKeymap: false,
      link: false,
      orderedList: false,
      strike: false,
      underline: false,
      trailingNode: false,
      dropcursor: false,
      hardBreak: { keepMarks: false },
      undoRedo: { depth: 200 },
    }),
    FoldLine,
    PlainClipboard,
  ];
}
