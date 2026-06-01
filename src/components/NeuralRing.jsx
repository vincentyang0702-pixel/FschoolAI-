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

// ── Claude proxy helper (tutor brain — better quality than Groq for conversation) ──
async function claudeTutor(messages, system) {
  const res = await fetch("/api/claude", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system, max_tokens: 400 }),
  });
  if (!res.ok) throw new Error(`Claude proxy ${res.status}`);
  const { content } = await res.json();
  return content ?? "";
}

// ── Fire-and-forget impression writer — never awaited in critical path ──
function writeImpression(userId, userMessage, tutorResponse) {
  fetch("/api/tutor-impression", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, userMessage, tutorResponse }),
  }).catch(() => {}); // silent — never block UI
}

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

function buildChatSystem(courseOptions, userData, assignments, flashcardMap, syllabus, impressions, lastSession, livingMind, isFirstMessage = false) {
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

  // Flashcard topics per course (just question subjects, not full cards)
  const flashcardContext = Object.entries(flashcardMap || {})
    .map(([, data]) => {
      if (!data?.cards?.length) return null;
      const topics = data.cards.slice(0, 4).map(c => c.question).join(" | ");
      return `• ${topics}`;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");

  // Syllabus topics (first 5 items)
  const syllabusContext = (syllabus || [])
    .slice(0, 5)
    .map(s => `• ${s.title ?? s.name ?? JSON.stringify(s)}`)
    .join("\n");

  // Impressions from previous sessions
  const impressionContext = (impressions || [])
    .slice(0, 5)
    .map(i => `• ${i.impression}`)
    .join("\n");

  // Last session continuity
  const lastSessionLine = lastSession
    ? `Last session: ${lastSession}`
    : "";

  return `You are a sharp, direct academic AI tutor. You know this student — their patterns, their work habits, their actual courses. Answer in 1-3 sentences unless the student asks for more detail.

STUDENT DATA:
${userContext || "No user data yet"}

UPCOMING ASSIGNMENTS:
${upcoming || "None"}

COURSES (internal reference — never list back verbatim):
- ${courseList}

${flashcardContext ? `WHAT THEY'VE BEEN STUDYING (flashcard topics):\n${flashcardContext}` : ""}

${syllabusContext ? `SYLLABUS TOPICS:\n${syllabusContext}` : ""}

${impressionContext ? `RECENT OBSERVATIONS (this and past sessions):\n${impressionContext}` : ""}

${livingMind ? `LIVING MIND (your full student model — built across all sessions):\n${livingMind}` : ""}

${lastSessionLine ? `CONTINUITY:\n${lastSessionLine}` : ""}

PAGES: work, canvas, assignment, study, identity, leaderboard, toolkit

NAVIGATION: When the user wants to go somewhere or study a course, append this EXACTLY at the end of your reply — nothing after it:
<nav>{"page":"pagename","course":"EXACT course string","mode":"flashcards or guide"}</nav>
Omit "course"/"mode" when not relevant. Only use <nav> for clear navigation intent.

RULES:
- Be human and conversational. Max 2 sentences for casual questions, more only when asked.
- NEVER read out course codes (e.g. GGRC25H3, MDSB11H3) — use the course name only.
- NEVER dump assignments, deadlines, or course lists unless the student directly asks.
- NEVER mention GPA/streak/stats unless directly asked.
- If asked something personal (name, age, city) — answer from STUDENT DATA or say you don't have it. Do not pivot to courses.
- Match the student's energy — casual when they're casual, focused when they need help.
- Use the living mind doc to inform your tone — you know this student well.
- ${isFirstMessage ? "FIRST MESSAGE RULE: Greet them warmly by name in one short sentence only. No assignments, no stats, no courses." : "Only mention assignments or deadlines if directly relevant to what they asked."}\`;
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
// AudioContext bypasses iOS Safari autoplay restrictions.
let _audioCtx = null;
function getAudioContext() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

// Sanitize text before sending to TTS.
// Course codes like "GGRC25H3 F LEC01" sound terrible when read aloud.
// We strip them and replace with a natural phrase where possible.
function sanitizeForTTS(text) {
  return text
    // Remove raw Canvas course codes: e.g. GGRC25H3, VPAC16H3, MDSB11H3
    .replace(/\b[A-Z]{2,6}\d{2,4}[A-Z0-9]*\s*(F|W|S)?\s*(LEC|TUT|PRA|LAB)\d{2,3}\b/g, "that course")
    // Remove section labels like "LEC01", "TUT02"
    .replace(/\b(LEC|TUT|PRA|LAB)\d{2,3}\b/gi, "")
    // Clean up multiple spaces
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Returns { duration: seconds, play: fn }
// Caller decodes audio first, gets duration, then starts typewriter, then plays.
async function fetchAndDecodeAudio(text) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: sanitizeForTTS(text) }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  const { audio } = await res.json();
  if (!audio) throw new Error("No audio returned");
  const binaryStr = atob(audio);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const ctx = getAudioContext();
  const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
  return {
    duration: audioBuffer.duration, // actual audio duration in seconds
    play: () => new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = resolve;
      source.start(0);
    }),
  };
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

// Safe-area bottom offset — accounts for iOS home indicator + browser toolbar
function safeBottom() {
  // env(safe-area-inset-bottom) isn't readable from JS directly,
  // so we use a sentinel div approach, or fall back to a generous 90px.
  try {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;bottom:env(safe-area-inset-bottom,0px);height:0;visibility:hidden";
    document.body.appendChild(el);
    const rect = el.getBoundingClientRect();
    document.body.removeChild(el);
    const inset = window.innerHeight - rect.bottom;
    return Math.max(inset, 0) + 80; // 80px above toolbar
  } catch {
    return 90;
  }
}

function defaultPos() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  return { top: H - SIZE - safeBottom(), left: W - SIZE - 22 };
}

function clamp(pos) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  return {
    top:  Math.max(56, Math.min(H - SIZE - safeBottom(), pos.top)),
    left: Math.max(8,  Math.min(W - SIZE - 8, pos.left)),
  };
}

// Premium voice toggle — pill button with animated waveform (unmuted) or slash (muted)
const VoiceToggle = ({ muted, onClick, speaking }) => (
  <button
    onClick={onClick}
    title={muted ? "Voice off — tap to enable" : "Voice on — tap to mute"}
    style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 12px",
      borderRadius: "20px",
      border: `1px solid ${muted ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.16)"}`,
      background: muted
        ? "rgba(255,255,255,0.04)"
        : speaking
          ? "rgba(255,255,255,0.14)"
          : "rgba(255,255,255,0.08)",
      cursor: "pointer",
      flexShrink: 0,
      transition: "all 0.2s ease",
      outline: "none",
      WebkitTapHighlightColor: "transparent",
    }}
  >
    {/* Animated bars or muted icon */}
    {muted ? (
      // Muted — static crossed mic
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.2" strokeLinecap="round">
        <line x1="2" y1="2" x2="22" y2="22"/>
        <path d="M18.89 13.23A7 7 0 0 0 19 12v-2"/>
        <path d="M5 10v2a7 7 0 0 0 11.9 5.1"/>
        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    ) : (
      // Unmuted — waveform bars (animate when speaking)
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    )}
    <span style={{
      fontSize: "10px",
      fontWeight: "500",
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      color: muted ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.7)",
      fontFamily: "var(--font-sans)",
    }}>
      {speaking ? "Live" : muted ? "Off" : "Voice"}
    </span>
  </button>
);

