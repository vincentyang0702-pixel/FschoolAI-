import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Status = "loading" | "ready" | "unavailable" | "error";

const POPUP_W    = 440;
const POPUP_H    = 540; // approximate full height
const POPUP_W_SM = 220; // minimized width
const POPUP_H_SM = 44;  // minimized height

function defaultPos(w: number, h: number) {
  // Bottom-right, but shifted left/up to clear the NeuralRing widget (68px,
  // right: 22px) and give breathing room.
  return {
    left: Math.max(0, w - POPUP_W - 100),
    top:  Math.max(0, h - POPUP_H - 120),
  };
}

function clamp(left: number, top: number, popW: number, popH: number) {
  return {
    left: Math.max(0, Math.min(window.innerWidth  - popW, left)),
    top:  Math.max(0, Math.min(window.innerHeight - popH, top)),
  };
}

export default function VoiceRoom({ roomId, userName, onClose }: {
  roomId: string;
  userName?: string;
  onClose: () => void;
}) {
  const [status, setStatus]       = useState<Status>("loading");
  const [url, setUrl]             = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [pos, setPos]             = useState(() =>
    defaultPos(window.innerWidth, window.innerHeight)
  );

  const dragging   = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const popupRef   = useRef<HTMLDivElement>(null);

  // Fetch Daily room URL + meeting token
  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/daily-room", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ roomId, userName: userName || undefined }),
          signal:  ctrl.signal,
        });
        if (!alive) return;
        if (res.status === 503) { setStatus("unavailable"); return; }
        if (!res.ok)            { setStatus("error"); return; }
        const data = await res.json();
        if (!alive) return;
        if (data?.url) { setUrl(data.url); setStatus("ready"); }
        else           { setStatus("error"); }
      } catch (err: any) {
        if (err?.name === "AbortError" || !alive) return;
        setStatus("error");
      }
    })();
    return () => { alive = false; ctrl.abort(); };
  }, [roomId]);

  // Re-clamp whenever the window resizes
  useEffect(() => {
    function onResize() {
      setPos(p => {
        const pw = minimized ? POPUP_W_SM : POPUP_W;
        const ph = minimized ? POPUP_H_SM : POPUP_H;
        return clamp(p.left, p.top, pw, ph);
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [minimized]);

  // Global mouse tracking for drag
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const pw = popupRef.current?.offsetWidth  ?? (minimized ? POPUP_W_SM : POPUP_W);
      const ph = popupRef.current?.offsetHeight ?? (minimized ? POPUP_H_SM : POPUP_H);
      setPos(clamp(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
        pw, ph,
      ));
    }
    function onUp() { dragging.current = false; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [minimized]);

  function startDrag(e: React.MouseEvent) {
    dragging.current   = true;
    dragOffset.current = { x: e.clientX - pos.left, y: e.clientY - pos.top };
    e.preventDefault();
  }

  const ACCENT = "#60a5fa";

  const popup = (
    <div
      ref={popupRef}
      style={{
        position:             "fixed",
        top:                  pos.top,
        left:                 pos.left,
        width:                minimized ? POPUP_W_SM : POPUP_W,
        zIndex:               1200,
        borderRadius:         minimized ? "32px" : "16px",
        border:               "1px solid rgba(96,165,250,0.25)",
        background:           "rgba(10,10,14,0.97)",
        backdropFilter:       "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow:            "0 8px 40px rgba(0,0,0,0.6)",
        overflow:             "hidden",
        transition:           "width 0.2s ease, border-radius 0.2s ease",
        userSelect:           "none",
      }}
    >
      {/* Drag handle / header */}
      <div
        onMouseDown={startDrag}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        minimized ? "10px 14px" : "12px 16px",
          borderBottom:   minimized ? "none" : "1px solid rgba(96,165,250,0.12)",
          cursor:         dragging.current ? "grabbing" : "grab",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", pointerEvents: "none" }}>
          {minimized && status === "ready" && (
            <span style={{
              display: "inline-block", width: "7px", height: "7px",
              borderRadius: "50%", background: "#4ade80",
              boxShadow: "0 0 6px #4ade80",
              animation: "vcPulse 1.8s ease-in-out infinite",
            }} />
          )}
          <span style={{ fontSize: "14px" }}>🎙</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: ACCENT }}>
            {minimized ? "Voice (live)" : "Voice Chat"}
          </span>
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: "4px" }}
          onMouseDown={e => e.stopPropagation()} // buttons don't trigger drag
        >
          <button
            onClick={() => setMinimized(m => !m)}
            title={minimized ? "Expand" : "Minimize"}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-dim)", fontSize: "15px", lineHeight: 1,
              padding: "2px 5px", borderRadius: "5px",
            }}
          >
            {minimized ? "□" : "─"}
          </button>
          <button
            onClick={onClose}
            title="Leave voice"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-dim)", fontSize: "18px", lineHeight: 1,
              padding: "0 2px", borderRadius: "5px",
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Body — kept in DOM when minimized so the call stays alive */}
      <div style={{ height: minimized ? 0 : "auto", overflow: "hidden" }}>
        {status === "loading" && (
          <div style={{ padding: "36px 16px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>Connecting to voice…</p>
          </div>
        )}

        {status === "ready" && url && (
          <iframe
            title="Voice chat"
            src={url}
            allow="microphone; autoplay; camera; speaker"
            style={{ width: "100%", height: "460px", border: "none", display: "block" }}
          />
        )}

        {status === "unavailable" && (
          <div style={{ padding: "28px 20px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-primary)", marginBottom: "6px" }}>
              Voice chat isn't set up yet.
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-dim)", lineHeight: 1.5 }}>
              An admin needs to add a{" "}
              <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: "4px" }}>
                DAILY_API_KEY
              </code>{" "}
              to enable it.
            </p>
          </div>
        )}

        {status === "error" && (
          <div style={{ padding: "28px 20px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-primary)", marginBottom: "6px" }}>
              Couldn't connect to voice.
            </p>
            <p style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              Check your connection and try reopening the panel.
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes vcPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}`}</style>
    </div>
  );

  return createPortal(popup, document.body);
}
