// Whiteboard.tsx — Phase 3 collaborative whiteboard (v3).
//
// Coordinates live in a FIXED space (BOARD_W × BOARD_H) so every device renders the
// same picture; the <canvas> buffer is that size and CSS scales it to fit.
//
// RENDERING — one canvas, one pass (no offscreen layers, no destination-out):
//   Every render clears the canvas, fills the background, then draws every committed
//   stroke in order followed by every in-progress (live) stroke. Strokes simply
//   overlap — drawing always adds, never wipes. The area-eraser is just a stroke
//   painted in the *current* background colour (source-over), so it covers whatever
//   is beneath it and re-colours itself for free whenever the background changes.
//   Redrawing from the stroke list on every change makes multi-user state
//   impossible to desync, at the cost of a full redraw per frame (fine for the
//   modest stroke counts a study board sees).
//
// TOOLS: pen (5 styles) · stroke-eraser (tap a line to delete it) · area-eraser
// (background-coloured brush).

import { useEffect, useRef, useState } from "react";
import type { Point, Stroke, PenStyle } from "../api/whiteboard";

export const BOARD_W = 1000;
export const BOARD_H = 600;

export type Tool = "pen" | "stroke-erase" | "area-erase" | "laser" | "text" | "select" | "rect" | "circle" | "line" | "arrow";

const SHAPE_TOOLS: Tool[] = ["rect", "circle", "line", "arrow"];

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

