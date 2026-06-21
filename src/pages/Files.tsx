// Files.tsx — Files-by-course view + YouLearn Phase 1 document reader.
// Upload a PDF → store to course-files bucket → extract text → AI summary/highlights
// → clean reader view. LMS-synced files still work as before.

import { useMemo, useState, useRef, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { supabase } from "../api/supabase";
import DocUpload from "../components/DocUpload";
import DocReader from "../components/DocReader";

const card = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--depth-line)",
};

const PALETTE = ["#64b4ff", "#64dc9b", "#ffc364", "#be82ff", "#ff8080", "#4ecdc4", "#ffe66d", "#a8e6cf"];
const colorFor = (i) => PALETTE[i % PALETTE.length];

function formatSize(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status) {
  if (status === "submitted")       return { text: "Submitted",  color: "rgba(100,220,155,0.9)", bg: "rgba(52,199,89,0.14)" };
  if (status === "course_material") return { text: "Material",   color: "var(--text-secondary)", bg: "var(--color-surface-hover)" };
  if (status === "feedback")        return { text: "Feedback",   color: "rgba(255,195,100,0.95)", bg: "rgba(255,159,10,0.14)" };
  return null;
}

// ── Upload-to-course-files + extract + summarize ──────────────────────────────
// Returns the file record after processing (with summary + highlights).
async function processUpload(
  file: File,
  userId: string,
  onStatus: (msg: string) => void
): Promise<{
  id: string; name: string; fileType: string; storagePath: string;
  summary: string; highlights: string[]; processedAt: string;
}> {
  // 1. Upload binary to course-files bucket (anon key works — RLS is off, INSERT policy exists)
  onStatus("Uploading…");
  const ext   = file.name.split(".").pop() ?? "pdf";
  const path  = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error: upErr } = await supabase.storage
    .from("course-files")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  const storagePath = path;

  // 2. Extract text via /api/extract (reads from storage server-side — no body-size limit)
  onStatus("Extracting text…");
  const exRes = await fetch("/api/extract", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    // bucket: tell extract where the file lives; keepFile: don't delete it (it's permanent storage)
    body:    JSON.stringify({ storagePath, bucket: "course-files", keepFile: true, file_type: file.type, name: file.name, userId }),
  });
  const exData = await exRes.json().catch(() => ({}));
  if (!exRes.ok || !exData.text) throw new Error(exData.error || "Couldn't extract text from this file.");

  const contentText: string = exData.text;

  // 3. AI summary + highlights
  onStatus("Generating summary…");
  const sumRes = await fetch("/api/summarize", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ text: contentText, title: file.name }),
  });
  const sumData = await sumRes.json().catch(() => ({}));
  const summary: string     = sumData.summary    ?? "";
  const highlights: string[] = sumData.highlights ?? [];

  // 4. Save to files table
  onStatus("Saving…");
  const processedAt = new Date().toISOString();
  const { data: row, error: dbErr } = await supabase
    .from("files")
    .insert({
      user_id:      userId,
      name:         file.name,
      file_type:    ext,
      size_bytes:   file.size,
      storage_path: storagePath,
      content_text: contentText,
      summary,
      highlights,
      processed_at: processedAt,
      status:       "course_material",
      // lms_file_id, course_id, source_url are null (manual upload, not from LMS)
    })
    .select("id")
    .single();
  if (dbErr) throw new Error(`Couldn't save file: ${dbErr.message}`);

  return {
    id: row.id, name: file.name, fileType: ext, storagePath,
    summary, highlights, processedAt,
  };
}

// ── Signed-URL open for LMS-synced files ─────────────────────────────────────
async function openExternalFile(file) {
  if (file.storagePath) {
    try {
      const res = await fetch("/api/file-url", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ path: file.storagePath }),
      });
      const { url } = res.ok ? await res.json() : {};
      if (url) { window.open(url, "_blank", "noopener,noreferrer"); return; }
    } catch { /* fall through */ }
  }
  if (file.sourceUrl) window.open(file.sourceUrl, "_blank", "noopener,noreferrer");
}

