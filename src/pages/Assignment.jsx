// Assignment.jsx — Assignment list → detail view with AI draft generation.
// Reads live assignments from Supabase (synced from Canvas).
// Falls back to placeholder cards when Canvas is not connected.
// Draft supports text-selection toolbar (Shorten / Expand / Change Direction / Suggest / Copy).

import { useState, useRef, useCallback, useMemo, useEffect, useRef as useTimerRef } from "react";
import { groq } from "../api/groq";
import { buildStudentContext } from "../data/mockData";
import { useApp } from "../context/AppContext";

const SYSTEM =
  "You are an academic writing assistant. Write thorough, well-structured academic content. Use formal language, clear paragraph structure, and appropriate hedging where needed.";

const EDIT_SYSTEM =
  "You are an academic editing assistant. Follow the instruction precisely. Return ONLY the edited text — no preamble, no explanation, no quotation marks.";

const TOOLBAR_ACTIONS = ["Shorten", "Expand", "Change Direction", "Suggest", "Copy"];

// Shown when Canvas is not yet connected
const PLACEHOLDER_ASSIGNMENTS = [
  { id: "p1", name: "Research Paper: Cognitive Load Theory",  courseCode: "PSYC 302", description: "Analyze how cognitive load theory applies to modern digital learning environments. Include empirical evidence and practical implications for instructional design. Minimum 1,500 words." },
  { id: "p2", name: "Problem Set 4 — Differential Equations", courseCode: "MATH 241", description: "Solve problems 4.1–4.8 from Chapter 4. Show all working and verify solutions using an appropriate method." },
  { id: "p3", name: "Case Study: Market Entry Strategy",      courseCode: "BUS 410",  description: "Analyze Apple's 2007 iPhone market entry using Porter's Five Forces. 800–1,000 words." },
  { id: "p4", name: "Algorithm Analysis — Sorting Comparison", courseCode: "CS 355",  description: "Compare time and space complexity of merge sort, quick sort, and heap sort. Include empirical benchmarks." },
];

