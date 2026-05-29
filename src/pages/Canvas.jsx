// Canvas.jsx — Full Canvas LMS data display.
// Shows announcements, expandable course cards with assignments, modules, and grade weights.

import { useState } from "react";
import { useApp } from "../context/AppContext";
import ManualUploadSheet from "../components/ManualUploadSheet";

/* ─── helpers ─────────────────────────────────────────────── */

function fmt(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d - now;
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

/* ─── ConnectCanvas ───────────────────────────────────────── */

function ConnectCanvas({ onConnect }) {
  const [url, setUrl]       = useState("");
  const [token, setToken]   = useState("");
  const [saving, setSaving] = useState(false);

  const inputStyle = {
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

function CourseCard({ course, assignments, modules, assignmentGroups }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab]           = useState("Assignments");

  const score = course.current_score ?? course.currentScore ?? course.final_score ?? course.finalScore;
  const code  = course.course_code   ?? course.courseCode;

  // filter to this course
  // assignments are flat with camelCase courseId matching canvas_course_id
  const courseAssignments = (assignments ?? []).filter(a => a.courseId === course.id);
  // Use String() comparison — canvas_course_id type may differ between Supabase and blob
  const cid = String(course.id);
  const courseModules = (modules ?? []).find(m => String(m.courseId) === cid)?.modules ?? [];
  const courseGroups  = (assignmentGroups ?? []).find(g => String(g.courseId) === cid)?.groups ?? [];

  // sort assignments: missing first, then by due date
  const sorted = [...courseAssignments].sort((a, b) => {
    if (a.submission?.missing && !b.submission?.missing) return -1;
    if (!a.submission?.missing && b.submission?.missing) return 1;
    return new Date(a.dueAt ?? 0) - new Date(b.dueAt ?? 0);
  });

  const missing = courseAssignments.filter(a => a.submission?.missing).length;

  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", boxShadow: "var(--depth-line)", overflow: "hidden" }}>

      {/* ── row ── */}
      <button onClick={() => setExpanded(e => !e)}
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
              {courseGroups.length === 0 ? (
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

/* ─── Main Canvas page ────────────────────────────────────── */

export default function Canvas() {
  const {
    courses, assignments, announcements,
    modules, assignmentGroups,
    canvasToken, syncStatus, saveCanvasCredentials,
    addManualCourse,
    forceSync,
  } = useApp();

  const [showUpload, setShowUpload] = useState(false);

  if (!canvasToken) {
    return (
      <div>
        <h1 style={{ fontSize: "26px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "4px", letterSpacing: "-0.3px" }}>
          Canvas
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: "14px", marginBottom: "4px" }}>Not connected</p>
        <ConnectCanvas onConnect={saveCanvasCredentials} />
        <div style={{ marginTop: "20px", padding: "14px 16px", background: "rgba(255,204,0,0.05)", border: "1px solid rgba(255,204,0,0.12)", borderRadius: "12px" }}>
          <p style={{ color: "rgba(255,204,0,0.7)", fontSize: "12px", lineHeight: "1.65" }}>
            <strong>Note:</strong> Canvas restricts direct browser requests from third-party origins (CORS). If sync fails, you may need a proxy server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* header */}
      <h1 style={{ fontSize: "26px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "4px", letterSpacing: "-0.3px" }}>
        Canvas
      </h1>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
        <p style={{ color: "var(--text-dim)", fontSize: "14px" }}>
          {courses.length > 0 ? `${courses.length} course${courses.length !== 1 ? "s" : ""}` : "Syncing courses…"}
        </p>
        <SyncBadge status={syncStatus} />
        <button
          onClick={forceSync}
          disabled={syncStatus === "syncing"}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "20px",
            padding: "4px 12px",
            color: syncStatus === "syncing" ? "var(--text-dim)" : "var(--text-secondary)",
            fontSize: "11px",
            fontWeight: "500",
            cursor: syncStatus === "syncing" ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => {
            if (syncStatus !== "syncing") e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
          }}
        >
          {syncStatus === "syncing" ? "Syncing…" : "↻ Refresh"}
        </button>
      </div>

      {syncStatus === "cors-error" && (
        <div style={{ marginBottom: "16px", padding: "14px 16px", background: "rgba(255,59,48,0.06)", border: "1px solid rgba(255,59,48,0.15)", borderRadius: "12px" }}>
          <p style={{ color: "rgba(255,100,90,0.85)", fontSize: "12px", lineHeight: "1.65" }}>
            Canvas blocked the request (CORS). Your cached data is shown below if a previous sync succeeded.
          </p>
        </div>
      )}

      {courses.length === 0 && syncStatus !== "syncing" && (
        <ConnectCanvas onConnect={saveCanvasCredentials} />
      )}

      {/* announcements */}
      <AnnouncementsSection announcements={announcements} />

      {/* courses */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {courses.map(c => (
          <CourseCard
            key={c.id ?? c.course_code ?? c.courseCode}
            course={c}
            assignments={assignments}
            modules={modules}
            assignmentGroups={assignmentGroups}
          />
        ))}

        {/* ── Manual upload trigger ── */}
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
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            e.currentTarget.style.color = "var(--text-dim)";
          }}
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span>
          Add course manually
        </button>
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
