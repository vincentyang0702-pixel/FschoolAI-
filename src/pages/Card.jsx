// FschoolAI Founding Card — Apple iPhone 17 Pro + Cluely aesthetic
// Pure black, full-bleed sections, cinematic scroll, live engraving, Founder Delivery $3k tier
import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Assets ─────────────────────────────────────────────────────────────── */
const HERO_IMG   = "/card-group.jpg";
const TITANIUM_IMG = "/card-titanium.jpg";

/* ─── Colorway data ──────────────────────────────────────────────────────── */
const COLORWAYS = [
  { id: "white",  name: "Base White",   hex: "#F5F5F0", border: "#D8D8D3", accent: "#1a1a1a", tagline: "Clean. Timeless. Iconic.",      img: "/card-white.jpg" },
  { id: "purple", name: "Royal Purple", hex: "#C8B4F0", border: "#9B7FD4", accent: "#6B3FA0", tagline: "Bold. Regal. Unforgettable.",   img: "/card-purple.jpg" },
  { id: "pink",   name: "Royal Pink",   hex: "#F0B8CC", border: "#E07898", accent: "#C04870", tagline: "Vivid. Confident. Distinct.",  img: "/card-pink.jpg" },
  { id: "blue",   name: "Royal Blue",   hex: "#B4D0F0", border: "#78A8E0", accent: "#2860B0", tagline: "Sharp. Focused. Brilliant.",   img: "/card-blue.jpg" },
  { id: "green",  name: "Royal Green",  hex: "#D8ECA0", border: "#A8C870", accent: "#5A8020", tagline: "Fresh. Grounded. Alive.",       img: "/card-green.jpg" },
];

/* ─── Cinematic feature sections ─────────────────────────────────────────── */
const FEATURES = [
  {
    eyebrow: "AI Tutor",
    headline: "Your tutor.\nAlways on.",
    body: "Founding Card unlocks priority access to your personal FschoolAI AI tutor — 24/7, for every subject, forever. Answers grounded in your actual lecture notes, not just the internet.",
    bg: "#000",
    accent: "#f5f5f7",
    visual: "tutor",
  },
  {
    eyebrow: "In-Class Recording",
    headline: "Never miss\nwhat's said.",
    body: "FschoolAI captures and transcribes your lectures in real time. Searchable, always there, in your own notes. Every word your professor says — yours forever.",
    bg: "#0a0a0a",
    accent: "#f5f5f7",
    visual: "recording",
  },
  {
    eyebrow: "Canvas Sync",
    headline: "Every course.\nEvery deadline.",
    body: "Connect your Canvas account and FschoolAI pulls every course, assignment, and deadline automatically. Your card is linked to your verified academic identity.",
    bg: "#000",
    accent: "#f5f5f7",
    visual: "canvas",
  },
  {
    eyebrow: "NFC Identity",
    headline: "Tap to connect.\nInstantly.",
    body: "One tap shares your full profile, Brain Card, and links with anyone. No app needed. Your entire academic identity — in a single touch.",
    bg: "#0a0a0a",
    accent: "#f5f5f7",
    visual: "nfc",
  },
  {
    eyebrow: "Leaderboard",
    headline: "Your rank.\nYour legacy.",
    body: "Founding members get a permanent verified badge on the FschoolAI global leaderboard. Filter by country, city, or university. Your number is your identity.",
    bg: "#000",
    accent: "#f5f5f7",
    visual: "leaderboard",
  },
  {
    eyebrow: "FST Token Wallet",
    headline: "Earn as\nyou learn.",
    body: "Every study session, every milestone — rewarded in FST tokens. Your card is your wallet. Hold, spend, and trade within the FschoolAI ecosystem.",
    bg: "#0a0a0a",
    accent: "#f5f5f7",
    visual: "wallet",
  },
  {
    eyebrow: "Founding Edition",
    headline: "You're #0001\nof 500.",
    body: "Your founding number is laser-engraved on your card. Only 500 exist. Ever. This is not a limited run — it is the only run.",
    bg: "#000",
    accent: "#f5f5f7",
    visual: "founding",
  },
  {
    eyebrow: "Lifetime Pro",
    headline: "Lifetime Pro.\nForever.",
    body: "Every FschoolAI Pro feature. Every future update. No subscription. No renewal. No expiry. You're in — forever.",
    bg: "#0a0a0a",
    accent: "#f5f5f7",
    visual: "pro",
  },
];

