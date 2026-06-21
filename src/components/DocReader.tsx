// DocReader.tsx — YouLearn Phase 1: document reader with AI summary + gold highlights.
// Polish pass: robust highlight matching (normalized indexOf, not regex) + iOS-quality UI.
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../api/supabase";

// ── Normalize text for matching (keep paragraph breaks, collapse inline spaces) ─
function normalizeForMatch(s: string): string {
  return s
    .replace(/[ \t]+/g, " ")   // collapse horizontal whitespace
    .replace(/\n{3,}/g, "\n\n") // cap blank lines at one
    .trim();
}

// ── Build highlight ranges via indexOf (case-insensitive, whitespace-tolerant) ──
type Range = { start: number; end: number };

function findRanges(text: string, highlights: string[]): Range[] {
  if (!highlights?.length || !text) return [];

  const textLower = text.toLowerCase();
  const raw: Range[] = [];

  for (const hl of highlights) {
    if (!hl?.trim()) continue;
    // Normalize the highlight the same way as the text
    const normHl = normalizeForMatch(hl).toLowerCase();
    if (!normHl) continue;

    let from = 0;
    for (;;) {
      const idx = textLower.indexOf(normHl, from);
      if (idx === -1) break;
      raw.push({ start: idx, end: idx + normHl.length });
      from = idx + normHl.length;
    }
  }

  if (!raw.length) return [];

  // Sort by start, then merge overlapping / adjacent ranges
  raw.sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const r of raw) {
    const prev = merged[merged.length - 1];
    if (prev && r.start <= prev.end) {
      prev.end = Math.max(prev.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

// ── HighlightedText — renders prose with gold-tinted highlight spans ───────────
function HighlightedText({
  text,
  highlights,
}: {
  text: string;
  highlights: string[];
}) {
  // Normalise the displayed text (same transform applied to highlights in findRanges)
  const normalized = useMemo(() => normalizeForMatch(text), [text]);
  const ranges     = useMemo(() => findRanges(normalized, highlights), [normalized, highlights]);

  // Build display segments
  const segments = useMemo(() => {
    const segs: { text: string; highlighted: boolean }[] = [];
    let pos = 0;
    for (const { start, end } of ranges) {
      if (start > pos) segs.push({ text: normalized.slice(pos, start), highlighted: false });
      segs.push({ text: normalized.slice(start, end), highlighted: true });
      pos = end;
    }
    if (pos < normalized.length) segs.push({ text: normalized.slice(pos), highlighted: false });
    return segs;
  }, [normalized, ranges]);

  const bodyStyle: React.CSSProperties = {
    whiteSpace: "pre-wrap",
    lineHeight: "1.85",
    color: "rgba(245,245,245,0.88)",
    fontSize: "15px",
    margin: 0,
    fontFamily: "var(--font-sans)",
  };

  if (!ranges.length) {
    return <p style={bodyStyle}>{normalized}</p>;
  }

  return (
    <p style={bodyStyle}>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <mark
            key={i}
            style={{
              background: "rgba(196,154,60,0.2)",
              color: "rgba(245,245,245,0.95)",
              borderRadius: "3px",
              padding: "0 1px",
              boxShadow: "inset 0 -1.5px 0 rgba(196,154,60,0.5)",
              // No transition — marks are stable after render
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </p>
  );
}

// ── DocReader ─────────────────────────────────────────────────────────────────
interface DocFile {
  id: string;
  name: string;
  fileType?: string;
  storagePath?: string;
  summary?: string | null;
  highlights?: string[] | null;
  processedAt?: string | null;
}

interface Props {
  file: DocFile;
  onBack: () => void;
}

export default function DocReader({ file, onBack }: Props) {
  const [contentText, setContentText] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("files")
        .select("content_text")
        .eq("id", file.id)
        .maybeSingle();
      if (err) throw new Error(err.message);
      setContentText(data?.content_text ?? "");
    } catch (e: any) {
      setError(e.message || "Couldn't load document.");
    } finally {
      setLoading(false);
    }
  }, [file.id]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const fileExt    = file.fileType?.toUpperCase()
    ?? file.name?.split(".").pop()?.toUpperCase() ?? "DOC";
  const highlights = (file.highlights ?? []) as string[];

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px" }}>
        <button
          onClick={onBack}
          aria-label="Back to files"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-dim)", padding: "6px", borderRadius: "8px",
            display: "flex", alignItems: "center", flexShrink: 0,
            transition: "background 0.12s, color 0.12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-dim)"; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "19px", fontWeight: "600",
            color: "var(--text-primary)",
            letterSpacing: "-0.2px", lineHeight: "1.3",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            margin: 0,
          }}>
            {file.name}
          </h1>
        </div>

        <span style={{
          fontSize: "10px", fontWeight: "700", letterSpacing: "0.6px",
          textTransform: "uppercase", padding: "3px 8px", borderRadius: "5px",
          background: "rgba(196,154,60,0.1)", color: "#C49A3C",
          border: "1px solid rgba(196,154,60,0.22)", flexShrink: 0,
        }}>
          {fileExt}
        </span>
      </div>

      {/* ── AI Summary ────────────────────────────────────────────────────────── */}
      {file.summary && (
        <section style={{ marginBottom: "28px" }}>
          <p style={{
            fontSize: "11px", fontWeight: "700", letterSpacing: "0.6px",
            textTransform: "uppercase", color: "#C49A3C",
            margin: "0 0 10px",
          }}>
            AI Summary
          </p>
          <div style={{
            borderLeft: "2px solid rgba(196,154,60,0.4)",
            paddingLeft: "16px",
          }}>
            <p style={{
              fontSize: "14px", lineHeight: "1.75",
              color: "rgba(245,245,245,0.85)",
              margin: 0,
            }}>
              {file.summary}
            </p>
          </div>
        </section>
      )}

      {/* ── Key Highlights ────────────────────────────────────────────────────── */}
      {highlights.length > 0 && (
        <section style={{ marginBottom: "28px" }}>
          <p style={{
            fontSize: "11px", fontWeight: "700", letterSpacing: "0.6px",
            textTransform: "uppercase", color: "rgba(255,255,255,0.3)",
            margin: "0 0 12px",
          }}>
            Key Passages
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            {highlights.map((h, i) => (
              <li key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: "#C49A3C", flexShrink: 0, marginTop: "8px",
                }} />
                <p style={{
                  fontSize: "13px", lineHeight: "1.65",
                  color: "rgba(245,245,245,0.75)",
                  margin: 0, fontStyle: "italic",
                }}>
                  {h}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Separator ─────────────────────────────────────────────────────────── */}
      {(file.summary || highlights.length > 0) && (
        <hr style={{
          border: "none", borderTop: "1px solid rgba(255,255,255,0.07)",
          marginBottom: "28px",
        }} />
      )}

      {/* ── Document Content ──────────────────────────────────────────────────── */}
      <section style={{ flex: 1 }}>
        <p style={{
          fontSize: "11px", fontWeight: "700", letterSpacing: "0.6px",
          textTransform: "uppercase", color: "rgba(255,255,255,0.3)",
          margin: "0 0 20px",
        }}>
          Full Document
        </p>

        {loading ? (
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "32px 0", color: "var(--text-dim)", fontSize: "14px",
          }}>
            <span style={{
              width: 16, height: 16, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.1)",
              borderTopColor: "#C49A3C",
              animation: "docSpin 0.7s linear infinite",
              display: "inline-block", flexShrink: 0,
            }} />
            <style>{`@keyframes docSpin{to{transform:rotate(360deg)}}`}</style>
            Loading document…
          </div>

        ) : error ? (
          <div style={{
            padding: "16px 20px", borderRadius: "12px",
            background: "rgba(255,59,48,0.07)",
            border: "1px solid rgba(255,59,48,0.18)",
            color: "rgba(255,100,90,0.85)", fontSize: "13px",
            display: "flex", alignItems: "center", gap: "12px",
          }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={fetchContent} style={{
              background: "none", border: "none", color: "#C49A3C",
              cursor: "pointer", fontSize: "13px", fontFamily: "inherit",
              textDecoration: "underline", flexShrink: 0,
            }}>
              Retry
            </button>
          </div>

        ) : !contentText ? (
          <p style={{ color: "var(--text-dim)", fontSize: "14px" }}>
            No text content found in this document.
          </p>

        ) : (
          <div style={{ maxWidth: "68ch" }}>
            <HighlightedText text={contentText} highlights={highlights} />
          </div>
        )}
      </section>
    </div>
  );
}
