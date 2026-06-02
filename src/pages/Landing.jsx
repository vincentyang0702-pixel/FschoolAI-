// Landing.jsx — Marketing page. macOS-inspired dark aesthetic.
// Auth buttons proceed immediately — no validation required yet.
// Canvas URL/token in signup are optional; user can skip them.

import { useState } from "react";

/* ─── Copy ─────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    symbol: "⟡",
    title: "2D Spatial Navigation",
    body: "Swipe left, right, up, or down to move through your academic life. Every page lives in a felt 2D map — no menu, no clutter.",
  },
  {
    symbol: "◎",
    title: "AI Academic Assistant",
    body: "Draft full assignments, refine selected paragraphs, and query your own notes — with an AI that knows your courses.",
  },
  {
    symbol: "◈",
    title: "Connected Knowledge",
    body: "Your notes, recordings, and previous work form a living knowledge graph. Your agent references it all when writing with you.",
  },
];

const STEPS = [
  { n: "01", title: "Connect Canvas", body: "Link your institution's Canvas URL and API token. Your agent syncs your courses, assignments, and deadlines." },
  { n: "02", title: "Navigate your work", body: "Swipe between Work, Assignments, Study, and more. Your academic life arranged in 2D space you can feel." },
  { n: "03", title: "Think with AI", body: "Generate drafts grounded in your class notes. Study with AI flashcards built from your actual lectures." },
];

/* ─── Auth modal ────────────────────────────────────────────────────────── */

const inputBase = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: "10px",
  padding: "12px 14px",
  color: "#F5F5F5",
  fontSize: "14px",
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  transition: "border-color 0.15s",
};