/* ─── Spec list ──────────────────────────────────────────────────────────── */
const SPECS = [
  { icon: "🧠", label: "NeuroAGI Brain ID",         desc: "Your unique neural identity across the entire NeuroAGI ecosystem" },
  { icon: "🤖", label: "AI Tutor — Priority Access", desc: "24/7 personal AI tutor grounded in your actual lecture notes" },
  { icon: "🎙️", label: "In-Class Recording",         desc: "Real-time transcription, searchable, always in your notes" },
  { icon: "📚", label: "Canvas Sync",                desc: "Every course, assignment, and deadline — automatically synced" },
  { icon: "📡", label: "NFC Tap",                    desc: "One tap shares your full profile and Brain Card instantly" },
  { icon: "🔗", label: "LinkMe Profile",             desc: "Your full academic and social identity — one link, one tap" },
  { icon: "🏅", label: "Founding Member #0001–#0500",desc: "Permanently engraved founding number — only 500 exist, ever" },
  { icon: "💎", label: "FST Token Wallet",           desc: "Built-in FschoolAI token wallet — earn, hold, and spend FST" },
  { icon: "🏆", label: "Leaderboard Badge",          desc: "Verified rank badge on the FschoolAI global leaderboard" },
  { icon: "🤝", label: "Partner Rewards",            desc: "Exclusive discounts and perks from FschoolAI partner network" },
  { icon: "♾️", label: "Lifetime FschoolAI Pro",     desc: "Every Pro feature, every future update — forever, no subscription" },
];

