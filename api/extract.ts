// api/extract.js — file → plain text extractor for the brain.
// The extension fetches a file's bytes via the student's LMS session (only it
// can), base64-encodes them, and POSTs here. We turn PDFs (and plain text) into
// text the AI can read, capped so a single huge file can't blow the budget.
// Reuses the repo's existing `pdfjs-dist` dependency (lazy-imported on first use
// so cold starts stay cheap and the dev server doesn't load it at boot).

const MAX_CHARS = 20000;   // ~5k tokens — enough for a rubric/lecture, bounded
const MAX_PAGES = 40;

async function pdfToText(bytes) {
  // Legacy build runs in Node without a separate worker.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
  } as any).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);
  let out = "";
  for (let i = 1; i <= pages && out.length < MAX_CHARS; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out += content.items.map((it: any) => it.str).join(" ").replace(/\s+/g, " ") + "\n";
  }
  return out;
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
    let text;
    if (ext.includes("pdf")) {
      text = await pdfToText(bytes);
    } else {
      // Plain text / html / md — strip tags, decode utf-8.
      text = Buffer.from(bytes).toString("utf8").replace(/<[^>]+>/g, " ");
    }
    text = (text || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
    return res.status(200).json({ text, chars: text.length });
  } catch (err) {
    console.error("[extract] failed:", err.message);
    return res.status(200).json({ text: "", error: err.message });  // soft-fail: caller stores no content
  }
}
