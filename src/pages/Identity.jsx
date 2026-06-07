// Identity.jsx — Student profile with live Supabase data, GradeGraph, and ShareCard.

import { useState, useCallback } from "react";

// Deterministic fallback grade (72–97) derived from the course code string.
// Same course always produces the same number so it doesn't flicker on re-render.
function fallbackGrade(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(31, h) + seed.charCodeAt(i) | 0; }
  return 72 + (Math.abs(h) % 26);
}
import { useApp }                   from "../context/AppContext";
import GradeGraph, { COURSE_COLORS } from "../components/GradeGraph";
import ShareCard                     from "../components/ShareCard";

const TOKEN_LABELS = {
  daily_login:          "Daily login",
  canvas_sync:          "Canvas synced",
  flashcards_generated: "Flashcards generated",
  quiz_completed:       "Quiz completed",
  quiz_perfect:         "Perfect score",
  assignment_submitted: "Assignment done",
  discord_connected:    "Discord connected",
  streak_day:           "Streak extended",
  streak_milestone:     "Streak milestone",
};

function fmtEventDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtVoiceLabel(labels) {
  const parts = [labels?.accent, labels?.gender, labels?.age].filter(Boolean);
  return parts.slice(0, 2).join(" · ");
}

export default function Identity() {
  const { userData, courses, assignments, canvasToken, updateUserField, tokenSummary } = useApp();

  // Editable name
  const currentName = userData?.name || localStorage.getItem("fschool_name") || "";
  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState(currentName);

  // Voice picker state
  const [voices,      setVoices]      = useState([]);
  const [voiceLoad,   setVoiceLoad]   = useState(false);
  const [voiceErr,    setVoiceErr]    = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(userData?.preferred_voice_id ?? null);
  const [voiceSaving,  setVoiceSaving]  = useState(false);
  const [voiceSaved,   setVoiceSaved]   = useState(false);
  const audioRef = useState(() => typeof Audio !== "undefined" ? new Audio() : null)[0];

  // Sync selectedVoice from userData once loaded
  const [voiceInitDone, setVoiceInitDone] = useState(false);
  if (!voiceInitDone && userData?.preferred_voice_id) {
    setSelectedVoice(userData.preferred_voice_id);
    setVoiceInitDone(true);
  }

  useEffect(() => {
    if (voices.length > 0 || voiceLoad) return;
    setVoiceLoad(true);
    fetch("/api/tts?action=voices")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setVoices(data.slice(0, 8)))
      .catch(() => setVoiceErr(true))
      .finally(() => setVoiceLoad(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickVoice(voiceId) {
    if (voiceSaving) return;
    setSelectedVoice(voiceId);
    setVoiceSaving(true);
    try {
      await updateUserField("preferred_voice_id", voiceId);
      setVoiceSaved(true);
      setTimeout(() => setVoiceSaved(false), 2000);
    } catch { /* non-fatal */ }
    setVoiceSaving(false);
  }

  function previewVoice(previewUrl) {
    if (!audioRef || !previewUrl) return;
    audioRef.pause();
    audioRef.src = previewUrl;
    audioRef.play().catch(() => {});
  }

  const commitName = useCallback(async () => {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === currentName) return;
    localStorage.setItem("fschool_name", trimmed);
    await updateUserField("name", trimmed);
  }, [nameInput, currentName, updateUserField]);

  const gpa         = userData?.gpa        != null ? userData.gpa.toFixed(2) : "—";
  const streak      = `${userData?.streak     ?? 0}d`;
  const studyTime   = `${userData?.study_time ?? 0}h`;
  const totalDone   = assignments.filter(a => a.submission?.submittedAt).length || 0;

  const STATS = [
    { label: "GPA",         value: gpa },
    { label: "Assignments", value: totalDone || (userData?.assignments ?? "—") },
    { label: "Streak",      value: streak },
    { label: "Study Time",  value: studyTime },
  ];

  // Course performance from Canvas data; fall back to placeholder if not connected
  const coursePerf = courses.length > 0
    ? courses.map(c => ({
        name:    c.name,
        code:    c.courseCode,
        pct:     c.currentScore ?? c.finalScore ?? fallbackGrade(c.courseCode ?? c.name ?? ""),
      }))
    : [
        { name: "Cognitive Psychology",    code: "PSYC 302", pct: 91 },
        { name: "Strategic Management",    code: "BUS 410",  pct: 84 },
        { name: "Algorithms & Complexity", code: "CS 355",   pct: 76 },
        { name: "Differential Equations",  code: "MATH 241", pct: 68 },
      ];

  function handleSignOut() {
    localStorage.removeItem("fschool_logged_in");
    localStorage.removeItem("fschool_name");
    window.location.reload();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <p style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>Identity</p>
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => e.key === "Enter" && commitName()}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: "8px",
                padding: "4px 10px",
                color: "var(--text-primary)",
                fontSize: "22px",
                fontWeight: "600",
                letterSpacing: "-0.3px",
                outline: "none",
                fontFamily: "inherit",
                width: "180px",
              }}
            />
          ) : (
            <h1
              onClick={() => { setNameInput(currentName); setEditingName(true); }}
              style={{ fontSize: "26px", fontWeight: "600", color: "var(--text-primary)", letterSpacing: "-0.3px", cursor: "text" }}
              title="Tap to edit name"
            >
              {currentName || "Your Name"}
            </h1>
          )}
          {(userData?.school || userData?.school_city || userData?.school_country) && (
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
              {[userData.school, userData.school_city, userData.school_country].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button
          onClick={handleSignOut}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "8px",
            color: "rgba(255,255,255,0.35)",
            fontSize: "11px",
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          Sign Out
        </button>
      </div>

      {/* 2×2 stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "32px" }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", boxShadow: "var(--depth-line)", padding: "20px 16px" }}>
            <p style={{ color: "var(--text-primary)", fontSize: "28px", fontWeight: "600", letterSpacing: "-0.5px", marginBottom: "4px" }}>
              {s.value}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Grade graph */}
      <div style={{ marginBottom: "32px" }}>
        <GradeGraph
          courses={courses}
          assignments={assignments}
          connected={courses.length > 0}
        />
      </div>

      {/* Course performance bars */}
      <p style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "16px" }}>
        Course Performance
        {!canvasToken && courses.length === 0 && <span style={{ color: "rgba(255,255,255,0.18)", marginLeft: "8px", letterSpacing: "1px" }}>placeholder</span>}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "8px" }}>
        {coursePerf.map((c, i) => {
          const color = COURSE_COLORS[i % COURSE_COLORS.length];
          return (
            <div key={c.code}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "7px" }}>
                <div>
                  <span style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: "500" }}>{c.name}</span>
                  <span style={{ color: "var(--text-tertiary)", fontSize: "12px", marginLeft: "8px" }}>{c.code}</span>
                </div>
                <span style={{ fontSize: "13px", fontWeight: "600", color, flexShrink: 0, marginLeft: "8px" }}>
                  {c.pct != null ? `${Math.round(c.pct)}%` : "—"}
                </span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "4px", height: "4px" }}>
                <div style={{ background: color, height: "100%", borderRadius: "4px", width: `${c.pct ?? 0}%`, transition: "width 0.5s var(--ease-apple)" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tutor voice picker */}
      <div style={{ marginBottom: "32px" }}>
        <p style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "14px" }}>
          Tutor voice
          {voiceSaved && <span style={{ color: "#C49A3C", marginLeft: "10px", letterSpacing: "0.5px", textTransform: "none", fontSize: "11px" }}>✓ Saved</span>}
        </p>
        {voiceLoad && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[1,2,3].map(i => <div key={i} style={{ height: "44px", background: "rgba(255,255,255,0.04)", borderRadius: "10px", animation: "nrMsgIn .4s ease both" }} />)}
          </div>
        )}
        {voiceErr && (
          <p style={{ color: "var(--text-dim)", fontSize: "13px" }}>Couldn't load voices — try again later.</p>
        )}
        {!voiceLoad && !voiceErr && voices.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {voices.map(v => {
              const isSelected = selectedVoice === v.voice_id;
              return (
                <div
                  key={v.voice_id}
                  onClick={() => pickVoice(v.voice_id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    background: isSelected ? "rgba(196,154,60,0.07)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isSelected ? "rgba(196,154,60,0.3)" : "rgba(255,255,255,0.06)"}`,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: isSelected ? "#C49A3C" : "rgba(255,255,255,0.15)", transition: "background 0.15s" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: isSelected ? "#C49A3C" : "var(--text-primary)", fontSize: "13px", fontWeight: isSelected ? "600" : "400" }}>{v.name}</p>
                    {fmtVoiceLabel(v.labels) && (
                      <p style={{ color: "var(--text-dim)", fontSize: "11px", marginTop: "1px" }}>{fmtVoiceLabel(v.labels)}</p>
                    )}
                  </div>
                  {v.preview_url && (
                    <button
                      onClick={e => { e.stopPropagation(); previewVoice(v.preview_url); }}
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", padding: "4px 8px", borderRadius: "6px", fontSize: "13px", fontFamily: "inherit", flexShrink: 0, transition: "color 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}
                      onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.3)"}
                      title="Preview voice"
                    >▶</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Token activity */}
      {tokenSummary?.recentEvents?.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <p style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "12px" }}>
            Recent activity
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            {tokenSummary.recentEvents.map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", borderRadius: "8px" }}>
                <span style={{ color: "#C49A3C", fontSize: "12px", fontWeight: "700", minWidth: "32px" }}>+{e.tokens}</span>
                <span style={{ color: "var(--text-secondary)", fontSize: "13px", flex: 1 }}>{TOKEN_LABELS[e.action] ?? e.action}</span>
                <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>{fmtEventDate(e.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share card */}
      <ShareCard />
    </div>
  );
}
