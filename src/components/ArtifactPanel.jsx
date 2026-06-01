// ArtifactPanel.jsx — Full-screen panel that executes and renders Claude's React artifact code.
// Uses a sandboxed iframe with Babel standalone + React/Recharts from CDN.
// The artifact code runs fully isolated from the host app.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Escape any </script> inside component code so it doesn't break the HTML parser
function escapeScriptTag(code) {
  return code.replace(/<\/script>/gi, "<\\/script>");
}

// Claude often writes ESM import/export statements in its artifacts.
// Strip them all — React, Recharts, etc. are already available as globals in the iframe.
function stripModuleSyntax(code) {
  return code
    // Remove: import Something from 'somewhere'  (single and multi-line)
    .replace(/^import\b[\s\S]*?from\s*['"][^'"]*['"];?[ \t]*\n?/gm, '')
    // Remove: import 'side-effect'
    .replace(/^import\s+['"][^'"]*['"];?[ \t]*\n?/gm, '')
    // Remove: export { Foo, Bar }
    .replace(/^export\s*\{[^}]*\};?[ \t]*\n?/gm, '')
    // Remove export keyword from: export default function App / export const / export class
    .replace(/\bexport\s+default\s+/g, '')
    .replace(/\bexport\s+(function|const|let|var|class|async)\b/g, '$1')
    .trim();
}

function buildHtml(componentCode) {
  const safe = escapeScriptTag(stripModuleSyntax(componentCode));
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- crossorigin="anonymous" lets window.onerror see real error messages for these scripts -->
<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" crossorigin="anonymous" onerror="showCdnError('React')"><\/script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" crossorigin="anonymous" onerror="showCdnError('ReactDOM')"><\/script>
<script src="https://unpkg.com/prop-types@15.8.1/prop-types.min.js" crossorigin="anonymous"><\/script>
<script src="https://unpkg.com/recharts@2.8.0/umd/Recharts.js" crossorigin="anonymous" onerror="showCdnError('Recharts')"><\/script>
<script src="https://unpkg.com/@babel/standalone@7.23.10/babel.min.js" crossorigin="anonymous" onerror="showCdnError('Babel')"><\/script>
<script>
function showCdnError(lib) {
  document.getElementById('root').innerHTML =
    '<div class="error-box">Failed to load ' + lib + ' from CDN.\\nCheck your network connection and try again.</div>';
}
// Catch errors that escape Babel's scope
window.onerror = function(msg, src, line, col, err) {
  if (msg === 'Script error.') return false; // handled by inner try-catch
  document.getElementById('root').innerHTML =
    '<div class="error-box">Error: ' + msg + (line ? ' (line ' + line + ')' : '') +
    (err && err.stack ? '\\n\\n' + err.stack : '') + '</div>';
  return true;
};
<\/script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; background: #111111; color: rgba(255,255,255,0.9); }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    padding: 20px;
    overflow: auto;
    min-height: 100vh;
  }
  #root { width: 100%; min-height: calc(100vh - 40px); }
  .error-box {
    background: rgba(255,59,48,0.1);
    border: 1px solid rgba(255,59,48,0.3);
    border-radius: 10px;
    padding: 18px 20px;
    color: rgba(255,100,90,0.9);
    font-family: monospace;
    font-size: 12px;
    line-height: 1.7;
    white-space: pre-wrap;
    margin-top: 24px;
  }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
// Everything is wrapped in try-catch so errors are caught INSIDE Babel's scope,
// giving us the real error message (not the sanitised cross-origin "Script error.").
(function() {
  function showError(err) {
    document.getElementById('root').innerHTML =
      '<div class="error-box">Component Error:\\n' +
      (err && err.message ? err.message : String(err)) +
      (err && err.stack ? '\\n\\n' + err.stack : '') + '</div>';
  }

  try {
    if (typeof Recharts === 'undefined') throw new Error('Recharts library did not load from CDN');

    // ── React hooks ──────────────────────────────────────────────────────────
    const {
      useState, useEffect, useCallback, useMemo, useRef,
      useReducer, useContext, createContext, Fragment,
    } = React;

    // ── Recharts components ──────────────────────────────────────────────────
    const {
      ResponsiveContainer,
      LineChart, Line,
      BarChart, Bar,
      PieChart, Pie,
      AreaChart, Area,
      RadarChart, Radar,
      ScatterChart, Scatter,
      ComposedChart,
      Cell,
      XAxis, YAxis, ZAxis,
      CartesianGrid, Tooltip, Legend,
      PolarGrid, PolarAngleAxis, PolarRadiusAxis,
      ReferenceLine, ReferenceArea, Brush,
      LabelList,
    } = Recharts;

    // ── Component code from Claude ───────────────────────────────────────────
    ${safe}

    // ── Mount ────────────────────────────────────────────────────────────────
    ReactDOM.createRoot(document.getElementById('root')).render(
      React.createElement(App)
    );
  } catch (err) {
    showError(err);
  }
})();
<\/script>
</body>
</html>`;
}

export default function ArtifactPanel({ code, onClose }) {
  const [loaded, setLoaded] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 240);
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0, zIndex: 10000,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.24s ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          height: "88vh",
          background: "#111111",
          borderRadius: "20px 20px 0 0",
          border: "1px solid rgba(255,255,255,0.1)",
          borderBottom: "none",
          display: "flex", flexDirection: "column",
          zIndex: 10001,
          boxShadow: "0 -16px 64px rgba(0,0,0,0.7)",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.28s cubic-bezier(0.32,0.72,0,1)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 18px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#e8ff6b",
              boxShadow: "0 0 8px rgba(232,255,107,0.6)",
            }} />
            <span style={{ color: "var(--text-primary)", fontSize: "14px", fontWeight: "600" }}>
              Visualization
            </span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>
              Claude Artifact
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setShowCode(s => !s)}
              style={{
                background: showCode ? "rgba(232,255,107,0.12)" : "rgba(255,255,255,0.06)",
                border: showCode ? "1px solid rgba(232,255,107,0.3)" : "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                padding: "5px 12px",
                color: showCode ? "#e8ff6b" : "rgba(255,255,255,0.5)",
                fontSize: "12px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {showCode ? "View Chart" : "View Code"}
            </button>
            <button
              onClick={handleClose}
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                padding: "5px 12px",
                color: "rgba(255,255,255,0.6)",
                fontSize: "13px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Close
            </button>
          </div>
        </div>

        {showCode ? (
          /* Code viewer */
          <div style={{
            flex: 1, overflow: "auto", padding: "20px",
            fontFamily: "monospace", fontSize: "12px",
            color: "rgba(255,255,255,0.75)", lineHeight: "1.7",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {code}
          </div>
        ) : (
          <>
            {/* Loading overlay */}
            {!loaded && (
              <div style={{
                position: "absolute", inset: "57px 0 0 0",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#111111", zIndex: 1,
              }}>
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "13px", letterSpacing: "0.5px" }}>
                  Loading chart libraries…
                </p>
              </div>
            )}

            {/* iframe */}
            <iframe
              key={code}
              srcDoc={buildHtml(code)}
              sandbox="allow-scripts"
              onLoad={() => setLoaded(true)}
              style={{
                flex: 1,
                border: "none",
                background: "#111111",
                opacity: loaded ? 1 : 0,
                transition: "opacity 0.2s",
              }}
              title="Claude Visualization"
            />
          </>
        )}
      </div>
    </>,
    document.body
  );
}
