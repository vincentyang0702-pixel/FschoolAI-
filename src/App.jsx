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

if (!document.getElementById("fs-fraunces-font")) {
  const preconnect = document.createElement("link");
  preconnect.rel = "preconnect";
  preconnect.href = "https://fonts.googleapis.com";
  document.head.appendChild(preconnect);
  const link = document.createElement("link");
  link.id = "fs-fraunces-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&display=swap";
  document.head.appendChild(link);
}

export default function App() {
  const { userId, setUserId, refreshUser, saveCanvasCredentials, updateUserField, pendingNav, setPendingNav } = useApp();

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

    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(creds.password));
    const password_hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");

    const email = creds.email.toLowerCase().trim();

    // Check for existing account — prevents duplicate signups
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      // Throw here — propagates up to Landing.jsx to show the error to the user
      throw new Error("An account with this email already exists. Please sign in instead.");
    }

    // CRITICAL: every signup gets a brand-new id. Never reuse the device's
    // existing fschool_uid — otherwise signing up on a device that is already
    // logged into another account overwrites that account (the "merge" bug).
    const newId = crypto.randomUUID();
    localStorage.setItem("fschool_uid", newId);

    try {
      // insert, not upsert — a fresh signup is always a new row. If the id
      // somehow collided it should throw loudly, never silently clobber a row.
      const { error: insertErr } = await supabase
        .from("users")
        .insert({ id: newId, name: creds.name, email, password_hash });
      if (insertErr) throw insertErr;

      // Send verification email — non-blocking, won't fail signup if email fails
      fetch("/api/email?action=send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId: newId, email, name: creds.name }),
      }).catch(() => {});
    } catch (err) {
      console.warn("Supabase signup failed:", err.message);
    }

    // Point app state at the new account AFTER the row exists, so onboarding
    // and page-tracking write to the correct user.
    setUserId(newId);

    setOnboardingEmail(creds.email);
    setOnboardingInitName(creds.name);
    setShowOnboarding(true);
  }, [setUserId]);

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

  // ── Overlays (render in BOTH logged-in and logged-out states so a reset
  // link works even when the user isn't signed in on this device) ───────────
  const overlays = (
    <>
      <style>{`
        @keyframes fsBannerIn { from{opacity:0;transform:translateX(-50%) translateY(-10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes fsCardUp   { from{opacity:0;transform:translateY(16px) scale(.98)} to{opacity:1;transform:none} }
        @keyframes fsSealIn   { from{opacity:0;transform:scale(.82)} to{opacity:1;transform:scale(1)} }
        @keyframes fsSpin     { to{transform:rotate(360deg)} }
        .fs-reset-input:focus { border-color: rgba(196,154,60,.55) !important; }
        .fs-reset-btn:active  { transform: scale(.985); }
      `}</style>

      {/* Email verify banner */}
      {verifyBanner && (
        <div style={{
          position:"fixed", top:"env(safe-area-inset-top, 0px)", left:"50%",
          transform:"translateX(-50%)", zIndex:999, marginTop:"16px",
          width:"calc(100% - 40px)", maxWidth:"420px", padding:"14px 18px",
          borderRadius:"12px", display:"flex", alignItems:"center", gap:"14px",
          background: verifyBanner === "error" ? "#1a1814" : "#F6F2E9",
          border: verifyBanner === "error" ? "1px solid rgba(255,100,90,0.25)" : "1px solid rgba(196,154,60,0.28)",
          boxShadow:"0 4px 28px rgba(0,0,0,0.24)",
          animation:"fsBannerIn 0.3s cubic-bezier(0.0,0.0,0.2,1.0) both",
        }}>
          {verifyBanner !== "error" ? (
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none" style={{flexShrink:0}}>
              <circle cx="17" cy="17" r="16" stroke="#C49A3C" strokeWidth="1" strokeDasharray="4 2.5" opacity="0.5"/>
              <circle cx="17" cy="17" r="12" stroke="#C49A3C" strokeWidth="1.4"/>
              <path d="M11 17l4.5 4.5 7.5-8" stroke="#C49A3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none" style={{flexShrink:0}}>
              <circle cx="17" cy="17" r="16" stroke="#ff6961" strokeWidth="1" opacity="0.55"/>
              <circle cx="17" cy="17" r="12" stroke="#ff6961" strokeWidth="1.4"/>
              <path d="M12 12l10 10M22 12l-10 10" stroke="#ff6961" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
          <div style={{flex:1}}>
            <div style={{
              fontSize:"13px", fontWeight:"700", letterSpacing:"-0.1px", marginBottom:"3px",
              color: verifyBanner === "error" ? "#ff6961" : "#1a1814",
            }}>
              {verifyBanner === "success"      && "Email verified"}
              {verifyBanner === "already_done" && "Already verified"}
              {verifyBanner === "error"        && "Verification failed"}
            </div>
            <div style={{fontSize:"12px", color: verifyBanner === "error" ? "rgba(255,255,255,0.42)" : "rgba(26,24,20,0.5)"}}>
              {verifyBanner === "success"      && "Your 1-month free subscription is now active."}
              {verifyBanner === "already_done" && "Your email is already verified."}
              {verifyBanner === "error"        && "Link is invalid or expired \u2014 check your inbox."}
            </div>
          </div>
        </div>
      )}

      {/* Password-reset card */}
      {(resetMode || resetDone) && (
        <div style={{
          position:"fixed", inset:0, zIndex:1000,
          background:"rgba(10,8,6,0.74)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
          display:"flex", alignItems:"center", justifyContent:"center", padding:"24px",
        }}>
          <div style={{
            width:"100%", maxWidth:"380px",
            background:"#F6F2E9",
            border:"1px solid rgba(196,154,60,0.22)",
            borderRadius:"20px", padding:"40px 32px 36px",
            boxShadow:"0 32px 80px rgba(0,0,0,0.42)",
            animation:"fsCardUp .42s cubic-bezier(0.0,0.0,0.2,1.0) both",
            textAlign:"center",
          }}>
            {!resetDone ? (
              <>
                <div style={{margin:"0 auto 24px", width:"68px", height:"68px", animation:"fsSealIn .5s cubic-bezier(0.34,1.15,0.64,1) both .05s"}}>
                  <svg width="68" height="68" viewBox="0 0 68 68" fill="none">
                    <circle cx="34" cy="34" r="32" stroke="#C49A3C" strokeWidth="1" strokeDasharray="4 3" opacity="0.45"/>
                    <circle cx="34" cy="34" r="26" stroke="#C49A3C" strokeWidth="1.5" opacity="0.65"/>
                    <circle cx="34" cy="34" r="19" fill="rgba(196,154,60,0.06)" stroke="#C49A3C" strokeWidth="1.5"/>
                    <rect x="23" y="31" width="22" height="14" rx="2.5" stroke="#C49A3C" strokeWidth="1.8"/>
                    <path d="M27 31v-4.5a7 7 0 0 1 14 0v4.5" stroke="#C49A3C" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </div>
                <h2 style={{fontFamily:"'Fraunces',Georgia,serif", color:"#1a1814", fontSize:"24px", fontWeight:"700", letterSpacing:"-0.4px", marginBottom:"10px", lineHeight:1.15}}>Set a new password</h2>
                <p style={{color:"rgba(26,24,20,0.5)", fontSize:"13.5px", lineHeight:1.6, marginBottom:"28px"}}>Choose a strong password to secure your FSchoolAI account.</p>
                <div style={{display:"flex", flexDirection:"column", gap:"10px", marginBottom:"14px", textAlign:"left"}}>
                  <input className="fs-reset-input" type="password" placeholder="New password" value={resetPw}
                    onChange={e => { setResetPw(e.target.value); if (resetError) setResetError(""); }}
                    style={{background:"#fff", border:"1px solid rgba(26,24,20,0.16)", borderRadius:"10px", padding:"13px 15px", color:"#1a1814", fontSize:"14px", outline:"none", fontFamily:"inherit", transition:"border-color .15s"}}/>
                  <input className="fs-reset-input" type="password" placeholder="Confirm new password" value={resetConfirm}
                    onChange={e => { setResetConfirm(e.target.value); if (resetError) setResetError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") handleResetSubmit(); }}
                    style={{background:"#fff", border:"1px solid rgba(26,24,20,0.16)", borderRadius:"10px", padding:"13px 15px", color:"#1a1814", fontSize:"14px", outline:"none", fontFamily:"inherit", transition:"border-color .15s"}}/>
                </div>
                {resetError && <p style={{color:"#b33a2a", fontSize:"12.5px", marginBottom:"14px", textAlign:"left"}}>{resetError}</p>}
                <button className="fs-reset-btn" onClick={handleResetSubmit} disabled={resetLoading}
                  style={{width:"100%", background: resetLoading ? "rgba(26,24,20,0.55)" : "#1a1814", color:"#F6F2E9", border:"none", borderRadius:"11px", padding:"14px", fontSize:"15px", fontWeight:"650", cursor: resetLoading ? "default" : "pointer", fontFamily:"inherit", transition:"opacity .15s, transform .1s", display:"flex", alignItems:"center", justifyContent:"center", gap:"8px"}}>
                  {resetLoading
                    ? <><span style={{width:"15px", height:"15px", border:"2px solid rgba(246,242,233,0.25)", borderTopColor:"#F6F2E9", borderRadius:"50%", display:"inline-block", animation:"fsSpin .6s linear infinite"}}/>Saving\u2026</>
                    : "Save new password \u2192"}
                </button>
              </>
            ) : (
              <>
                <div style={{margin:"0 auto 28px", animation:"fsSealIn .55s cubic-bezier(0.34,1.15,0.64,1) both"}}>
                  <svg width="76" height="76" viewBox="0 0 76 76" fill="none">
                    <circle cx="38" cy="38" r="36" stroke="#C49A3C" strokeWidth="1" strokeDasharray="4.5 3" opacity="0.45"/>
                    <circle cx="38" cy="38" r="29.5" stroke="#C49A3C" strokeWidth="1.5" opacity="0.65"/>
                    <circle cx="38" cy="38" r="22" fill="rgba(196,154,60,0.07)" stroke="#C49A3C" strokeWidth="1.5"/>
                    <path d="M25.5 38.5l9 9 16.5-17" stroke="#C49A3C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p style={{fontSize:"11px", letterSpacing:"3px", textTransform:"uppercase", color:"rgba(26,24,20,0.35)", fontWeight:"500", marginBottom:"16px"}}>Password updated</p>
                <h2 style={{fontFamily:"'Fraunces',Georgia,serif", color:"#1a1814", fontSize:"28px", fontWeight:"700", letterSpacing:"-0.4px", marginBottom:"10px", lineHeight:1.15}}>You're all set.</h2>
                <p style={{color:"rgba(26,24,20,0.5)", fontSize:"14px", lineHeight:1.6}}>Sign in with your new password to continue.</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );

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
    return (<>{overlays}<Landing onEnter={handleEnter} /></>);
  }

  const PageComponent = PAGES[currentPage];

  return (
    <div
      className="app-shell"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {overlays}

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
