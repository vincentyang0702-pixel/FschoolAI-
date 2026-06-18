// Whiteboard.tsx — Phase 3 session-only collaborative whiteboard.
//
// Strokes are stored in a FIXED internal coordinate space (BOARD_W × BOARD_H) so
// every device renders the same picture regardless of screen size. The <canvas>
// drawing buffer is that fixed size; CSS scales it to fit. Pointer coordinates are
// mapped back into board space before being recorded.
//
// Rendering is "replay from scratch": on any change to `strokes` (or the in-progress
// stroke) we clear the canvas and redraw every stroke in order. Pen strokes paint
// normally; eraser strokes use `destination-out` so replay order stays correct.

import { useEffect, useRef } from "react";
import type { Point, Stroke } from "../api/whiteboard";

export const BOARD_W = 1000;
export const BOARD_H = 600;
const BG = "#14130f"; // matches the dark board surface

export const PEN_COLORS = ["#e8e4d8", "#c49a3c", "#7fae6e", "#6fb3c4", "#c47fae", "#d97b5b"];
export const PEN_WIDTHS = [2, 4, 8];
const ERASER_WIDTH = 28;

type Tool = "pen" | "erase";

function drawStroke(ctx: CanvasRenderingContext2D, s: { mode: Tool; color: string; width: number; points: Point[] }) {
  if (!s.points || s.points.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = s.mode === "erase" ? "destination-out" : "source-over";
  ctx.strokeStyle = s.mode === "erase" ? "rgba(0,0,0,1)" : s.color;
  ctx.lineWidth = s.width;

  ctx.beginPath();
  const pts = s.points;
  if (pts.length === 1) {
    // A single tap — draw a dot.
    ctx.arc(pts[0].x, pts[0].y, Math.max(0.5, s.width / 2), 0, Math.PI * 2);
    ctx.fillStyle = s.mode === "erase" ? "rgba(0,0,0,1)" : s.color;
    ctx.fill();
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

export default function Whiteboard({
  strokes, tool, color, onToolChange, onColorChange,
  onStrokeComplete, onClear, onClose,
}: {
  strokes: Stroke[];
  tool: Tool;
  color: string;
  onToolChange: (t: Tool) => void;
  onColorChange: (c: string) => void;
  onStrokeComplete: (s: { mode: Tool; color: string; width: number; points: Point[] }) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const currentRef = useRef<Point[]>([]);
  const widthRef = useRef<number>(PEN_WIDTHS[1]);

  // keep live tool/color/width available to pointer handlers without re-binding
  const toolRef = useRef(tool);  toolRef.current = tool;
  const colorRef = useRef(color); colorRef.current = color;

  // Full redraw whenever committed strokes change.
  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    for (const s of strokes) drawStroke(ctx, s);
    // draw the in-progress stroke on top
    if (drawingRef.current && currentRef.current.length) {
      drawStroke(ctx, { mode: toolRef.current, color: colorRef.current, width: widthRef.current, points: currentRef.current });
    }
  }

  useEffect(() => { redraw(); }, [strokes]); // eslint-disable-line

  function toBoard(e: React.PointerEvent): Point {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * BOARD_W),
      y: Math.round(((e.clientY - r.top) / r.height) * BOARD_H),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    widthRef.current = toolRef.current === "erase" ? ERASER_WIDTH : PEN_WIDTHS[1];
    currentRef.current = [toBoard(e)];
    redraw();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    currentRef.current.push(toBoard(e));
    redraw();
  }

  function finishStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const points = currentRef.current;
    currentRef.current = [];
    if (points.length === 0) return;
    onStrokeComplete({ mode: toolRef.current, color: colorRef.current, width: widthRef.current, points });
  }

  const btn = (active: boolean): React.CSSProperties => ({
    padding: "6px 10px", fontSize: "12px", borderRadius: "8px", cursor: "pointer",
    fontFamily: "inherit", lineHeight: 1,
    background: active ? "rgba(196,154,60,0.14)" : "rgba(255,255,255,0.05)",
    border: `1px solid ${active ? "rgba(196,154,60,0.3)" : "rgba(255,255,255,0.09)"}`,
    color: active ? "#c49a3c" : "var(--text-dim)",
  });

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

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "10px 16px", borderBottom: "1px solid rgba(196,154,60,0.08)" }}>
        <button style={btn(tool === "pen")} onClick={() => onToolChange("pen")}>✏️ Pen</button>
        <button style={btn(tool === "erase")} onClick={() => onToolChange("erase")}>🧽 Eraser</button>

        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginLeft: "4px" }}>
          {PEN_COLORS.map(c => (
            <button
              key={c}
              onClick={() => { onColorChange(c); onToolChange("pen"); }}
              title={c}
              style={{
                width: "20px", height: "20px", borderRadius: "50%", cursor: "pointer",
                background: c, padding: 0,
                border: color === c && tool === "pen" ? "2px solid #fff" : "2px solid rgba(255,255,255,0.15)",
                outline: color === c && tool === "pen" ? "1px solid rgba(196,154,60,0.6)" : "none",
              }}
            />
          ))}
        </div>

        <button
          style={{ ...btn(false), marginLeft: "auto", color: "rgba(255,100,90,0.8)", borderColor: "rgba(255,59,48,0.18)", background: "rgba(255,59,48,0.06)" }}
          onClick={() => { if (window.confirm("Clear the whiteboard for everyone in the room?")) onClear(); }}
        >
          🗑 Clear
        </button>
      </div>

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
            background: BG, borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)",
            touchAction: "none", cursor: "crosshair", display: "block",
          }}
        />
      </div>
    </div>
  );
}