function formatDue(dueAt) {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  const now = new Date();
  const diffDays = Math.round((d - now) / 86400000);
  if (diffDays < 0)  return "Past due";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7)  return `In ${diffDays} days`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Assignment() {
  const { assignments: liveAssignments, canvasToken } = useApp();

  // Use live data if available, else placeholder
  const assignments = useMemo(() => {
    if (!canvasToken || !liveAssignments.length) return PLACEHOLDER_ASSIGNMENTS;
    // Sort: upcoming first, then by due date
    return [...liveAssignments]
      .filter(a => !a.submission?.submittedAt)           // not yet submitted
      .sort((a, b) => {
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return new Date(a.dueAt) - new Date(b.dueAt);
      })
      .slice(0, 20);
  }, [liveAssignments, canvasToken]);

  const [selected, setSelected]   = useState(null);
  const [draft, setDraft]         = useState("");
  const [generating, setGenerating] = useState(false);
  const [selection, setSelection] = useState(null);
  const [toolbarPos, setToolbarPos] = useState(null);
  const [suggestMode, setSuggestMode] = useState(false);
  const [suggestInput, setSuggestInput] = useState("");
  const [editingIdx, setEditingIdx] = useState(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const draftRef = useRef(null);


  // Normalise live vs. placeholder assignment shape for the detail view
  const selectedPrompt = selected
    ? (selected.description || selected.prompt || "")
    : "";
  const selectedCourse = selected
    ? (selected.courseCode || selected.course || "")
    : "";
  const selectedTitle = selected?.name || selected?.title || "";

  const generateDraftFor = useCallback(async (assignment) => {
    if (generating) return;
    const prompt = assignment.description || assignment.prompt || "";
    setGenerating(true);
    setDraft("");
    const content = await groq(
      [{ role: "user", content: `Write a detailed academic response to this assignment: ${prompt}` }],
      SYSTEM + "\n\n" + buildStudentContext()
    );
    setDraft(content);
    setGenerating(false);
  }, [generating]);

  const generateDraft = useCallback(() => {
    if (selected) generateDraftFor(selected);
  }, [selected, generateDraftFor]);

  const handleTextSelect = useCallback(() => {
    const ta = draftRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    if (start === end) { setSelection(null); setToolbarPos(null); return; }
    const text = ta.value.slice(start, end).trim();
    if (!text) return;
    setSelection({ text, start, end });

    const TOOLBAR_WIDTH = 320;
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;

    // Try DOM selection rect first (works on desktop/iOS)
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        const left  = Math.max(TOOLBAR_WIDTH / 2 + 8, Math.min(vw - TOOLBAR_WIDTH / 2 - 8, rect.left + rect.width / 2));
        const above = rect.top - 52;
        const top   = above >= 70 ? Math.min(above, vh - 60) : Math.min(rect.bottom + 8, vh - 60);
        setToolbarPos({ top, left });
        return;
      }
    }

    // Android fallback: estimate Y from line number inside textarea
    const taRect   = ta.getBoundingClientRect();
    const computed = window.getComputedStyle(ta);
    const lineH    = parseFloat(computed.lineHeight) || 20;
    const padTop   = parseFloat(computed.paddingTop)  || 0;
    const midOffset = Math.floor((start + end) / 2);
    const linesBefore = ta.value.slice(0, midOffset).split('\n').length - 1;
    const estimatedY  = taRect.top + padTop + linesBefore * lineH - ta.scrollTop + lineH / 2;
    const clampedY    = Math.max(0, Math.min(estimatedY, vh));
    const top  = clampedY - 52 >= 70 ? clampedY - 52 : Math.min(clampedY + lineH + 8, vh - 60);
    const left = Math.max(TOOLBAR_WIDTH / 2 + 8, Math.min(vw - TOOLBAR_WIDTH / 2 - 8, taRect.left + taRect.width / 2));
    setToolbarPos({ top, left });
  }, []);

  // Android fix: selectionchange fires reliably after native long-press selection
  useEffect(() => {
    const ta = draftRef.current;
    if (!ta) return;
    let timer;
    const onSelectionChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.activeElement === ta) {
          handleTextSelect();
        }
      }, 100);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      clearTimeout(timer);
    };
  }, [handleTextSelect]);

  const applyEdit = useCallback(async (instruction, actionIdx = null) => {
    if (!selection?.text || !draft) return;
    if (actionIdx !== null) setEditingIdx(actionIdx);
    const result = await groq(
      [{ role: "user", content: `Text to edit:\n"${selection.text}"\n\nInstruction: ${instruction}` }],
      EDIT_SYSTEM
    );
    setDraft((prev) => prev.slice(0, selection.start) + result + prev.slice(selection.end));
    setSelection(null);
    setToolbarPos(null);
    setSuggestMode(false);
    setSuggestInput("");
    setEditingIdx(null);
  }, [selection, draft]);

  const handleToolbarAction = async (action, idx) => {
    if (action === "Copy") { navigator.clipboard.writeText(selection?.text ?? ""); setToolbarPos(null); return; }
    if (action === "Suggest") { setSuggestMode(true); return; }
    const instructionMap = {
      Shorten:            "Shorten this text while keeping the key information.",
      Expand:             "Expand this text with more detail and supporting evidence.",
      "Change Direction": "Rewrite this from a different angle or perspective.",
    };
    await applyEdit(instructionMap[action], idx);
  };

  // ── Detail view ──────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div style={{ position: "relative" }}>
        <button
          onClick={() => { setSelected(null); setDraft(""); setSelection(null); setToolbarPos(null); setSuggestMode(false); }}
          style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "14px", cursor: "pointer", padding: "0 0 16px", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "6px" }}
        >
          ← Assignments
        </button>

        <h1 style={{ fontSize: "20px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "6px", letterSpacing: "-0.2px" }}>
          {selectedTitle}
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "16px" }}>{selectedCourse}</p>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "14px", marginBottom: "20px" }}>
          <div
  dangerouslySetInnerHTML={{ __html: selectedPrompt }}
  style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.65" }}
