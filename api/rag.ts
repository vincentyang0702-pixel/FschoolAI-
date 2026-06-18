// api/rag.ts — Retrieval-Augmented Generation over student-uploaded documents.
// Single action-routed function (to stay under Vercel's function limit):
//   POST /api/rag?action=ingest  { userId, courseId?, title, kind?, sourceUrl?, text }
//   POST /api/rag?action=query   { userId, courseId?, query, maxSections? }
//
// Design (see supabase-rag-migration.sql): embed SMALL chunks, return the BIG
// parent section ("small-to-big"). Embeddings: OpenAI text-embedding-3-small.
// Retrieval: hybrid (pgvector + full-text) fused with RRF in a Postgres RPC.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims — must match the vector() column
const EMBED_DIM   = 1536;
const MAX_CONTEXT_CHARS = 6000;               // cap injected passage text per query

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY,
);

// ── OpenAI embeddings ────────────────────────────────────────────────────────
/** Embed an array of strings → array of 1536-d vectors (order preserved). */
async function embed(texts) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const out = [];
  // Batch to stay well within request limits.
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body:    JSON.stringify({ model: EMBED_MODEL, input: batch }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`OpenAI embeddings ${res.status}: ${detail}`);
    }
    const json = await res.json();
    // Sort by index so the order matches the input batch exactly.
    const sorted = (json.data ?? []).sort((a, b) => a.index - b.index);
    for (const d of sorted) out.push(d.embedding);
  }
  return out;
}

// ── Sectioning + chunking ────────────────────────────────────────────────────
// Heuristic structure: split into sections at heading-like lines, then split each
// section into small chunks. Sections are what we return; chunks are what we embed.

const HEADING_RE = [
  /^#{1,6}\s+\S/,                                   // markdown headings
  /^(chapter|section|unit|part|module|lecture)\s+[\w\d]/i,
  /^\d+(\.\d+){0,3}\s+\S/,                           // "1.2 Title"
];
export function isHeading(line) {
  const l = line.trim();
  if (!l || l.length > 90) return false;
  if (HEADING_RE.some(re => re.test(l))) return true;
  // Short, title-cased / all-caps line with no terminal punctuation.
  if (l.length <= 70 && !/[.!?,:;]$/.test(l) && /^[A-Z0-9]/.test(l)) {
    const letters = l.replace(/[^A-Za-z]/g, "");
    if (letters && letters === letters.toUpperCase()) return true;
  }
  return false;
}

const SECTION_MAX = 2200; // chars — soft cap before forcing a new section

