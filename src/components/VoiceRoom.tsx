import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Status = "loading" | "ready" | "unavailable" | "error";

const POPUP_W    = 440;
const POPUP_H    = 540;
const POPUP_W_SM = 220;
const POPUP_H_SM = 44;

function defaultPos(w: number, h: number) {
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
  const isMobile = window.innerWidth < 600;

  const dragging   = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const popupRef   = useRef<HTMLDivElement>(null);
  const iframeRef  = useRef<HTMLIFrameElement>(null);


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

  const mobileCollapsed = isMobile && minimized;

  // ── Full popup (desktop) or expanded bottom sheet (mobile) ───────────────
  const popup = (
    <div
      ref={popupRef}
      style={isMobile ? {
        position:             "fixed",
        bottom:               0,
        left:                 0,
        right:                0,
        width:                "100%",
        zIndex:               1200,
        borderRadius:         "20px 20px 0 0",
        border:               "1px solid rgba(96,165,250,0.25)",
        borderBottom:         "none",
        background:           "rgba(10,10,14,0.97)",
        backdropFilter:       "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow:            "0 -4px 40px rgba(0,0,0,0.6)",
        overflow:             "hidden",
        userSelect:           "none",
      } : {
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
      {/* Header */}
      <div
        onMouseDown={!isMobile ? startDrag : undefined}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "12px 16px",
          borderBottom:   "1px solid rgba(96,165,250,0.12)",
          cursor:         isMobile ? "default" : (dragging.current ? "grabbing" : "grab"),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", pointerEvents: "none" }}>
          <span style={{ fontSize: "14px" }}>🎙</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: ACCENT }}>Voice Chat</span>
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: "4px" }}
          onMouseDown={e => e.stopPropagation()}
        >
          {/* Collapse button — mobile only */}
          {isMobile && (
            <button
              onClick={() => setMinimized(true)}
              title="Collapse"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-dim)", fontSize: "15px", lineHeight: 1,
                padding: "2px 5px", borderRadius: "5px",
              }}
            >
              ─
            </button>
          )}
          {/* Desktop minimize */}
          {!isMobile && (
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
          )}
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

      {/* Body */}
      <div style={{ height: (!isMobile && minimized) ? 0 : "auto", overflow: "hidden" }}>
        {status === "loading" && (
          <div style={{ padding: "36px 16px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>Connecting to voice…</p>
          </div>
        )}

        {status === "ready" && url && (
          <iframe
            ref={iframeRef}
            title="Voice chat"
            src={url}
            allow="microphone *; camera *; autoplay *; display-capture *; speaker *; fullscreen *"
            style={{ width: "100%", height: isMobile ? "50vh" : "460px", border: "none", display: "block" }}
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

  return createPortal(
    <>
      {/* Collapsed bar — shown instead of sheet on mobile when minimized.
          The sheet (with iframe) stays in the DOM so the call doesn't drop. */}
      {mobileCollapsed && (
        <div
          onClick={() => setMinimized(false)}
          style={{
            position:             "fixed",
            bottom:               0,
            left:                 0,
            right:                0,
            height:               "56px",
            zIndex:               1201,
            display:              "flex",
            alignItems:           "center",
            justifyContent:       "space-between",
            padding:              "0 20px",
            background:           "rgba(10,10,14,0.97)",
            backdropFilter:       "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderTop:            "1px solid rgba(96,165,250,0.2)",
            boxShadow:            "0 -4px 20px rgba(0,0,0,0.5)",
            cursor:               "pointer",
            userSelect:           "none",
          }}
        >
          {/* Left: live dot + label */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              display:      "inline-block",
              width:        "8px",
              height:       "8px",
              borderRadius: "50%",
              background:   status === "ready" ? "#4ade80" : "#facc15",
              boxShadow:    status === "ready" ? "0 0 8px #4ade80" : "0 0 8px #facc15",
              animation:    "vcPulse 1.8s ease-in-out infinite",
            }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: ACCENT }}>Voice</span>
          </div>

          {/* Right: leave */}
          <button
            onClick={e => { e.stopPropagation(); onClose(); }}
            style={{
              background:   "rgba(239,68,68,0.15)",
              border:       "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px",
              color:        "#f87171",
              fontSize:     "13px",
              fontWeight:   600,
              padding:      "0 14px",
              height:       "36px",
              cursor:       "pointer",
            }}
          >
            Leave
          </button>
        </div>
      )}

      {/* Main sheet — visually hidden when collapsed but kept in DOM so the
          Daily.co iframe (and the active call) is never unmounted. */}
      <div style={{ display: mobileCollapsed ? "none" : undefined }}>
        {popup}
      </div>
    </>,
    document.body,
  );
}