export default function NeuralRing() {
  const { userData, updateUserField, courses, assignments, setPendingNav, setStudyConfig, userId, flashcardMap, syllabus } = useApp();

  const courseOptions = courses.length
    ? courses.map(c => `${c.courseCode} — ${c.name}`)
    : [];

  // ── Tutor impressions + living mind — loaded once on mount ─────────────────
  const [impressions,  setImpressions]  = useState([]);
  const abortCtrlRef   = useRef(null);   // cancel in-flight fetch
  const audioSourceRef = useRef(null);   // cancel in-flight audio
  const [lastSession,  setLastSession]  = useState(null);
  const [livingMind,   setLivingMind]   = useState(null);

  // ── Session tracking — for session-close payload + self-write trigger ───────
  const sessionStartedAt  = useRef(null);
  const exchangeCountRef  = useRef(0); // increments each AI response

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

  const [muted,        setMuted]        = useState(() => {
    try { return localStorage.getItem("fschool_muted") === "1"; } catch { return false; }
  });
  const [speaking,     setSpeaking]     = useState(false);
  const [streamingMsg, setStreamingMsg] = useState("");
  const typeTimerRef = useRef(null);

  const sheetStartY             = useRef(null);
  const [sheetDragY, setSheetDragY] = useState(0);

  useEffect(() => {
    const name = userData?.ring_name ?? "";
    setRingName(name);
    setRingNameInput(name);
  }, [userData?.ring_name]);

  // ── Load impressions + last session from Supabase on mount ──────────────────
  useEffect(() => {
    if (!userId) return;
    async function loadMemory() {
      try {
        // Load last 10 impressions
        const { data: impData } = await supabase
          .from("tutor_impressions")
          .select("impression, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10);
        if (impData?.length) setImpressions(impData);

        // Load last session summary from chat_logs (last assistant message from a different day)
        const { data: logData } = await supabase
          .from("chat_logs")
          .select("content, created_at")
          .eq("user_id", userId)
          .eq("role", "assistant")
          .order("created_at", { ascending: false })
          .limit(1);
        if (logData?.[0]) {
          const daysAgo = Math.round((Date.now() - new Date(logData[0].created_at)) / 86400000);
          if (daysAgo >= 1) {
            setLastSession(`${daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`} — "${logData[0].content.slice(0, 80)}..."`);
          }
        }

        // Load living mind doc
        const { data: mindData } = await supabase
          .from("tutor_mind")
          .select("mind_doc")
          .eq("user_id", userId)
          .maybeSingle();
        if (mindData?.mind_doc) setLivingMind(mindData.mind_doc);

      } catch { /* non-fatal */ }
    }
    loadMemory();
  }, [userId]);

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
      @keyframes blink { 0%, 100% { opacity: 0.4; } 50% { opacity: 0; } }
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

  // ── Session close queue — fires living mind rewrite when chat closes ────────
  const prevChatOpenClose = useRef(false);
  // Keep a ref to messages so beforeunload can read the latest value
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    const wasOpen = prevChatOpenClose.current;
    prevChatOpenClose.current = chatOpen;
    if (chatOpen && !wasOpen) {
      // Chat just opened — record session start time
      if (!sessionStartedAt.current) sessionStartedAt.current = new Date().toISOString();
    }
    // Chat just closed — fire session-close queue (lowered threshold: 1+ real messages)
    if (wasOpen && !chatOpen && userId && messages.length >= 1) {
      fetch("/api/session-close", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          sessionMessages: messages,
          sessionStartedAt: sessionStartedAt.current,
        }),
      }).catch(() => {});
      // Reset for next session
      sessionStartedAt.current  = null;
      exchangeCountRef.current  = 0;
    }
  }, [chatOpen, userId, messages]);

  // Also fire session-close on page unload/refresh so memory saves even without
  // explicitly closing the chat sheet
  useEffect(() => {
    if (!userId) return;
    function handleUnload() {
      const msgs = messagesRef.current;
      if (!msgs || msgs.length < 1) return;
      // sendBeacon is fire-and-forget — survives page unload
      const payload = JSON.stringify({
        userId,
        sessionMessages: msgs,
        sessionStartedAt: sessionStartedAt.current,
      });
      navigator.sendBeacon("/api/session-close", new Blob([payload], { type: "application/json" }));
    }
    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [userId]);

  // ── Proactive urgent nudge when chat opens ──────────────────────────────────
  // Only fires if user opens chat without typing first (empty messages state).
  // Does NOT fire if the student just said their name/age — that's handled
  // by the first-message rule in buildChatSystem.
  const prevChatOpen = useRef(false);
  useEffect(() => {
    if (chatOpen && !prevChatOpen.current) {
      const urgent = getUrgentAssignments(assignments);
      // Only show the nudge if chat is fresh (no messages yet) — never interrupt
      // an ongoing conversation or a greeting with an assignment dump
      if (urgent.length > 0 && messages.length === 0) {
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

  // ── Typewriter ──────────────────────────────────────────────────────────────────────────
  const typewrite = useCallback((text, durationSecs) => {
    return new Promise((resolve) => {
      if (typeTimerRef.current) clearInterval(typeTimerRef.current);
      let i = 0;
      setStreamingMsg("");
      // Spread typing over actual audio duration, min 1.5s, with slight padding
      const totalMs  = Math.max(1500, durationSecs * 1000 * 0.92);
      const interval = Math.max(16, Math.round(totalMs / text.length));
      typeTimerRef.current = setInterval(() => {
        i++;
        setStreamingMsg(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(typeTimerRef.current);
          typeTimerRef.current = null;
          setMessages(m => [...m, { role: "assistant", content: text }]);
          setStreamingMsg("");
          resolve();
        }
      }, interval);
    });
  }, []);

  // ── Speak + type in sync ───────────────────────────────────────────────────────────────
  // Fetch audio first → get real duration → start both typewriter and playback together.
  // This eliminates the 1-2s delay between text appearing and voice starting.
  const speakAndType = useCallback(async (text) => {
    const plain = text.replace(/<[^>]+>/g, "").trim();
    if (!plain) return;

    if (muted) {
      await typewrite(plain, 3); // ~3s default when no voice
      return;
    }

    try {
      setSpeaking(true);
      // Decode audio first so we have the real duration
      const { duration, play } = await fetchAndDecodeAudio(plain);
      // Now start both simultaneously — typewriter matches actual audio length
      await Promise.all([
        play().finally(() => setSpeaking(false)),
        typewrite(plain, duration),
      ]);
    } catch (err) {
      console.warn("TTS failed, staying text-only:", err.message);
      setSpeaking(false);
      await typewrite(plain, 3);
    }
  }, [muted, typewrite]);

  // ── Chat ──────────────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    getAudioContext();
    const userMsg = { role: "user", content: input.trim() };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setLoading(true);
    logChat(userId, "user", userMsg.content, null);
    try {
      // ── Dynamic context fetch (chatbot agent upgrade) ─────────────────────
      // Fires in parallel — if it resolves before Claude, gets injected into prompt
      let dynamicContext = null;
      abortCtrlRef.current = new AbortController();
      const contextFetch = fetch("/api/tutor-context", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, userMessage: userMsg.content }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => { dynamicContext = d?.context ?? null; })
        .catch(() => {});

      const system = buildChatSystem(
        courseOptions, userData, assignments,
        flashcardMap, syllabus, impressions, lastSession, livingMind,
        messages.length === 0  // isFirstMessage — no prior exchanges yet
      );

      // Wait briefly for context fetch (max 1.2s) — if still pending, proceed without it
      await Promise.race([contextFetch, new Promise(r => setTimeout(r, 1200))]);

      // Append dynamic context to system prompt if retrieved
      const finalSystem = dynamicContext
        ? `${system}\n\nLIVE DATA (just fetched for this query):\n${dynamicContext}`
        : system;

      // Use Claude for tutor brain; fall back to Groq if key missing
      let raw;
      try {
        raw = await claudeTutor([...messages, userMsg], finalSystem);
      } catch {
        raw = await groq([...messages, userMsg], finalSystem);
      }

      const { cmd, text: displayText } = parseNav(raw);
      const cleanText = displayText.replace(/<[^>]+>/g, "").trim();

      if (cmd?.page) {
        if (cmd.course || cmd.mode) setStudyConfig({ course: cmd.course ?? null, mode: cmd.mode ?? "flashcards" });
        setTimeout(() => setPendingNav({ page: cmd.page }), 600);
      }

      logChat(userId, "assistant", cleanText, null);
      writeImpression(userId, userMsg.content, cleanText);

      // ── Self-write trigger — fires every 6th exchange ─────────────────────
      exchangeCountRef.current += 1;
      if (exchangeCountRef.current % 6 === 0) {
        const currentMsgs = [...messages, userMsg, { role: "assistant", content: cleanText }];
        fetch("/api/self-write", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, recentMessages: currentMsgs.slice(-8) }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            // If living mind was patched mid-session, update local state immediately
            if (d?.updated && d?.patch) setLivingMind(d.patch);
          })
          .catch(() => {});
      }

      setLoading(false);
      await speakAndType(cleanText);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Couldn't connect. Check your API keys." }]);
      setLoading(false);
    }
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
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
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

                {/* Voice toggle */}
                <VoiceToggle muted={muted} onClick={toggleMute} speaking={speaking} />
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
                  <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "84%" }}>
                    <div
                      style={{
                        background: m.role === "user" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
                        borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        padding: "10px 14px", color: "var(--text-primary)",
                        fontSize: "14px", lineHeight: "1.6",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      {m.content}
                    </div>
                    {m.role === "assistant" && (
                      <div style={{ display: "flex", gap: "6px", marginTop: "5px", paddingLeft: "2px" }}>
                        <button
                          onClick={() => navigator.clipboard?.writeText(m.content)}
                          title="Copy"
                          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: "12px", cursor: "pointer", padding: "2px 6px", borderRadius: "6px", fontFamily: "inherit" }}
                          onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
                          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.25)"}
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => writeImpression(userId, messages[i-1]?.content ?? "", m.content + " [thumbs up]")}
                          title="Good response"
                          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: "13px", cursor: "pointer", padding: "2px 4px", borderRadius: "6px" }}
                          onMouseEnter={e => e.currentTarget.style.color = "rgba(100,220,155,0.8)"}
                          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.25)"}
                        >
                          👍
                        </button>
                        <button
                          onClick={() => writeImpression(userId, messages[i-1]?.content ?? "", m.content + " [thumbs down — student disliked this response]")}
                          title="Bad response"
                          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: "13px", cursor: "pointer", padding: "2px 4px", borderRadius: "6px" }}
                          onMouseEnter={e => e.currentTarget.style.color = "rgba(255,100,90,0.8)"}
                          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.25)"}
                        >
                          👎
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
              {loading && !streamingMsg && (
                <div style={{ alignSelf: "flex-start", color: "rgba(255,255,255,0.3)", fontSize: "13px", padding: "6px 4px" }}>
                  Thinking…
                </div>
              )}
              {streamingMsg ? (
                <div style={{
                  alignSelf: "flex-start", maxWidth: "84%",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "16px 16px 16px 4px",
                  padding: "10px 14px", color: "var(--text-primary)",
                  fontSize: "14px", lineHeight: "1.6",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}>
                  {streamingMsg}<span style={{ opacity: 0.4, animation: "blink 1s step-end infinite" }}>|</span>
                </div>
              ) : null}
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
              {loading ? (
                <button
                  onClick={stopResponse}
                  style={{
                    background: "rgba(255,80,80,0.15)", color: "rgba(255,120,100,0.9)",
                    border: "1px solid rgba(255,80,80,0.25)", borderRadius: "var(--radius-btn)",
                    padding: "11px 16px", fontSize: "14px", fontWeight: "600",
                    cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                  }}
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  style={{
                    background: !input.trim() ? "rgba(255,255,255,0.18)" : "var(--color-accent)",
                    color: "#111", border: "none", borderRadius: "var(--radius-btn)",
                    padding: "11px 18px", fontSize: "14px", fontWeight: "600",
                    cursor: !input.trim() ? "not-allowed" : "pointer",
                    fontFamily: "inherit", flexShrink: 0,
                    transition: "background var(--dur-base) var(--ease-apple)",
                  }}
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>,
    document.body
  );
}
