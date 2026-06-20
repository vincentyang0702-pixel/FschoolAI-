// Canvas.jsx — Full Canvas LMS data display.
// Shows announcements, expandable course cards with assignments, modules, and grade weights.

import { useState } from "react";
import { useApp } from "../context/AppContext";
import ManualUploadSheet from "../components/ManualUploadSheet";
import { fetchAssignments, fetchModules } from "../../canvas-module/canvasApi";
import { normalizeAssignment, normalizeModule } from "../../canvas-module/canvasTransform";
import { supabase } from "../api/supabase";

/* ─── helpers ─────────────────────────────────────────────── */

function fmt(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = +d - +now;
  const days = Math.ceil(diff / 86400000);
  if (days < 0)  return { label: "Past due", urgent: false, past: true };
  if (days === 0) return { label: "Due today", urgent: true,  past: false };
  if (days === 1) return { label: "Due tomorrow", urgent: true, past: false };
  if (days <= 7)  return { label: `Due in ${days}d`, urgent: false, past: false };
  return {
    label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    urgent: false,
    past: false,
  };
}

function scoreColor(score) {
  if (score == null) return "rgba(255,255,255,0.35)";
  if (score >= 90) return "rgba(100,220,130,0.85)";
  if (score >= 80) return "rgba(255,255,255,0.7)";
  if (score >= 70) return "rgba(255,204,0,0.8)";
  return "rgba(255,100,90,0.85)";
}

/* ─── SyncBadge ───────────────────────────────────────────── */

function SyncBadge({ status }) {
  const map = {
    syncing:      { label: "Syncing…",           bg: "rgba(255,204,0,0.12)",  color: "rgba(255,204,0,0.8)" },
    synced:       { label: "Synced",             bg: "rgba(52,199,89,0.1)",   color: "rgba(100,220,130,0.85)" },
    error:        { label: "Sync error",         bg: "rgba(255,59,48,0.1)",   color: "rgba(255,100,90,0.85)" },
    "cors-error": { label: "CORS — needs proxy", bg: "rgba(255,59,48,0.1)",   color: "rgba(255,100,90,0.85)" },
    idle:         { label: "Pending",            bg: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" },
  };
  const { label, bg, color } = map[status] ?? map.idle;
  return (
    <span style={{ fontSize: "11px", fontWeight: "500", padding: "4px 10px", borderRadius: "20px", background: bg, color }}>
      {label}
    </span>
  );
}

/* ─── RefreshButton ───────────────────────────────────────── */

function RefreshButton({ syncStatus, onClick, style }: any) {
  const busy = syncStatus === "syncing";
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        background: "none",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "20px",
        padding: "4px 12px",
        color: busy ? "var(--text-dim)" : "var(--text-secondary)",
        fontSize: "11px",
        fontWeight: "500",
        cursor: busy ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        transition: "border-color 0.15s, color 0.15s",
        ...style,
      }}
      onMouseEnter={e => { if (!busy) e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
    >
      {busy ? "Syncing…" : "↻ Refresh"}
    </button>
  );
}

/* ─── ConnectCanvas ───────────────────────────────────────── */

function ConnectCanvas({ onConnect }) {
  const [url, setUrl]       = useState("");
  const [token, setToken]   = useState("");
  const [saving, setSaving] = useState(false);

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: "10px",
    padding: "12px 14px",
    color: "var(--text-primary)",
    fontSize: "14px",
    outline: "none",
    fontFamily: "inherit",
    width: "100%",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
  };

  async function handleSave() {
    if (!url.trim() || !token.trim() || saving) return;
    setSaving(true);
    await onConnect(token.trim(), url.trim());
    setSaving(false);
  }

  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", padding: "24px", marginTop: "8px" }}>
      <p style={{ color: "var(--text-primary)", fontSize: "16px", fontWeight: "600", marginBottom: "6px" }}>
        Connect Canvas
      </p>
      <p style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.65", marginBottom: "20px" }}>
        Enter your institution's Canvas URL and an API access token.{" "}
        <span style={{ color: "rgba(255,255,255,0.5)" }}>Canvas → Account → Settings → Approved Integrations → New Access Token</span>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="canvas.youruni.edu" style={inputStyle}
          onFocus={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)")}
          onBlur={e  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")} />
        <input value={token} onChange={e => setToken(e.target.value)} placeholder="Canvas access token" type="password" style={inputStyle}
          onFocus={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)")}
          onBlur={e  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")} />
      </div>
      <button onClick={handleSave} disabled={!url.trim() || !token.trim() || saving}
        style={{
          background: saving || !url.trim() || !token.trim() ? "rgba(255,255,255,0.15)" : "var(--color-accent)",
          color: "#111", border: "none", borderRadius: "var(--radius-btn)",
          padding: "12px 24px", fontSize: "14px", fontWeight: "600",
          cursor: saving || !url.trim() || !token.trim() ? "not-allowed" : "pointer",
          fontFamily: "inherit", transition: "background 0.15s",
        }}>
        {saving ? "Connecting…" : "Connect Canvas"}
      </button>
    </div>
  );
}

