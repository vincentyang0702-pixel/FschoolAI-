// NeuralRing.jsx — Draggable floating AI assistant button + chat sheet.
//
// Behaviour:
//  • Drag freely anywhere on screen; stays exactly where released (free placement, no corner snap).
//  • Position is global and persists across page navigation.
//  • Ring hides (opacity 0, pointer-events none) while the chat is open.
//  • Ring drag sets document.body[data-ring-drag] so useSwipe ignores the gesture.
//  • Chat can be closed by swiping down on the drag handle or tapping the backdrop.
//  • Renders via createPortal into document.body to escape any ancestor overflow/stacking context.
//  • Ring name label below the sphere is editable and saved to Supabase users.ring_name.
//  • Voice mode: mute toggle in header. When unmuted, AI replies are spoken via ElevenLabs TTS.

import { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { groq } from "../api/groq";
import { useApp } from "../context/AppContext";
import { supabase } from "../api/supabase";

const NAV_REGEX      = /<\s*n?\s*nav[^>]*>([\s\S]*?)<\/\s*n?\s*nav\s*>/i;
const NAV_STRIP_REGEX = /<\s*n?\s*nav[\s\S]*$/i;

/** Log chat message to Supabase chat_logs (non-blocking) */
async function logChat(userId, role, content, page) {
  try {
    await supabase.from("chat_logs").insert({
      user_id: userId, role, content, page: page ?? null,
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}

/** Return assignments due within 48h that aren't submitted */
function getUrgentAssignments(assignments) {
  const now = Date.now();
  const h48 = 48 * 60 * 60 * 1000;
  return (assignments || []).filter(a => {
    if (!a.dueAt || a.submission?.submittedAt) return false;
    const diff = new Date(a.dueAt).getTime() - now;
    return diff > 0 && diff <= h48;
  });
}

function buildChatSystem(courseOptions, userData, assignments) {
  const courseList = courseOptions.length
    ? courseOptions.join("\n- ")
    : "No courses loaded yet";

  const now = Date.now();
  const upcoming = (assignments || [])
    .filter(a => a.dueAt && new Date(a.dueAt).getTime() > now)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, 5)
    .map(a => `- ${a.name} (${a.courseName || a.courseCode || ""}) — due ${new Date(a.dueAt).toLocaleDateString()}`)
    .join("\n");

  const userContext = userData ? [
    userData.name       ? `Student name: ${userData.name}` : null,
    userData.gpa        ? `GPA: ${userData.gpa}` : null,
    userData.streak     ? `Study streak: ${userData.streak} days` : null,
    userData.study_time ? `Total study time: ${userData.study_time} mins` : null,
    userData.school     ? `School: ${userData.school}` : null,
  ].filter(Boolean).join("\n") : "";

  return `You are a concise academic AI assistant. Answer in 1-3 sentences. Use the student's real data below to give specific, helpful answers.

STUDENT DATA:
${userContext || "No user data yet"}

UPCOMING ASSIGNMENTS:
${upcoming || "None"}

COURSES (internal reference — never list these back verbatim):
- ${courseList}

PAGES: work, canvas, assignment, study, identity, leaderboard, toolkit

NAVIGATION: When the user wants to go somewhere or study a course, append this EXACTLY at the end of your reply — nothing after it:
<nav>{"page":"pagename","course":"EXACT course string","mode":"flashcards or guide"}</nav>
Omit "course"/"mode" when not relevant. Only use <nav> for clear navigation intent.

RULES:
- Never dump the full course list. If asked, summarize (e.g. "You have 6 courses including Physics and Media Studies")
- Use the student's real GPA/streak/assignments when answering
- Be direct and specific, not generic`;
}

function parseNav(raw) {
  const tagMatch = raw.match(NAV_REGEX);
  if (tagMatch) {
    try {
      const cmd  = JSON.parse(tagMatch[1].trim());
      const text = raw.replace(NAV_REGEX, "").replace(NAV_STRIP_REGEX, "").trim();
      return { cmd, text };
    } catch {}
  }
  const bareMatch = raw.match(/(\{[^{}]*"page"\s*:[^{}]*\})\s*$/);
  if (bareMatch) {
    try {
      const cmd = JSON.parse(bareMatch[1]);
      if (cmd.page) return { cmd, text: raw.slice(0, raw.lastIndexOf(bareMatch[1])).replace(NAV_STRIP_REGEX, "").trim() };
    } catch {}
  }
  return { cmd: null, text: raw.replace(NAV_STRIP_REGEX, "").trim() };
}

// ── ElevenLabs TTS ─────────────────────────────────────────────────────────
async function speakText(text) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  const { audio, mimeType } = await res.json();
  if (!audio) throw new Error("No audio returned");
  const bytes   = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
  const blob    = new Blob([bytes], { type: mimeType || "audio/mpeg" });
  const url     = URL.createObjectURL(blob);
  const audioEl = new Audio(url);
  return new Promise((resolve, reject) => {
    audioEl.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audioEl.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    audioEl.play().catch(reject);
  });
}

const SIZE           = 68;
const RADIUS         = 24;
const N              = 28;
const EDGE_THRESHOLD = 0.72;

function fibonacciSphere(n) {
  const pts = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = phi * i;
    pts.push({ x: r * Math.cos(t), y, z: r * Math.sin(t) });
  }
  return pts;
}

const NODES = fibonacciSphere(N);

function defaultPos() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  return { top: H - SIZE - 96, left: W - SIZE - 22 };
}