/* ─── Countdown hook ─────────────────────────────────────────────────────── */
function useCountdown(targetDate) {
  const [t, setT] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  useEffect(() => {
    function calc() {
      const diff = new Date(targetDate) - new Date();
      if (diff <= 0) { setT({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return; }
      setT({ days: Math.floor(diff/86400000), hours: Math.floor((diff%86400000)/3600000), minutes: Math.floor((diff%3600000)/60000), seconds: Math.floor((diff%60000)/1000) });
    }
    calc(); const id = setInterval(calc, 1000); return () => clearInterval(id);
  }, [targetDate]);
  return t;
}

/* ─── Scroll-reveal hook ─────────────────────────────────────────────────── */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ─── Card visual component ──────────────────────────────────────────────── */
function CardVisual({ colorway, engraving, isFounder, size = 220 }) {
  const h = Math.round(size * 1.58);
  if (isFounder) {
    return (
      <div style={{ width: size, height: h, borderRadius: size * 0.09, overflow: "hidden", boxShadow: `0 ${size*0.18}px ${size*0.36}px rgba(0,0,0,0.8), 0 0 ${size*0.18}px rgba(180,180,180,0.08)`, position: "relative", flexShrink: 0 }}>
        <img src={TITANIUM_IMG} alt="Titanium Black Founding Card" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {engraving && (
          <div style={{ position: "absolute", bottom: "14%", left: 0, right: 0, textAlign: "center", fontSize: size * 0.055, color: "rgba(200,200,200,0.7)", fontFamily: "'SF Pro Display', -apple-system, sans-serif", letterSpacing: "0.04em", fontWeight: 400 }}>
            {engraving}
          </div>
        )}
      </div>
    );
  }
  const c = colorway;
  return (
    <div style={{
      width: size, height: h, borderRadius: size * 0.09,
      overflow: "hidden", flexShrink: 0, position: "relative",
      boxShadow: `0 ${size*0.18}px ${size*0.36}px rgba(0,0,0,0.8), 0 0 ${size*0.18}px ${c.hex}30`,
      transition: "box-shadow 0.5s ease",
    }}>
      <img
        src={c.img}
        alt={c.name}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block", transition: "opacity 0.4s ease" }}
      />
      {engraving && (
        <div style={{
          position: "absolute", bottom: "18%", left: 0, right: 0, textAlign: "center",
          fontSize: size * 0.055, color: c.id === "white" ? "rgba(30,30,30,0.7)" : `${c.accent}cc`,
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          letterSpacing: "0.04em", fontWeight: 400,
        }}>
          {engraving}
        </div>
      )}
    </div>
  );
}

/* ─── Feature visual mocks ───────────────────────────────────────────────── */
function FeatureVisual({ type }) {
  const s = { borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "20px", maxWidth: 320, width: "100%" };
  const label = { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 8 };
  const row = { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" };

  if (type === "tutor") return (
    <div style={s}>
      <div style={{ ...label }}>AI Tutor · BIOL 201</div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>Explain homeostasis</div>
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#f5f5f7", lineHeight: 1.6 }}>
        Homeostasis is the body's mechanism for maintaining stable internal conditions. Your professor covered this in <span style={{ color: "#a78bfa" }}>Lecture 4</span> — the feedback loop example with temperature regulation.
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 8 }}>From your Lecture 4 notes · Priority Access</div>
    </div>
  );

  if (type === "recording") return (
    <div style={s}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff3b30", boxShadow: "0 0 8px #ff3b30" }} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>REC 00:04 · COMP 101</span>
      </div>
      <div style={{ ...label }}>Live Transcript</div>
      {["…cognitive load theory suggests working memory has limited capacity…", "…four components: phonological loop, visuospatial sketchpad…", "…central executive coordinates the subsystems…"].map((t, i) => (
        <div key={i} style={{ fontSize: 13, color: i === 0 ? "#f5f5f7" : `rgba(245,245,247,${0.5 - i*0.15})`, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", lineHeight: 1.5 }}>{t}</div>
      ))}
    </div>
  );

  if (type === "canvas") return (
    <div style={s}>
      <div style={{ ...label }}>Canvas · 3 Courses</div>
      {[
        { course: "COMP 101", item: "Problem Set 4", due: "Tomorrow", color: "#ff3b30" },
        { course: "BIOL 201", item: "Lab Report", due: "May 28", color: "#ff9500" },
        { course: "MATH 150", item: "Midterm Review", due: "Jun 2", color: "#30d158" },
      ].map((a, i) => (
        <div key={i} style={{ ...row }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#f5f5f7", fontWeight: 500 }}>{a.item}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{a.course}</div>
          </div>
          <div style={{ fontSize: 12, color: a.color }}>{a.due}</div>
        </div>
      ))}
    </div>
  );

  if (type === "nfc") return (
    <div style={{ ...s, textAlign: "center", padding: "32px 20px" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📲</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#f5f5f7", marginBottom: 6 }}>Tap to share</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>Brain Card · LinkMe Profile · NeuroAGI ID</div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "center", gap: 8 }}>
        {["Brain Card", "Links", "ID"].map(t => (
          <span key={t} style={{ fontSize: 11, background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "4px 10px", color: "rgba(255,255,255,0.5)" }}>{t}</span>
        ))}
      </div>
    </div>
  );

  if (type === "leaderboard") return (
    <div style={s}>
      <div style={{ ...label }}>Global Leaderboard</div>
      {[
        { rank: 1, name: "You", score: "847h", badge: "🏅", founding: "#0042" },
        { rank: 2, name: "Pratik S.", score: "812h", badge: "", founding: "#0089" },
        { rank: 3, name: "Shreya M.", score: "798h", badge: "", founding: "#0156" },
      ].map((u) => (
        <div key={u.rank} style={{ ...row, borderBottom: u.rank < 3 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", width: 18, textAlign: "center" }}>#{u.rank}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: u.rank === 1 ? "#f5f5f7" : "rgba(255,255,255,0.6)", fontWeight: u.rank === 1 ? 600 : 400 }}>{u.name} {u.badge}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Founding {u.founding}</div>
          </div>
          <div style={{ fontSize: 13, color: u.rank === 1 ? "#a78bfa" : "rgba(255,255,255,0.35)" }}>{u.score}</div>
        </div>
      ))}
    </div>
  );

  if (type === "wallet") return (
    <div style={s}>
      <div style={{ ...label }}>FST Wallet</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: "#f5f5f7", letterSpacing: "-1px", marginBottom: 4 }}>1,247 <span style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>FST</span></div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>+84 FST this week</div>
      {[
        { label: "Study session · 2h", amount: "+12 FST", color: "#30d158" },
        { label: "Assignment completed", amount: "+25 FST", color: "#30d158" },
        { label: "Streak bonus · 7 days", amount: "+50 FST", color: "#30d158" },
      ].map((tx, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13 }}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>{tx.label}</span>
          <span style={{ color: tx.color, fontWeight: 600 }}>{tx.amount}</span>
        </div>
      ))}
    </div>
  );

  if (type === "founding") return (
    <div style={{ ...s, textAlign: "center", padding: "32px 20px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>Founding Member</div>
      <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-3px", color: "#f5f5f7", lineHeight: 1 }}>#0042</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 12, lineHeight: 1.6 }}>Laser-engraved.<br />Permanent. Yours.</div>
    </div>
  );

  if (type === "pro") return (
    <div style={s}>
      <div style={{ ...label }}>FschoolAI Pro · Lifetime</div>
      {["AI Tutor — Priority", "In-class Recording", "Smart Study Planner", "Study Rooms", "Leaderboard Badge", "FST Token Wallet"].map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
          <span style={{ color: "#30d158", fontSize: 14 }}>✓</span> {f}
        </div>
      ))}
      <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.25)" }}>No subscription. No renewal. Forever.</div>
    </div>
  );

  return null;
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function Card() {
  const [selected, setSelected]       = useState(0);
  const [engraving, setEngraving]     = useState("");
  const [founderDelivery, setFounder] = useState(false);
  const [formData, setFormData]       = useState({ name: "", university: "", email: "" });
  const [submitted, setSubmitted]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [headerScrolled, setHeader]   = useState(false);
  const heroRef = useRef(null);
  const countdown = useCountdown("2026-06-30T23:59:59");

  useEffect(() => {
    function onScroll() {
      const hero = heroRef.current;
      setHeader(window.scrollY > (hero ? hero.offsetHeight * 0.5 : 300));
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name || !formData.email) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1400));
    setSubmitted(true); setSubmitting(false);
  }

  const colorway = COLORWAYS[selected];
  const isFounder = founderDelivery;

  return (
    <div style={{ background: "#000", minHeight: "100dvh", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif", color: "#f5f5f7", overflowX: "hidden" }}>

      {/* ── Sticky Header ── */}
      <header style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        background: headerScrolled ? "rgba(0,0,0,0.88)" : "rgba(0,0,0,0.3)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: headerScrolled ? "1px solid rgba(255,255,255,0.07)" : "none",
        transition: "background 0.4s ease, border-color 0.4s ease",
        padding: "0 24px", height: "52px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <a href="/" style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px", textDecoration: "none", letterSpacing: "-0.2px", display: "flex", alignItems: "center", gap: "5px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          FschoolAI
        </a>
        <span style={{ fontSize: "13px", fontWeight: "600", color: "rgba(255,255,255,0.9)", letterSpacing: "-0.3px" }}>Founding Card</span>
        <a href="#apply" style={{ fontSize: "12px", fontWeight: "600", color: "#000", background: "#f5f5f7", borderRadius: "20px", padding: "6px 14px", textDecoration: "none", letterSpacing: "-0.2px" }}>
          Apply
        </a>
      </header>

      {/* ── Hero ── */}
      <section ref={heroRef} style={{ position: "relative", height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", overflow: "hidden" }}>
        <img src={HERO_IMG} alt="FschoolAI Founding Card" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 30%, transparent 45%, rgba(0,0,0,0.65) 75%, rgba(0,0,0,0.97) 100%)" }} />
        <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "0 24px 64px", width: "100%", maxWidth: "500px" }}>
          <p style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: "10px" }}>
            Founding Edition · Only 500
          </p>
          <h1 style={{ fontSize: "clamp(38px, 9vw, 60px)", fontWeight: "700", letterSpacing: "-1.8px", lineHeight: 1.04, color: "#f5f5f7", marginBottom: "10px" }}>
            FschoolAI<br />Founding Card
          </h1>
          <p style={{ fontSize: "16px", color: "rgba(255,255,255,0.55)", marginBottom: "30px", letterSpacing: "-0.3px" }}>
            Free for founding members. Ships Q4 2026.
          </p>
          <a href="#apply" style={{ display: "inline-block", background: "#f5f5f7", color: "#000", fontSize: "15px", fontWeight: "650", letterSpacing: "-0.3px", padding: "14px 38px", borderRadius: "980px", textDecoration: "none" }}>
            Apply for your card
          </a>
        </div>
        <div className="bounce-arrow" style={{ position: "absolute", bottom: "22px", left: "50%", transform: "translateX(-50%)", opacity: 0.35, zIndex: 2 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
        </div>
      </section>

      {/* ── Countdown ── */}
      <section style={{ background: "#111", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "32px 24px", textAlign: "center" }}>
        <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "18px" }}>Applications close</p>
        <div style={{ display: "flex", justifyContent: "center", gap: "clamp(20px, 5vw, 48px)", flexWrap: "wrap" }}>
          {[{ v: countdown.days, l: "Days" }, { v: countdown.hours, l: "Hours" }, { v: countdown.minutes, l: "Min" }, { v: countdown.seconds, l: "Sec" }].map(({ v, l }) => (
            <div key={l} style={{ textAlign: "center", minWidth: "52px" }}>
              <div style={{ fontSize: "clamp(34px, 8vw, 52px)", fontWeight: "700", letterSpacing: "-2px", color: "#f5f5f7", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{String(v).padStart(2, "0")}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", marginTop: "6px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{l}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginTop: "16px" }}>June 30, 2026 · Midnight</p>
      </section>

      {/* ── Manifesto ── */}
      <ManifestoSection />

      {/* ── Cinematic Feature Sections ── */}
      {FEATURES.map((f, i) => <FeatureSection key={i} feature={f} index={i} />)}

      {/* ── Colorway Picker ── */}
      <section data-colorway-section style={{ padding: "80px 24px 72px", maxWidth: "700px", margin: "0 auto", textAlign: "center" }}>
        <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "12px" }}>Colorway</p>
        <h2 style={{ fontSize: "clamp(26px, 5vw, 34px)", fontWeight: "700", letterSpacing: "-0.8px", marginBottom: "4px" }}>{isFounder ? "Titanium Black" : colorway.name}</h2>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: "36px", letterSpacing: "-0.2px" }}>
          {isFounder ? "Exclusive to Founder Delivery. Not available separately." : colorway.tagline}
        </p>
        {/* Group photo with color glow — Apple style */}
        <div style={{ position: "relative", width: "100%", maxWidth: 480, margin: "0 auto 40px", borderRadius: 20, overflow: "hidden" }}>
          <img src={isFounder ? TITANIUM_IMG : HERO_IMG} alt="FschoolAI Cards" style={{ width: "100%", display: "block", borderRadius: 20 }} />
          {/* Color glow overlay for selected colorway */}
          {!isFounder && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: 20,
              background: `radial-gradient(ellipse at center bottom, ${colorway.hex}30 0%, transparent 70%)`,
              pointerEvents: "none", transition: "background 0.5s ease",
            }} />
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginBottom: "0", flexWrap: "wrap" }}>
          {COLORWAYS.map((c, i) => (
            <button key={c.id} onClick={() => { setSelected(i); setFounder(false); }} title={c.name} style={{
              width: "32px", height: "32px", borderRadius: "50%", background: c.hex,
              border: (!isFounder && selected === i) ? `2px solid ${c.hex}` : "2px solid transparent",
              outline: (!isFounder && selected === i) ? "2px solid rgba(255,255,255,0.5)" : "2px solid transparent",
              outlineOffset: "2px", cursor: "pointer",
              transform: (!isFounder && selected === i) ? "scale(1.15)" : "scale(1)",
              boxShadow: (!isFounder && selected === i) ? `0 0 12px ${c.hex}60` : "none",
              transition: "all 0.15s",
            }} />
          ))}
          {/* Titanium Black swatch — only shown when Founder Delivery selected */}
          {isFounder && (
            <button title="Titanium Black — Founder Delivery" style={{
              width: "32px", height: "32px", borderRadius: "50%",
              background: "linear-gradient(135deg, #2a2a2a, #1a1a1a)",
              border: "2px solid #555", outline: "2px solid rgba(255,255,255,0.5)", outlineOffset: "2px",
              cursor: "default", transform: "scale(1.15)",
              boxShadow: "0 0 12px rgba(150,150,150,0.3)",
            }} />
          )}
        </div>
      </section>

      {/* ── Engraving ── */}
      <EngravingSection engraving={engraving} setEngraving={setEngraving} colorway={colorway} isFounder={isFounder} />

      {/* ── Spec List ── */}
      <SpecSection />

      {/* ── Founding Counter ── */}
      <CounterSection />

      {/* ── Founder Delivery ── */}
      <FounderDeliverySection founderDelivery={founderDelivery} setFounder={setFounder} />

      {/* ── Specialist Setup ── */}
      <SpecialistSection />

      {/* ── Application Form ── */}
      <ApplicationSection
        formData={formData} setFormData={setFormData}
        submitted={submitted} submitting={submitting}
        handleSubmit={handleSubmit}
        colorway={colorway} isFounder={isFounder} engraving={engraving}
        founderDelivery={founderDelivery}
      />

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "40px 24px", textAlign: "center" }}>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)", lineHeight: 1.9 }}>
          © 2026 FschoolAI. All rights reserved.<br />
          The FschoolAI Founding Card is a physical NFC card. Not a financial product.
        </p>
      </footer>

      <style>{`
        @keyframes bounceY { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(7px)} }
        .bounce-arrow { animation: bounceY 2s ease-in-out infinite; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }
        .reveal { animation: fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) forwards; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        input::placeholder { color: rgba(255,255,255,0.22); }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 1000px rgba(255,255,255,0.05) inset !important; -webkit-text-fill-color: #f5f5f7 !important; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
    </div>
  );
}

/* ─── Sub-sections ───────────────────────────────────────────────────────── */

function ManifestoSection() {
  const [ref, visible] = useReveal(0.2);
  return (
    <section ref={ref} style={{ padding: "96px 24px", background: "#000", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", opacity: 1, transform: "translateY(0)", transition: "opacity 0.8s ease, transform 0.8s ease" }}>
        <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: "20px" }}>What is FschoolAI</p>
        <h2 style={{ fontSize: "clamp(30px, 7vw, 52px)", fontWeight: "700", letterSpacing: "-1.5px", lineHeight: 1.1, color: "#f5f5f7", marginBottom: "24px" }}>
          The AI that actually<br />knows your courses.
        </h2>
        <p style={{ fontSize: "clamp(15px, 2.5vw, 18px)", color: "rgba(255,255,255,0.5)", lineHeight: 1.7, letterSpacing: "-0.2px" }}>
          Canvas sync. In-class recording. AI tutor grounded in your actual lecture notes — not just the internet. FschoolAI is the academic intelligence layer every student needs. The Founding Card is your key to all of it — forever.
        </p>
      </div>
    </section>
  );
}

function FeatureSection({ feature: f, index }) {
  const [ref, visible] = useReveal(0.15);
  const isEven = index % 2 === 0;
  return (
    <section ref={ref} style={{ background: f.bg, borderTop: "1px solid rgba(255,255,255,0.05)", padding: "clamp(72px, 12vw, 120px) 24px", minHeight: "80vh", display: "flex", alignItems: "center" }}>
      <div style={{
        maxWidth: 900, margin: "0 auto", width: "100%",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: "clamp(40px, 6vw, 64px)",
        opacity: 1, transform: "translateY(0)",
        transition: "opacity 0.9s ease, transform 0.9s ease",
      }}>
        <div style={{ textAlign: "center", maxWidth: 560 }}>
          <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: "16px" }}>{f.eyebrow}</p>
          <h2 style={{ fontSize: "clamp(36px, 8vw, 64px)", fontWeight: "700", letterSpacing: "-2px", lineHeight: 1.05, color: "#f5f5f7", whiteSpace: "pre-line", marginBottom: "20px" }}>{f.headline}</h2>
          <p style={{ fontSize: "clamp(15px, 2vw, 17px)", color: "rgba(255,255,255,0.45)", lineHeight: 1.7, letterSpacing: "-0.2px" }}>{f.body}</p>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <FeatureVisual type={f.visual} />
        </div>
      </div>
    </section>
  );
}

function EngravingSection({ engraving, setEngraving, colorway, isFounder }) {
  const [ref, visible] = useReveal(0.2);
  return (
    <section ref={ref} style={{ padding: "80px 24px 72px", maxWidth: 600, margin: "0 auto", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)", opacity: 1, transform: "translateY(0)", transition: "opacity 0.8s ease, transform 0.8s ease" }}>
      <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "12px" }}>Engraving</p>
      <h2 style={{ fontSize: "clamp(26px, 5vw, 36px)", fontWeight: "700", letterSpacing: "-0.9px", marginBottom: "8px" }}>Make it yours.</h2>
      <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: "36px", lineHeight: 1.6 }}>
        Add your name, student ID, or a short message.<br />Laser-engraved on the back of your card.
      </p>
      <div style={{ position: "relative", marginBottom: "32px" }}>
        <input
          type="text"
          maxLength={30}
          placeholder="Your name, quote, or student ID"
          value={engraving}
          onChange={e => setEngraving(e.target.value)}
          style={{
            width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px", padding: "14px 50px 14px 16px", color: "#f5f5f7", fontSize: "15px",
            outline: "none", fontFamily: "inherit", transition: "border-color 0.15s",
          }}
          onFocus={e => e.target.style.borderColor = "rgba(255,255,255,0.25)"}
          onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
        />
        <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: "rgba(255,255,255,0.25)" }}>{engraving.length}/30</span>
      </div>
      {/* Live preview — real card photo with engraving overlay */}
      <div style={{ position: "relative", width: "100%", maxWidth: 280, margin: "0 auto" }}>
        <img
          src={isFounder ? TITANIUM_IMG : colorway.img}
          alt={isFounder ? "Titanium Black" : colorway.name}
          style={{ width: "100%", display: "block", borderRadius: 16, boxShadow: `0 24px 48px rgba(0,0,0,0.8)` }}
        />
        {(engraving || true) && (
          <div style={{
            position: "absolute", bottom: "18%", left: 0, right: 0, textAlign: "center",
            fontSize: "clamp(11px, 3vw, 14px)",
            color: isFounder ? "rgba(200,200,200,0.75)" : (colorway.id === "white" ? "rgba(30,30,30,0.65)" : `${colorway.accent}cc`),
            fontFamily: "'SF Pro Display', -apple-system, sans-serif",
            letterSpacing: "0.04em", fontWeight: 400,
            padding: "0 12px",
          }}>
            {engraving || <span style={{ opacity: 0.35 }}>Your engraving here</span>}
          </div>
        )}
      </div>
      {engraving && <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)", marginTop: "16px" }}>Preview — actual engraving may vary slightly</p>}
    </section>
  );
}

function SpecSection() {
  const [ref, visible] = useReveal(0.1);
  return (
    <section ref={ref} style={{ padding: "80px 24px 88px", maxWidth: 680, margin: "0 auto", borderTop: "1px solid rgba(255,255,255,0.06)", opacity: 1, transform: "translateY(0)", transition: "opacity 0.8s ease, transform 0.8s ease" }}>
      <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "12px", textAlign: "center" }}>What's inside</p>
      <h2 style={{ fontSize: "clamp(28px, 6vw, 42px)", fontWeight: "700", letterSpacing: "-1px", marginBottom: "52px", textAlign: "center" }}>Everything a founder gets.</h2>
      <div>
        {SPECS.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "16px", padding: "20px 0", borderBottom: i < SPECS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
            <span style={{ fontSize: "22px", flexShrink: 0, marginTop: "1px" }}>{f.icon}</span>
            <div>
              <div style={{ fontSize: "15px", fontWeight: "600", color: "#f5f5f7", letterSpacing: "-0.3px", marginBottom: "3px" }}>{f.label}</div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.38)", lineHeight: 1.55 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CounterSection() {
  const [ref, visible] = useReveal(0.2);
  const remaining = 247;
  return (
    <section ref={ref} style={{ padding: "72px 24px", background: "#0a0a0a", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)", opacity: 1, transform: "translateY(0)", transition: "opacity 0.8s ease, transform 0.8s ease" }}>
      <div style={{ fontSize: "clamp(52px, 14vw, 88px)", fontWeight: "700", letterSpacing: "-4px", color: "#f5f5f7", lineHeight: 1 }}>{remaining}</div>
      <div style={{ fontSize: "15px", color: "rgba(255,255,255,0.4)", marginTop: "10px", letterSpacing: "-0.2px" }}>of 500 founding spots remaining</div>
      <div style={{ width: "100%", maxWidth: "320px", height: "3px", background: "rgba(255,255,255,0.07)", borderRadius: "2px", margin: "22px auto 0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${((500 - remaining) / 500) * 100}%`, background: "linear-gradient(90deg, #888, #f5f5f7)", borderRadius: "2px" }} />
      </div>
      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.22)", marginTop: "10px" }}>{500 - remaining} members have already applied</div>
    </section>
  );
}

