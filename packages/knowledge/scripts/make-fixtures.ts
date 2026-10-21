/** Regenerates test/fixtures. Run: pnpm --filter @brandloop/knowledge fixtures */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as XLSX from "xlsx";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");
mkdirSync(dir, { recursive: true });

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
pdf.addPage().drawText("Pricing is a positioning decision (pdf fixture).", { x: 40, y: 700, size: 14, font });
writeFileSync(join(dir, "sample.pdf"), await pdf.save());

const doc = new Document({
  sections: [{ children: [new Paragraph("Short paragraphs win on mobile (docx fixture).")] }],
});
writeFileSync(join(dir, "sample.docx"), await Packer.toBuffer(doc));

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([["topic", "note"], ["hooks", "Lead with the result (xlsx fixture)"]]),
  "Ideas",
);
writeFileSync(join(dir, "sample.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

writeFileSync(join(dir, "sample.md"), "# Notes\n\nConsistency beats intensity (md fixture).\n");

const body = Array.from(
  { length: 6 },
  (_, i) =>
    `<p>Paragraph ${i}: a founder who writes every week builds trust slowly and compounds attention over many months of steady work.</p>`,
).join("\n");
writeFileSync(
  join(dir, "article.html"),
  `<!doctype html><html><head><title>On writing</title></head><body><nav>Home About Contact</nav><article><h1>On writing</h1>${body}<p>The article fixture sentence lives here.</p></article><footer>copyright</footer></body></html>\n`,
);
