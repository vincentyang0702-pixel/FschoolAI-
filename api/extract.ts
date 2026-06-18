// api/extract.ts — file → text extractor that PRESERVES STRUCTURE.
// The extension (or the in-app uploader) base64-encodes a file's bytes and POSTs
// here. For PDFs we reconstruct lines from pdfjs text items, detect headings by
// font size, infer paragraph breaks from vertical gaps, and keep PER-PAGE text so
// downstream RAG can cite real page numbers. No more flattening to one blob and no
// 20k-char cap (that truncated ~300-page textbooks to ~5 pages).
//
// Response: { text, pages: [{ page, text }], chars, pageCount, truncated }
//   - `text`  = all pages joined (back-compat: the extension stores this as content_text)
//   - `pages` = structured per-page text (RAG ingest uses this for page locators)

const MAX_PAGES = 300;          // generous; most uploads are far smaller
const SAFETY_CHARS = 1_500_000; // hard ceiling (~375k tokens) to avoid OOM on pathological files

// Reconstruct one page's text from pdfjs text items, preserving line breaks,
// paragraph breaks (large vertical gaps), and headings (markdown `#`, by font size).
// Lines are grouped by Y position (robust across PDF generators — doesn't depend
// on pdfjs setting hasEOL), ordered top-to-bottom, left-to-right within a line.
export function reconstructPage(items: any[]): string {
  const toks = (items || [])
    .filter(it => it?.str && it.str.trim())
    .map(it => ({
      str: it.str,
      x: it.transform ? it.transform[4] : 0,
      y: it.transform ? it.transform[5] : 0,
      h: it.height || (it.transform ? Math.abs(it.transform[3]) : 0),
    }));
  if (!toks.length) return "";

  const medianH = [...toks].map(t => t.h).filter(Boolean).sort((a, b) => a - b)[Math.floor(toks.length / 2)] || 10;
  const tol = Math.max(2, medianH * 0.5);

  // Group tokens into lines by Y (within tolerance), top-to-bottom.
  toks.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines: { y: number; size: number; text: string }[] = [];
  let group: { y: number; size: number; items: any[] } | null = null;
  for (const t of toks) {
    if (group && Math.abs(group.y - t.y) <= tol) {
      group.items.push(t);
      group.size = Math.max(group.size, t.h);
    } else {
      if (group) lines.push(finishLine(group, medianH));
      group = { y: t.y, size: t.h, items: [t] };
    }
  }
  if (group) lines.push(finishLine(group, medianH));

  // Body font size = median; typical line gap = median vertical delta.
  const sizes = lines.map(l => l.size).filter(Boolean).sort((a, b) => a - b);
  const body = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) gaps.push(Math.abs(lines[i - 1].y - lines[i].y));
  gaps.sort((a, b) => a - b);
  // Use a LOW percentile as the baseline "normal" line spacing, so paragraph/heading
  // gaps (the larger outliers) stand out — the median gets skewed by those outliers
  // when a page has few lines.
  const lineGap = gaps.length ? gaps[Math.floor(gaps.length * 0.35)] : 0;

  // Emit: headings get markdown `#`; large vertical gaps become paragraph breaks.
  let out = "";
  lines.forEach((l, i) => {
    if (!l.text) return;
    const isHeading = body > 0 && l.size > body * 1.25 && l.text.length < 120;
    const bigGap = i > 0 && lineGap > 0 && Math.abs(lines[i - 1].y - l.y) > lineGap * 1.6;
    if (isHeading)      out += `\n\n# ${l.text}\n\n`;
    else { if (bigGap) out += "\n\n"; out += l.text + "\n"; }
  });
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

// Join one line's tokens left-to-right, inserting a space across visual gaps.
function finishLine(group: { y: number; size: number; items: any[] }, medianH: number) {
  group.items.sort((a, b) => a.x - b.x);
  let s = "";
  let prevX: number | null = null;
  for (const it of group.items) {
    if (prevX != null && it.x - prevX > medianH * 0.3 && !s.endsWith(" ")) s += " ";
    s += it.str;
    prevX = it.x;
  }
  return { y: group.y, size: group.size, text: s.replace(/\s+/g, " ").trim() };
}

async function pdfToPages(bytes: Uint8Array): Promise<{ pages: { page: number; text: string }[]; pageCount: number; truncated: boolean }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true } as any).promise;
  const pageCount = doc.numPages;
  const limit = Math.min(pageCount, MAX_PAGES);
  const pages: { page: number; text: string }[] = [];
  let total = 0;
  for (let i = 1; i <= limit; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    const text = reconstructPage(content.items as any[]);
    if (text) { pages.push({ page: i, text }); total += text.length; }
    if (total > SAFETY_CHARS) return { pages, pageCount, truncated: true };
  }
  return { pages, pageCount, truncated: pageCount > limit };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, file_type, name } = req.body ?? {};
  if (!base64) return res.status(400).json({ error: "base64 required" });

  let bytes;
  try { bytes = new Uint8Array(Buffer.from(base64, "base64")); }
  catch { return res.status(400).json({ error: "invalid base64" }); }

  const ext = String(file_type || name || "").toLowerCase();
  try {
    let pages: { page: number; text: string }[];
    let pageCount: number;
    let truncated = false;

    if (ext.includes("pdf")) {
      const r = await pdfToPages(bytes);
      pages = r.pages; pageCount = r.pageCount; truncated = r.truncated;
    } else {
      // Plain text / html / md — strip tags, decode utf-8, keep line structure.
      let text = Buffer.from(bytes).toString("utf8").replace(/<[^>]+>/g, " ");
      if (text.length > SAFETY_CHARS) { text = text.slice(0, SAFETY_CHARS); truncated = true; }
      // Normalize newlines but DO NOT collapse them — structure matters for chunking.
      text = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      pages = text ? [{ page: 1, text }] : [];
      pageCount = 1;
    }

    const combined = pages.map(p => p.text).join("\n\n");
    return res.status(200).json({ text: combined, pages, chars: combined.length, pageCount, truncated });
  } catch (err) {
    console.error("[extract] failed:", err.message);
    return res.status(200).json({ text: "", pages: [], error: err.message }); // soft-fail: caller stores no content
  }
}