/>
        </div>

        {!draft && (
          generating
            ? <p style={{ color: "var(--text-dim)", fontSize: "13px", letterSpacing: "0.3px" }}>Generating draft…</p>
            : <button
                onClick={generateDraft}
                style={{ background: "var(--color-accent)", color: "#111111", border: "none", borderRadius: "var(--radius-btn)", padding: "12px 24px", fontSize: "14px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}
              >
                Generate Draft
              </button>
        )}

        {draft && (
          <>
            {toolbarPos && selection && (
              <div style={{ position: "fixed", top: toolbarPos.top, left: toolbarPos.left, transform: "translateX(-50%)", background: "rgba(24,24,24,0.96)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid var(--color-border-strong)", borderRadius: "var(--radius-btn)", zIndex: 200, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
                {!suggestMode ? (
                  <div style={{ display: "flex" }}>
                    {TOOLBAR_ACTIONS.map((action, idx) => (
                      <button key={action} onClick={() => handleToolbarAction(action, idx)} disabled={editingIdx !== null} style={{ background: "none", border: "none", borderRight: idx < TOOLBAR_ACTIONS.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none", color: editingIdx === idx ? "var(--text-secondary)" : "var(--text-primary)", fontSize: "12px", padding: "9px 12px", cursor: editingIdx !== null ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }} onMouseEnter={e => { if (editingIdx === null) e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                        {editingIdx === idx ? "…" : action}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "6px", padding: "6px" }}>
                    <input autoFocus placeholder="Your instruction…" value={suggestInput} onChange={e => setSuggestInput(e.target.value)} onKeyDown={e => e.key === "Enter" && applyEdit(suggestInput)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--color-border)", borderRadius: "8px", padding: "7px 10px", color: "var(--text-primary)", fontSize: "13px", outline: "none", fontFamily: "inherit", width: "190px" }} />
                    <button onClick={() => applyEdit(suggestInput)} style={{ background: "var(--color-accent)", color: "#111", border: "none", borderRadius: "8px", padding: "7px 12px", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}>Apply</button>
                    <button onClick={() => setSuggestMode(false)} style={{ background: "none", border: "none", color: "var(--text-secondary)", fontSize: "16px", cursor: "pointer", padding: "0 4px" }}>×</button>
                  </div>
                )}
              </div>
            )}

            <textarea
              ref={draftRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onMouseUp={handleTextSelect}
              onTouchEnd={() => setTimeout(handleTextSelect, 150)}
              onSelect={handleTextSelect}
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", padding: "20px", color: "var(--text-primary)", fontSize: "14px", lineHeight: "1.85", whiteSpace: "pre-wrap", marginBottom: "14px", outline: "none", cursor: "text", minHeight: "320px", width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
            />

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", marginBottom: "16px", overflow: "hidden" }}>
              <button onClick={() => setSourcesOpen(o => !o)} style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", color: "var(--text-secondary)", fontSize: "13px", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "inherit" }}>
                Sources & Reasoning
                <span style={{ fontSize: "12px", opacity: 0.5 }}>{sourcesOpen ? "↑" : "↓"}</span>
              </button>
              {sourcesOpen && (
                <div style={{ padding: "0 16px 14px", color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.65", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ marginTop: "12px" }}>This draft was generated from your assignment brief using an AI language model. No external sources were cited automatically — add real academic references before submission.</p>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => navigator.clipboard.writeText(draft)} style={{ flex: 1, background: "var(--color-surface-hover)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-btn)", padding: "12px", color: "var(--text-primary)", fontSize: "14px", cursor: "pointer", fontFamily: "inherit", transition: "background var(--dur-base) var(--ease-apple)" }} onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")} onMouseLeave={e => (e.currentTarget.style.background = "var(--color-surface-hover)")}>Copy</button>
              <button onClick={generateDraft} disabled={generating} style={{ flex: 1, background: "var(--color-surface-hover)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-btn)", padding: "12px", color: "var(--text-primary)", fontSize: "14px", cursor: generating ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: generating ? 0.5 : 1 }} onMouseEnter={e => { if (!generating) e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }} onMouseLeave={e => (e.currentTarget.style.background = "var(--color-surface-hover)")}>{generating ? "Regenerating…" : "Regenerate"}</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <div>
      <h1 style={{ fontSize: "26px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "4px", letterSpacing: "-0.3px" }}>
        Assignments
      </h1>
      <p style={{ color: "var(--text-dim)", fontSize: "14px", marginBottom: "28px" }}>
        {assignments.length} {canvasToken && liveAssignments.length ? "pending" : "active"} assignment{assignments.length !== 1 ? "s" : ""}
        {!canvasToken && <span style={{ color: "rgba(255,255,255,0.18)" }}> · placeholder</span>}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {assignments.map((a) => {
          const due = formatDue(a.dueAt);
          const isLate = a.submission?.missing || (a.dueAt && new Date(a.dueAt) < new Date() && !a.submission?.submittedAt);
          return (
            <button
              key={a.id}
              onClick={() => { setSelected(a); setDraft(""); generateDraftFor(a); }}
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", boxShadow: "var(--depth-line)", padding: "18px", cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit", transition: "background var(--dur-base) var(--ease-apple)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--color-surface-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "var(--color-surface)")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                <p style={{ color: "var(--text-primary)", fontSize: "15px", fontWeight: "500", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.name || a.title}
                </p>
                {due && (
                  <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "20px", background: isLate ? "rgba(255,59,48,0.1)" : "rgba(255,255,255,0.06)", color: isLate ? "rgba(255,100,90,0.85)" : "var(--text-dim)", flexShrink: 0 }}>
                    {due}
                  </span>
                )}
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px" }}>
                {a.courseCode || a.course}
                {a.pointsPossible > 0 && <span style={{ color: "var(--text-dim)", marginLeft: "8px" }}>{a.pointsPossible} pts</span>}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