function drawStroke(ctx: CanvasRenderingContext2D, s: { mode: "pen" | "erase"; style: PenStyle; color: string; width: number; points: Point[] }, bgColor: string) {
  const pts = s.points;
  if (!pts || pts.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";

  // Area eraser: paint over with the current background colour so it covers
  // whatever is underneath. No destination-out, so it can never punch through
  // to other users' strokes unexpectedly.
  if (s.mode === "erase") {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = bgColor;
    ctx.fillStyle = bgColor;
    ctx.lineWidth = s.width;
    strokePath(ctx, pts, s.width);
    ctx.restore();
    return;
  }

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

    case "text": {
      const pt = pts[0] as any;
      if (!pt?.t) break;
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.color;
      ctx.font = `bold ${s.width}px sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(pt.t, pt.x, pt.y);
      break;
    }

    case "rect": {
      if (pts.length < 2) break;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      const rx = Math.min(pts[0].x, pts[1].x), ry = Math.min(pts[0].y, pts[1].y);
      const rw = Math.abs(pts[1].x - pts[0].x), rh = Math.abs(pts[1].y - pts[0].y);
      ctx.strokeRect(rx, ry, rw, rh);
      break;
    }

    case "circle": {
      if (pts.length < 2) break;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      const ecx = (pts[0].x + pts[1].x) / 2, ecy = (pts[0].y + pts[1].y) / 2;
      const erx = Math.abs(pts[1].x - pts[0].x) / 2, ery = Math.abs(pts[1].y - pts[0].y) / 2;
      ctx.beginPath();
      ctx.ellipse(ecx, ecy, Math.max(erx, 1), Math.max(ery, 1), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case "line": {
      if (pts.length < 2) break;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.stroke();
      break;
    }

    case "arrow": {
      if (pts.length < 2) break;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.stroke();
      const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      const headLen = Math.max(12, s.width * 4);
      ctx.beginPath();
      ctx.moveTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[1].x - headLen * Math.cos(ang - Math.PI / 6), pts[1].y - headLen * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(pts[1].x - headLen * Math.cos(ang + Math.PI / 6), pts[1].y - headLen * Math.sin(ang + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
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

const SHAPE_STYLES = ["rect", "circle", "line", "arrow"];

function strokeBounds(s: { style: PenStyle; points: Point[] }): { x1: number; y1: number; x2: number; y2: number } | null {
  if (!s.points || s.points.length === 0) return null;
  if (SHAPE_STYLES.includes(s.style) && s.points.length >= 2) {
    const [p0, p1] = s.points;
    return { x1: Math.min(p0.x, p1.x), y1: Math.min(p0.y, p1.y), x2: Math.max(p0.x, p1.x), y2: Math.max(p0.y, p1.y) };
  }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of s.points) {
    if (p.x < x1) x1 = p.x; if (p.x > x2) x2 = p.x;
    if (p.y < y1) y1 = p.y; if (p.y > y2) y2 = p.y;
  }
  return x1 === Infinity ? null : { x1, y1, x2, y2 };
}

function hitForSelect(p: Point, s: Stroke): boolean {
  if (SHAPE_STYLES.includes(s.style)) {
    const b = strokeBounds(s);
    if (!b) return false;
    const tol = Math.max(8, (s.width || 2) / 2 + 4);
    return p.x >= b.x1 - tol && p.x <= b.x2 + tol && p.y >= b.y1 - tol && p.y <= b.y2 + tol;
  }
  return hitStroke(p, s, 12);
}

export default function Whiteboard({
  strokes, liveStrokes, tool, style, color, penWidth, eraserSize, bg,
  onToolChange, onStyleChange, onColorChange, onPenWidthChange, onEraserSizeChange, onBgChange,
  onStrokeComplete, onEraseStroke, onMoveStroke, onLiveStroke, onClear,
  canUndo, canRedo, onUndo, onRedo,
  peerCursors, laserPositions, onCursorMove, onLaserMove,
  onClose,
}: {
  strokes: Stroke[];
  liveStrokes?: Record<string, { mode: "pen" | "erase"; style: PenStyle; color: string; width: number; points: Point[] }>;
  tool: Tool; style: PenStyle; color: string; penWidth: number; eraserSize: number; bg: string;
  onToolChange: (t: Tool) => void;
  onStyleChange: (s: PenStyle) => void;
  onColorChange: (c: string) => void;
  onPenWidthChange: (w: number) => void;
  onEraserSizeChange: (w: number) => void;
  onBgChange: (c: string) => void;
  onStrokeComplete: (s: { mode: "pen" | "erase"; style: PenStyle; color: string; width: number; points: Point[] }) => void;
  onEraseStroke: (strokeId: string) => void;
  onMoveStroke?: (strokeId: string, dx: number, dy: number) => void;
  onLiveStroke?: (s: { mode: "pen" | "erase"; style: PenStyle; color: string; width: number; points: Point[] } | null) => void;
  onClear: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  peerCursors?: Record<string, { x: number; y: number; name: string; color: string }>;
  laserPositions?: Record<string, { x: number; y: number; active: boolean }>;
  onCursorMove?: (x: number | null, y: number | null) => void;
  onLaserMove?: (pos: { x: number; y: number } | null) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const currentRef = useRef<Point[]>([]);
  const [localLaser, setLocalLaser] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const erasedThisDragRef = useRef<Set<string>>(new Set());
  const selectedRef = useRef<string | null>(null);
  const selectDragStartRef = useRef<Point | null>(null);
  const selectDragDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  // Snapshot of the canvas at the start of each stroke. Restored on every
  // pointermove before drawing the in-progress stroke so committed strokes
  // are preserved regardless of React render timing.
  const snapshotRef = useRef<ImageData | null>(null);

  // Live values for pointer handlers (avoid stale closures / re-binding).
  const toolRef   = useRef(tool);       toolRef.current = tool;
  const styleRef  = useRef(style);      styleRef.current = style;
  const colorRef  = useRef(color);      colorRef.current = color;
  const penWRef   = useRef(penWidth);   penWRef.current = penWidth;
  const eraserRef = useRef(eraserSize); eraserRef.current = eraserSize;
  const strokesRef = useRef(strokes);   strokesRef.current = strokes;
  const liveStrokesRef = useRef(liveStrokes ?? {}); liveStrokesRef.current = liveStrokes ?? {};

  // Draw the whole board: background, every committed stroke in order, then every
  // in-progress stroke (the local one + remote peers'). One pass, always additive.
  function render() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);

    const selId = selectedRef.current;
    const delta = selectDragDeltaRef.current;
    const hasDelta = delta.dx !== 0 || delta.dy !== 0;

    for (const s of strokesRef.current) {
      if (selId && s.id === selId && hasDelta) {
        const moved = { ...s, points: s.points.map(p => ({ ...p, x: p.x + delta.dx, y: p.y + delta.dy })) };
        drawStroke(ctx, moved, bg);
      } else {
        drawStroke(ctx, s, bg);
      }
    }

    // Selection bounding box overlay
    if (selId && toolRef.current === "select") {
      const s = strokesRef.current.find(s => s.id === selId);
      if (s) {
        const effPts = hasDelta ? s.points.map(p => ({ ...p, x: p.x + delta.dx, y: p.y + delta.dy })) : s.points;
        const b = strokeBounds({ style: s.style, points: effPts });
        if (b) {
          ctx.save();
          ctx.strokeStyle = "#4f86d9";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.globalAlpha = 0.85;
          const pad = 6;
          ctx.strokeRect(b.x1 - pad, b.y1 - pad, b.x2 - b.x1 + pad * 2, b.y2 - b.y1 + pad * 2);
          ctx.restore();
        }
      }
    }

    // Remote peers' in-progress strokes.
    for (const draft of Object.values(liveStrokesRef.current)) {
      drawStroke(ctx, draft, bg);
    }

    // The local in-progress stroke, drawn last so it sits on top.
    const isShapeTool = SHAPE_TOOLS.includes(toolRef.current);
    if (drawingRef.current && currentRef.current.length &&
        toolRef.current !== "stroke-erase" && toolRef.current !== "laser" &&
        toolRef.current !== "text" && toolRef.current !== "select") {
      drawStroke(ctx, {
        mode: toolRef.current === "area-erase" ? "erase" : "pen",
        style: isShapeTool ? toolRef.current as PenStyle : styleRef.current,
        color: colorRef.current,
        width: toolRef.current === "area-erase" ? eraserRef.current : penWRef.current,
        points: currentRef.current,
      }, bg);
    }
  }

  useEffect(() => { render(); }, [strokes]);      // eslint-disable-line
  useEffect(() => { render(); }, [bg]);           // eslint-disable-line
  useEffect(() => { render(); }, [liveStrokes]);  // eslint-disable-line

  // Keep a ref to finishStroke so the global listener always calls the latest version.
  const finishStrokeRef = useRef<() => void>(() => {});

  // Global pointerup/pointercancel — fires even when the finger is lifted outside
  // the canvas or when iOS Safari drops pointer capture mid-stroke.
  useEffect(() => {
    function globalUp() { if (drawingRef.current) finishStrokeRef.current(); }
    window.addEventListener("pointerup",     globalUp);
    window.addEventListener("pointercancel", globalUp);
    return () => {
      window.removeEventListener("pointerup",     globalUp);
      window.removeEventListener("pointercancel", globalUp);
    };
  }, []);

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
    const pt = toBoard(e);
    if (toolRef.current === "text") {
      setTextInput({ x: pt.x, y: pt.y });
      return;
    }
    if (toolRef.current === "select") {
      const list = strokesRef.current;
      let found: Stroke | null = null;
      for (let i = list.length - 1; i >= 0; i--) {
        if (hitForSelect(pt, list[i])) { found = list[i]; break; }
      }
      selectedRef.current = found?.id ?? null;
      selectDragStartRef.current = found ? pt : null;
      selectDragDeltaRef.current = { dx: 0, dy: 0 };
      if (found) drawingRef.current = true;
      render();
      return;
    }
    drawingRef.current = true;
    if (toolRef.current === "laser") {
      setLocalLaser(pt);
      onLaserMove?.({ x: pt.x, y: pt.y });
      return;
    }
    if (toolRef.current === "stroke-erase") {
      erasedThisDragRef.current = new Set();
      eraseAt(pt);
      return;
    }
    currentRef.current = [pt];
    // Snapshot the canvas now so onPointerMove can restore it before drawing
    // the in-progress stroke — preserves committed strokes with no React dependency.
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d")!;
      snapshotRef.current = ctx.getImageData(0, 0, BOARD_W, BOARD_H);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const pt = toBoard(e);
    // Always broadcast cursor position for live-cursor feature (throttled in parent).
    onCursorMove?.(pt.x, pt.y);

    // Select tool: handle drag-to-move (before drawingRef guard)
    if (toolRef.current === "select") {
      if (drawingRef.current && selectedRef.current && selectDragStartRef.current) {
        selectDragDeltaRef.current = { dx: pt.x - selectDragStartRef.current.x, dy: pt.y - selectDragStartRef.current.y };
        render();
      }
      return;
    }

    if (!drawingRef.current) return;
    if (toolRef.current === "laser") {
      setLocalLaser(pt);
      onLaserMove?.({ x: pt.x, y: pt.y });
      return;
    }
    if (toolRef.current === "stroke-erase") { eraseAt(pt); return; }

    // Shape tools: keep only [start, currentPt] for preview
    if (SHAPE_TOOLS.includes(toolRef.current)) {
      currentRef.current = [currentRef.current[0] ?? pt, pt];
      const canvas = canvasRef.current;
      if (canvas && snapshotRef.current) {
        const ctx = canvas.getContext("2d")!;
        ctx.putImageData(snapshotRef.current, 0, 0);
        drawStroke(ctx, {
          mode: "pen",
          style: toolRef.current as PenStyle,
          color: colorRef.current,
          width: penWRef.current,
          points: currentRef.current,
        }, bg);
      }
      onLiveStroke?.({ mode: "pen", style: toolRef.current as PenStyle, color: colorRef.current, width: penWRef.current, points: currentRef.current });
      return;
    }

    currentRef.current.push(pt);
    // Restore snapshot (committed strokes) then draw in-progress stroke on top.
    // This never touches the strokes React prop so stale closures can't wipe work.
    const canvas = canvasRef.current;
    if (canvas && snapshotRef.current) {
      const ctx = canvas.getContext("2d")!;
      ctx.putImageData(snapshotRef.current, 0, 0);
      if (currentRef.current.length && toolRef.current !== "area-erase") {
        drawStroke(ctx, {
          mode: "pen",
          style: styleRef.current,
          color: colorRef.current,
          width: penWRef.current,
          points: currentRef.current,
        }, bg);
      }
    }
    onLiveStroke?.({
      mode: toolRef.current === "area-erase" ? "erase" : "pen",
      style: styleRef.current,
      color: colorRef.current,
      width: toolRef.current === "area-erase" ? eraserRef.current : penWRef.current,
      points: currentRef.current,
    });
  }

  function finishStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    snapshotRef.current = null;
    if (toolRef.current === "select") {
      const delta = selectDragDeltaRef.current;
      if (selectedRef.current && (Math.abs(delta.dx) > 3 || Math.abs(delta.dy) > 3)) {
        onMoveStroke?.(selectedRef.current, delta.dx, delta.dy);
        selectedRef.current = null;
      }
      selectDragStartRef.current = null;
      selectDragDeltaRef.current = { dx: 0, dy: 0 };
      render();
      return;
    }
    if (toolRef.current === "laser") {
      setLocalLaser(null);
      onLaserMove?.(null);
      return;
    }
    if (toolRef.current === "stroke-erase") { erasedThisDragRef.current = new Set(); return; }
    const points = currentRef.current;
    currentRef.current = [];
    onLiveStroke?.(null);
    if (points.length === 0) return;
    if (SHAPE_TOOLS.includes(toolRef.current)) {
      if (points.length >= 2) {
        onStrokeComplete({
          mode: "pen",
          style: toolRef.current as PenStyle,
          color: colorRef.current,
          width: penWRef.current,
          points: [points[0], points[points.length - 1]],
        });
      }
      return;
    }
    const isErase = toolRef.current === "area-erase";
    const finished = {
      mode: (isErase ? "erase" : "pen") as "pen" | "erase",
      style: styleRef.current,
      color: colorRef.current,
      width: isErase ? eraserRef.current : penWRef.current,
      points,
    };
    onStrokeComplete(finished);
  }

  finishStrokeRef.current = finishStroke;

  function handlePointerLeave() {
    finishStroke();
    onCursorMove?.(null, null);
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
  const isText = tool === "text";
  const isShape = SHAPE_TOOLS.includes(tool);
  const cursor = tool === "stroke-erase" ? "pointer" : tool === "laser" ? "none" : tool === "text" ? "text" : tool === "select" ? "default" : "crosshair";
  const isCustomColor = !PEN_COLORS.includes(color);

  function handleTextCommit(text: string) {
    if (!text.trim() || !textInput) { setTextInput(null); return; }
    onStrokeComplete({
      mode: "pen",
      style: "text",
      color,
      width: penWidth * 3 + 6,
      points: [{ x: textInput.x, y: textInput.y, t: text.trim() }],
    });
    setTextInput(null);
  }

  function handleExport() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "whiteboard.png";
    a.click();
  }

  return (
    <div style={{
      border: "1px solid rgba(196,154,60,0.2)", borderRadius: "14px",
      background: "rgba(196,154,60,0.03)", marginBottom: "20px", overflow: "hidden",
      touchAction: "none", overscrollBehavior: "none",
    }} data-no-swipe="true">
      <style>{`@keyframes laserFade{to{opacity:0;transform:translate(-50%,-50%) scale(2.5)}}`}</style>
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
        <button style={chip(tool === "laser")} onClick={() => onToolChange("laser")} title="Laser pointer — point without drawing">🔴 Laser</button>
        <button style={chip(tool === "text")} onClick={() => onToolChange("text")} title="Text — click to place text">📝 Text</button>

        <span style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />

        <button style={chip(tool === "select", "#4f86d9")} onClick={() => onToolChange("select")} title="Select and move a stroke">↖ Select</button>
        <button style={chip(tool === "rect")} onClick={() => onToolChange("rect")} title="Rectangle">▭ Rect</button>
        <button style={chip(tool === "circle")} onClick={() => onToolChange("circle")} title="Circle / Ellipse">○ Circle</button>
        <button style={chip(tool === "line")} onClick={() => onToolChange("line")} title="Straight line">╱ Line</button>
        <button style={chip(tool === "arrow")} onClick={() => onToolChange("arrow")} title="Arrow">→ Arrow</button>

        <span style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />

        <button
          style={{ ...chip(false), opacity: canUndo ? 1 : 0.35, cursor: canUndo ? "pointer" : "not-allowed" }}
          onClick={() => canUndo && onUndo?.()}
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
        >↩ Undo</button>
        <button
          style={{ ...chip(false), opacity: canRedo ? 1 : 0.35, cursor: canRedo ? "pointer" : "not-allowed" }}
          onClick={() => canRedo && onRedo?.()}
          title="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo}
        >↪ Redo</button>

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
          style={{ ...chip(false), marginLeft: "auto", color: "rgba(100,210,120,0.9)", borderColor: "rgba(80,190,100,0.18)", background: "rgba(80,190,100,0.06)" }}
          onClick={handleExport}
          title="Save board as PNG"
        >⬇ Export</button>
        <button
          style={{ ...chip(false), color: "rgba(255,100,90,0.85)", borderColor: "rgba(255,59,48,0.18)", background: "rgba(255,59,48,0.06)" }}
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
          {/* Custom color picker */}
          <label title="Custom color" style={{ position: "relative", width: "20px", height: "20px", cursor: "pointer", flexShrink: 0 }}>
            <input
              type="color"
              value={isCustomColor ? color : "#000000"}
              onChange={e => onColorChange(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
            />
            <div style={{
              width: "20px", height: "20px", borderRadius: "50%",
              background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
              border: isCustomColor ? "2px solid #fff" : "2px solid rgba(255,255,255,0.15)",
              outline: isCustomColor ? "1px solid rgba(196,154,60,0.6)" : "none",
              pointerEvents: "none",
            }} />
          </label>
        </div>
      )}

      {/* Text tool options */}
      {isText && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px 16px", borderBottom: "1px solid rgba(196,154,60,0.08)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Size</span>
          {PEN_WIDTHS.map((w, i) => (
            <button key={w} onClick={() => onPenWidthChange(w)} title={`Size ${i + 1}`}
              style={{ ...chip(penWidth === w), minWidth: "30px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: `${10 + i * 3}px`, lineHeight: 1, color: penWidth === w ? "#c49a3c" : "var(--text-dim)" }}>A</span>
            </button>
          ))}
          <span style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
          {PEN_COLORS.map(c => (
            <button key={c} onClick={() => onColorChange(c)} title={c}
              style={{
                width: "20px", height: "20px", borderRadius: "50%", cursor: "pointer", padding: 0, background: c,
                border: color === c ? "2px solid #fff" : "2px solid rgba(255,255,255,0.15)",
                outline: color === c ? "1px solid rgba(196,154,60,0.6)" : "none",
              }}
            />
          ))}
          <label title="Custom color" style={{ position: "relative", width: "20px", height: "20px", cursor: "pointer", flexShrink: 0 }}>
            <input type="color" value={isCustomColor ? color : "#000000"} onChange={e => onColorChange(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
            <div style={{
              width: "20px", height: "20px", borderRadius: "50%",
              background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
              border: isCustomColor ? "2px solid #fff" : "2px solid rgba(255,255,255,0.15)",
              outline: isCustomColor ? "1px solid rgba(196,154,60,0.6)" : "none",
              pointerEvents: "none",
            }} />
          </label>
          <span style={{ fontSize: "11px", color: "var(--text-dim)", marginLeft: "4px" }}>Click canvas to place text · Enter to commit · Esc to cancel</span>
        </div>
      )}

      {/* Shape tool options */}
      {isShape && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px 16px", borderBottom: "1px solid rgba(196,154,60,0.08)" }}>
          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Size</span>
          {PEN_WIDTHS.map((w, i) => (
            <button key={w} onClick={() => onPenWidthChange(w)} title={`Thickness ${i + 1}`}
              style={{ ...chip(penWidth === w), width: "30px", display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 0" }}>
              <span style={{ display: "block", width: `${Math.min(18, w + 2)}px`, height: `${Math.max(2, Math.round(w / 2))}px`, borderRadius: "99px", background: penWidth === w ? "#c49a3c" : "var(--text-dim)" }} />
            </button>
          ))}
          <span style={{ width: "1px", height: "20px", background: "rgba(255,255,255,0.1)", margin: "0 2px" }} />
          {PEN_COLORS.map(c => (
            <button key={c} onClick={() => onColorChange(c)} title={c}
              style={{ width: "20px", height: "20px", borderRadius: "50%", cursor: "pointer", padding: 0, background: c,
                border: color === c ? "2px solid #fff" : "2px solid rgba(255,255,255,0.15)",
                outline: color === c ? "1px solid rgba(196,154,60,0.6)" : "none" }} />
          ))}
          <label title="Custom color" style={{ position: "relative", width: "20px", height: "20px", cursor: "pointer", flexShrink: 0 }}>
            <input type="color" value={isCustomColor ? color : "#000000"} onChange={e => onColorChange(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
            <div style={{ width: "20px", height: "20px", borderRadius: "50%",
              background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
              border: isCustomColor ? "2px solid #fff" : "2px solid rgba(255,255,255,0.15)",
              outline: isCustomColor ? "1px solid rgba(196,154,60,0.6)" : "none", pointerEvents: "none" }} />
          </label>
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

      {/* Canvas + overlay */}
      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative", width: "100%", maxWidth: `${BOARD_W}px` }}>
          <canvas
            ref={canvasRef}
            width={BOARD_W}
            height={BOARD_H}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onPointerLeave={handlePointerLeave}
            style={{
              width: "100%", aspectRatio: `${BOARD_W} / ${BOARD_H}`,
              background: bg, borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)",
              touchAction: "none", cursor, display: "block",
            }}
          />
          {/* Text input overlay */}
          {textInput && (
            <input
              key={`${textInput.x},${textInput.y}`}
              autoFocus
              type="text"
              placeholder="Type text…"
              style={{
                position: "absolute",
                left: `${(textInput.x / BOARD_W) * 100}%`,
                top: `${(textInput.y / BOARD_H) * 100}%`,
                transform: "translateY(-50%)",
                zIndex: 10,
                background: "rgba(0,0,0,0.75)",
                color,
                border: `1px solid ${color}`,
                borderRadius: "4px",
                padding: "3px 8px",
                fontSize: "14px",
                fontFamily: "sans-serif",
                outline: "none",
                minWidth: "80px",
                maxWidth: "280px",
              }}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Enter") { handleTextCommit(e.currentTarget.value); e.preventDefault(); }
                if (e.key === "Escape") { setTextInput(null); e.preventDefault(); }
              }}
              onBlur={e => {
                if (e.currentTarget.value.trim()) handleTextCommit(e.currentTarget.value);
                else setTextInput(null);
              }}
            />
          )}

          {/* Peer cursors + laser overlay */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: "10px" }}>
            {/* Peer live cursors */}
            {Object.entries(peerCursors ?? {}).map(([uid, cur]) => (
              <div key={uid} style={{
                position: "absolute",
                left: `${(cur.x / BOARD_W) * 100}%`,
                top: `${(cur.y / BOARD_H) * 100}%`,
                transform: "translate(2px, 2px)",
                display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px",
              }}>
                <svg width="11" height="13" viewBox="0 0 11 13" style={{ display: "block", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))" }}>
                  <path d="M0 0 L0 11 L3 8 L5.5 12 L7 11 L4.5 7 L8 7 Z" fill={cur.color} />
                </svg>
                <span style={{
                  background: cur.color, color: "#fff", fontSize: "10px", fontWeight: 600,
                  padding: "1px 5px", borderRadius: "4px", whiteSpace: "nowrap",
                  maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis",
                }}>{cur.name.split(" ")[0]}</span>
              </div>
            ))}
            {/* Peer laser dots */}
            {Object.entries(laserPositions ?? {}).map(([uid, las]) => (
              <div key={uid} style={{
                position: "absolute",
                left: `${(las.x / BOARD_W) * 100}%`,
                top: `${(las.y / BOARD_H) * 100}%`,
                transform: "translate(-50%, -50%)",
                width: "14px", height: "14px", borderRadius: "50%",
                background: "rgba(239,68,68,0.9)",
                boxShadow: "0 0 0 4px rgba(239,68,68,0.3)",
                animation: las.active ? "none" : "laserFade 1.2s ease-out forwards",
              }} />
            ))}
            {/* Local laser dot */}
            {tool === "laser" && localLaser && (
              <div style={{
                position: "absolute",
                left: `${(localLaser.x / BOARD_W) * 100}%`,
                top: `${(localLaser.y / BOARD_H) * 100}%`,
                transform: "translate(-50%, -50%)",
                width: "14px", height: "14px", borderRadius: "50%",
                background: "rgba(239,68,68,0.9)",
                boxShadow: "0 0 0 4px rgba(239,68,68,0.3)",
              }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
