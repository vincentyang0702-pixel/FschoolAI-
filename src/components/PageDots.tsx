// PageDots.jsx — SVG 3×3 page map with directional connection lines.
// Lines are derived from NAV config so they stay accurate as the nav map changes.
// Current page dot pulses; adjacent reachable dots are slightly brighter.

import { useMemo } from "react";
import { DOT_GRID, NAV } from "../navigation/navConfig";

// Grid layout constants
const DOT_R   = 3;    // dot radius
const STEP    = 11;   // distance between dot centres (6px dot + 5px gap)
const SVG_W   = (DOT_GRID[0].length - 1) * STEP + DOT_R * 2; // 24
const SVG_H   = (DOT_GRID.length    - 1) * STEP + DOT_R * 2; // 24

// Centre coords for a grid position
const cx = c => c * STEP + DOT_R;
const cy = r => r * STEP + DOT_R;

// Build position lookup: pageName → { r, c }
const posMap = {};
DOT_GRID.forEach((row, r) => row.forEach((page, c) => {
  if (page) posMap[page] = { r, c };
}));

// Derive unique line segments from NAV (each pair drawn once)
const LINES = (() => {
  const seen = new Set();
  const lines = [];
  Object.entries(NAV).forEach(([from, dirs]) => {
    Object.values(dirs).forEach(to => {
      const key = [from, to].sort().join("|");
      if (!seen.has(key) && posMap[from] && posMap[to]) {
        seen.add(key);
        const a = posMap[from];
        const b = posMap[to];
        lines.push({ x1: cx(a.c), y1: cy(a.r), x2: cx(b.c), y2: cy(b.r), from, to });
      }
    });
  });
  return lines;
})();

export default function PageDots({ currentPage }) {
  // Pages reachable from the current page in one swipe
  const reachable = useMemo(() => new Set(Object.values(NAV[currentPage] ?? {})), [currentPage]);

  return (
    <svg
      width={SVG_W}
      height={SVG_H}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Connection lines */}
      {LINES.map((l, i) => {
        const isCurrent = l.from === currentPage || l.to === currentPage;
        return (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={isCurrent ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.10)"}
            strokeWidth={isCurrent ? "1" : "0.75"}
            strokeLinecap="round"
            style={{ transition: "stroke 0.18s, stroke-width 0.18s" }}
          />
        );
      })}

      {/* Dots */}
      {DOT_GRID.flat().map((page, i) => {
        if (!page) return null;
        const col = i % DOT_GRID[0].length;
        const row = Math.floor(i / DOT_GRID[0].length);
        const isCurrent   = page === currentPage;
        const isReachable = reachable.has(page);

        const fill = isCurrent
          ? "rgba(255,255,255,0.9)"
          : isReachable
          ? "rgba(255,255,255,0.35)"
          : "rgba(255,255,255,0.18)";

        return (
          <circle
            key={page}
            cx={cx(col)}
            cy={cy(row)}
            r={isCurrent ? DOT_R + 0.5 : DOT_R}
            fill={fill}
            style={{ transition: "fill 0.18s, r 0.18s" }}
          >
            {/* Pulse ring on active dot */}
            {isCurrent && (
              <animate
                attributeName="opacity"
                values="0.4;0.15;0.4"
                dur="3s"
                repeatCount="indefinite"
              />
            )}
          </circle>
        );
      })}

      {/* Outer glow ring on active dot */}
      {(() => {
        const pos = posMap[currentPage];
        if (!pos) return null;
        return (
          <circle
            cx={cx(pos.c)}
            cy={cy(pos.r)}
            r={DOT_R + 3}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            style={{ transition: "cx 0.18s var(--ease-apple), cy 0.18s var(--ease-apple)" }}
          />
        );
      })()}
    </svg>
  );
}
