// Whiteboard.tsx — Phase 3 collaborative whiteboard (v2).
//
// Coordinates live in a FIXED space (BOARD_W × BOARD_H) so every device renders the
// same picture; the <canvas> buffer is that size and CSS scales it to fit.
//
// RENDERING — two-layer compositing:
//   1. An offscreen "ink" canvas holds every stroke. Pen strokes paint normally;
//      area-eraser strokes use destination-out (punching transparent holes).
//   2. The visible canvas is filled with the chosen background, then the ink layer
//      is drawn on top — so eraser holes reveal the *background colour*, not the page.
//   The ink layer is rebuilt only when `strokes` changes; live drawing just
//   re-composites (cheap) so dragging stays smooth on a busy board.
//
// TOOLS: pen (5 styles) · stroke-eraser (tap a line to delete it) · area-eraser
// (circular destination-out brush).

import { useEffect, useRef } from "react";
import type { Point, Stroke, PenStyle } from "../api/whiteboard";

export const BOARD_W = 1000;
export const BOARD_H = 600;

export type Tool = "pen" | "stroke-erase" | "area-erase";

// ── Palettes ──────────────────────────────────────────────────────────────────
export const BACKGROUNDS = [
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#1a1a1a" },
  { label: "Theme", value: "#14130f" }, // matches the site surface
  { label: "Cream", value: "#f4ecd8" },
  { label: "Beige", value: "#d9c9a3" },
];
export const DEFAULT_BG = BACKGROUNDS[0].value;

// Mix of dark + light inks so a colour is legible on any background.
export const PEN_COLORS = [
  "#1a1a1a", "#e8e4d8", "#c49a3c", "#d94f4f",
  "#4f86d9", "#5bbf72", "#b06fc4", "#e08a3c",
];

// Five thickness presets (base widths) for pens; eraser has its own sizes.
export const PEN_WIDTHS   = [2, 4, 7, 11, 16];
export const ERASER_SIZES = [16, 28, 44, 64, 90];

export const PEN_STYLES: { value: PenStyle; label: string; icon: string }[] = [
  { value: "normal",      label: "Pen",         icon: "🖊" },
  { value: "highlighter", label: "Highlighter", icon: "🖍" },
  { value: "pencil",      label: "Pencil",      icon: "✏️" },
  { value: "ink",         label: "Ink",         icon: "🪶" },
  { value: "marker",      label: "Marker",      icon: "🟠" },
];

