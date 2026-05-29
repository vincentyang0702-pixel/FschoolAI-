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
import { signUp, signIn } from "./api/auth";

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

export default function App() {
  const { userId, saveCanvasCredentials, updateUserField, pendingNav, setPendingNav } = useApp();

  // Initialise from cache so returning users skip the landing page entirely
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => Boolean(localStorage.getItem(LOGGED_IN_KEY))
  );
  const [showOnboarding,    setShowOnboarding]    = useState(false);
  const [onboardingEmail,   setOnboardingEmail]   = useState("");
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
      const user = await signIn(creds.email, creds.password); // throws on bad creds
      localStorage.setItem("fschool_uid", user.id);
      localStorage.setItem(LOGGED_IN_KEY, "1");
      if (user.name) localStorage.setItem("fschool_name", user.name);
      window.location.reload();
      return;
    }

    // Write name to localStorage immediately so greeting is correct right away
    localStorage.setItem("fschool_name", creds.name);

    // signup — create user row (best-effort; app works without Supabase too)
    try {
      await signUp(userId, {
        name:     creds.name,
        email:    creds.email,
        password: creds.password,
      });
    } catch (err) {
      console.warn("Supabase signup failed (tables may not exist yet):", err.message);
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
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        background:  "var(--color-bg)",
        minHeight:   "100dvh",
        position:    "relative",
        overflowX:   "clip",
        fontFamily:  "var(--font-sans)",
      }}
    >
      <div
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? "scale(1)" : "scale(0.98)",
          transition: "opacity 0.18s var(--ease-apple), transform 0.18s var(--ease-apple)",
          minHeight:  "100dvh",
        }}
      >
        <header
          style={{
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "space-between",
            padding:         "52px 22px 0",
          }}
        >
          <span
            style={{
              fontSize:      "11px",
              color:         "var(--text-dim)",
              letterSpacing: "2px",
              textTransform: "uppercase",
              fontWeight:    "500",
            }}
          >
            {LABEL[currentPage]}
          </span>
          <PageDots currentPage={currentPage} />
        </header>

        <main style={{ padding: "20px 22px 100px" }}>
          {PageComponent && <PageComponent />}
        </main>
      </div>

      <NeuralRing />
    </div>
  );
}
