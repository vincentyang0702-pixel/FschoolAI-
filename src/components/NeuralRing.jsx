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

import { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { groq } from "../api/groq";
import { claude } from "../api/claude";
import { useApp } from "../context/AppContext";
import ArtifactPanel from "./ArtifactPanel";

const NAV_REGEX = /<nav>([\s\S]*?)<\/nav>/;

// Build system prompt dynamically so the AI knows what pages and courses exist
function buildChatSystem(courseOptions) {
  const courseList = courseOptions.length
    ? courseOptions.join("\n- ")
    : "PSYC 302 — Cognitive Psychology\n- MATH 241 — Differential Equations\n- BUS 410 — Strategic Management\n- CS 355 — Algorithms & Complexity";

  return `You are a personal academic AI assistant. Be concise and genuinely useful.

Available pages: work, canvas, assignment, study, identity, leaderboard, toolkit
Available courses:
- ${courseList}

NAVIGATION RULE: When the user clearly wants to navigate or study something, you MUST append a navigation command at the very end of your reply using this EXACT format — the JSON must be wrapped in <nav> and </nav> tags, nothing else after it:
<nav>{"page":"pagename","course":"EXACT course string from the list","mode":"flashcards or guide"}</nav>

CRITICAL: Always use the <nav> XML tags. Never output raw JSON. Never skip the tags.

Examples:
- "study contracts" → On it! <nav>{"page":"study","course":"VPAC16H3 — Contracts and Copyright","mode":"guide"}</nav>
- "quiz me on psych" → <nav>{"page":"study","course":"PSYC 302 — Cognitive Psychology","mode":"flashcards"}</nav>
- "show assignments" → <nav>{"page":"assignment"}</nav>
- "go to toolkit" → <nav>{"page":"toolkit"}</nav>
Omit "course" and "mode" when not relevant. Only append <nav> when navigation is the clear intent.`;
}

function parseNav(raw) {
  // Primary: <nav>...</nav> tags
  const tagMatch = raw.match(NAV_REGEX);
  if (tagMatch) {
    try { return { cmd: JSON.parse(tagMatch[1].trim()), text: raw.replace(NAV_REGEX, "").trim() }; } catch {}
  }
  // Fallback: bare JSON object ending the response that contains "page"
  const bareMatch = raw.match(/(\{[^{}]*"page"\s*:[^{}]*\})\s*$/);
  if (bareMatch) {
    try {
      const cmd = JSON.parse(bareMatch[1]);
      if (cmd.page) return { cmd, text: raw.slice(0, raw.lastIndexOf(bareMatch[1])).trim() };
    } catch {}
  }
  return { cmd: null, text: raw };
}

const ARTIFACT_REGEX = /<artifact>([\s\S]*?)<\/artifact>/i;

const VIZ_KEYWORDS = [
  "chart", "graph", "visuali", "plot", "diagram", "dashboard",
  "bar chart", "pie chart", "line chart", "histogram", "scatter",
];

function isVizRequest(text) {
  const lower = text.toLowerCase();
  return VIZ_KEYWORDS.some(kw => lower.includes(kw));
}

function parseArtifact(raw) {
  const m = raw.match(ARTIFACT_REGEX);
  if (!m) return { code: null, text: raw };
  return {
    code: m[1].trim(),
    text: raw.replace(ARTIFACT_REGEX, "").trim() || "Here's your visualization.",
  };
}

const VIZ_SYSTEM = `You are a data visualization expert. Create stunning interactive React visualizations.

RULES:
1. Wrap your ENTIRE React component in <artifact></artifact> tags — nothing outside the tags.
2. The component must be a function named App.
3. Use only these globals (already loaded — do NOT import them):
   - React hooks: useState, useEffect, useCallback, useMemo, useRef
   - Recharts: LineChart, Line, BarChart, Bar, PieChart, Pie, AreaChart, Area,
     RadarChart, Radar, ScatterChart, Scatter, Cell, XAxis, YAxis, CartesianGrid,
     Tooltip, Legend, ResponsiveContainer, PolarGrid, PolarAngleAxis, PolarRadiusAxis
4. Use realistic sample data if none is provided.
5. Dark theme: background transparent/#111, text rgba(255,255,255,0.9), accent #e8ff6b.
6. Make it interactive (hover states, click filters, etc.) when appropriate.
7. Return ONLY the <artifact> block — no explanation, no markdown, no extra text.`;

const SIZE   = 68;
const RADIUS = 24;
const N      = 28;
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

export default function NeuralRing() {
  const { userData, updateUserField, courses, setPendingNav, setStudyConfig } = useApp();

  // Build course option strings once, matching the format Study.jsx uses
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

  // Ring name — loaded from Supabase via userData
  const [ringName,       setRingName]       = useState("");
  const [editingName,    setEditingName]    = useState(false);
  const [ringNameInput,  setRingNameInput]  = useState("");
  const ringNameInputRef                    = useRef(null);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const messagesEndRef          = useRef(null);

  // Artifact / visualization state
  const [artifactCode, setArtifactCode] = useState(null);
  const [artifactOpen, setArtifactOpen] = useState(false);

  // Sheet swipe-to-close
  const sheetStartY             = useRef(null);
  const [sheetDragY, setSheetDragY] = useState(0);

  useEffect(() => {
    const name = userData?.ring_name ?? "";
    setRingName(name);
    setRingNameInput(name);
  }, [userData?.ring_name]);

  // ── Inject pulse keyframe once ───────────────────────────────────────────────
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
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // ── Canvas animation ─────────────────────────────────────────────────────────
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

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
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

  // ── Sheet swipe-to-close ─────────────────────────────────────────────────────
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

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const isViz = isVizRequest(userMsg.content);

      if (isViz) {
        // Route to Claude for visualization artifacts
        const raw = await claude([userMsg], VIZ_SYSTEM);
        const { code, text: displayText } = parseArtifact(raw);
        if (code) {
          setArtifactCode(code);
          setMessages(m => [...m, { role: "assistant", content: displayText, hasArtifact: true }]);
        } else {
          setMessages(m => [...m, { role: "assistant", content: displayText }]);
        }
      } else {
        // Regular chat via Groq
        const raw = await groq([...messages, userMsg], buildChatSystem(courseOptions));
        const { cmd, text: displayText } = parseNav(raw);

        if (cmd?.page) {
          if (cmd.course || cmd.mode) {
            setStudyConfig({ course: cmd.course ?? null, mode: cmd.mode ?? "flashcards" });
          }
          setTimeout(() => setPendingNav({ page: cmd.page }), 600);
        }

        setMessages(m => [...m, { role: "assistant", content: displayText }]);
      }
    } catch (err) {
      setMessages(m => [...m, { role: "assistant", content: `Error: ${err.message}` }]);
    }
    setLoading(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return createPortal(
    <>
      {/* Floating ring + name label */}
      <div
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          opacity: chatOpen ? 0 : (isDragging ? 1 : 0.82),
          pointerEvents: chatOpen ? "none" : "auto",
          transition: isDragging
            ? "opacity 0.15s"
            : "top 0.22s var(--ease-apple), left 0.22s var(--ease-apple), opacity 0.2s",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "5px",
        }}
      >
        {/* Sphere */}
        <div
          className={isDragging ? undefined : "nr-idle"}
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
          }}>
            {/* Drag handle */}
            <div onTouchStart={handleSheetHandleTouchStart} onTouchMove={handleSheetHandleTouchMove} onTouchEnd={handleSheetHandleTouchEnd} style={{ display: "flex", justifyContent: "center", padding: "14px 0 6px", flexShrink: 0, cursor: "grab", touchAction: "none" }}>
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
                        background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        borderRadius: "6px",
                        padding: "3px 9px",
                        color: "var(--text-primary)",
                        fontSize: "17px",
                        fontWeight: "600",
                        letterSpacing: "-0.2px",
                        outline: "none",
                        fontFamily: "inherit",
                        width: "160px",
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
                    Academic AI · Always on
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {messages.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "48px", gap: "14px" }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.14), rgba(255,255,255,0.03))", border: "1px solid rgba(255,255,255,0.10)" }} />
                  <p style={{ color: "rgba(255,255,255,0.22)", fontSize: "14px", textAlign: "center", lineHeight: "1.7" }}>
                    Ask me about your courses,<br />assignments, or study material.<br />
                    <span style={{ color: "rgba(232,255,107,0.5)", fontSize: "12px" }}>Try "show me a chart of study progress"</span>
                  </p>
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
                      padding: "10px 14px",
                      color: "var(--text-primary)",
                      fontSize: "14px",
                      lineHeight: "1.6",
                      border: m.hasArtifact ? "1px solid rgba(232,255,107,0.2)" : "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    {m.content}
                    {m.hasArtifact && (
                      <button
                        onClick={() => setArtifactOpen(true)}
                        style={{
                          display: "block",
                          marginTop: "10px",
                          background: "rgba(232,255,107,0.12)",
                          border: "1px solid rgba(232,255,107,0.3)",
                          borderRadius: "8px",
                          padding: "7px 14px",
                          color: "#e8ff6b",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          width: "100%",
                          textAlign: "center",
                        }}
                      >
                        View Visualization →
                      </button>
                    )}
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
                placeholder="Message…"
                style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "var(--radius-btn)", padding: "11px 14px", color: "var(--text-primary)", fontSize: "14px", outline: "none", fontFamily: "inherit", transition: "border-color var(--dur-base) var(--ease-apple)" }}
                onFocus={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)")}
                onBlur={e  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                style={{ background: !input.trim() || loading ? "rgba(255,255,255,0.18)" : "var(--color-accent)", color: "#111", border: "none", borderRadius: "var(--radius-btn)", padding: "11px 18px", fontSize: "14px", fontWeight: "600", cursor: !input.trim() || loading ? "not-allowed" : "pointer", fontFamily: "inherit", flexShrink: 0, transition: "background var(--dur-base) var(--ease-apple)" }}
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}
      {artifactOpen && artifactCode && (
        <ArtifactPanel code={artifactCode} onClose={() => setArtifactOpen(false)} />
      )}
    </>,
    document.body
  );
}