function AuthModal({ mode, onClose, onEnter, onSwitchMode, onForgotPassword }) {
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);

  const isSignup = mode === "signup";

  const canSubmit = isSignup
    ? name.trim() && email.trim() && password.length >= 6
    : email.trim() && password.length >= 1;

  async function handleSubmit() {
    if (!canSubmit || loading) return;
    if (isSignup && password !== confirmPw) { setError("Passwords don't match."); return; }
    setError("");
    setLoading(true);
    try {
      await onEnter({
        mode,
        name:  name.trim(),
        email: email.trim(),
        password,
      });
    } catch (err) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) { if (e.key === "Enter") handleSubmit(); }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "flex-end",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div style={{
        width: "100%",
        background: "rgba(16,16,18,0.97)",
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        borderRadius: "22px 22px 0 0",
        border: "1px solid rgba(255,255,255,0.09)",
        borderBottom: "none",
        padding: "16px 28px 44px",
        fontFamily: "inherit",
        animation: "lSheetUp 0.28s cubic-bezier(0.25,0.46,0.45,0.94) forwards",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "22px" }}>
          <div onClick={onClose} style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", cursor: "pointer" }} />
        </div>

        <h2 style={{ color: "#F5F5F5", fontSize: "22px", fontWeight: "600", letterSpacing: "-0.3px", marginBottom: "6px" }}>
          {isSignup ? "Create your account" : "Welcome back"}
        </h2>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "14px", marginBottom: "26px", lineHeight: "1.6" }}>
          {isSignup
            ? "Takes 30 seconds. You'll connect Canvas on the next screen."
            : "Enter your email and password to continue."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
          {isSignup ? (
            <>
              <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} onKeyDown={handleKey} style={inputBase} />
              <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKey} style={inputBase} />
              <input placeholder="Password (min 6 characters)" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKey} style={inputBase} />
              <input placeholder="Confirm password" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} onKeyDown={handleKey} style={inputBase} />
            </>
          ) : (
            <>
              <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKey} style={inputBase} />
              <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKey} style={inputBase} />
              <button
                type="button"
                onClick={() => onForgotPassword(email.trim())}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: "12px", cursor: "pointer", textAlign: "right", fontFamily: "inherit", padding: "0", textDecoration: "underline" }}
              >
                Forgot password?
              </button>
            </>
          )}
        </div>

        {error && (
          <p style={{ color: "rgba(255,100,90,0.85)", fontSize: "12px", textAlign: "center", marginBottom: "10px" }}>
            {error}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          style={{
            width: "100%",
            background: canSubmit && !loading ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.25)",
            color: "#111",
            border: "none",
            borderRadius: "12px",
            padding: "14px",
            fontSize: "15px",
            fontWeight: "600",
            cursor: canSubmit && !loading ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            transition: "background 0.15s, transform 0.15s",
          }}
          onMouseEnter={(e) => { if (canSubmit && !loading) { e.currentTarget.style.background = "#fff"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = canSubmit && !loading ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.25)"; e.currentTarget.style.transform = "none"; }}
        >
          {loading ? "…" : isSignup ? "Start for free →" : "Sign in →"}
        </button>

        <p style={{ color: "rgba(255,255,255,0.18)", fontSize: "12px", textAlign: "center", marginTop: "10px" }}>
          {isSignup
            ? "You'll set up Canvas in the next step."
            : <>Don't have an account?{" "}
                <span
                  onClick={() => { onClose(); setTimeout(() => onSwitchMode("signup"), 50); }}
                  style={{ color: "rgba(255,255,255,0.45)", textDecoration: "underline", cursor: "pointer" }}
                >
                  Sign up free
                </span>
              </>
          }
        </p>
      </div>
    </div>
  );
}

/* ─── Abstract product preview (NO fake browser/phone chrome) ───────────── */

function AppPreview() {
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "580px", margin: "0 auto", height: "290px" }}>
      {/* ambient glow behind cards */}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%,-50%)",
        width: "400px", height: "300px",
        background: "radial-gradient(ellipse, rgba(255,255,255,0.04) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Work card — center, most prominent */}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: "230px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.13)",
        borderRadius: "18px", padding: "18px",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        zIndex: 3,
        boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
      }}>
        <p style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", letterSpacing: "2.5px", textTransform: "uppercase", marginBottom: "14px" }}>WORK</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginBottom: "12px" }}>
          {[
            { label: "Research Paper", badge: "Tomorrow", urgent: true },
            { label: "Problem Set 4",  badge: "May 23",   urgent: false },
          ].map((a) => (
            <div key={a.label} style={{ background: "rgba(255,255,255,0.06)", borderRadius: "8px", padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: a.urgent ? "#F5F5F5" : "rgba(255,255,255,0.6)", fontSize: "11px", fontWeight: a.urgent ? "500" : "400" }}>{a.label}</span>
              <span style={{ fontSize: "9px", padding: "2px 7px", borderRadius: "10px", background: a.urgent ? "rgba(255,59,48,0.18)" : "transparent", color: a.urgent ? "rgba(255,100,90,0.9)" : "rgba(255,255,255,0.3)" }}>{a.badge}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "4px", height: "3px" }}>
          <div style={{ background: "rgba(255,255,255,0.55)", height: "100%", borderRadius: "4px", width: "65%" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px" }}>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)" }}>GPA 3.87</span>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)" }}>12d streak</span>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)" }}>34 done</span>
        </div>
      </div>

      {/* Study card — top right, tilted */}
      <div className="preview-card-right" style={{
        position: "absolute", right: "0", top: "16px",
        width: "168px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "14px", padding: "14px",
        transform: "rotate(4deg)",
        zIndex: 2,
      }}>
        <p style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>STUDY</p>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "8px", padding: "10px" }}>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "8px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "5px" }}>Question</p>
          <p style={{ color: "#F5F5F5", fontSize: "10px", lineHeight: "1.5" }}>What is cognitive load theory?</p>
        </div>
        <p style={{ color: "rgba(255,255,255,0.18)", fontSize: "8px", marginTop: "8px", textAlign: "center" }}>Tap to flip</p>
      </div>

      {/* AI chat card — bottom left, counter-tilted */}
      <div className="preview-card-left" style={{
        position: "absolute", left: "0", bottom: "14px",
        width: "176px",
        background: "rgba(14,14,18,0.92)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "14px", padding: "14px",
        transform: "rotate(-3deg)",
        zIndex: 2,
      }}>
        <p style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>AI ASSISTANT</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ alignSelf: "flex-end", background: "rgba(255,255,255,0.09)", borderRadius: "8px 8px 2px 8px", padding: "6px 9px" }}>
            <p style={{ color: "#F5F5F5", fontSize: "9px" }}>Summarize my notes</p>
          </div>
          <div style={{ alignSelf: "flex-start", background: "rgba(255,255,255,0.04)", borderRadius: "8px 8px 8px 2px", padding: "6px 9px" }}>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "9px", lineHeight: "1.55" }}>Based on Lecture 7, working memory has four components…</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export default function Landing({ onEnter }) {
  const [authMode,       setAuthMode]       = useState(null);
  const [forgotSent,     setForgotSent]     = useState(false);
  const [forgotLoading,  setForgotLoading]  = useState(false);

  async function handleForgotPassword(email) {
    if (!email) { alert("Enter your email first, then tap Forgot password."); return; }
    setForgotLoading(true);
    try {
      await fetch("/api/email?action=reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setForgotSent(true);
      setTimeout(() => setForgotSent(false), 5000);
    } catch {}
    setForgotLoading(false);
  } // null | "signup" | "login"

  return (
    <div style={{ background: "#111111", minHeight: "100dvh", fontFamily: "var(--font-sans)", overflowX: "clip" }}>
      <style>{`
        @keyframes lSheetUp { from { transform: translateY(100%) }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  } to { transform: translateY(0) } }
        @keyframes lFadeUp  { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }

        .l-fade { opacity: 0; animation: lFadeUp 0.7s cubic-bezier(0.25,0.46,0.45,0.94) forwards; }
        .l-d1 { animation-delay: 0.1s; }
        .l-d2 { animation-delay: 0.25s; }
        .l-d3 { animation-delay: 0.4s; }
        .l-d4 { animation-delay: 0.55s; }
        .l-d5 { animation-delay: 0.7s; }

        .l-btn-primary:hover  { background: #fff !important; transform: translateY(-1px); }
        .l-btn-primary:active { transform: translateY(0); }
        .l-btn-ghost:hover    { background: rgba(255,255,255,0.09) !important; }

        .l-feature-card { transition: background 0.2s, border-color 0.2s, transform 0.2s; }
        .l-feature-card:hover { background: rgba(255,255,255,0.07) !important; border-color: rgba(255,255,255,0.12) !important; transform: translateY(-3px); }

        .l-step-num { transition: color 0.2s; }
        .l-step:hover .l-step-num { color: rgba(255,255,255,0.6) !important; }

        .l-nav-login:hover { color: #F5F5F5 !important; }

        @media (max-width: 640px) {
          .l-hero-h1 { font-size: 38px !important; letter-spacing: -1.2px !important; line-height: 1.1 !important; }
          .l-hero-sub { font-size: 16px !important; }
          .l-features-grid { grid-template-columns: 1fr !important; }
          .l-steps-grid    { grid-template-columns: 1fr !important; gap: 32px !important; }
          .l-section       { padding: 64px 22px !important; }
          .l-hero-section  { padding: 90px 22px 60px !important; }
          .preview-card-right, .preview-card-left { display: none; }
        }
      `}</style>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "15px 28px",
        background: "rgba(17,17,17,0.88)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <img src="/logo.jpeg" alt="FSchool AI" style={{ height: "32px", width: "32px", borderRadius: "8px", objectFit: "cover" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <button
            className="l-nav-login"
            onClick={() => setAuthMode("login")}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "14px", cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s" }}
          >
            Sign in
          </button>
          <button
            className="l-btn-ghost"
            onClick={() => setAuthMode("signup")}
            style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "10px", color: "#F5F5F5", fontSize: "14px", fontWeight: "500", padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
          >
            Get started
          </button>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="l-hero-section" style={{ padding: "130px 28px 80px", textAlign: "center", position: "relative" }}>
        {/* top ambient glow */}
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: "700px", height: "500px",
          background: "radial-gradient(ellipse at top, rgba(255,255,255,0.05) 0%, transparent 65%)",
          pointerEvents: "none",
        }} />

        <img
          className="l-fade l-d1"
          src="/logo.jpeg"
          alt="FSchool AI"
          style={{ width: "72px", height: "72px", borderRadius: "18px", objectFit: "cover", marginBottom: "24px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
        />

        <p className="l-fade l-d1" style={{
          display: "inline-block",
          fontSize: "10px", color: "rgba(255,255,255,0.3)",
          letterSpacing: "3px", textTransform: "uppercase",
          border: "1px solid rgba(255,255,255,0.09)", borderRadius: "20px",
          padding: "4px 14px", marginBottom: "16px",
        }}>
          Your academic mind
        </p>

        {/* Beta badge */}
        <div className="l-fade l-d1" style={{ marginBottom: "28px" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            background: "rgba(255,200,80,0.1)",
            border: "1px solid rgba(255,200,80,0.25)",
            borderRadius: "20px",
            padding: "5px 14px",
            fontSize: "12px",
            color: "rgba(255,200,80,0.85)",
            fontWeight: "500",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,200,80,0.8)", display: "inline-block", animation: "pulse 2s infinite" }} />
            Beta — Join free, get 1 month subscription
          </span>
        </div>

        <h1 className="l-hero-h1 l-fade l-d2" style={{
          fontSize: "72px", fontWeight: "700", color: "#F5F5F5",
          letterSpacing: "-2.8px", lineHeight: "1.04",
          maxWidth: "740px", margin: "0 auto 22px",
          overflowWrap: "anywhere", minWidth: 0,
        }}>
          Organized.<br />
          <span style={{ color: "rgba(255,255,255,0.35)" }}>Amplified.</span>
        </h1>

        <p className="l-hero-sub l-fade l-d3" style={{
          fontSize: "18px", color: "rgba(255,255,255,0.42)",
          maxWidth: "500px", margin: "0 auto 40px", lineHeight: "1.7",
        }}>
          Your agent connects your Canvas courses, class notes, and AI in one intelligent space — navigated by touch.
        </p>

        <div className="l-fade l-d4" style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            className="l-btn-primary"
            onClick={() => setAuthMode("signup")}
            style={{ background: "rgba(255,255,255,0.92)", color: "#111", border: "none", borderRadius: "12px", padding: "13px 28px", fontSize: "15px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s, transform 0.15s" }}
          >
            Join the Beta →
          </button>
          <button
            className="l-btn-ghost"
            onClick={() => setAuthMode("login")}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "rgba(255,255,255,0.65)", padding: "13px 24px", fontSize: "15px", cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
          >
            Sign in
          </button>
        </div>
      </section>

      {/* ── Product preview ──────────────────────────────────────────────── */}
      <div className="l-fade l-d5" style={{ padding: "0 28px 90px" }}>
        <AppPreview />
      </div>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="l-section" style={{ padding: "80px 28px", maxWidth: "920px", margin: "0 auto" }}>
        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", letterSpacing: "3px", textTransform: "uppercase", textAlign: "center", marginBottom: "52px" }}>
          What your agent does
        </p>
        <div className="l-features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px" }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="l-feature-card"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "24px" }}
            >
              <p style={{ fontSize: "24px", marginBottom: "14px", opacity: 0.65 }}>{f.symbol}</p>
              <p style={{ color: "#F5F5F5", fontSize: "15px", fontWeight: "600", letterSpacing: "-0.2px", marginBottom: "8px" }}>{f.title}</p>
              <p style={{ color: "rgba(255,255,255,0.38)", fontSize: "13px", lineHeight: "1.75" }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="l-section" style={{ padding: "80px 28px", maxWidth: "920px", margin: "0 auto", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", letterSpacing: "3px", textTransform: "uppercase", textAlign: "center", marginBottom: "52px" }}>
          How it works
        </p>
        <div className="l-steps-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "48px" }}>
          {STEPS.map((s) => (
            <div key={s.n} className="l-step">
              <p className="l-step-num" style={{ fontSize: "44px", fontWeight: "700", color: "rgba(255,255,255,0.07)", letterSpacing: "-1px", lineHeight: 1, marginBottom: "14px" }}>
                {s.n}
              </p>
              <p style={{ color: "#F5F5F5", fontSize: "15px", fontWeight: "600", marginBottom: "8px" }}>{s.title}</p>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "13px", lineHeight: "1.75" }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA strip ────────────────────────────────────────────────────── */}
      <section style={{ padding: "90px 28px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <h2 style={{ color: "#F5F5F5", fontSize: "40px", fontWeight: "700", letterSpacing: "-1.2px", marginBottom: "14px", overflowWrap: "anywhere", minWidth: 0 }}>
          Ready to start?
        </h2>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "15px", marginBottom: "34px" }}>
          No Canvas token required to get started.
        </p>
        <button
          className="l-btn-primary"
          onClick={() => setAuthMode("signup")}
          style={{ background: "rgba(255,255,255,0.92)", color: "#111", border: "none", borderRadius: "12px", padding: "14px 34px", fontSize: "15px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s, transform 0.15s" }}
        >
          Create free account →
        </button>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{ padding: "22px 28px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px", fontWeight: "700" }}>FSCHOOL AI</span>
        <span style={{ color: "rgba(255,255,255,0.12)", fontSize: "12px" }}>Academic intelligence</span>
      </footer>

      {/* ── Auth modal ───────────────────────────────────────────────────── */}
      {authMode && (
        {forgotSent && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1001, padding: "12px 20px", textAlign: "center", fontSize: "13px", fontWeight: "500", background: "rgba(52,199,89,0.95)", color: "#fff" }}>
            ✓ Password reset email sent — check your inbox.
          </div>
        )}
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onEnter={onEnter}
          onSwitchMode={setAuthMode}
          onForgotPassword={handleForgotPassword}
        />
      )}
    </div>
  );
}
