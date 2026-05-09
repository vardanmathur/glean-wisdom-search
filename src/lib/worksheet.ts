import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import type { Highlight } from "@/lib/data";

const TEAL: [number, number, number] = [26, 122, 110]; // #1A7A6E
const GREY_RULE: [number, number, number] = [210, 210, 210];
const TEXT: [number, number, number] = [30, 30, 30];
const MUTED: [number, number, number] = [110, 110, 110];

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_RESERVE = 15; // mm reserved at bottom for footer

export function sanitizeQueryForFilename(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "worksheet";
}

interface BuildOpts {
  query: string;
  synthesis: string;
  highlights: Highlight[];
  questions: string[];
}

export function generateWorksheetPdf(opts: BuildOpts): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("helvetica", "normal");

  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - FOOTER_RESERVE) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const sectionHeader = (label: string) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TEAL);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 6;
    doc.setTextColor(...TEXT);
    doc.setFont("helvetica", "normal");
  };

  const writeWrapped = (
    text: string,
    fontSize: number,
    style: "normal" | "italic" | "bold" = "normal",
    lineGap = 1.2,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, CONTENT_W);
    const lineHeight = fontSize * 0.3528 * lineGap; // pt → mm
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, MARGIN, y);
      y += lineHeight;
    }
  };

  const ruledLines = (count: number, gap = 7) => {
    doc.setDrawColor(...GREY_RULE);
    doc.setLineWidth(0.2);
    for (let i = 0; i < count; i++) {
      ensureSpace(gap);
      y += gap - 1;
      doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
      y += 1;
    }
  };

  // === HEADER ===
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...TEAL);
  doc.text("Your Glean Worksheet", MARGIN, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), MARGIN, y);
  y += 8;
  doc.setTextColor(...TEXT);

  // === SECTION 1: Query callout ===
  sectionHeader("Your question");
  {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(`"${opts.query}"`, CONTENT_W - 8);
    const lineHeight = 12 * 0.3528 * 1.3;
    const boxH = lines.length * lineHeight + 8;
    ensureSpace(boxH + 4);
    doc.setFillColor(245, 248, 247);
    doc.setDrawColor(...TEAL);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, y, CONTENT_W, boxH, "FD");
    let ly = y + 6;
    for (const line of lines) {
      doc.text(line, MARGIN + 4, ly);
      ly += lineHeight;
    }
    y += boxH + 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT);
  }

  // === SECTION 2: Synthesis ===
  sectionHeader("What the wisdom says");
  if (opts.synthesis && opts.synthesis.trim().length > 0) {
    // Strip markdown artefacts for clean PDF rendering
    const clean = opts.synthesis
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/^#+\s*/gm, "")
      .replace(/^---+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    writeWrapped(clean, 10, "normal", 1.4);
  } else {
    writeWrapped("(No synthesis available)", 10, "italic");
  }
  y += 4;

  // === SECTION 3: Top 5 highlights ===
  sectionHeader("Highlights worth keeping");
  const top = opts.highlights.slice(0, 5);
  if (top.length === 0) {
    writeWrapped("(No highlights)", 10, "italic");
  } else {
    for (const h of top) {
      const quoteText = h.text.length > 600 ? h.text.slice(0, 600).trimEnd() + "…" : h.text;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...TEXT);
      const qLines = doc.splitTextToSize(`"${quoteText}"`, CONTENT_W);
      const lh = 10 * 0.3528 * 1.4;
      ensureSpace(qLines.length * lh + 6);
      for (const line of qLines) {
        ensureSpace(lh);
        doc.text(line, MARGIN, y);
        y += lh;
      }
      // Right-aligned attribution
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      const attr = `— ${h.bookTitle}, ${h.author}`;
      const attrW = doc.getTextWidth(attr);
      ensureSpace(5);
      doc.text(attr, MARGIN + CONTENT_W - attrW, y + 1);
      y += 7;
      doc.setTextColor(...TEXT);
    }
  }
  y += 2;

  // === SECTION 4: Books worth exploring ===
  sectionHeader("Books worth exploring");
  const seen = new Set<string>();
  const books: { title: string; author: string }[] = [];
  for (const h of opts.highlights) {
    const key = `${h.bookTitle}::${h.author}`;
    if (!seen.has(key)) {
      seen.add(key);
      books.push({ title: h.bookTitle, author: h.author });
    }
  }
  if (books.length === 0) {
    writeWrapped("(No books)", 10, "italic");
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    for (const b of books) {
      const line = `• ${b.title} — ${b.author}`;
      const wrapped = doc.splitTextToSize(line, CONTENT_W);
      const lh = 10 * 0.3528 * 1.3;
      for (const wl of wrapped) {
        ensureSpace(lh);
        doc.text(wl, MARGIN, y);
        y += lh;
      }
    }
  }

  // === PAGE BREAK → Reflection ===
  doc.addPage();
  y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...TEAL);
  doc.text("Reflection & Action", MARGIN, y);
  y += 10;
  doc.setTextColor(...TEXT);

  // === SECTION 5: Reflection questions ===
  sectionHeader("Sit with these questions");
  const qs = (opts.questions && opts.questions.length > 0)
    ? opts.questions.slice(0, 4)
    : ["", "", "", ""];
  qs.forEach((q, i) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    const qLines = doc.splitTextToSize(`${i + 1}. ${q}`, CONTENT_W);
    const lh = 10 * 0.3528 * 1.4;
    ensureSpace(qLines.length * lh + 4 * 7 + 4);
    for (const line of qLines) {
      ensureSpace(lh);
      doc.text(line, MARGIN, y);
      y += lh;
    }
    y += 1;
    ruledLines(4);
    y += 3;
  });

  // === SECTION 6 ===
  sectionHeader("Make it real");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("What will I do differently?", MARGIN, y);
  y += 2;
  ruledLines(6);
  y += 3;
  doc.text("My smallest daily change (5 minutes or less):", MARGIN, y);
  y += 2;
  ruledLines(3);
  y += 3;
  doc.text("My accountability partner:", MARGIN, y);
  y += 2;
  ruledLines(1);
  y += 4;

  // === SECTION 7 ===
  sectionHeader("Commitment");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Date:", MARGIN, y);
  y += 2;
  ruledLines(1);
  y += 3;
  doc.text("My commitment:", MARGIN, y);
  y += 2;
  ruledLines(1);

  // === FOOTERS on every page ===
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const footerY = PAGE_H - 10;
    const left = "Glean — wisdom applied to life · Built by Vardan Mathur · linkedin.com/in/vardanmathur";
    const right = `Page ${p} of ${total}`;
    doc.text(left, MARGIN, footerY);
    const rW = doc.getTextWidth(right);
    doc.text(right, MARGIN + CONTENT_W - rW, footerY);
  }

  return doc.output("blob");
}

export async function uploadWorksheet(
  userId: string,
  query: string,
  blob: Blob,
): Promise<string | null> {
  try {
    const date = new Date().toISOString().slice(0, 10);
    const slug = sanitizeQueryForFilename(query);
    const path = `${userId}/${date}_${slug}.pdf`;
    const { error } = await supabase.storage
      .from("worksheets")
      .upload(path, blob, { contentType: "application/pdf", upsert: true });
    if (error) {
      console.warn("Worksheet upload failed:", error.message);
      return null;
    }
    return path;
  } catch (e) {
    console.warn("Worksheet upload threw:", e);
    return null;
  }
}

export async function recordWorksheetDownload(
  userId: string,
  query: string,
  synthesis: string,
  filePath: string | null,
) {
  try {
    await supabase.from("worksheet_downloads").insert({
      user_id: userId,
      query,
      synthesis,
      file_path: filePath,
    });
  } catch (e) {
    console.warn("Worksheet DB log failed:", e);
  }
}

export function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
