// Files.jsx — Files-by-course view. Lists the LMS files the browser extension
// synced into the `files` table, grouped under their course, with a link back to
// the original file on the portal. Reads live files + courses from AppContext.

import { useMemo } from "react";
import { useApp } from "../context/AppContext";

const card = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--depth-line)",
};

// Same palette as Courses so a course keeps its colour across pages.
const PALETTE = ["#64b4ff", "#64dc9b", "#ffc364", "#be82ff", "#ff8080", "#4ecdc4", "#ffe66d", "#a8e6cf"];
const colorFor = (i) => PALETTE[i % PALETTE.length];

function formatSize(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status) {
  if (status === "submitted")       return { text: "Submitted",   color: "rgba(100,220,155,0.9)", bg: "rgba(52,199,89,0.14)" };
  if (status === "course_material") return { text: "Material",     color: "var(--text-secondary)", bg: "var(--color-surface-hover)" };
  if (status === "feedback")        return { text: "Feedback",     color: "rgba(255,195,100,0.95)", bg: "rgba(255,159,10,0.14)" };
  return null;
}

// Open the file: prefer the stored binary (a signed URL into the private bucket
// → opens the actual document, PDFs inline, no LMS session needed); fall back to
// the original session-gated LMS link.
async function openFile(file) {
  if (file.storagePath) {
    try {
      const res = await fetch("/api/file-url", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ path: file.storagePath }),
      });
      const { url } = res.ok ? await res.json() : {};
      if (url) { window.open(url, "_blank", "noopener,noreferrer"); return; }
    } catch { /* fall through to the LMS link */ }
  }
  if (file.sourceUrl) window.open(file.sourceUrl, "_blank", "noopener,noreferrer");
}

function FileRow({ file, color }) {
  const size  = formatSize(file.sizeBytes);
  const stat  = statusLabel(file.status);
  const openable = file.storagePath || file.sourceUrl;
  const inner = (
    <>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {file.name}
        </p>
        <p style={{ color: "var(--text-dim)", fontSize: "12px", marginTop: "2px" }}>
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

  const rowStyle = { ...card, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", textDecoration: "none" };

  // A stored file opens its real document via a signed URL; otherwise we fall
  // back to the session-gated LMS link. Either way it's one click.
  return openable
    ? <div role="button" tabIndex={0} onClick={() => openFile(file)}
           onKeyDown={e => { if (e.key === "Enter" || e.key === " ") openFile(file); }}
           style={{ ...rowStyle, cursor: "pointer" }}>{inner}</div>
    : <div style={rowStyle}>{inner}</div>;
}

export default function Files() {
  const { files, courses } = useApp();

  // Group files under their course (matched by DB UUID); unmatched → "Other".
  const groups = useMemo(() => {
    const byDbId = new Map();
    courses.forEach((c, i) => { if (c.dbId) byDbId.set(c.dbId, { course: c, color: colorFor(i), files: [] }); });
    const other = { course: null, color: "var(--text-dim)", files: [] };

    for (const f of files) {
      const g = (f.courseDbId && byDbId.get(f.courseDbId)) || other;
      g.files.push(f);
    }
    const ordered = [...byDbId.values()].filter(g => g.files.length);
    if (other.files.length) ordered.push(other);
    return ordered;
  }, [files, courses]);

  return (
    <div>
      <h1 style={{ fontSize: "26px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "4px", letterSpacing: "-0.3px" }}>
        Files
      </h1>
      <p style={{ color: "var(--text-dim)", fontSize: "14px", marginBottom: "24px" }}>
        {files.length > 0 ? `${files.length} file${files.length !== 1 ? "s" : ""} synced from your portal` : "Sync your portal to see files"}
      </p>

      {files.length === 0 ? (
        <div style={{ ...card, padding: "24px" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "4px" }}>No files yet</p>
          <p style={{ color: "var(--text-dim)", fontSize: "12px" }}>Use the browser extension on your portal to sync course files here.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {groups.map((g, gi) => (
            <div key={g.course?.dbId ?? `other-${gi}`}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ color: g.color, fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px" }}>
                  {g.course ? (g.course.courseCode || g.course.name) : "Other"}
                </span>
                <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>
                  {g.files.length} file{g.files.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {g.files.map(f => <FileRow key={f.id} file={f} color={g.color} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