function FounderDeliverySection({ founderDelivery, setFounder }) {
  const [ref, visible] = useReveal(0.15);
  const perks = [
    "Titanium Black card — exclusive, never sold separately",
    "Guaranteed founding number #0001–#0050 (top 50 only)",
    "White-glove premium packaging + express delivery",
    "1-on-1 onboarding session with Vincent",
    "Lifetime Pro + priority support forever",
  ];
  return (
    <section ref={ref} style={{ padding: "80px 24px", background: "#000", borderTop: "1px solid rgba(255,255,255,0.06)", opacity: 1, transform: "translateY(0)", transition: "opacity 0.8s ease, transform 0.8s ease" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "12px", textAlign: "center" }}>Founder Delivery</p>
        <h2 style={{ fontSize: "clamp(28px, 6vw, 42px)", fontWeight: "700", letterSpacing: "-1px", marginBottom: "8px", textAlign: "center" }}>The rarest card<br />in the world.</h2>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: "48px", textAlign: "center", lineHeight: 1.6 }}>Only 50 Titanium Black cards exist. Ever.</p>

        {/* Two-column layout: card image + perks */}
        <div style={{ display: "flex", gap: "clamp(24px, 5vw, 56px)", alignItems: "center", flexWrap: "wrap", justifyContent: "center", marginBottom: "40px" }}>
          <img src={TITANIUM_IMG} alt="Titanium Black Founding Card" style={{ width: "clamp(140px, 30vw, 200px)", borderRadius: 16, boxShadow: "0 32px 64px rgba(0,0,0,0.8), 0 0 32px rgba(150,150,150,0.08)", objectFit: "cover" }} />
          <div style={{ flex: 1, minWidth: 240 }}>
            {perks.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: i < perks.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <span style={{ color: "#a78bfa", fontSize: 14, flexShrink: 0, marginTop: 1 }}>✦</span>
                <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>{p}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Toggle — Apple AppleCare style */}
        <div style={{
          border: founderDelivery ? "1px solid rgba(167,139,250,0.4)" : "1px solid rgba(255,255,255,0.1)",
          borderRadius: "16px", padding: "20px 20px",
          background: founderDelivery ? "rgba(167,139,250,0.06)" : "rgba(255,255,255,0.03)",
          transition: "all 0.3s ease", cursor: "pointer",
        }} onClick={() => setFounder(f => !f)}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%",
              border: founderDelivery ? "none" : "2px solid rgba(255,255,255,0.25)",
              background: founderDelivery ? "#a78bfa" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "all 0.2s",
            }}>
              {founderDelivery && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M5 12l5 5L20 7"/></svg>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "15px", fontWeight: "600", color: "#f5f5f7", letterSpacing: "-0.3px" }}>Add Founder Delivery</div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>Titanium Black · Top 50 · White-glove · 1-on-1 with Vincent</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: "17px", fontWeight: "700", color: founderDelivery ? "#a78bfa" : "#f5f5f7", letterSpacing: "-0.5px" }}>$3,000</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", marginTop: "1px" }}>One time</div>
            </div>
          </div>
        </div>
        {founderDelivery && (
          <p style={{ fontSize: "12px", color: "rgba(167,139,250,0.6)", marginTop: "12px", textAlign: "center" }}>
            ✦ Titanium Black colorway selected · Founding #0001–#0050 guaranteed
          </p>
        )}
      </div>
    </section>
  );
}