// ── FileRow ───────────────────────────────────────────────────────────────────
function FileRow({ file, color, onOpenReader }) {
  const size     = formatSize(file.sizeBytes);
  const stat     = statusLabel(file.status);
  const isPdf    = ["pdf","docx","doc","pptx","ppt","txt","md"].includes((file.fileType ?? "").toLowerCase());
  const hasReader = file.summary && isPdf;

  function handleClick() {
    if (hasReader) {
      onOpenReader(file);
    } else {
      openExternalFile(file);
    }
  }

  const openable = hasReader || file.storagePath || file.sourceUrl;

  const inner = (
    <>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <p style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
            {file.name}
          </p>
          {/* "Read" badge for AI-processed files */}
          {hasReader && (
            <span style={{
              fontSize: "9px", fontWeight: "700", letterSpacing: "0.5px",
              textTransform: "uppercase", padding: "2px 6px", borderRadius: "4px",
              background: "rgba(196,154,60,0.1)", color: "#C49A3C",
              border: "1px solid rgba(196,154,60,0.22)", flexShrink: 0,
            }}>
              Read
            </span>
          )}
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: "12px", marginTop: "2px", marginBottom: 0 }}>
          {[file.folder, size].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
      {file.fileType && (
        <span style={{ fontSize: "10px", fontWeight: "700", letterSpacing: "0.5px", textTransform: "uppercase", color, flexShrink: 0 }}>
          {file.fileType}
        </span>
      )}
      {stat && (
        <span style={{ fontSize: "11px", fontWeight: "600", padding: "4px 10px", borderRadius: "20px", background: stat.bg, color: stat.color, flexShrink: 0, whiteSpace: "nowrap" }}>
          {stat.text}
        </span>
      )}
    </>
  );

  const rowStyle = { ...card, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" };

  return openable
    ? <div role="button" tabIndex={0} onClick={handleClick}
           onKeyDown={e => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
           style={{ ...rowStyle, cursor: "pointer" }}>{inner}</div>
    : <div style={rowStyle}>{inner}</div>;
}

// ── Upload progress card ──────────────────────────────────────────────────────
type UploadState =
  | { phase: "idle" }
  | { phase: "working"; message: string }
  | { phase: "error";   message: string };

function UploadCard({ onFileProcessed }: { onFileProcessed: (file: any) => void }) {
  const { userId } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  const busy = state.phase === "working";

  async function handleFile(file: File | undefined) {
    if (!file || !userId) return;
    setState({ phase: "working", message: "Starting…" });
    try {
      const processed = await processUpload(file, userId, msg =>
        setState({ phase: "working", message: msg })
      );
      setState({ phase: "idle" });
      onFileProcessed(processed);
    } catch (err: any) {
      setState({ phase: "error", message: err.message || "Something went wrong." });
    }
  }

  return (
    <div style={{
      ...card, padding: "16px 18px", marginBottom: "24px",
    }}>
      <div style={{ marginBottom: "12px" }}>
        <p style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: 600, margin: 0 }}>
          Read a document with AI
        </p>
        <p style={{ color: "var(--text-dim)", fontSize: "12px", marginTop: "3px", marginBottom: 0 }}>
          Upload a PDF or Word doc — get an AI summary, highlighted key passages, and the full text.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        style={{
          background: "var(--color-accent)", color: "#111",
          border: "none", borderRadius: "var(--radius-btn)",
          padding: "10px 18px", fontSize: "13px", fontWeight: 600,
          cursor: busy ? "default" : "pointer", fontFamily: "inherit",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Processing…" : "Upload PDF or Doc"}
      </button>

      {state.phase === "working" && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
          <span style={{
            width: 12, height: 12, borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.12)",
            borderTopColor: "#C49A3C",
            animation: "spin2 0.7s linear infinite",
            display: "inline-block",
          }} />
          <style>{`@keyframes spin2{to{transform:rotate(360deg)}}`}</style>
          <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>{state.message}</span>
        </div>
      )}
      {state.phase === "error" && (
        <p style={{ fontSize: "12px", color: "rgba(255,100,90,0.85)", marginTop: "10px", marginBottom: 0 }}>
          {state.message}
          <button
            onClick={() => setState({ phase: "idle" })}
            style={{ marginLeft: "8px", background: "none", border: "none", color: "#C49A3C", cursor: "pointer", fontFamily: "inherit", fontSize: "12px" }}
          >
            Dismiss
          </button>
        </p>
      )}
    </div>
  );
}

// Map a raw Supabase files row to the shape the UI expects
function mapFileRow(f: any) {
  return {
    ...f,
    courseDbId:  f.course_id   ?? null,
    sizeBytes:   f.size_bytes  ?? null,
    fileType:    f.file_type   ?? null,
    sourceUrl:   f.source_url  ?? null,
    storagePath: f.storage_path ?? null,
    summary:     f.summary     ?? null,
    highlights:  f.highlights  ?? null,
    processedAt: f.processed_at ?? null,
  };
}

