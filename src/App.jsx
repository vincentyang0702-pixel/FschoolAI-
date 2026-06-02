// App.jsx — Navigation state + page transition only.
// Does not know about page content — all page logic lives in pages/.
// Adding a page: create pages/NewPage.jsx, import it here, add to PAGES.
// PLACE IN: /src/App.jsx (replaces existing file)

import { useState, useCallback, useRef, useEffect } from "react";
import { NAV, LABEL }       from "./navigation/navConfig";
import { useSwipe }         from "./navigation/useSwipe";
import PageDots             from "./components/PageDots";
import NeuralRing           from "./components/NeuralRing";
import Landing              from "./pages/Landing";
import Onboarding           from "./pages/Onboarding";
import { useApp }           from "./context/AppContext";
import { supabase }         from "./api/supabase";
import { usePageTracking }  from "./hooks/usePageTracking";

import Work        from "./pages/Work";
import Canvas      from "./pages/Canvas";
import Assignment  from "./pages/Assignment";
import Study       from "./pages/Study";
import Toolkit     from "./pages/Toolkit";
import Identity    from "./pages/Identity";
import Leaderboard from "./pages/Leaderboard";

const PAGES = {
  work:        Work,
  canvas:      Canvas,
  assignment:  Assignment,
  study:       Study,
  toolkit:     Toolkit,
  identity:    Identity,
  leaderboard: Leaderboard,
};

const LOGGED_IN_KEY = "fschool_logged_in";

const SHELL_STYLES = `
  .app-shell {
    background:  var(--color-bg);
    font-family: var(--font-sans);
    color:       var(--text-primary);
    min-height:  100dvh;
    position:    relative;
    overflow-x:  clip;
    transition:  background 0.4s var(--ease-apple), color 0.4s var(--ease-apple);
  }
  .app-page-transition {
    min-height: 100dvh;
    transition: opacity 0.18s var(--ease-apple), transform 0.18s var(--ease-apple);
  }
  .app-header {
    display:         flex;
    align-items:     center;
    justify-content: space-between;
    padding:         52px 22px 0;
    transition:      color 0.4s var(--ease-apple);
  }
  .app-page-label {
    font-size:      11px;
    color:          var(--text-dim);
    letter-spacing: 2px;
    text-transform: uppercase;
    font-weight:    500;
    transition:     color 0.4s var(--ease-apple);
  }
  .app-main {
    padding: 20px 22px 100px;
  }
`;

if (!document.getElementById("app-shell-styles")) {
  const tag = document.createElement("style");
  tag.id = "app-shell-styles";
  tag.textContent = SHELL_STYLES;
  document.head.appendChild(tag);
}

