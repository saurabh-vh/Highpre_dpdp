import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * A tiny flowing-layout writer on top of pdf-lib: headings, paragraphs,
 * key/value lists and tables, with automatic page breaks. Uses the standard
 * Helvetica fonts, so text is reduced to Latin-1 (other scripts become "?").
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const INK = rgb(0.07, 0.07, 0.08);
const MUTED = rgb(0.42, 0.42, 0.45);
const RULE = rgb(0.86, 0.86, 0.88);

const REPLACEMENTS: Record<string, string> = {
  "—": "-", "–": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "•": "-", "…": "...", "₹": "Rs. ", " ": " ", "→": "->", "✓": "x",
};

/** Makes text safe for the standard PDF fonts (WinAnsi / Latin-1). */
export function pdfSafe(input: unknown): string {
  const text = String(input ?? "");
  let out = "";
  for (const ch of text) {
    const mapped = REPLACEMENTS[ch];
    if (mapped !== undefined) out += mapped;
    else if (ch === "\n" || ch === "\t") out += " ";
    else {
      const code = ch.codePointAt(0)!;
      out += (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) ? ch : "?";
    }
  }
  return out;
}

export type Column = { header: string; width: number; align?: "left" | "right" };

export class PdfWriter {
  private constructor(
    readonly doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
  ) {}

  private page!: PDFPage;
  private y = 0;

  static async create(title: string): Promise<PdfWriter> {
    const doc = await PDFDocument.create();
    doc.setTitle(title);
    doc.setProducer("HighPre");
    doc.setCreator("HighPre");
    const w = new PdfWriter(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
    w.newPage();
    return w;
  }

  private get width() {
    return A4[0] - MARGIN * 2;
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN + 20) this.newPage();
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const words = pdfSafe(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Break very long tokens (URLs, hashes) across lines.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  private draw(text: string, x: number, size: number, font: PDFFont, color = INK) {
    this.page.drawText(text, { x, y: this.y, size, font, color });
  }

  title(text: string, subtitle?: string) {
    this.ensure(60);
    for (const line of this.wrap(text, this.bold, 22, this.width)) {
      this.y -= 22;
      this.draw(line, MARGIN, 22, this.bold);
      this.y -= 6;
    }
    if (subtitle) this.paragraph(subtitle, { muted: true, size: 11 });
    this.space(10);
  }

  heading(text: string, level: 1 | 2 = 1) {
    const size = level === 1 ? 15 : 11.5;
    this.space(level === 1 ? 14 : 8);
    this.ensure(size + 40);
    this.y -= size;
    this.draw(pdfSafe(text), MARGIN, size, this.bold);
    this.y -= level === 1 ? 8 : 5;
    if (level === 1) {
      this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4[0] - MARGIN, y: this.y }, thickness: 0.6, color: RULE });
      this.y -= 10;
    }
  }

  paragraph(text: string, opts: { muted?: boolean; size?: number; bold?: boolean } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.regular;
    for (const line of this.wrap(text, font, size, this.width)) {
      this.ensure(size + 4);
      this.y -= size + 3;
      this.draw(line, MARGIN, size, font, opts.muted ? MUTED : INK);
    }
    this.y -= 4;
  }

  /** Two-column label/value list. */
  keyValues(rows: [string, unknown][]) {
    const labelWidth = 150;
    for (const [label, value] of rows) {
      const lines = this.wrap(String(value ?? "-") || "-", this.regular, 9.5, this.width - labelWidth);
      this.ensure(lines.length * 13 + 2);
      this.y -= 12.5;
      this.draw(pdfSafe(label), MARGIN, 9, this.regular, MUTED);
      lines.forEach((line, i) => {
        if (i > 0) this.y -= 12.5;
        this.draw(line, MARGIN + labelWidth, 9.5, this.regular);
      });
    }
    this.y -= 6;
  }

  /** Table with wrapped cells. Column widths are fractions of the page width. */
  table(columns: Column[], rows: unknown[][], empty = "None.") {
    if (rows.length === 0) {
      this.paragraph(empty, { muted: true });
      return;
    }
    const widths = columns.map((c) => c.width * this.width);
    const header = () => {
      this.ensure(30);
      this.y -= 11;
      let x = MARGIN;
      columns.forEach((c, i) => {
        this.draw(pdfSafe(c.header).toUpperCase(), x, 7.5, this.bold, MUTED);
        x += widths[i];
      });
      this.y -= 5;
      this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4[0] - MARGIN, y: this.y }, thickness: 0.6, color: RULE });
    };
    header();
    for (const row of rows) {
      const cells = row.map((cell, i) => this.wrap(String(cell ?? "-"), this.regular, 8.5, widths[i] - 6));
      const height = Math.max(...cells.map((c) => c.length)) * 11 + 6;
      if (this.y - height < MARGIN + 20) {
        this.newPage();
        header();
      }
      const top = this.y;
      let x = MARGIN;
      cells.forEach((lines, i) => {
        this.y = top - 3;
        for (const line of lines) {
          this.y -= 11;
          const w = this.regular.widthOfTextAtSize(line, 8.5);
          const cx = columns[i].align === "right" ? x + widths[i] - 6 - w : x;
          this.page.drawText(line, { x: cx, y: this.y, size: 8.5, font: this.regular, color: INK });
        }
        x += widths[i];
      });
      this.y = top - height;
      this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4[0] - MARGIN, y: this.y }, thickness: 0.3, color: RULE });
    }
    this.y -= 8;
  }

  space(points: number) {
    this.y -= points;
  }

  /** Stamps "page N of M" and a footer line on every page. */
  finish(footer: string): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((page, i) => {
      const text = pdfSafe(`${footer}  ·  Page ${i + 1} of ${pages.length}`);
      page.drawText(text, { x: MARGIN, y: 28, size: 7.5, font: this.regular, color: MUTED });
    });
    return this.doc.save();
  }
}