// ── Stroke rendering ──────────────────────────────────────────────────────────
function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawStroke(ctx: CanvasRenderingContext2D, s: { mode: "pen" | "erase"; style: PenStyle; color: string; width: number; points: Point[] }) {
  const pts = s.points;
  if (!pts || pts.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Area eraser: cut holes in the ink layer.
  if (s.mode === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = s.width;
    strokePath(ctx, pts, s.width);
    ctx.restore();
    return;
  }

  ctx.globalCompositeOperation = "source-over";

  switch (s.style) {
    case "highlighter":
      ctx.globalAlpha = 0.32;
      ctx.lineCap = "butt";
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * 2.4;
      strokePath(ctx, pts, s.width * 2.4);
      break;

    case "pencil":
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1, s.width * 0.8);
      strokePath(ctx, pts, ctx.lineWidth);
      break;

    case "marker":
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * 1.8;
      ctx.shadowBlur = s.width * 0.7;
      ctx.shadowColor = s.color;
      strokePath(ctx, pts, s.width * 1.8);
      break;

    case "ink": {
      // Calligraphy feel: width modulated by drawing speed (slow = thick).
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
      const base = s.width * 1.4;
      if (pts.length === 1) { dot(ctx, pts[0], base / 2, s.color); break; }
      for (let i = 1; i < pts.length; i++) {
        const speed = dist(pts[i], pts[i - 1]);
        const w = Math.max(base * 0.35, base * (1.5 - speed / 22));
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      break;
    }

    case "normal":
    default:
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      strokePath(ctx, pts, s.width);
      break;
  }
  ctx.restore();
}

function strokePath(ctx: CanvasRenderingContext2D, pts: Point[], width: number) {
  if (pts.length === 1) {
    dot(ctx, pts[0], Math.max(0.5, width / 2), ctx.strokeStyle as string);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, p: Point, r: number, fill: string) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

// Distance from point p to segment a-b (board space) — for the stroke eraser.
function distToSeg(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function hitStroke(p: Point, s: Stroke, tol: number): boolean {
  const r = tol + (s.width || 2) / 2;
  const pts = s.points;
  if (pts.length === 1) return dist(p, pts[0]) <= r;
  for (let i = 1; i < pts.length; i++) {
    if (distToSeg(p, pts[i - 1], pts[i]) <= r) return true;
  }
  return false;
}

export default function Whiteboard({
  strokes, tool, style, color, penWidth, eraserSize, bg,
  onToolChange, onStyleChange, onColorChange, onPenWidthChange, onEraserSizeChange, onBgChange,
  onStrokeComplete, onEraseStroke, onClear, onClose,
}: {
  strokes: Stroke[];
  tool: Tool; style: PenStyle; color: string; penWidth: number; eraserSize: number; bg: string;
  onToolChange: (t: Tool) => void;
  onStyleChange: (s: PenStyle) => void;
  onColorChange: (c: string) => void;
  onPenWidthChange: (w: number) => void;
  onEraserSizeChange: (w: number) => void;
  onBgChange: (c: string) => void;
  onStrokeComplete: (s: { mode: "pen" | "erase"; style: PenStyle; color: string; width: number; points: Point[] }) => void;
  onEraseStroke: (strokeId: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement | null>(null); // offscreen committed strokes
  const drawingRef = useRef(false);
  const currentRef = useRef<Point[]>([]);
  const erasedThisDragRef = useRef<Set<string>>(new Set());

  // Live values for pointer handlers (avoid stale closures / re-binding).
  const toolRef   = useRef(tool);       toolRef.current = tool;
  const styleRef  = useRef(style);      styleRef.current = style;
  const colorRef  = useRef(color);      colorRef.current = color;
  const penWRef   = useRef(penWidth);   penWRef.current = penWidth;
  const eraserRef = useRef(eraserSize); eraserRef.current = eraserSize;
  const strokesRef = useRef(strokes);   strokesRef.current = strokes;

  // Rebuild the offscreen ink layer (only when committed strokes change).
  function rebuildInk() {
    let ink = inkRef.current;
    if (!ink) { ink = document.createElement("canvas"); ink.width = BOARD_W; ink.height = BOARD_H; inkRef.current = ink; }
    const ictx = ink.getContext("2d")!;
    ictx.clearRect(0, 0, BOARD_W, BOARD_H);
    for (const s of strokes) drawStroke(ictx, s);
  }

  // Composite background + ink + the in-progress stroke onto the visible canvas.
  function composite() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    if (inkRef.current) ctx.drawImage(inkRef.current, 0, 0);

    if (drawingRef.current && currentRef.current.length && toolRef.current !== "stroke-erase") {
      // For the live area-eraser preview we can't destination-out the page; show a
      // translucent trail instead. The committed version will cut the ink properly.
      if (toolRef.current === "area-erase") {
        ctx.save();
        ctx.globalAlpha = 0.5;
        drawStroke(ctx, { mode: "pen", style: "normal", color: bg, width: eraserRef.current, points: currentRef.current });
        ctx.restore();
      } else {
        drawStroke(ctx, { mode: "pen", style: styleRef.current, color: colorRef.current, width: penWRef.current, points: currentRef.current });
      }
    }
  }

  useEffect(() => { rebuildInk(); composite(); }, [strokes]);   // eslint-disable-line
  useEffect(() => { composite(); }, [bg]);                       // eslint-disable-line

  function toBoard(e: React.PointerEvent): Point {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * BOARD_W),
      y: Math.round(((e.clientY - r.top) / r.height) * BOARD_H),
    };
  }

  // Stroke eraser: delete the topmost stroke under the pointer (drag erases more).
  function eraseAt(p: Point) {
    const list = strokesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (erasedThisDragRef.current.has(s.id)) continue;
      if (hitStroke(p, s, 20)) {
        erasedThisDragRef.current.add(s.id);
        onEraseStroke(s.id);
        return; // one per move tick keeps it predictable
      }
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    const pt = toBoard(e);
    if (toolRef.current === "stroke-erase") {
      erasedThisDragRef.current = new Set();
      eraseAt(pt);
      return;
    }
    currentRef.current = [pt];
    composite();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    const pt = toBoard(e);
    if (toolRef.current === "stroke-erase") { eraseAt(pt); return; }
    currentRef.current.push(pt);
    composite();
  }

  function finishStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (toolRef.current === "stroke-erase") { erasedThisDragRef.current = new Set(); return; }
    const points = currentRef.current;
    currentRef.current = [];
    if (points.length === 0) return;
    const isErase = toolRef.current === "area-erase";
    const finished = {
      mode: (isErase ? "erase" : "pen") as "pen" | "erase",
      style: styleRef.current,
      color: colorRef.current,
      width: isErase ? eraserRef.current : penWRef.current,
      points,
    };
    // Commit to the ink layer immediately so the stroke stays put regardless of
    // how long the save round-trips (or even if it fails) — a later rebuildInk()
    // from the parent's strokes state is idempotent and stays consistent.
    if (inkRef.current) drawStroke(inkRef.current.getContext("2d")!, finished);
    composite();
    onStrokeComplete(finished);
  }

  // ── Small UI helpers ────────────────────────────────────────────────────────
  const chip = (active: boolean, accent = "#c49a3c"): React.CSSProperties => ({
    padding: "6px 10px", fontSize: "12px", borderRadius: "8px", cursor: "pointer",
    fontFamily: "inherit", lineHeight: 1, whiteSpace: "nowrap",
    background: active ? "rgba(196,154,60,0.14)" : "rgba(255,255,255,0.05)",
    border: `1px solid ${active ? "rgba(196,154,60,0.35)" : "rgba(255,255,255,0.09)"}`,
    color: active ? accent : "var(--text-dim)",
  });

  const isPen = tool === "pen";
  const cursor = tool === "stroke-erase" ? "pointer" : "crosshair";

  return (
    <div style={{
      border: "1px solid rgba(196,154,60,0.2)", borderRadius: "14px",
      background: "rgba(196,154,60,0.03)", marginBottom: "20px", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid rgba(196,154,60,0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "15px" }}>🖊</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#c49a3c" }}>Whiteboard</span>
          <span style={{ fontSize: "11px", color: "var(--text-dim)", background: "rgba(255,255,255,0.05)", borderRadius: "6px", padding: "2px 7px" }}>
            clears when everyone leaves
          </span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "18px", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</button>
      </div>

      {/* Tools row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px 16px", borderBottom: "1px solid rgba(196,154,60,0.08)" }}>
        <button style={chip(tool === "pen")} onClick={() => onToolChange("pen")}>✏️ Pen</button>
        <button style={chip(tool === "stroke-erase")} onClick={() => onToolChange("stroke-erase")} title="Tap a line to delete the whole stroke">🧽 Stroke erase</button>
        <button style={chip(tool === "area-erase")} onClick={() => onToolChange("area-erase")} title="Drag to rub out an area">⭕ Area erase</button>

        <span style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />

        {/* Backgrounds */}
        <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>BG</span>
        {BACKGROUNDS.map(b => (
          <button
            key={b.value}
            onClick={() => onBgChange(b.value)}
            title={b.label}
            style={{
              width: "20px", height: "20px", borderRadius: "5px", cursor: "pointer", padding: 0,
              background: b.value,
              border: bg === b.value ? "2px solid #c49a3c" : "2px solid rgba(255,255,255,0.18)",
            }}
          />
        ))}

        <button
          style={{ ...chip(false), marginLeft: "auto", color: "rgba(255,100,90,0.85)", borderColor: "rgba(255,59,48,0.18)", background: "rgba(255,59,48,0.06)" }}
          onClick={() => { if (window.confirm("Clear the whiteboard for everyone in the room?")) onClear(); }}
        >
          🗑 Clear
        </button>
      </div>

      {/* Pen options (only for the pen tool) */}
      {isPen && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px 16px", borderBottom: "1px solid rgba(196,154,60,0.08)" }}>
          {PEN_STYLES.map(ps => (
            <button key={ps.value} style={chip(style === ps.value)} onClick={() => onStyleChange(ps.value)}>
              {ps.icon} {ps.label}
            </button>
          ))}
          <span style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
          {/* Thickness */}
          {PEN_WIDTHS.map((w, i) => (
            <button key={w} onClick={() => onPenWidthChange(w)} title={`Thickness ${i + 1}`}
              style={{ ...chip(penWidth === w), width: "30px", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0" }}>
              <span style={{ display: "block", width: `${Math.min(18, w + 2)}px`, height: `${Math.max(2, Math.round(w / 2))}px`, borderRadius: "99px", background: penWidth === w ? "#c49a3c" : "var(--text-dim)" }} />
            </button>
          ))}
          <span style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
          {/* Colours */}
          {PEN_COLORS.map(c => (
            <button key={c} onClick={() => onColorChange(c)} title={c}
              style={{
                width: "20px", height: "20px", borderRadius: "50%", cursor: "pointer", padding: 0, background: c,
                border: color === c ? "2px solid #fff" : "2px solid rgba(255,255,255,0.15)",
                outline: color === c ? "1px solid rgba(196,154,60,0.6)" : "none",
              }}
            />
          ))}
        </div>
      )}

      {/* Area-eraser options */}
      {tool === "area-erase" && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px 16px", borderBottom: "1px solid rgba(196,154,60,0.08)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Eraser size</span>
          {ERASER_SIZES.map((w, i) => (
            <button key={w} onClick={() => onEraserSizeChange(w)} title={`Size ${i + 1}`}
              style={{ ...chip(eraserSize === w), width: "34px", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0" }}>
              <span style={{ display: "block", width: `${Math.min(22, 8 + i * 4)}px`, height: `${Math.min(22, 8 + i * 4)}px`, borderRadius: "50%", border: `2px solid ${eraserSize === w ? "#c49a3c" : "var(--text-dim)"}` }} />
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "center" }}>
        <canvas
          ref={canvasRef}
          width={BOARD_W}
          height={BOARD_H}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
          style={{
            width: "100%", maxWidth: `${BOARD_W}px`, aspectRatio: `${BOARD_W} / ${BOARD_H}`,
            background: bg, borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)",
            touchAction: "none", cursor, display: "block",
          }}
        />
      </div>
    </div>
  );
}