/* ─── AnnouncementsSection ────────────────────────────────── */

function AnnouncementsSection({ announcements }) {
  const [open, setOpen] = useState(true);
  if (!announcements?.length) return null;

  return (
    <div style={{ marginBottom: "20px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)" }}>
      {/* header */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 18px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: "600", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          📢 Announcements
        </span>
        <span style={{ color: "var(--text-dim)", fontSize: "12px" }}>
          {announcements.length} · {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--color-border)" }}>
          {announcements.slice(0, 5).map((a, i) => (
            <div key={a.id ?? i}
              style={{ padding: "12px 18px", borderBottom: i < Math.min(announcements.length, 5) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <p style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: "500", marginBottom: "3px" }}>
                {a.title}
              </p>
              <p style={{ color: "var(--text-dim)", fontSize: "11px" }}>
                {a.context_name ?? a.course_name ?? ""}
                {a.posted_at ? ` · ${new Date(a.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── CourseCard ──────────────────────────────────────────── */

const TABS = ["Assignments", "Modules", "Grade Weights"];

function CourseCard({ course, assignments, modules, assignmentGroups, changes, onSeen }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab]           = useState("Assignments");

  // Expanding the card means the user has seen what changed → dismiss its badge.
  function toggleExpanded() {
    setExpanded(e => {
      const next = !e;
      if (next && changes && onSeen) onSeen(course.id);
      return next;
    });
  }

  const score = course.current_score ?? course.currentScore ?? course.final_score ?? course.finalScore;
  const code  = course.course_code   ?? course.courseCode;

  // filter to this course
  // assignments are flat with camelCase courseId matching canvas_course_id
  const courseAssignments = (assignments ?? []).filter(a => a.courseId === course.id);
  // Use String() comparison — canvas_course_id type may differ between Supabase and blob
  const cid = String(course.id);
  const courseModules = (modules ?? []).find(m => String(m.courseId) === cid)?.modules ?? [];
  const courseGroups  = (assignmentGroups ?? []).find(g => String(g.courseId) === cid)?.groups ?? [];

  // Per-assignment grade weights (public schema: assignments.weight / weight_achieved).
  // Preferred source for the Grade Weights tab; the group blob is a fallback.
  const weighted = courseAssignments
    .filter(a => a.weight != null)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const totalWeight   = weighted.reduce((s, a) => s + (a.weight ?? 0), 0);
  const totalAchieved = weighted.reduce((s, a) => s + (a.weightAchieved ?? 0), 0);

  // sort assignments: missing first, then by due date
  const sorted = [...courseAssignments].sort((a, b) => {
    if (a.submission?.missing && !b.submission?.missing) return -1;
    if (!a.submission?.missing && b.submission?.missing) return 1;
    return +new Date(a.dueAt ?? 0) - +new Date(b.dueAt ?? 0);
  });

  const missing = courseAssignments.filter(a => a.submission?.missing).length;

  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", boxShadow: "var(--depth-line)", overflow: "hidden" }}>

      {/* ── row ── */}
      <button onClick={toggleExpanded}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>

        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ color: "var(--text-primary)", fontSize: "15px", fontWeight: "600", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {code}
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {course.name}
          </p>
          {(course.professor || course.semester) && (
            <p style={{ color: "var(--text-dim)", fontSize: "11px", marginTop: "3px" }}>
              {[course.professor, course.semester].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", flexShrink: 0, marginLeft: "12px", flexDirection: "column", alignItems: "flex-end" }}>
          {score != null && (
            <span style={{ fontSize: "16px", fontWeight: "700", color: scoreColor(score) }}>
              {Math.round(score)}%
            </span>
          )}
          {missing > 0 && (
            <span style={{ fontSize: "10px", fontWeight: "600", padding: "2px 7px", borderRadius: "12px", background: "rgba(255,59,48,0.12)", color: "rgba(255,100,90,0.85)" }}>
              {missing} missing
            </span>
          )}
          {changes?.newAssignments > 0 && (
            <span style={{ fontSize: "10px", fontWeight: "600", padding: "2px 7px", borderRadius: "12px", background: "rgba(10,132,255,0.15)", color: "rgba(90,170,255,0.95)" }}>
              {changes.newAssignments} new
            </span>
          )}
          {(changes?.scoreChanged || changes?.gradedAssignments > 0) && (
            <span style={{ fontSize: "10px", fontWeight: "600", padding: "2px 7px", borderRadius: "12px", background: "rgba(52,199,89,0.12)", color: "rgba(100,220,130,0.9)" }}>
              {changes.scoreDelta != null && changes.scoreDelta !== 0
                ? `${changes.scoreDelta > 0 ? "▲" : "▼"} ${Math.abs(changes.scoreDelta)}%`
                : "Grade updated"}
            </span>
          )}
          <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* ── expanded panel ── */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--color-border)" }}>

          {/* tabs */}
          <div style={{ display: "flex", gap: "0", borderBottom: "1px solid var(--color-border)" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "10px 6px", background: "none", border: "none",
                  borderBottom: tab === t ? "2px solid var(--color-accent, rgba(255,255,255,0.7))" : "2px solid transparent",
                  color: tab === t ? "var(--text-primary)" : "var(--text-dim)",
                  fontSize: "12px", fontWeight: tab === t ? "600" : "400",
                  cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s",
                }}>
                {t}
                {t === "Assignments" && courseAssignments.length > 0 && (
                  <span style={{ marginLeft: "4px", fontSize: "10px", opacity: 0.6 }}>({courseAssignments.length})</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Assignments tab ── */}
          {tab === "Assignments" && (
            <div>
              {sorted.length === 0 ? (
                <p style={{ padding: "16px 18px", color: "var(--text-dim)", fontSize: "13px" }}>No assignments found.</p>
              ) : sorted.map((a, i) => {
                  const due    = fmt(a.dueAt);
                  const scored = a.submission?.score != null && a.pointsPossible != null && a.pointsPossible > 0;
                  return (
                    <div key={a.id ?? i}
                      style={{ padding: "12px 18px", borderBottom: i < sorted.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ color: a.submission?.missing ? "rgba(255,100,90,0.85)" : "var(--text-primary)", fontSize: "13px", fontWeight: "500",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.submission?.missing && <span style={{ marginRight: "5px" }}>⚠</span>}
                          {a.name}
                        </p>
                        {due && (
                          <p style={{ color: due.urgent ? "rgba(255,204,0,0.8)" : due.past ? "rgba(255,100,90,0.6)" : "var(--text-dim)", fontSize: "11px", marginTop: "2px" }}>
                            {due.label}
                          </p>
                        )}
                      </div>

                      <div style={{ flexShrink: 0, textAlign: "right" }}>
                        {scored ? (
                          <>
                            <p style={{ color: scoreColor((a.submission.score / a.pointsPossible) * 100), fontSize: "13px", fontWeight: "600" }}>
                              {a.submission.score}/{a.pointsPossible}
                            </p>
                            <p style={{ color: "var(--text-dim)", fontSize: "10px" }}>
                              {Math.round((a.submission.score / a.pointsPossible) * 100)}%
                            </p>
                          </>
                        ) : (
                          <p style={{ color: "var(--text-dim)", fontSize: "12px" }}>
                            {a.pointsPossible != null ? `/${a.pointsPossible} pts` : "—"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
              })}
            </div>
          )}

          {/* ── Modules tab ── */}
          {tab === "Modules" && (
            <div>
              {courseModules.length === 0 ? (
                <p style={{ padding: "16px 18px", color: "var(--text-dim)", fontSize: "13px" }}>No modules found.</p>
              ) : courseModules.map((m, i) => (
                <div key={m.id ?? i}
                  style={{ padding: "12px 18px", borderBottom: i < courseModules.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: "500" }}>
                    {m.name ?? m.title ?? `Module ${i + 1}`}
                  </p>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {m.items_count != null && (
                      <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>{m.items_count} items</span>
                    )}
                    {m.published != null && (
                      <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "10px",
                        background: m.published ? "rgba(52,199,89,0.1)" : "rgba(255,255,255,0.06)",
                        color: m.published ? "rgba(100,220,130,0.85)" : "var(--text-dim)" }}>
                        {m.published ? "Live" : "Unpublished"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Grade Weights tab ── */}
          {tab === "Grade Weights" && (
            <div>
              {weighted.length > 0 ? (
                /* Per-assignment weighting (public schema). Each row shows the
                   weight earned vs. the weight the assignment is worth. */
                <>
                  {weighted.map((a, i) => {
                    const earned = a.weightAchieved;
                    const pct = a.weight > 0 && earned != null ? (earned / a.weight) * 100 : null;
                    return (
                      <div key={a.id ?? i}
                        style={{ padding: "12px 18px", borderBottom: i < weighted.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                        <p style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: "500", minWidth: 0, flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.name}
                        </p>
                        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: "13px", fontWeight: "600", color: pct != null ? scoreColor(pct) : "var(--text-dim)" }}>
                            {earned != null ? Math.round(earned * 100) / 100 : "—"}
                            <span style={{ color: "var(--text-dim)", fontWeight: "400" }}> / {a.weight}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ padding: "10px 18px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-dim)", fontSize: "12px", fontWeight: "600" }}>
                      Earned {Math.round(totalAchieved * 10) / 10} of {Math.round(totalWeight * 10) / 10}%
                    </span>
                    <span style={{ color: "var(--text-primary)", fontSize: "12px", fontWeight: "700" }}>
                      {totalWeight > 0 ? `${Math.round((totalAchieved / totalWeight) * 1000) / 10}%` : "—"}
                    </span>
                  </div>
                </>
              ) : courseGroups.length === 0 ? (
                <p style={{ padding: "16px 18px", color: "var(--text-dim)", fontSize: "13px" }}>No grade weights found.</p>
              ) : (
                <>
                  {/* if all weights are 0, course uses unweighted grading */}
                  {courseGroups.every(g => !g.weight) && (
                    <p style={{ padding: "12px 18px 4px", color: "var(--text-dim)", fontSize: "11px" }}>
                      This course uses unweighted grading — all assignments contribute equally.
                    </p>
                  )}
                  {courseGroups.map((g, i) => (
                    <div key={g.id ?? i}
                      style={{ padding: "12px 18px", borderBottom: i < courseGroups.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <p style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: "500" }}>
                        {g.name}
                      </p>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        {g.assignmentIds?.length > 0 && (
                          <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>{g.assignmentIds.length} items</span>
                        )}
                        <span style={{ fontSize: "14px", fontWeight: "700", color: g.weight ? "var(--text-primary)" : "var(--text-dim)", minWidth: "42px", textAlign: "right" }}>
                          {g.weight ?? 0}%
                        </span>
                      </div>
                    </div>
                  ))}
                  {/* only show total row when weights are actually set */}
                  {courseGroups.some(g => g.weight) && (
                    <div style={{ padding: "10px 18px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--text-dim)", fontSize: "12px", fontWeight: "600" }}>Total</span>
                      <span style={{ color: "var(--text-primary)", fontSize: "12px", fontWeight: "700" }}>
                        {courseGroups.reduce((sum, g) => sum + (g.weight ?? 0), 0)}%
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ─── PastCoursesSection ──────────────────────────────────── */

function PastCoursesSection({ pastCourses, addedIds, adding, onAdd, onAddManual }) {
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm]     = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualSem,  setManualSem]  = useState("");
  const [manualCode, setManualCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleManualSubmit() {
    if (!manualName.trim()) return;
    setSubmitting(true);
    await onAddManual({
      name:       manualName.trim(),
      courseCode: manualCode.trim() || manualName.trim().split(" ")[0].toUpperCase(),
      semester:   manualSem.trim() || "Past",
    });
    setManualName(""); setManualCode(""); setManualSem("");
    setShowForm(false);
    setSubmitting(false);
  }

  const inputSt: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px", padding: "8px 12px", color: "var(--text-primary)", fontSize: "13px",
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  };

  // Group by semester
  const grouped: Record<string, any[]> = {};
  pastCourses.forEach(c => {
    const sem = c.semester || "Past";
    if (!grouped[sem]) grouped[sem] = [];
    grouped[sem].push(c);
  });

  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px" }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "6px" }}
        >
          <span style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: "600", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            🗂 Past Courses
          </span>
          <span style={{ color: "var(--text-dim)", fontSize: "12px" }}>
            {pastCourses.length} {open ? "▲" : "▼"}
          </span>
        </button>
      </div>

      {open && (
        <div style={{ borderTop: "1px solid var(--color-border)" }}>
          {pastCourses.length === 0 && (
            <p style={{ padding: "14px 18px", color: "var(--text-dim)", fontSize: "13px" }}>
              No past courses from Canvas.
            </p>
          )}
          {Object.entries(grouped).map(([semester, semCourses]) => (
            <div key={semester}>
              <p style={{ padding: "10px 18px 6px", fontSize: "10px", color: "var(--text-dim)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                {semester}
              </p>
              {semCourses.map((c, i) => {
                const added = addedIds.has(c.id);
                return (
                  <div key={c.id ?? i} style={{
                    padding: "11px 18px",
                    borderBottom: i < semCourses.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </p>
                      <p style={{ color: "var(--text-dim)", fontSize: "11px", marginTop: "2px" }}>
                        {c.courseCode}
                        {c.finalScore != null ? ` · ${Math.round(c.finalScore)}%` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => onAdd(c)}
                      disabled={added || adding}
                      style={{
                        background: added ? "rgba(100,220,130,0.1)" : "rgba(255,255,255,0.07)",
                        border: `1px solid ${added ? "rgba(100,220,130,0.25)" : "rgba(255,255,255,0.12)"}`,
                        borderRadius: "8px",
                        padding: "5px 12px",
                        color: added ? "rgba(100,220,130,0.8)" : "var(--text-secondary)",
                        fontSize: "11px", fontWeight: "500",
                        cursor: added || adding ? "default" : "pointer",
                        fontFamily: "inherit", flexShrink: 0, marginLeft: "10px",
                        transition: "all 0.15s",
                      }}
                    >
                      {added ? "Added ✓" : adding ? "Adding…" : "+ Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          <p style={{ padding: "10px 18px 12px", color: "var(--text-dim)", fontSize: "11px", lineHeight: "1.5" }}>
            Added courses appear in your active course list and are included in AI context.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Main Courses page ───────────────────────────────────── */

export default function Canvas() {
  const {
    courses, assignments, announcements,
    modules, assignmentGroups,
    setModules, setAssignments,
    canvasToken, canvasBaseUrl, syncStatus, saveCanvasCredentials,
    userId, addManualCourse, refreshFromSupabase,
    cardChanges, markCardSeen,
    pastCourses,
  } = useApp();

  const [showUpload,      setShowUpload]      = useState(false);
  const [addingPast,      setAddingPast]      = useState(false);
  const [canvasExpanded,  setCanvasExpanded]  = useState(false);
  const [addedPastIds,    setAddedPastIds]    = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("fschool_added_past") || "[]")); }
    catch { return new Set(); }
  });

  async function handleAddPastCourse(pastCourse) {
    if (addedPastIds.has(pastCourse.id)) return;
    setAddingPast(true);

    // 1. Insert the course (now also stores canvas_course_id and returns the DB id)
    const dbCourseId = await addManualCourse(
      {
        name:           pastCourse.name,
        courseCode:     pastCourse.courseCode,
        source:         "past_canvas",
        semester:       pastCourse.semester,
        canvasCourseId: pastCourse.id,   // pass Canvas id so sync can link future data
      },
      []
    );

    const next = new Set(addedPastIds);
    next.add(pastCourse.id);
    setAddedPastIds(next);
    localStorage.setItem("fschool_added_past", JSON.stringify([...next]));

    // 2. Immediately fetch assignments + modules from Canvas if we have credentials.
    // Past courses may have access restrictions — all errors are silent.
    if (canvasToken && canvasBaseUrl && dbCourseId) {
      const [assignResult, moduleResult] = await Promise.allSettled([
        fetchAssignments(canvasToken, canvasBaseUrl, pastCourse.id, "/api/canvas"),
        fetchModules(canvasToken, canvasBaseUrl, pastCourse.id, "/api/canvas"),
      ]);

      // Assignments — upsert to DB with the real course_id so CourseCard can find them
      if (assignResult.status === "fulfilled" && assignResult.value.length > 0) {
        const meta = { courseId: String(pastCourse.id), courseCode: pastCourse.courseCode, courseName: pastCourse.name };
        const normalized = assignResult.value.map(a => normalizeAssignment(a, meta));
        const rows = normalized.map(a => ({
          user_id:              userId,
          course_id:            dbCourseId,
          canvas_assignment_id: String(a.id),
          title:                a.name,
          description:          a.description ?? null,
          due_at:               a.dueAt ?? null,
          points_possible:      a.pointsPossible ?? null,
          score:                a.submission?.score ?? null,
          submitted_at:         a.submission?.submittedAt ?? null,
          late:                 a.submission?.late ?? false,
          missing:              a.submission?.missing ?? false,
          submission_type:      a.submission?.submissionType ?? null,
          source:               "past_canvas",
          is_manual:            false,
        })).filter(r => r.canvas_assignment_id);
        await supabase.from("assignments").upsert(rows, { onConflict: "user_id,canvas_assignment_id" });
        // Update context so the CourseCard shows them immediately
        const ctxAssignments = normalized.map(a => ({
          ...a,
          courseId: dbCourseId,   // use DB id — matches CourseCard's a.courseId === course.id filter
        }));
        setAssignments(prev => [...prev, ...ctxAssignments]);
      }

      // Modules — add to context so the Modules tab shows immediately
      if (moduleResult.status === "fulfilled" && moduleResult.value.length > 0) {
        const moduleEntry = {
          courseId:   dbCourseId,   // use DB id to match CourseCard's String(m.courseId) === cid
          courseCode: pastCourse.courseCode,
          courseName: pastCourse.name,
          modules:    moduleResult.value.map(normalizeModule),
        };
        setModules(prev => [...prev, moduleEntry]);
      }
    }

    setAddingPast(false);
  }

  async function handleAddManualPast(course) {
    setAddingPast(true);
    const tempId = `manual_past_${Date.now()}`;
    await addManualCourse(
      { name: course.name, courseCode: course.courseCode, source: "manual_past", semester: course.semester },
      []
    );
    // Re-read from Supabase so the new past course lands in the Past Courses bucket
    // (loadCanvasData splits past-source courses out of the main list) right away.
    await refreshFromSupabase().catch(() => {});
    const next = new Set(addedPastIds);
    next.add(tempId);
    setAddedPastIds(next);
    localStorage.setItem("fschool_added_past", JSON.stringify([...next]));
    setAddingPast(false);
  }

  const hasCourses = courses.length > 0;

  return (
    <div>

      {/* ── Page header ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: "600", color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: "3px" }}>
            Courses
          </h1>
          <p style={{ color: "var(--text-dim)", fontSize: "14px" }}>
            {hasCourses
              ? `${courses.length} course${courses.length !== 1 ? "s" : ""}`
              : syncStatus === "syncing" ? "Syncing…" : "Add a course to get started"}
          </p>
        </div>
        {canvasToken && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "4px" }}>
            <SyncBadge status={syncStatus} />
            <RefreshButton syncStatus={syncStatus} onClick={refreshFromSupabase} />
          </div>
        )}
      </div>

      {/* ── Announcements ────────────────────────────────────── */}
      <AnnouncementsSection announcements={announcements} />

      {/* ── Course cards — primary content ───────────────────── */}
      {hasCourses ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
          {courses.map(c => (
            <CourseCard
              key={c.id ?? c.course_code ?? c.courseCode}
              course={c}
              assignments={assignments}
              modules={modules}
              assignmentGroups={assignmentGroups}
              changes={cardChanges[String(c.id)]}
              onSeen={markCardSeen}
            />
          ))}
        </div>
      ) : syncStatus !== "syncing" && (
        <div style={{ textAlign: "center", padding: "32px 16px", marginBottom: "20px" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "15px", fontWeight: "500", marginBottom: "6px" }}>
            No courses yet
          </p>
          <p style={{ color: "var(--text-dim)", fontSize: "13px", lineHeight: "1.65" }}>
            Add a course manually below, or connect Canvas to sync your full schedule automatically.
          </p>
        </div>
      )}

      {/* ── Past courses + manual add ────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
        <PastCoursesSection
          pastCourses={pastCourses || []}
          addedIds={addedPastIds}
          adding={addingPast}
          onAdd={handleAddPastCourse}
          onAddManual={handleAddManualPast}
        />
        <button
          onClick={() => setShowUpload(true)}
          style={{
            width: "100%", padding: "18px",
            background: "transparent",
            border: "1px dashed rgba(255,255,255,0.12)",
            borderRadius: "var(--radius-card)",
            color: "var(--text-dim)", fontSize: "13px", fontWeight: "500",
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "var(--text-dim)"; }}
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
          Add course manually
        </button>
      </div>

      {/* ── Canvas connect — expandable disclosure ────────────── */}
      {/* Collapsed by default — optional integration, not a wall. */}
      <div style={{ marginBottom: "24px" }}>
        <button
          onClick={() => setCanvasExpanded(e => !e)}
          style={{
            width: "100%",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px",
            background: canvasToken ? "rgba(52,199,89,0.04)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${canvasToken ? "rgba(52,199,89,0.15)" : "rgba(255,255,255,0.09)"}`,
            borderRadius: canvasExpanded ? "12px 12px 0 0" : "12px",
            cursor: "pointer", fontFamily: "inherit",
            transition: "border-color 0.15s, border-radius 0.12s",
          }}
          onMouseEnter={e => { if (!canvasToken) e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
          onMouseLeave={e => { if (!canvasToken) e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
        >
          <span style={{ color: canvasToken ? "rgba(52,199,89,0.8)" : "var(--text-secondary)", fontSize: "13px" }}>
            {canvasToken ? "Canvas connected ✓" : "Have Canvas? Connect here"}
          </span>
          <span style={{ color: "var(--text-dim)", fontSize: "10px", letterSpacing: "0.5px" }}>
            {canvasExpanded ? "▲" : "▼"}
          </span>
        </button>

        {canvasExpanded && (
          <div style={{
            border: `1px solid ${canvasToken ? "rgba(52,199,89,0.15)" : "rgba(255,255,255,0.09)"}`,
            borderTop: "none",
            borderRadius: "0 0 12px 12px",
            overflow: "hidden",
          }}>
            {canvasToken ? (
              <div style={{ padding: "16px 20px" }}>
                <p style={{ color: "var(--text-dim)", fontSize: "12px", lineHeight: "1.65" }}>
                  Connected and syncing automatically. Use ↻ Refresh in the header to pull the latest data.
                </p>
                {syncStatus === "cors-error" && (
                  <p style={{ color: "rgba(255,100,90,0.85)", fontSize: "12px", lineHeight: "1.65", marginTop: "10px" }}>
                    Canvas blocked the last request (CORS). Your cached data is shown above.
                  </p>
                )}
              </div>
            ) : (
              <div style={{ padding: "4px 20px 20px" }}>
                <ConnectCanvas onConnect={saveCanvasCredentials} />
                <div style={{ marginTop: "12px", padding: "12px 14px", background: "rgba(255,204,0,0.05)", border: "1px solid rgba(255,204,0,0.12)", borderRadius: "10px" }}>
                  <p style={{ color: "rgba(255,204,0,0.7)", fontSize: "12px", lineHeight: "1.65" }}>
                    <strong>Note:</strong> Canvas may restrict direct browser requests (CORS). If sync fails, a proxy server is required.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showUpload && (
        <ManualUploadSheet
          onClose={() => setShowUpload(false)}
          onSave={(course, newAssignments) => {
            addManualCourse(course, newAssignments);
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}