/** Split raw text into [{ heading, text }] sections. */
export function sectionize(text) {
  const blocks = String(text).replace(/\r\n/g, "\n").split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const sections = [];
  let cur = { heading: null, text: "" };
  const push = () => { if (cur.text.trim()) sections.push({ heading: cur.heading, text: cur.text.trim() }); };

  for (const block of blocks) {
    const firstLine = block.split("\n")[0];
    const headingHere = block.split("\n").length === 1 && isHeading(firstLine);
    if (headingHere) {
      push();
      cur = { heading: firstLine.replace(/^#{1,6}\s+/, "").trim(), text: "" };
      continue;
    }
    if (cur.text && (cur.text.length + block.length) > SECTION_MAX) {
      push();
      cur = { heading: cur.heading, text: "" }; // carry heading for continued sections
    }
    cur.text += (cur.text ? "\n\n" : "") + block;
  }
  push();
  return sections.length ? sections : [{ heading: null, text: String(text).trim() }];
}

/** Page-aware sectionizer: splits [{page, text}] into sections tagged with the
 *  page range they span, so retrieved passages can cite real page numbers. */
export function sectionizePages(pages) {
  const sections = [];
  let cur = { heading: null, text: "", locStart: null, locEnd: null };
  const push = () => {
    if (cur.text.trim())
      sections.push({ heading: cur.heading, text: cur.text.trim(), locStart: cur.locStart, locEnd: cur.locEnd });
  };
  for (const pg of pages) {
    const page = pg?.page ?? null;
    const blocks = String(pg?.text ?? "").replace(/\r\n/g, "\n").split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    for (const block of blocks) {
      const firstLine = block.split("\n")[0];
      const headingHere = block.split("\n").length === 1 && isHeading(firstLine);
      if (headingHere) {
        push();
        cur = { heading: firstLine.replace(/^#{1,6}\s+/, "").trim(), text: "", locStart: page, locEnd: page };
        continue;
      }
      if (cur.text && (cur.text.length + block.length) > SECTION_MAX) {
        push();
        cur = { heading: cur.heading, text: "", locStart: page, locEnd: page };
      }
      if (cur.locStart == null) cur.locStart = page;
      cur.locEnd = page;
      cur.text += (cur.text ? "\n\n" : "") + block;
    }
  }
  push();
  return sections;
}

const CHUNK_MAX = 900; // chars per embedded chunk

/** Split section text into small chunks on paragraph/sentence boundaries. */
export function chunkText(text) {
  const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = "";
  const flush = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ""; };

  for (const para of paras) {
    if (para.length > CHUNK_MAX) {
      flush();
      // Break an oversized paragraph on sentence boundaries.
      const sentences = para.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [para];
      let sBuf = "";
      for (const s of sentences) {
        if ((sBuf + s).length > CHUNK_MAX) { if (sBuf.trim()) chunks.push(sBuf.trim()); sBuf = ""; }
        sBuf += s;
      }
      if (sBuf.trim()) chunks.push(sBuf.trim());
    } else if ((buf + "\n\n" + para).length > CHUNK_MAX) {
      flush();
      buf = para;
    } else {
      buf += (buf ? "\n\n" : "") + para;
    }
  }
  flush();
  return chunks;
}

// ── Ingest ────────────────────────────────────────────────────────────────────
async function ingest(body) {
  const { userId, courseId = null, title = "Untitled", kind = "text", sourceUrl = null, text, pages } = body ?? {};
  if (!userId) return { status: 400, json: { error: "userId required" } };

  // Prefer structured per-page input (real page-number citations); fall back to
  // a flat text string for callers that don't have page structure.
  let sections;
  if (Array.isArray(pages) && pages.some(p => p?.text && String(p.text).trim())) {
    sections = sectionizePages(pages);
  } else if (text && typeof text === "string" && text.trim()) {
    sections = sectionize(text).map(s => ({ ...s, locStart: null, locEnd: null }));
  } else {
    return { status: 400, json: { error: "text or pages required" } };
  }
  if (!sections.length) return { status: 400, json: { error: "no content to index" } };

  // Build section + chunk rows with client-generated ids so chunk→section linkage
  // is deterministic (no reliance on insert ordering).
  const documentId = randomUUID();
  const sectionRows = [];
  const chunkRows   = [];
  sections.forEach((sec, idx) => {
    const sectionId = randomUUID();
    sectionRows.push({
      id: sectionId, document_id: documentId, user_id: userId, course_id: courseId,
      heading: sec.heading, ordinal: idx, loc_start: sec.locStart ?? null, loc_end: sec.locEnd ?? null, full_text: sec.text,
    });
    for (const content of chunkText(sec.text)) {
      chunkRows.push({
        id: randomUUID(), section_id: sectionId, document_id: documentId,
        user_id: userId, course_id: courseId, content, embedding: null,
      });
    }
  });

  if (!chunkRows.length) return { status: 400, json: { error: "no content to index" } };

  // Embed all chunks, attach vectors.
  const vectors = await embed(chunkRows.map(c => c.content));
  chunkRows.forEach((c, i) => { c.embedding = vectors[i]; });

  // Persist: document → sections → chunks (chunks batched to keep payloads sane).
  const { error: dErr } = await supabase.from("rag_documents").insert({
    id: documentId, user_id: userId, course_id: courseId, title, kind, source_url: sourceUrl,
  });
  if (dErr) return { status: 500, json: { error: `document insert: ${dErr.message}` } };

  const { error: sErr } = await supabase.from("rag_sections").insert(sectionRows);
  if (sErr) return { status: 500, json: { error: `sections insert: ${sErr.message}` } };

  for (let i = 0; i < chunkRows.length; i += 200) {
    const { error: cErr } = await supabase.from("rag_chunks").insert(chunkRows.slice(i, i + 200));
    if (cErr) return { status: 500, json: { error: `chunks insert: ${cErr.message}` } };
  }

  return { status: 200, json: { ok: true, documentId, sections: sectionRows.length, chunks: chunkRows.length } };
}

// ── Query ───────────────────────────────────────────────────────────────────
async function query(body) {
  const { userId, courseId = null, query: q, maxSections = 4 } = body ?? {};
  if (!userId) return { status: 400, json: { error: "userId required" } };
  if (!q || !String(q).trim()) return { status: 400, json: { error: "query required" } };

  const [queryEmbedding] = await embed([String(q)]);

  const { data: hits, error } = await supabase.rpc("rag_hybrid_search", {
    p_user_id:         userId,
    p_query_embedding: queryEmbedding,
    p_query_text:      String(q),
    p_course_id:       courseId,
    p_match_count:     12,
  });
  if (error) return { status: 500, json: { error: `search: ${error.message}` } };
  if (!hits?.length) return { status: 200, json: { passages: [], used: 0 } };

  // Map winning chunks to their parent sections, best section first, deduped.
  const sectionOrder = [];
  const seen = new Set();
  for (const h of hits) {
    if (h.section_id && !seen.has(h.section_id)) { seen.add(h.section_id); sectionOrder.push(h.section_id); }
    if (sectionOrder.length >= maxSections) break;
  }

  const { data: sections } = await supabase
    .from("rag_sections")
    .select("id, document_id, heading, ordinal, loc_start, loc_end, full_text")
    .in("id", sectionOrder);

  const { data: docs } = await supabase
    .from("rag_documents")
    .select("id, title")
    .in("id", (sections ?? []).map(s => s.document_id));
  const titleById = Object.fromEntries((docs ?? []).map(d => [d.id, d.title]));

  // Preserve ranked order; cap total injected text.
  const byId = Object.fromEntries((sections ?? []).map(s => [s.id, s]));
  const passages = [];
  let total = 0;
  for (const sid of sectionOrder) {
    const s = byId[sid];
    if (!s) continue;
    let textOut = s.full_text ?? "";
    if (total + textOut.length > MAX_CONTEXT_CHARS) textOut = textOut.slice(0, Math.max(0, MAX_CONTEXT_CHARS - total));
    if (!textOut) break;
    passages.push({
      title:   titleById[s.document_id] ?? "Document",
      heading: s.heading ?? null,
      loc:     s.loc_start != null ? `p.${s.loc_start}${s.loc_end && s.loc_end !== s.loc_start ? `-${s.loc_end}` : ""}` : null,
      text:    textOut,
    });
    total += textOut.length;
    if (total >= MAX_CONTEXT_CHARS) break;
  }

  return { status: 200, json: { passages, used: passages.length } };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY))
    return res.status(500).json({ error: "Supabase env not configured" });

  const action = req.query?.action;
  try {
    const result = action === "ingest" ? await ingest(req.body)
                 : action === "query"  ? await query(req.body)
                 : { status: 400, json: { error: "Unknown action. Use ?action=ingest or ?action=query" } };
    return res.status(result.status).json(result.json);
  } catch (err) {
    console.error("[rag] error:", err?.message ?? err);
    return res.status(502).json({ error: err?.message ?? "RAG error" });
  }
}