export default function App() {
  const { userId, saveCanvasCredentials, updateUserField, pendingNav, setPendingNav } = useApp();

  const [isLoggedIn, setIsLoggedIn] = useState(
    () => Boolean(localStorage.getItem(LOGGED_IN_KEY))
  );
  const [showOnboarding,      setShowOnboarding]     = useState(false);
  const [onboardingEmail,     setOnboardingEmail]    = useState("");
  const [onboardingInitName,  setOnboardingInitName] = useState("");
  const [currentPage,         setCurrentPage]        = useState("work");
  const [visible,             setVisible]            = useState(true);

  // ── Verify banner state ────────────────────────────────────────────────────
  const [verifyBanner, setVerifyBanner] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("verify") || null;
  });

  // ── Password reset state ────────────────────────────────────────────────────
  const [resetMode, setResetMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reset") === "confirm" ? {
      token:  params.get("token"),
      userId: params.get("userId"),
    } : null;
  });
  const [resetPw,      setResetPw]      = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError,   setResetError]   = useState("");
  const [resetDone,    setResetDone]    = useState(false);

  async function handleResetSubmit() {
    if (!resetPw || resetPw !== resetConfirm) { setResetError("Passwords don't match."); return; }
    if (resetPw.length < 6) { setResetError("Password must be at least 6 characters."); return; }
    setResetLoading(true);
    setResetError("");
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(resetPw));
      const password_hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      await supabase.from("users").update({ password_hash, email_verify_token: null }).eq("id", resetMode.userId);
      setResetDone(true);
      setTimeout(() => { setResetMode(null); setResetDone(false); }, 3000);
      const url = new URL(window.location.href);
      url.searchParams.delete("reset");
      url.searchParams.delete("token");
      url.searchParams.delete("userId");
      window.history.replaceState({}, "", url.toString());
    } catch (err) {
      setResetError("Failed to reset password. Try again.");
    }
    setResetLoading(false);
  }

  // Clear ?verify= param from URL after reading it + listen for cross-tab verify
  useEffect(() => {
    if (!verifyBanner) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("verify");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
    const t = setTimeout(() => setVerifyBanner(null), 6000);
    return () => clearTimeout(t);
  }, [verifyBanner]);

  // If user verifies email in another tab, show banner in this tab too
  useEffect(() => {
    function onStorage(e) {
      if (e.key === "fschool_verified" && e.newValue === "1") {
        setVerifyBanner("success");
        localStorage.removeItem("fschool_verified");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const fadingRef = useRef(false);

  // ── Page tracking ──────────────────────────────────────────────────────────
  usePageTracking(isLoggedIn ? currentPage : null, userId);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const navigate = useCallback((pageKey) => {
    if (fadingRef.current || !PAGES[pageKey]) return;
    try { navigator.vibrate?.(8); } catch (_) {}
    fadingRef.current = true;
    setVisible(false);
    setTimeout(() => {
      setCurrentPage(pageKey);
      setVisible(true);
      fadingRef.current = false;
    }, 180);
  }, []);

  const swipeNavigate = useCallback((dir) => {
    const next = NAV[currentPage]?.[dir];
    if (next) navigate(next);
  }, [currentPage, navigate]);

  useEffect(() => {
    if (!pendingNav) return;
    navigate(pendingNav.page ?? pendingNav);
    setPendingNav(null);
  }, [pendingNav, navigate, setPendingNav]);

  const { onTouchStart, onTouchEnd } = useSwipe(swipeNavigate);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const handleEnter = useCallback(async (creds = {}) => {
    if (creds.mode === "login") {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(creds.password));
      const password_hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      const { data: user, error } = await supabase
        .from("users")
        .select("id, name, school")
        .eq("email", creds.email.toLowerCase().trim())
        .eq("password_hash", password_hash)
        .maybeSingle();
      if (error || !user) throw new Error("Incorrect email or password.");
      localStorage.setItem("fschool_uid", user.id);
      localStorage.setItem(LOGGED_IN_KEY, "1");
      if (user.name) localStorage.setItem("fschool_name", user.name);
      window.location.reload();
      return;
    }

    // ── Signup ────────────────────────────────────────────────────────────────
    localStorage.setItem("fschool_name", creds.name);

    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(creds.password));
      const password_hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");

      // Check for existing account — prevents duplicate signups
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("email", creds.email.toLowerCase().trim())
        .maybeSingle();

      if (!existing) {
        await supabase
          .from("users")
          .upsert(
            { id: userId, name: creds.name, email: creds.email.toLowerCase().trim(), password_hash },
            { onConflict: "id" }
          );

        // Send verification email — non-blocking, won't fail signup if email fails
        fetch("/api/email?action=send", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            userId,
            email: creds.email.toLowerCase().trim(),
            name:  creds.name,
          }),
        }).catch(() => {});

      } else {
        // Email already registered — throw error, don't silently merge into existing account
        throw new Error("An account with this email already exists. Please sign in instead.");
      }
    } catch (err) {
      console.warn("Supabase signup failed:", err.message);
    }

    setOnboardingEmail(creds.email);
    setOnboardingInitName(creds.name);
    setShowOnboarding(true);
  }, [userId]);

  // ── Onboarding complete ────────────────────────────────────────────────────
  const handleOnboardingComplete = useCallback(async ({
    preferredName, schoolName, schoolCity, schoolCountry, schoolContinent, token, baseUrl,
  }) => {
    if (preferredName) localStorage.setItem("fschool_name", preferredName);
    try {
      const patch = { id: userId };
      if (preferredName)   patch.name            = preferredName;
      if (schoolName)      patch.school          = schoolName;
      if (schoolCity)      patch.school_city     = schoolCity;
      if (schoolCountry)   patch.school_country  = schoolCountry;
      if (schoolContinent) patch.school_continent = schoolContinent;
      await updateUserField(patch);
    } catch {}
    if (token && baseUrl) {
      try { await saveCanvasCredentials(token, baseUrl); } catch {}
    }
    localStorage.setItem(LOGGED_IN_KEY, "1");
    setShowOnboarding(false);
    setIsLoggedIn(true);
  }, [userId, updateUserField, saveCanvasCredentials]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (showOnboarding) {
    return (
      <Onboarding
        email={onboardingEmail}
        preferredName={onboardingInitName}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  if (!isLoggedIn) {
    return <Landing onEnter={handleEnter} />;
  }

  const PageComponent = PAGES[currentPage];

  return (
    <div
      className="app-shell"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Email verify banner ───────────────────────────────────────────── */}
      {verifyBanner && (
        <div style={{
          position:   "fixed",
          top:        0,
          left:       0,
          right:      0,
          zIndex:     999,
          padding:    "12px 20px",
          textAlign:  "center",
          fontSize:   "13px",
          fontWeight: "500",
          background: verifyBanner === "success" ? "rgba(52,199,89,0.95)"
                    : verifyBanner === "already_done" ? "rgba(52,199,89,0.7)"
                    : "rgba(255,59,48,0.95)",
          color: "#fff",
        }}>
          {verifyBanner === "success"      && "✓ Email verified — your 1-month free subscription is active."}
          {verifyBanner === "already_done" && "✓ Email already verified."}
          {verifyBanner === "error"        && "Verification link is invalid or expired. Check your email for a new one."}
        </div>
      )}

      {/* ── Password reset modal ─────────────────────────────────────────── */}
      {resetMode && !resetDone && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end" }}>
          <div style={{ width: "100%", background: "rgba(16,16,18,0.97)", borderRadius: "22px 22px 0 0", border: "1px solid rgba(255,255,255,0.09)", borderBottom: "none", padding: "24px 28px 48px" }}>
            <h2 style={{ color: "#F5F5F5", fontSize: "20px", fontWeight: "600", marginBottom: "6px" }}>Set new password</h2>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "13px", marginBottom: "20px" }}>Enter a new password for your account.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              <input
                type="password" placeholder="New password (min 6 characters)"
                value={resetPw} onChange={e => setResetPw(e.target.value)}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "10px", padding: "12px 14px", color: "#F5F5F5", fontSize: "14px", outline: "none", fontFamily: "inherit" }}
              />
              <input
                type="password" placeholder="Confirm new password"
                value={resetConfirm} onChange={e => setResetConfirm(e.target.value)}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "10px", padding: "12px 14px", color: "#F5F5F5", fontSize: "14px", outline: "none", fontFamily: "inherit" }}
              />
            </div>
            {resetError && <p style={{ color: "rgba(255,100,90,0.85)", fontSize: "12px", marginBottom: "10px" }}>{resetError}</p>}
            <button
              onClick={handleResetSubmit}
              disabled={resetLoading}
              style={{ width: "100%", background: "rgba(255,255,255,0.92)", color: "#111", border: "none", borderRadius: "12px", padding: "14px", fontSize: "15px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}
            >
              {resetLoading ? "Saving…" : "Save new password →"}
            </button>
          </div>
        </div>
      )}
      {resetDone && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, padding: "12px 20px", textAlign: "center", fontSize: "13px", fontWeight: "500", background: "rgba(52,199,89,0.95)", color: "#fff" }}>
          ✓ Password updated — you can now sign in with your new password.
        </div>
      )}

      <div
        className="app-page-transition"
        style={{
          opacity:   visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.98)",
        }}
      >
        <header className="app-header">
          <span className="app-page-label">
            {LABEL[currentPage]}
          </span>
          <PageDots currentPage={currentPage} />
        </header>

        <main className="app-main">
          {PageComponent && <PageComponent />}
        </main>
      </div>

      <NeuralRing />
    </div>
  );
}
