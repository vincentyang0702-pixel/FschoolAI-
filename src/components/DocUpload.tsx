// DocUpload.tsx — Upload a document (PDF / text) or paste text to index it for RAG.
// PDFs/text are extracted server-side via /api/extract, then sent to
// /api/rag?action=ingest, which sections + chunks + embeds them. Once indexed,
// the tutor (NeuralRing) can answer grounded in the content with [n] citations.

import { useRef, useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { supabase } from "../api/supabase";

const ACCEPT = ".pdf,.txt,.md,.markdown,.html";

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function DocUpload() {
  const { userId, courses } = useApp();
  const fileRef = useRef(null);
  const [status,   setStatus]   = useState("idle"); // idle|reading|extracting|indexing|done|error
  const [message,  setMessage]  = useState("");
  const [courseId, setCourseId] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [docs, setDocs] = useState([]); // already-indexed documents for this user

  const busy = status === "reading" || status === "extracting" || status === "indexing";

  // Load the user's indexed documents; re-runs when an upload finishes (status → done).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("rag_documents")
          .select("id, title, kind, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (!cancelled) setDocs(data ?? []);
      } catch { /* table may not exist yet */ }
    })();
    return () => { cancelled = true; };
  }, [userId, status]);

  async function deleteDoc(id) {
    setDocs(prev => prev.filter(d => d.id !== id)); // optimistic
    try { await supabase.from("rag_documents").delete().eq("id", id); } catch { /* non-fatal */ }
  }

  async function ingest({ text = null, pages = null, title, kind }: any) {
    if (!userId) { setStatus("error"); setMessage("Not signed in."); return; }
    const hasContent = (pages && pages.some(p => p?.text?.trim())) || (text && text.trim());
    if (!hasContent) { setStatus("error"); setMessage("Nothing to index — no text found."); return; }
    setStatus("indexing"); setMessage("Indexing…");
    try {
      const res = await fetch("/api/rag?action=ingest", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        // Prefer structured pages (page-number citations); fall back to flat text.
        body:    JSON.stringify({ userId, courseId: courseId || null, title, kind, pages, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `ingest ${res.status}`);
      setStatus("done");
      setMessage(`Indexed “${title}” — ${data.sections} section${data.sections !== 1 ? "s" : ""}, ${data.chunks} chunk${data.chunks !== 1 ? "s" : ""}. Ask the tutor about it.`);
    } catch (err) {
      setStatus("error");
      setMessage(err?.message || "Indexing failed.");
    }
  }

  async function handleFile(file) {
    if (!file) return;
    setStatus("reading"); setMessage(`Reading ${file.name}…`);
    try {
      const base64 = await readAsBase64(file);
      setStatus("extracting"); setMessage("Extracting text…");
      const res = await fetch("/api/extract", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ base64, file_type: file.type, name: file.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.text) throw new Error(data.error || "Couldn't extract text from that file.");
      const kind = /pdf/i.test(file.type || file.name) ? "pdf" : "text";
      if (data.truncated) setMessage("Large file — indexing the first portion…");
      await ingest({ text: data.text, pages: data.pages, title: file.name, kind });
    } catch (err) {
      setStatus("error");
      setMessage(err?.message || "Couldn't read that file.");
    }
  }

  const statusColor =
    status === "done"  ? "rgba(100,220,155,0.95)" :
    status === "error" ? "rgba(255,120,110,0.95)" :
    "var(--text-dim)";

  return (
    <div style={{
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-card)", boxShadow: "var(--depth-line)",
      padding: "16px 18px", marginBottom: "24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 600 }}>Add study material</p>
          <p style={{ color: "var(--text-dim)", fontSize: "12px", marginTop: "2px" }}>
            Upload a PDF or notes — the tutor answers grounded in it.
          </p>
        </div>
      </div>

      {/* Optional course tag */}
      {courses?.length > 0 && (
        <select
          value={courseId}
          onChange={e => setCourseId(e.target.value)}
          disabled={busy}
          style={{
            width: "100%", boxSizing: "border-box", marginBottom: "10px",
            background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)",
            borderRadius: "10px", padding: "9px 11px", color: "var(--text-primary)",
            fontSize: "13px", fontFamily: "inherit", outline: "none",
          }}
        >
          <option value="">No specific course</option>
          {courses.map((c, i) => (
            <option key={c.dbId ?? c.id ?? i} value={c.dbId ?? c.id ?? ""}>
              {c.courseCode || c.name || `Course ${i + 1}`}
            </option>
          ))}
        </select>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          ref={fileRef} type="file" accept={ACCEPT} style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{
            flex: "1 1 auto", background: "var(--color-accent)", color: "#111", border: "none",
            borderRadius: "var(--radius-btn)", padding: "11px 16px", fontSize: "14px", fontWeight: 600,
            cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Working…" : "Upload PDF / file"}
        </button>
        <button
          onClick={() => setShowPaste(v => !v)}
          disabled={busy}
          style={{
            background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-btn)", padding: "11px 16px", fontSize: "14px", fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Paste text
        </button>
      </div>

      {showPaste && (
        <div style={{ marginTop: "10px" }}>
          <input
            value={pasteTitle}
            onChange={e => setPasteTitle(e.target.value)}
            placeholder="Title (e.g. Chapter 4 notes)"
            style={{
              width: "100%", boxSizing: "border-box", marginBottom: "8px",
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)",
              borderRadius: "10px", padding: "9px 11px", color: "var(--text-primary)",
              fontSize: "13px", fontFamily: "inherit", outline: "none",
            }}
          />
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="Paste textbook passages, notes, or any text to make it searchable…"
            rows={5}
            style={{
              width: "100%", boxSizing: "border-box", resize: "vertical",
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--color-border)",
              borderRadius: "10px", padding: "10px 12px", color: "var(--text-primary)",
              fontSize: "13px", lineHeight: 1.6, fontFamily: "inherit", outline: "none",
            }}
          />
          <button
            onClick={() => ingest({ text: pasteText, title: pasteTitle.trim() || "Pasted notes", kind: "text" }).then(() => { setPasteText(""); setPasteTitle(""); })}
            disabled={busy || !pasteText.trim()}
            style={{
              marginTop: "8px", background: "var(--color-accent)", color: "#111", border: "none",
              borderRadius: "var(--radius-btn)", padding: "9px 16px", fontSize: "13px", fontWeight: 600,
              cursor: (busy || !pasteText.trim()) ? "default" : "pointer", fontFamily: "inherit",
              opacity: (busy || !pasteText.trim()) ? 0.6 : 1,
            }}
          >
            Index text
          </button>
        </div>
      )}

      {message && (
        <p style={{ color: statusColor, fontSize: "12px", marginTop: "12px", lineHeight: 1.5 }}>
          {message}
        </p>
      )}

      {/* Indexed documents — these are searchable by the tutor (separate from
          portal-synced files below). */}
      {docs.length > 0 && (
        <div style={{ marginTop: "14px", borderTop: "1px solid var(--color-border)", paddingTop: "12px" }}>
          <p style={{ color: "var(--text-dim)", fontSize: "11px", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "8px" }}>
            Indexed materials ({docs.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {docs.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ flex: 1, minWidth: 0, color: "var(--text-secondary)", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.title}
                </span>
                <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--text-dim)", flexShrink: 0 }}>
                  {d.kind}
                </span>
                <button
                  onClick={() => deleteDoc(d.id)}
                  title="Remove from index"
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "17px", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