// ── Files page ────────────────────────────────────────────────────────────────
export default function Files() {
  const { files, courses, userId, setPendingNav } = useApp();

  // Reader view state — null = file list, object = reading a doc
  const [viewingFile, setViewingFile] = useState<any>(null);

  // Saved YouLearn docs fetched directly from Supabase on mount.
  // This is the persistence fix: freshFiles dies on unmount; AppContext doesn't
  // re-fetch after an insert. A direct query here always reflects the real DB state.
  const [savedDocs, setSavedDocs] = useState<any[]>([]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("files")
      .select("id, course_id, lms_file_id, name, file_type, size_bytes, source_url, folder, status, storage_path, summary, highlights, processed_at")
      .eq("user_id", userId)
      .not("processed_at", "is", null)        // only YouLearn-processed files
      .order("processed_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data?.length) setSavedDocs(data.map(mapFileRow));
      });
  }, [userId]);

  function refreshSavedDocs() {
    if (!userId) return;
    supabase
      .from("files")
      .select("id, course_id, lms_file_id, name, file_type, size_bytes, source_url, folder, status, storage_path, summary, highlights, processed_at")
      .eq("user_id", userId)
      .not("processed_at", "is", null)
      .order("processed_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data?.length) setSavedDocs(data.map(mapFileRow));
      });
  }

  function handleProcessed(processed: any) {
    const newFile = {
      id:          processed.id,
      name:        processed.name,
      fileType:    processed.fileType,
      storagePath: processed.storagePath,
      summary:     processed.summary,
      highlights:  processed.highlights,
      processedAt: processed.processedAt,
      sizeBytes:   null,
      sourceUrl:   null,
      courseDbId:  null,
      status:      "course_material",
    };
    // Add to savedDocs immediately (optimistic) + refresh from DB
    setSavedDocs(prev => {
      if (prev.some(d => d.id === newFile.id)) return prev;
      return [newFile, ...prev];
    });
    setViewingFile(newFile);
    // Refresh in background to pick up the canonical DB row
    setTimeout(refreshSavedDocs, 1500);
  }

  // Merge savedDocs + AppContext files (LMS-synced), de-duped by id
  const allFiles = useMemo(() => {
    const seen = new Set(savedDocs.map(f => f.id));
    const lmsOnly = files.filter(f => !seen.has(f.id));
    return [...savedDocs, ...lmsOnly];
  }, [files, savedDocs]);

  // Group by course
  const groups = useMemo(() => {
    const byDbId = new Map();
    courses.forEach((c, i) => {
      if (c.dbId) byDbId.set(c.dbId, { course: c, color: colorFor(i), files: [] });
    });
    const other = { course: null, color: "var(--text-dim)", files: [] as any[] };

    for (const f of allFiles) {
      const g = (f.courseDbId && byDbId.get(f.courseDbId)) || other;
      g.files.push(f);
    }
    const ordered = [...byDbId.values()].filter(g => g.files.length);
    if (other.files.length) ordered.push(other);
    return ordered;
  }, [allFiles, courses]);

  // ── Reader view ─────────────────────────────────────────────────────────
  if (viewingFile) {
    return (
      <DocReader
        file={viewingFile}
        onBack={() => setViewingFile(null)}
        onNavigate={(page) => { setViewingFile(null); setPendingNav(page); }}
      />
    );
  }

  // ── File list ────────────────────────────────────────────────────────────
  return (
    <div>
      <h1 style={{ fontSize: "26px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "4px", letterSpacing: "-0.3px", fontFamily: "'Fraunces', serif" }}>
        Files
      </h1>
      <p style={{ color: "var(--text-dim)", fontSize: "14px", marginBottom: "24px" }}>
        {allFiles.length > 0
          ? `${allFiles.length} file${allFiles.length !== 1 ? "s" : ""}`
          : "Upload a document or sync your portal via the extension"}
      </p>

      {/* YouLearn upload card */}
      <UploadCard onFileProcessed={handleProcessed} />

      {/* RAG / tutor indexing (separate from the reader) */}
      <DocUpload />

      {allFiles.length === 0 ? (
        <div style={{ ...card, padding: "24px" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "4px" }}>No files yet</p>
          <p style={{ color: "var(--text-dim)", fontSize: "12px" }}>
            Upload a PDF above to read it with AI, or use the browser extension to sync course files from your portal.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {groups.map((g, gi) => (
            <div key={g.course?.dbId ?? `other-${gi}`}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ color: g.color, fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px" }}>
                  {g.course ? (g.course.courseCode || g.course.name) : "My Documents"}
                </span>
                <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>
                  {g.files.length} file{g.files.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {g.files.map(f => (
                  <FileRow
                    key={f.id}
                    file={f}
                    color={g.color}
                    onOpenReader={setViewingFile}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