function SpecialistSection() {
  const [ref, visible] = useReveal(0.2);
  return (
    <section ref={ref} style={{ padding: "72px 24px", background: "#f5f5f7", opacity: 1, transform: "translateY(0)", transition: "opacity 0.8s ease, transform 0.8s ease" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        {/* Icon row */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "clamp(8px, 2vw, 16px)", marginBottom: "28px", flexWrap: "wrap" }}>
          {["🧠", "📱", "🎓", "📡", "🔗", "🏆"].map((icon, i) => (
            <div key={i} style={{ width: "clamp(40px, 8vw, 52px)", height: "clamp(40px, 8vw, 52px)", borderRadius: "12px", background: "#e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "clamp(18px, 3.5vw, 24px)" }}>{icon}</div>
          ))}
        </div>
        <h2 style={{ fontSize: "clamp(24px, 5vw, 34px)", fontWeight: "700", letterSpacing: "-0.8px", color: "#1d1d1f", marginBottom: "16px", lineHeight: 1.2 }}>
          Set up your identity card<br />with a one-on-one session<br />with a Specialist.
        </h2>
        <p style={{ fontSize: "15px", color: "#6e6e73", lineHeight: 1.6, marginBottom: "24px" }}>
          When you apply for your Founding Card, you can book a free Personal Setup session. We'll help you activate your Brain ID, connect Canvas, configure NFC, and make the most of your card.
        </p>
        <a href="#apply" style={{ fontSize: "15px", color: "#0071e3", textDecoration: "none", fontWeight: "500", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          Learn more about Personal Setup
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        </a>
      </div>
    </section>
  );
}

function ApplicationSection({ formData, setFormData, submitted, submitting, handleSubmit, colorway, isFounder, engraving, founderDelivery }) {
  const [ref, visible] = useReveal(0.1);
  const inputStyle = {
    width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: "12px", padding: "14px 16px", color: "#f5f5f7", fontSize: "15px",
    outline: "none", fontFamily: "inherit", transition: "border-color 0.15s",
  };
  return (
    <section id="apply" ref={ref} style={{ padding: "88px 24px 100px", maxWidth: 480, margin: "0 auto", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)", opacity: 1, transform: "translateY(0)", transition: "opacity 0.8s ease, transform 0.8s ease" }}>
      <p style={{ fontSize: "11px", fontWeight: "600", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: "12px" }}>Founding Edition</p>
      <h2 style={{ fontSize: "clamp(28px, 6vw, 42px)", fontWeight: "700", letterSpacing: "-1px", marginBottom: "8px" }}>Apply for your card.</h2>
      <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.4)", marginBottom: "40px", letterSpacing: "-0.2px", lineHeight: 1.6 }}>
        {founderDelivery ? "Founder Delivery — $3,000. We'll reach out to complete your order." : "Free for founding members. We'll reach out when your card is ready to ship."}
      </p>

      {submitted ? (
        <div style={{ background: "rgba(48,209,88,0.07)", border: "1px solid rgba(48,209,88,0.18)", borderRadius: "16px", padding: "44px 24px" }}>
          <div style={{ fontSize: "44px", marginBottom: "16px" }}>🎉</div>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#30d158", marginBottom: "8px", letterSpacing: "-0.5px" }}>You're on the list.</div>
          <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
            We'll email you when your founding card is ready to ship.<br />Welcome to the founding 500.
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Colorway display */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "12px 16px" }}>
            {isFounder ? (
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "linear-gradient(135deg, #2a2a2a, #1a1a1a)", border: "1px solid #555", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: colorway.hex, boxShadow: `0 0 8px ${colorway.hex}60`, flexShrink: 0 }} />
            )}
            <span style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", flex: 1, textAlign: "left" }}>
              {isFounder ? "Titanium Black — Founder Delivery ($3,000)" : colorway.name}
            </span>
            <a href="#" onClick={e => { e.preventDefault(); document.querySelector('[data-colorway-section]')?.scrollIntoView({ behavior: "smooth" }); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: "12px", cursor: "pointer", textDecoration: "none" }}>Change</a>
          </div>

          {/* Engraving display */}
          {engraving && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "12px 16px" }}>
              <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", flex: 1, textAlign: "left" }}>✍️ Engraving: <span style={{ color: "rgba(255,255,255,0.6)" }}>"{engraving}"</span></span>
            </div>
          )}

          <input type="text" placeholder="Full name" value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} required style={inputStyle} onFocus={e => e.target.style.borderColor = "rgba(255,255,255,0.25)"} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.09)"} />
          <input type="text" placeholder="University or school" value={formData.university} onChange={e => setFormData(p => ({ ...p, university: e.target.value }))} style={inputStyle} onFocus={e => e.target.style.borderColor = "rgba(255,255,255,0.25)"} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.09)"} />
          <input type="email" placeholder="Email address" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} required style={inputStyle} onFocus={e => e.target.style.borderColor = "rgba(255,255,255,0.25)"} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.09)"} />

          <button type="submit" disabled={submitting || !formData.name || !formData.email} style={{
            marginTop: "8px", background: submitting ? "rgba(245,245,247,0.5)" : "#f5f5f7", color: "#000",
            border: "none", borderRadius: "980px", padding: "16px", fontSize: "15px", fontWeight: "650",
            letterSpacing: "-0.3px", cursor: submitting ? "default" : "pointer", fontFamily: "inherit",
            opacity: (!formData.name || !formData.email) ? 0.4 : 1, transition: "opacity 0.2s",
          }}>
            {submitting ? "Submitting…" : founderDelivery ? "Apply for Founder Delivery →" : "Apply for my card →"}
          </button>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.18)", marginTop: "4px" }}>
            {founderDelivery ? "$3,000 · Titanium Black · Top 50 · Ships Q4 2026." : "Free. No credit card required. Ships Q4 2026."}
          </p>
        </form>
      )}
    </section>
  );
}