function clamp(pos) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  return {
    top:  Math.max(56, Math.min(H - SIZE - 40, pos.top)),
    left: Math.max(8,  Math.min(W - SIZE - 8,  pos.left)),
  };
}

const MuteIcon = ({ muted }) => muted ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);

export default function NeuralRing() {
  const { userData, updateUserField, courses, assignments, setPendingNav, setStudyConfig, userId } = useApp();

  const courseOptions = courses.length
    ? courses.map(c => `${c.courseCode} — ${c.name}`)
    : [];

  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const rotRef    = useRef(0);

  const [pos, setPos]           = useState(defaultPos);
  const [isDragging, setIsDrag] = useState(false);
  const dragStartRef            = useRef(null);
  const hasDraggedRef           = useRef(false);

  const [chatOpen, setChatOpen] = useState(false);

  const [ringName,       setRingName]       = useState("");
  const [editingName,    setEditingName]    = useState(false);
  const [ringNameInput,  setRingNameInput]  = useState("");
  const ringNameInputRef                    = useRef(null);

  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const messagesEndRef          = useRef(null);

  const [muted,    setMuted]    = useState(() => {
    try { return localStorage.getItem("fschool_muted") === "1"; } catch { return false; }
  });
  const [speaking, setSpeaking] = useState(false);

  const sheetStartY             = useRef(null);
  const [sheetDragY, setSheetDragY] = useState(0);

  useEffect(() => {
    const name = userData?.ring_name ?? "";
    setRingName(name);
    setRingNameInput(name);
  }, [userData?.ring_name]);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m;
      try { localStorage.setItem("fschool_muted", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  // ── Inject keyframes once ──────────────────────────────────────────────────
  useEffect(() => {
    if (document.querySelector("[data-neuralring-style]")) return;
    const style = document.createElement("style");
    style.dataset.neuralringStyle = "1";
    style.textContent = `
      @keyframes neuralPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.10), 0 6px 28px rgba(0,0,0,0.5); }
        50%       { box-shadow: 0 0 0 9px rgba(255,255,255,0.03), 0 0 0 1px rgba(255,255,255,0.12), 0 6px 28px rgba(0,0,0,0.5); }
      }
      .nr-idle { animation: neuralPulse 4s ease-in-out infinite; }
      @keyframes neuralSpeak {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.14), 0 0 0 1px rgba(255,255,255,0.18), 0 6px 28px rgba(0,0,0,0.5); }
        50%       { box-shadow: 0 0 0 14px rgba(255,255,255,0.05), 0 0 0 1px rgba(255,255,255,0.22), 0 6px 28px rgba(0,0,0,0.5); }
      }
      .nr-speaking { animation: neuralSpeak 0.8s ease-in-out infinite; }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // ── Canvas animation ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      rotRef.current += 0.004;
      const rot = rotRef.current;
      const projected = NODES.map(({ x, y, z }) => {
        const rx = x * Math.cos(rot) + z * Math.sin(rot);
        const rz = -x * Math.sin(rot) + z * Math.cos(rot);
        return { sx: rx * RADIUS + SIZE / 2, sy: y * RADIUS + SIZE / 2, sz: rz, depth: (rz + 1) * 0.5 };
      });
      ctx.lineWidth = 0.7;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const ri = projected[i], rj = projected[j];
          const da = { x: ri.sx - rj.sx, y: ri.sy - rj.sy, z: ri.sz - rj.sz };
          const d3 = Math.sqrt(da.x * da.x + da.y * da.y + da.z * da.z);
          if (d3 < RADIUS * 2 * EDGE_THRESHOLD) {
            const alpha = 0.05 + (ri.depth + rj.depth) * 0.07;
            ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx.beginPath(); ctx.moveTo(ri.sx, ri.sy); ctx.lineTo(rj.sx, rj.sy); ctx.stroke();
          }
        }
      }
      for (const { sx, sy, depth } of projected) {
        ctx.beginPath();
        ctx.arc(sx, sy, 0.9 + depth * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${(0.5 + depth * 0.4).toFixed(2)})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const commitRingName = useCallback(async () => {
    setEditingName(false);
    const trimmed = ringNameInput.trim();
    setRingName(trimmed);
    await updateUserField("ring_name", trimmed);
  }, [ringNameInput, updateUserField]);

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    document.body.dataset.ringDrag = "1";
    dragStartRef.current  = { px: pos.left, py: pos.top, mx: e.clientX, my: e.clientY };
    hasDraggedRef.current = false;
    setIsDrag(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pos]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.mx;
    const dy = e.clientY - dragStartRef.current.my;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasDraggedRef.current = true;
    setPos({ top: dragStartRef.current.py + dy, left: dragStartRef.current.px + dx });
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    delete document.body.dataset.ringDrag;
    setIsDrag(false);
    if (hasDraggedRef.current) {
      setPos(p => clamp(p));
    } else {
      setChatOpen(o => !o);
      setEditingName(false);
    }
  }, [isDragging]);

  // ── Sheet swipe-to-close ────────────────────────────────────────────────────
  const handleSheetHandleTouchStart = useCallback((e) => {
    sheetStartY.current = e.touches[0].clientY;
    setSheetDragY(0);
  }, []);

  const handleSheetHandleTouchMove = useCallback((e) => {
    if (sheetStartY.current === null) return;
    const dy = e.touches[0].clientY - sheetStartY.current;
    if (dy > 0) { e.preventDefault(); setSheetDragY(dy); }
  }, []);

  const handleSheetHandleTouchEnd = useCallback(() => {
    const dy = sheetDragY;
    sheetStartY.current = null;
    setSheetDragY(0);
    if (dy > 80) { setChatOpen(false); setEditingName(false); }
  }, [sheetDragY]);

  // ── Proactive urgent nudge when chat opens ──────────────────────────────────
  const prevChatOpen = useRef(false);
  useEffect(() => {
    if (chatOpen && !prevChatOpen.current) {
      const urgent = getUrgentAssignments(assignments);
      if (urgent.length > 0) {
        const names = urgent.map(a => {
          const h = Math.round((new Date(a.dueAt) - Date.now()) / 3600000);
          return `• ${a.name} — due in ${h}h`;
        }).join("\n");
        setMessages(m => m.length === 0
          ? [{ role: "assistant", content: `Heads up! You have ${urgent.length} assignment${urgent.length > 1 ? "s" : ""} due soon:\n${names}` }]
          : m
        );
      }
    }
    prevChatOpen.current = chatOpen;
  }, [chatOpen, assignments]);

  // ── Speak helper — fires TTS if not muted, fails silently ──────────────────
  const speak = useCallback(async (text) => {
    if (muted) return;
    const plain = text.replace(/<[^>]+>/g, "").trim();
    if (!plain) return;
    try {
      setSpeaking(true);
      await speakText(plain);
    } catch (err) {
      console.warn("TTS failed, staying text-only:", err.message);
    } finally {
      setSpeaking(false);
    }
  }, [muted]);

  // ── Chat ────────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setLoading(true);
    logChat(userId, "user", userMsg.content, null);

    try {
      const raw = await groq([...messages, userMsg], buildChatSystem(courseOptions, userData, assignments));
      const { cmd, text: displayText } = parseNav(raw);
      const cleanText = displayText.replace(/<[^>]+>/g, "").trim();
      if (cmd?.page) {
        if (cmd.course || cmd.mode) setStudyConfig({ course: cmd.course ?? null, mode: cmd.mode ?? "flashcards" });
        setTimeout(() => setPendingNav({ page: cmd.page }), 600);
      }
      setMessages(m => [...m, { role: "assistant", content: cleanText }]);
      logChat(userId, "assistant", cleanText, null);
      speak(cleanText);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Couldn't connect. Check your Groq API key." }]);
    }
    setLoading(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return createPortal(
    <>
      {/* Floating ring */}
      <div
        style={{
          position: "fixed", top: pos.top, left: pos.left,
          opacity: chatOpen ? 0 : (isDragging ? 1 : 0.82),
          pointerEvents: chatOpen ? "none" : "auto",
          transition: isDragging
            ? "opacity 0.15s"
            : "top 0.22s var(--ease-apple), left 0.22s var(--ease-apple), opacity 0.2s",
          zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
        }}
      >
        <div
          className={speaking ? "nr-speaking" : (isDragging ? undefined : "nr-idle")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            width: SIZE, height: SIZE, borderRadius: "50%",
            cursor: isDragging ? "grabbing" : "grab",
            touchAction: "none", userSelect: "none",
            background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.13), rgba(255,255,255,0.04))",
            border: "1px solid rgba(255,255,255,0.13)",
          }}
        >
          <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: "block", borderRadius: "50%" }} />
        </div>
      </div>

      {/* Chat sheet */}
      {chatOpen && (
        <>
          <div onClick={() => setChatOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9997 }} />
          <div
            onTouchStart={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              height: "72vh", maxHeight: "680px",
              background: "rgba(16,16,16,0.96)",
              backdropFilter: "blur(32px)", WebkitBackdropFilter: "blur(32px)",
              borderRadius: "22px 22px 0 0",
              border: "1px solid rgba(255,255,255,0.09)", borderBottom: "none",
              display: "flex", flexDirection: "column",
              fontFamily: "var(--font-sans)",
              boxShadow: "0 -12px 48px rgba(0,0,0,0.6)",
              zIndex: 9998,
              transform: `translateY(${sheetDragY}px)`,
              transition: sheetDragY > 0 ? "none" : "transform 0.28s var(--ease-apple)",
            }}
          >
            {/* Drag handle */}
            <div
              onTouchStart={handleSheetHandleTouchStart}
              onTouchMove={handleSheetHandleTouchMove}
              onTouchEnd={handleSheetHandleTouchEnd}
              style={{ display: "flex", justifyContent: "center", padding: "14px 0 6px", flexShrink: 0, cursor: "grab", touchAction: "none" }}
            >
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)" }} />
            </div>

            {/* Header */}
            <div style={{ padding: "10px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.18), rgba(255,255,255,0.04))", border: "1px solid rgba(255,255,255,0.12)" }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  {editingName ? (
                    <input
                      ref={ringNameInputRef}
                      value={ringNameInput}
                      onChange={e => setRingNameInput(e.target.value)}
                      onBlur={commitRingName}
                      onKeyDown={e => e.key === "Enter" && commitRingName()}
                      style={{
                        background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.18)",
                        borderRadius: "6px", padding: "3px 9px", color: "var(--text-primary)",
                        fontSize: "17px", fontWeight: "600", letterSpacing: "-0.2px",
                        outline: "none", fontFamily: "inherit", width: "160px",
                      }}
                    />
                  ) : (
                    <p
                      onClick={() => { setRingNameInput(ringName); setEditingName(true); setTimeout(() => ringNameInputRef.current?.focus(), 0); }}
                      style={{ color: "var(--text-primary)", fontSize: "17px", fontWeight: "600", letterSpacing: "-0.2px", cursor: "text" }}
                      title="Tap to rename"
                    >
                      {ringName || "Name your agent"}
                    </p>
                  )}
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", marginTop: "1px", letterSpacing: "0.4px" }}>
                    Academic AI · Always on{speaking ? " · Speaking…" : ""}
                  </p>
                </div>

                {/* Mute toggle */}
                <button
                  onClick={toggleMute}
                  title={muted ? "Voice off — tap to enable" : "Voice on — tap to mute"}
                  style={{
                    background: muted ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)",
                    border: `1px solid ${muted ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.2)"}`,
                    borderRadius: "8px", padding: "6px 8px",
                    color: muted ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)",
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", flexShrink: 0, transition: "all 0.15s ease",
                  }}
                >
                  <MuteIcon muted={muted} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {messages.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "40px", gap: "12px" }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.14), rgba(255,255,255,0.03))", border: "1px solid rgba(255,255,255,0.10)" }} />
                  <p style={{ color: "rgba(255,255,255,0.22)", fontSize: "14px", textAlign: "center", lineHeight: "1.8" }}>
                    Ask about assignments, grades,<br />or navigate anywhere in the app.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "center", marginTop: "4px" }}>
                    {["What's due soon?", "Take me to study", "How's my GPA?", "Open toolkit"].map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => setInput(prompt)}
                        style={{
                          fontSize: "11px", padding: "5px 11px", borderRadius: "20px",
                          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                          color: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "84%",
                      background: m.role === "user" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
                      borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      padding: "10px 14px", color: "var(--text-primary)",
                      fontSize: "14px", lineHeight: "1.6",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {m.content}
                  </div>
                ))
              )}
              {loading && (
                <div style={{ alignSelf: "flex-start", color: "rgba(255,255,255,0.3)", fontSize: "13px", padding: "6px 4px" }}>
                  Thinking…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ display: "flex", gap: "10px", padding: "12px 14px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask about assignments, navigate…"
                style={{
                  flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: "var(--radius-btn)", padding: "11px 14px", color: "var(--text-primary)",
                  fontSize: "14px", outline: "none", fontFamily: "inherit",
                  transition: "border-color var(--dur-base) var(--ease-apple)",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)")}
                onBlur={e  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                style={{
                  background: !input.trim() || loading ? "rgba(255,255,255,0.18)" : "var(--color-accent)",
                  color: "#111", border: "none", borderRadius: "var(--radius-btn)",
                  padding: "11px 18px", fontSize: "14px", fontWeight: "600",
                  cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                  fontFamily: "inherit", flexShrink: 0,
                  transition: "background var(--dur-base) var(--ease-apple)",
                }}
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </>,
    document.body
  );
}
