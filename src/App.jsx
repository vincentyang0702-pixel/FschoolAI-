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
import Courses     from "./pages/Courses";
import Identity    from "./pages/Identity";
import Leaderboard from "./pages/Leaderboard";

const PAGES = {
  work:        Work,
  canvas:      Canvas,
  assignment:  Assignment,
  study:       Study,
  toolkit:     Toolkit,
  courses:     Courses,
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

  // Clear ?verify= param from URL after reading it
  useEffect(() => {
    if (!verifyBanner) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("verify");
    url.searchParams.delete("reason");
    window.history.replaceState({}, "", url.toString());
    const t = setTimeout(() => setVerifyBanner(null), 5000);
    return () => clearTimeout(t);
  }, [verifyBanner]);

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
    const email = creds.email.toLowerCase().trim();
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(creds.password));
    const password_hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Duplicate email → send them to log in. Do NOT silently adopt an existing
    // account (that was an account-takeover path and required no password).
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      throw new Error("An account with this email already exists — please log in instead.");
    }

    // Brand-new account: mint a FRESH id so we can NEVER overwrite another user's
    // row (the old code reused the ambient fschool_uid, which collapsed accounts).
    const newId = crypto.randomUUID();
    const { error: insErr } = await supabase
      .from("users")
      .insert({ id: newId, name: creds.name, email, password_hash });
    if (insErr) throw new Error("Could not create your account. Please try again.");

    // Verification email — non-blocking
    fetch("/api/email?action=send", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: newId, email, name: creds.name }),
    }).catch(() => {});

    // Become the new user, then reload so the whole app (incl. context `userId`,
    // which only re-reads on reload) re-initializes as them. Onboarding resumes
    // after the reload via the pending flag below.
    localStorage.setItem("fschool_uid", newId);
    localStorage.setItem("fschool_name", creds.name);
    localStorage.setItem("fschool_pending_onboarding", JSON.stringify({ email, name: creds.name }));
    window.location.reload();
  }, [userId]);

  // Resume onboarding after a signup reload — identity is now the new user, so
  // any writes from onboarding land on the correct (fresh) id.
  useEffect(() => {
    const pending = localStorage.getItem("fschool_pending_onboarding");
    if (!pending) return;
    localStorage.removeItem("fschool_pending_onboarding");
    try {
      const { email, name } = JSON.parse(pending);
      setOnboardingEmail(email);
      setOnboardingInitName(name);
      setShowOnboarding(true);
    } catch { /* ignore malformed */ }
  }, []);

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
