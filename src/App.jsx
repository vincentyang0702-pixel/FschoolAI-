// App.jsx — Navigation state + page transition only.
// Does not know about page content — all page logic lives in pages/.
// Adding a page: create pages/NewPage.jsx, import it here, add to PAGES.

import { useState, useCallback, useRef, useEffect } from "react";
import { NAV, LABEL }  from "./navigation/navConfig";
import { useSwipe }    from "./navigation/useSwipe";
import PageDots        from "./components/PageDots";
import NeuralRing      from "./components/NeuralRing";
import Landing         from "./pages/Landing";
import Onboarding      from "./pages/Onboarding";
import { useApp }      from "./context/AppContext";
import { supabase } from "./api/supabase";

import Work            from "./pages/Work";
import Canvas          from "./pages/Canvas";
import Assignment      from "./pages/Assignment";
import Study           from "./pages/Study";
import Toolkit         from "./pages/Toolkit";
import Identity        from "./pages/Identity";
import Leaderboard     from "./pages/Leaderboard";

const PAGES = {
  work:        Work,
  canvas:      Canvas,
  assignment:  Assignment,
  study:       Study,
  toolkit:     Toolkit,
  identity:    Identity,
  leaderboard: Leaderboard,
};

// Persist login across sessions
const LOGGED_IN_KEY = "fschool_logged_in";

// Inject app-shell styles into <head> once — theme-reactive via CSS vars.
// Using a <style> tag instead of inline styles so the browser always resolves
// the CURRENT value of each var (inline styles snapshot the value at render time).
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

// Inject once on module load
if (!document.getElementById("app-shell-styles")) {
  const tag = document.createElement("style");
  tag.id = "app-shell-styles";
  tag.textContent = SHELL_STYLES;
  document.head.appendChild(tag);
}

export default function App() {
  const { userId, saveCanvasCredentials, updateUserField, pendingNav, setPendingNav } = useApp();

  // Initialise from cache so returning users skip the landing page entirely
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => Boolean(localStorage.getItem(LOGGED_IN_KEY))
  );
  const [showOnboarding,     setShowOnboarding]    = useState(false);
  const [onboardingEmail,    setOnboardingEmail]   = useState("");
  const [onboardingInitName, setOnboardingInitName] = useState("");
  const [currentPage, setCurrentPage] = useState("work");
  const [visible,     setVisible]     = useState(true);
  const fadingRef = useRef(false);

  // Transition helper — reused for both swipe and AI navigation
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

  // Swipe navigation uses adjacent-page directions
  const swipeNavigate = useCallback((dir) => {
    const next = NAV[currentPage]?.[dir];
    if (next) navigate(next);
  }, [currentPage, navigate]);

  // AI-triggered navigation — NeuralRing sets pendingNav in AppContext
  useEffect(() => {
    if (!pendingNav) return;
    navigate(pendingNav.page ?? pendingNav);
    setPendingNav(null);
  }, [pendingNav, navigate, setPendingNav]);

  const { onTouchStart, onTouchEnd } = useSwipe(swipeNavigate);

  const handleEnter = useCallback(async (creds = {}) => {
    if (creds.mode === "login") {
      // Verify credentials, restore the user's UUID, then reload so AppContext
      // re-initialises with the correct UUID and loads their Supabase data.
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

    // Write name to localStorage immediately so greeting is correct right away
    localStorage.setItem("fschool_name", creds.name);

    // signup — create user row directly via supabase
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(creds.password));
      const password_hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
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
      }
    } catch (err) {
      console.warn("Supabase signup failed:", err.message);
    }

    // Show onboarding wizard instead of dropping straight into the app
    setOnboardingEmail(creds.email);
    setOnboardingInitName(creds.name);
    setShowOnboarding(true);
  }, [userId]);

  const handleOnboardingComplete = useCallback(async ({
    preferredName, schoolName, schoolCity, schoolCountry, schoolContinent, token, baseUrl,
  }) => {
    if (preferredName) localStorage.setItem("fschool_name", preferredName);
    try {
      const patch = { id: userId };
      if (preferredName)   patch.name = preferredName;
      if (schoolName)      patch.school = schoolName;
      if (schoolCity)      patch.school_city = schoolCity;
      if (schoolCountry)   patch.school_country = schoolCountry;
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
