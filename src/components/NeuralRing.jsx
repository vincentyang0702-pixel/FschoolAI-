// NeuralRing.jsx — Draggable floating AI assistant button + chat sheet.
//
// Behaviour:
//  • Drag freely anywhere on screen; stays exactly where released (free placement, no corner snap).
//  • Position is global and persists across page navigation.
//  • Ring hides (opacity 0, pointer-events none) while the chat is open.
//  • Ring drag sets document.body[data-ring-drag] so useSwipe ignores the gesture.
//  • Chat can be closed by swiping down on the drag handle or tapping the backdrop.
//  • Renders via createPortal into document.body to escape any ancestor overflow/stacking context.
//  • Ring name label below the sphere is editable and saved to Supabase users.ring_name.
//  • Voice mode: mute toggle in header. When unmuted, AI replies are spoken via ElevenLabs TTS.

import { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { groq }       from "../api/groq";
import { claude }      from "../api/claude";
import { useApp }      from "../context/AppContext";
import { supabase }    from "../api/supabase";
import { awardTokens } from "../api/tokens";
import ArtifactPanel   from "./ArtifactPanel";

// ── Claude proxy helper (tutor brain — better quality than Groq for conversation) ──
async function claudeTutor(messages, system, signal) {
  const res = await fetch("/api/claude", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system, max_tokens: 400 }),
    signal,  // abort signal from stopResponse()
  });
  if (!res.ok) throw new Error(`Claude proxy ${res.status}`);
  const { content } = await res.json();
  return content ?? "";
}

// ── Fire-and-forget impression writer — never awaited in critical path ──
function writeImpression(userId, userMessage, tutorResponse) {
  fetch("/api/tutor-impression", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, userMessage, tutorResponse }),
  }).catch(() => {}); // silent — never block UI
}

const NAV_REGEX      = /<\s*n?\s*nav[^>]*>([\s\S]*?)<\/\s*n?\s*nav\s*>/i;
const NAV_STRIP_REGEX = /<\s*n?\s*nav[\s\S]*$/i;
const ARTIFACT_REGEX = /<artifact>([\s\S]*?)<\/artifact>/i;

const VIZ_KEYWORDS = [
  "chart", "graph", "visuali", "plot", "diagram", "dashboard", "histogram", "scatter", "heatmap",
  "build", "create", "make me", "make a", "build me",
  "interactive", "animation", "animate", "simulat",
  "timer", "calculator", "tracker", "kanban", "game", "snake",
  "flashcard", "quiz", "pomodoro", "calendar", "planner", "budget",
  "sorting", "pathfinding", "neural", "algorithm",
];
const NAV_OVERRIDE_KEYWORDS = [
  "go to", "navigate", "open", "show my", "what are my",
  "study plan", "remind me", "schedule", "assignment",
  // Quiz intents — must bypass viz routing and go through normal Claude path
  // so the [QUIZ_START] format triggers InlineQuiz
  "quiz me", "quiz on", "quiz about", "test me on", "test me about",
  "ask me questions", "ask me about", "flashcard me", "drill me",
];

function isVizRequest(text) {
  const lower = text.toLowerCase();
  if (NAV_OVERRIDE_KEYWORDS.some(kw => lower.includes(kw))) return false;
  return VIZ_KEYWORDS.some(kw => lower.includes(kw));
}

function parseArtifact(raw) {
  // Primary: wrapped in <artifact> tags
  const m = raw.match(ARTIFACT_REGEX);
  if (m) return { code: m[1].trim(), text: raw.replace(ARTIFACT_REGEX, "").trim() || "Here's your visualization." };

  // Fallback: response looks like raw component code (Claude skipped the tags)
  const looksLikeCode = /function\s+App\s*[({]|const\s+App\s*=|return\s*\(\s*</.test(raw);
  if (looksLikeCode) return { code: raw.trim(), text: "Here's your visualization." };

  return { code: null, text: raw };
}

const VIZ_SYSTEM = `You are a data visualization expert. Create stunning interactive React visualizations.

STRICT RULES — breaking any of these will cause a crash:
1. Wrap your ENTIRE component in <artifact></artifact> tags. Nothing outside the tags.
2. The component MUST be named App: function App() { ... } or const App = () => { ... }
3. NO import or export statements — everything is already available as a global.
4. NO TypeScript — plain JavaScript only. No type annotations, no interfaces, no generics.
5. Use only these pre-loaded globals (do NOT redeclare them):
   - React hooks: useState, useEffect, useCallback, useMemo, useRef
   - Recharts: LineChart, Line, BarChart, Bar, PieChart, Pie, AreaChart, Area,
     RadarChart, Radar, ScatterChart, Scatter, Cell, XAxis, YAxis, CartesianGrid,
     Tooltip, Legend, ResponsiveContainer, PolarGrid, PolarAngleAxis, PolarRadiusAxis
6. Use realistic sample data when no real data is provided.
7. Design language: dark background #1a1814, gold accent #C49A3C, cream text #F6F2E9. NEVER neon green, neon yellow, or bright saturated accents.
8. Make it interactive where it makes sense (buttons, sliders, hover effects).
9. Return ONLY the <artifact> block — no explanation, no markdown fences, nothing else.`;

/** Log chat message to Supabase chat_logs (non-blocking) */
async function logChat(userId, role, content, page) {
  try {
    await supabase.from("chat_logs").insert({
      user_id: userId, role, content, page: page ?? null,
      created_at: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}

/** Lightweight inline formatter for streaming text — no block elements so partial HTML is safe */
function renderStreamingHTML(text) {
  let s = text
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/^(\d+)\.\s+(.+)$/gm, '<p style="margin:2px 0">$1. $2</p>');
  s = s.replace(/\n/g, "<br/>");
  return s;
}

/** Render tutor message markdown as safe HTML (no dependency) */
function renderMessageHTML(text) {
  let s = text
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;");
  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Numbered list items
  s = s.replace(/^(\d+)\.\s+(.+)$/gm, '<p style="margin:3px 0;padding-left:2px">$1. $2</p>');
  // Bullet items
  s = s.replace(/^[-•] (.+)$/gm, "<li>$1</li>");
  // Wrap runs of <li> in <ul>
  s = s.replace(/(<li>[\s\S]*?<\/li>)/g, m =>
    m.startsWith("<ul>") ? m : "<ul>" + m + "</ul>"
  );
  s = s.replace(/<\/ul>\s*<ul>/g, "");   // merge adjacent lists
  // Paragraph breaks
  s = s.replace(/\n\n/g, "</p><p>");
  s = s.replace(/\n/g,   "<br/>");
  return "<p>" + s + "</p>";
}

/** Parse [QUIZ_START]...[QUIZ_END] block from a Claude response */
function parseQuiz(text) {
  const match = text.match(/\[QUIZ_START\]([\s\S]*?)\[QUIZ_END\]/);
  if (!match) return null;
  const cards = match[1].trim().split("\n")
    .filter(l => l.includes("Q:") && l.includes(" | ") && l.includes("A:"))
    .map(l => {
      const [q, a] = l.split(" | ");
      return {
        q: (q || "").replace(/^Q:\s*/i, "").trim(),
        a: (a || "").replace(/^A:\s*/i, "").trim(),
      };
    })
    .filter(c => c.q && c.a);
  return cards.length > 0 ? cards : null;
}

/** Load last 20 chat messages for this user, oldest first */
async function loadChatHistory(userId) {
  try {
    const { data } = await supabase
      .from("chat_logs")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(20);
    return (data ?? []).map(r => ({ role: r.role, content: r.content }));
  } catch {
    return [];
  }
}

/** Return assignments due within 48h that aren't submitted */
function getUrgentAssignments(assignments) {
  const now = Date.now();
  const h48 = 48 * 60 * 60 * 1000;
  return (assignments || []).filter(a => {
    if (!a.dueAt || a.submission?.submittedAt) return false;
    const diff = new Date(a.dueAt).getTime() - now;
    return diff > 0 && diff <= h48;
  });
}

function buildChatSystem(courseOptions, userData, assignments, flashcardMap, syllabus, impressions, lastSession, livingMind, isFirstMessage = false, voicesForContext = []) {
  const courseList = courseOptions.length
    ? courseOptions.join("\n- ")
    : "No courses loaded yet";

  const now = Date.now();
  const upcoming = (assignments || [])
    .filter(a => a.dueAt && new Date(a.dueAt).getTime() > now)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, 5)
    .map(a => `- ${a.name} (${a.courseName || a.courseCode || ""}) — due ${new Date(a.dueAt).toLocaleDateString()}`)
    .join("\n");

  const userContext = userData ? [
    userData.name       ? `Student name: ${userData.name}` : null,
    userData.gpa        ? `GPA: ${userData.gpa}` : null,
    userData.streak     ? `Study streak: ${userData.streak} days` : null,
    userData.study_time ? `Total study time: ${userData.study_time} mins` : null,
    userData.school     ? `School: ${userData.school}` : null,
  ].filter(Boolean).join("\n") : "";

  // Flashcard topics per course (just question subjects, not full cards)
  const flashcardContext = Object.entries(flashcardMap || {})
    .map(([, data]) => {
      if (!data?.cards?.length) return null;
      const topics = data.cards.slice(0, 4).map(c => c.question).join(" | ");
      return `• ${topics}`;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");

  // Syllabus topics (first 5 items)
  const syllabusContext = (syllabus || [])
    .slice(0, 5)
    .map(s => `• ${s.title ?? s.name ?? JSON.stringify(s)}`)
    .join("\n");

  // Impressions from previous sessions
  const impressionContext = (impressions || [])
    .slice(0, 5)
    .map(i => `• ${i.impression}`)
    .join("\n");

  // Last session continuity
  const lastSessionLine = lastSession
    ? `Last session: ${lastSession}`
    : "";

  return `You are a sharp, direct academic AI tutor. You know this student — their patterns, their work habits, their actual courses. Answer in 1-3 sentences unless the student asks for more detail.

STUDENT DATA:
${userContext || "No user data yet"}

UPCOMING ASSIGNMENTS:
${upcoming || "None"}

COURSES (internal reference — never list back verbatim):
- ${courseList}

${flashcardContext ? `WHAT THEY'VE BEEN STUDYING (flashcard topics):\n${flashcardContext}` : ""}

${syllabusContext ? `SYLLABUS TOPICS:\n${syllabusContext}` : ""}

${impressionContext ? `RECENT OBSERVATIONS (this and past sessions):\n${impressionContext}` : ""}

${livingMind ? `LIVING MIND (your full student model — built across all sessions):\n${livingMind}` : ""}

${lastSessionLine ? `CONTINUITY:\n${lastSessionLine}` : ""}

PAGES: work, canvas, assignment, study, courses, identity, leaderboard, toolkit

NAVIGATION: When the user wants to go somewhere or study a course, append this EXACTLY at the end of your reply — nothing after it:
<nav>{"page":"pagename","course":"EXACT course string","mode":"flashcards or guide"}</nav>
Omit "course"/"mode" when not relevant. Only use <nav> for clear navigation intent.

QUIZ FORMAT: When the student asks to be quizzed, respond with EXACTLY this format — one short intro line BEFORE the block, nothing after:
[QUIZ_START]
Q: question text | A: answer text
Q: question text | A: answer text
[QUIZ_END]
Generate exactly 5 Q/A pairs.
CRITICAL — quiz content rules:
- Questions MUST come from the student's actual courses, assignments, syllabus, and modules listed in your context above. NEVER generic trivia (no "capital of France", no general knowledge).
- If the student names a course, quiz only on that course's material.
- If no course is specified, quiz on the course with the nearest upcoming deadline.
- If you have no course content in context at all, do NOT generate a quiz. Instead reply: "I need your Canvas synced to quiz you on real material — head to the Canvas page to connect."

VOICE CONTROL: When the student asks you to change how you sound or perform a voice action, include ONE hidden tag at the very end of your reply (stripped before display):
  [VOICE:<exactName>]  when they ask for a different voice — pick the BEST match from available voices below by scoring accent, gender, age, descriptive labels. Confirm in speech which voice and why.
  [SPEED:<0.7-1.3>]    when they ask to speak faster/slower (slower≈0.8, faster≈1.2)
  [TONE:<calm|energetic|neutral|serious>]  when they ask for a mood/persona
  [READ:assignments]   when they ask you to read their assignments or what's due
  [QUIZ:<course>]      when they ask to be quizzed out loud (course optional)
If no strong match exists, ask ONE short clarifying question instead of guessing.
Still reply naturally in words too (e.g. 'Switching to Daniel — a British broadcaster.'). Only ONE tag per reply.
${voicesForContext.length > 0
  ? `Available voices (name [accent/gender/age/style]):\n${voicesForContext.slice(0,8).map(v => {
      const lbls = Object.values(v.labels ?? {}).filter(Boolean).join("/");
      return `- ${v.name}${lbls ? ` [${lbls}]` : ""}`;
    }).join("\n")}`
  : ""}

STRESS SUPPORT: If the student says they're stressed, overwhelmed, or anxious: respond calmly and warmly FIRST (1-2 sentences of genuine acknowledgment, no toxic positivity), THEN offer ONE small concrete next step based on their actual workload — the single easiest or most urgent item, framed as "just this one thing for now". Never dump their full list when they're stressed. Keep it under 4 sentences. If they express serious distress beyond schoolwork, gently suggest they talk to someone they trust or their campus support services.

PLAN REQUESTS: When the student asks what to do / to plan their day / what's next, respond with a SHORT ranked list in this exact format (max 3 items):
1. **[item]** — [one short reason]
2. **[item]** — [one short reason]
3. **[item]** — [one short reason]
Rank by: overdue first, then nearest deadline, then highest points_possible. End with: "Start with #1?"

RESPONSE STYLE — CRITICAL:
- Keep responses SHORT. 2–4 sentences for most answers. Max 6 sentences unless the student explicitly asks for detail.
- One thing at a time. If multiple assignments are urgent, name the TOP ONE only, then ask if they want the rest.
- Talk like a sharp friend who knows their stuff, not a computer generating a report.
- Use **bold** sparingly — only for assignment names and key dates.
- End with a question or next action when natural, not always.
- Never dump lists of more than 3 items. Summarize and offer to expand.
- You are the brain of this app. You can navigate, quiz, plan their day. Act like it.

RULES:
- Be human and conversational. Max 2 sentences for casual questions, more only when asked.
- NEVER read out course codes (e.g. GGRC25H3, MDSB11H3) — use the course name only.
- NEVER dump assignments, deadlines, or course lists unless the student directly asks.
- NEVER mention GPA/streak/stats unless directly asked.
- If asked something personal (name, age, city) — answer from STUDENT DATA or say you don't have it. Do not pivot to courses.
- Match the student's energy — casual when they're casual, focused when they need help.
- Use the living mind doc to inform your tone — you know this student well.
- ${isFirstMessage ? "FIRST MESSAGE RULE: Greet them warmly by name in one short sentence only. No assignments, no stats, no courses." : "Only mention assignments or deadlines if directly relevant to what they asked."}`; 
}

function parseNav(raw) {
  const tagMatch = raw.match(NAV_REGEX);
  if (tagMatch) {
    try {
      const cmd  = JSON.parse(tagMatch[1].trim());
      const text = raw.replace(NAV_REGEX, "").replace(NAV_STRIP_REGEX, "").trim();
      return { cmd, text };
    } catch {}
  }
  const bareMatch = raw.match(/(\{[^{}]*"page"\s*:[^{}]*\})\s*$/);
  if (bareMatch) {
    try {
      const cmd = JSON.parse(bareMatch[1]);
      if (cmd.page) return { cmd, text: raw.slice(0, raw.lastIndexOf(bareMatch[1])).replace(NAV_STRIP_REGEX, "").trim() };
    } catch {}
  }
  return { cmd: null, text: raw.replace(NAV_STRIP_REGEX, "").trim() };
}

// ── Tone presets — map intent tag values to ElevenLabs voice_settings ───────
const TONE_PRESETS = {
  calm:      { stability: 0.8, similarity_boost: 0.75, style: 0.1 },
  energetic: { stability: 0.3, similarity_boost: 0.8,  style: 0.6 },
  neutral:   { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
  serious:   { stability: 0.7, similarity_boost: 0.7,  style: 0.2 },
};

// ── Voice intent tag parser ──────────────────────────────────────────────────
// Extracts [VOICE:x], [SPEED:x], [TONE:x], [READ:x], [QUIZ:x] from Claude reply
function parseVoiceTags(raw) {
  const tags = {};
  let cleaned = raw;
  const re = /\[(VOICE|SPEED|TONE|READ|QUIZ):?([^\]]*)\]/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    tags[m[1].toUpperCase()] = m[2].trim();
    cleaned = cleaned.replace(m[0], "");
  }
  return { tags, cleaned: cleaned.trim() };
}

// ── ElevenLabs TTS ─────────────────────────────────────────────────────────
// AudioContext bypasses iOS Safari autoplay restrictions.
let _audioCtx = null;
function getAudioContext() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

// Sanitize text before sending to TTS.
// Course codes like "GGRC25H3 F LEC01" sound terrible when read aloud.
// We strip them and replace with a natural phrase where possible.
function sanitizeForTTS(text) {
  return text
    // Remove raw Canvas course codes: e.g. GGRC25H3, VPAC16H3, MDSB11H3
    .replace(/\b[A-Z]{2,6}\d{2,4}[A-Z0-9]*\s*(F|W|S)?\s*(LEC|TUT|PRA|LAB)\d{2,3}\b/g, "that course")
    // Remove section labels like "LEC01", "TUT02"
    .replace(/\b(LEC|TUT|PRA|LAB)\d{2,3}\b/gi, "")
    // Clean up multiple spaces
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Returns { duration: seconds, play: fn }
// Caller decodes audio first, gets duration, then starts typewriter, then plays.
async function fetchAndDecodeAudio(text, voiceId, speed = 1.0, voiceSettings) {
  const body = {
    text: sanitizeForTTS(text),
    ...(voiceId ? { voiceId } : {}),
    ...(speed !== 1.0 ? { speed } : {}),
    ...(voiceSettings ? { voiceSettings } : {}),
  };
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}`);
  const { audio } = await res.json();
  if (!audio) throw new Error("No audio returned");
  const binaryStr = atob(audio);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const ctx = getAudioContext();
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch (_) {} }
  const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
  const effectiveDuration = audioBuffer.duration / Math.max(speed, 0.1);
  return {
    duration: effectiveDuration,
    play: (onSourceCreated) => new Promise((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = speed; // client-side speed fallback
      source.connect(ctx.destination);
      source.onended = resolve;
      onSourceCreated?.(source);
      source.start(0);
    }),
  };
}

// ── Situation-aware opening greeting ─────────────────────────────────────────
function buildSituationGreeting(assignments, courses, userData) {
  const now   = new Date();
  const hour  = now.getHours();
  const name  = userData?.name?.split(" ")[0] || "there";
  const timeTone = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "latenight";

  const overdue = (assignments || []).filter(a => a.dueAt && new Date(a.dueAt) < now && !a.submission?.submittedAt);
  const due24h  = (assignments || []).filter(a => {
    if (!a.dueAt || a.submission?.submittedAt) return false;
    const diff = new Date(a.dueAt) - now;
    return diff > 0 && diff < 86400000;
  });
  const due48h  = (assignments || []).filter(a => {
    if (!a.dueAt || a.submission?.submittedAt) return false;
    const diff = new Date(a.dueAt) - now;
    return diff > 0 && diff < 172800000;
  });
  const streak = userData?.streak || 0;

  let situation = "neutral";
  if (overdue.length > 0)       situation = "overdue";
  else if (due24h.length > 0)   situation = "urgent";
  else if (due48h.length > 0)   situation = "upcoming";
  else if (streak >= 7)         situation = "streak";
  else if (timeTone === "latenight") situation = "latenight";

  const greetings = {
    overdue: [
      `${name}, you've got ${overdue.length} overdue assignment${overdue.length > 1 ? "s" : ""}. Let's deal with that first.`,
      `Before anything else — ${overdue[0].name || "an assignment"} is past due. Want to tackle it now?`,
    ],
    urgent: [
      `${due24h[0].name || "An assignment"} is due in under 24 hours. How far along are you?`,
      `Tight window — ${due24h.length} assignment${due24h.length > 1 ? "s" : ""} due today. Let's prioritize.`,
    ],
    upcoming: [
      `You've got ${due48h.length} thing${due48h.length > 1 ? "s" : ""} due in the next 48 hours. Good time to get ahead.`,
      `${due48h[0].name || "Something"} is coming up. Want to break it down together?`,
    ],
    streak: [
      `${streak} days in a row — that's real momentum, ${name}. What are we working on today?`,
      `${streak}-day streak. Let's keep it going. What's on your plate?`,
    ],
    latenight: [
      `Still at it, ${name}? What do you need right now?`,
      `Late night session. I'm here — what are we solving?`,
    ],
    neutral: [
      `What are we working on${timeTone === "morning" ? " this morning" : timeTone === "evening" ? " tonight" : " today"}, ${name}?`,
      `Good ${timeTone === "morning" ? "morning" : timeTone === "afternoon" ? "afternoon" : "evening"}, ${name}. What do you need?`,
    ],
  };

  const opts = greetings[situation];
  return opts[Math.floor(Math.random() * opts.length)];
}

// ── Dynamic smart chips ───────────────────────────────────────────────────────
function buildSmartChips(assignments, courses, userData) {
  const now   = new Date();
  const chips = [];

  const overdue = (assignments || []).filter(a => a.dueAt && new Date(a.dueAt) < now && !a.submission?.submittedAt);
  if (overdue.length > 0) {
    chips.push({
      label:   `Fix ${overdue.length} overdue`,
      message: `I have ${overdue.length} overdue assignment${overdue.length > 1 ? "s" : ""}. Help me prioritize and make a plan.`,
    });
  }

  const dueSoon = (assignments || []).filter(a => {
    if (!a.dueAt || a.submission?.submittedAt) return false;
    const diff = new Date(a.dueAt) - now;
    return diff > 0 && diff < 172800000;
  });
  if (dueSoon.length > 0) {
    chips.push({
      label:   (`Due soon: ${dueSoon[0].name || "assignment"}`).slice(0, 28),
      message: `Tell me about my most urgent upcoming assignment and help me make a plan.`,
    });
  }

  if ((courses || []).length > 0) {
    const c = courses[Math.floor(Math.random() * courses.length)];
    chips.push({
      label:   `Quiz me on ${(c.name || c.courseCode || "my courses").split(" ")[0]}`,
      message: `Quiz me on ${c.name || c.courseCode}. Ask me 5 questions to test my understanding.`,
    });
  } else {
    chips.push({ label: "Connect Canvas", message: "How do I connect my Canvas account?" });
  }

  if ((userData?.streak || 0) >= 3) {
    chips.push({
      label:   `${userData.streak}🔥 Keep streak`,
      message: "What should I study today to keep my streak going?",
    });
  }

  const hour = now.getHours();
  chips.push(hour >= 18
    ? { label: "Review today's work",  message: "Give me a quick summary of what I should have done today and what's still pending." }
    : { label: "Plan my day",          message: "Help me plan my study schedule for today based on my assignments and deadlines." }
  );

  chips.push({ label: "I'm stressed",   message: "I'm feeling stressed about my workload." });
  chips.push({ label: "How's my GPA?",  message: "What's my current GPA and grade breakdown?" });
  chips.push({ label: "Open toolkit",   message: "Open toolkit" });

  return chips.slice(0, 4);
}

// ── Artifact type detection ────────────────────────────────────────────────────
function detectArtifactType(msg) {
  const t = (msg || "").toLowerCase();
  if (/quiz\s+me|test\s+me|exam\s+me|drill\s+me|give\s+me\s+a\s+quiz/i.test(t)) return "quiz";
  if (/flashcard|flash\s+card/i.test(t))                                         return "flashcard";
  if (/study\s+plan|schedule\s+me|planner|timetable|plan\s+my/i.test(t))        return "plan";
  if (/diagram|flowchart|mind\s+map/i.test(t))                                   return "diagram";
  if (/dashboard/i.test(t))                                                       return "dashboard";
  if (/chart|graph|plot|histogram|scatter|visuali/i.test(t))                     return "chart";
  if (/game|snake|puzzle/i.test(t))                                               return "game";
  if (/timer|pomodoro|countdown/i.test(t))                                        return "timer";
  if (/tracker|kanban|todo/i.test(t))                                             return "tracker";
  if (/calculator/i.test(t))                                                       return "calculator";
  return "viz";
}

const ARTIFACT_LABELS = {
  quiz:       { button: "Start Quiz →",       header: "Quiz"        },
  flashcard:  { button: "Open Flashcards →",  header: "Flashcards"  },
  plan:       { button: "View Plan →",        header: "Study Plan"  },
  diagram:    { button: "View Diagram →",     header: "Diagram"     },
  dashboard:  { button: "View Dashboard →",   header: "Dashboard"   },
  chart:      { button: "View Chart →",       header: "Chart"       },
  game:       { button: "Play →",             header: "Game"        },
  timer:      { button: "Open →",             header: "Tool"        },
  tracker:    { button: "Open →",             header: "Tracker"     },
  calculator: { button: "Open →",             header: "Calculator"  },
  viz:        { button: "Open →",             header: "Visualization"},
};

// ── Inline quiz component (renders inside chat when Claude returns quiz format) ─
function InlineQuiz({ cards, userId, courseId }) {
  const [idx,     setIdx]     = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState([]);
  const [done,    setDone]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const card = cards[idx];

  function judge(correct) {
    const next = [...results, correct];
    setResults(next);
    setFlipped(false);
    if (idx + 1 >= cards.length) {
      setDone(true);
      const score = next.filter(Boolean).length;
      const total = cards.length;
      awardTokens("quiz_completed", { score, total }).catch(() => {});
      if (score === total) awardTokens("quiz_perfect", { score, total }).catch(() => {});
    } else {
      setIdx(i => i + 1);
    }
  }

  async function saveCards() {
    setSaving(true);
    try {
      await supabase.from("flashcards").upsert(
        {
          user_id:      userId,
          course_id:    courseId ?? null,
          cards:        cards.map(c => ({ question: c.q, answer: c.a })),
          generated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,course_id" }
      );
      setSaved(true);
    } catch { /* non-fatal */ }
    setSaving(false);
  }

  const wrap = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(196,154,60,0.35)",
    borderRadius: "14px",
    padding: "16px",
    marginTop: "8px",
  };

  if (done) {
    const correct = results.filter(Boolean).length;
    return (
      <div style={wrap}>
        <p style={{ color: "var(--text-primary)", fontSize: "15px", fontWeight: "600", marginBottom: "8px" }}>
          {correct}/{cards.length} correct
        </p>
        <div style={{ display: "flex", gap: "5px", marginBottom: "12px" }}>
          {results.map((r, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: r ? "rgba(52,199,89,0.85)" : "rgba(255,59,48,0.7)" }} />
          ))}
        </div>
        {!saved
          ? <button onClick={saveCards} disabled={saving}
              style={{ background: "rgba(196,154,60,0.12)", border: "1px solid rgba(196,154,60,0.28)", borderRadius: "8px", padding: "7px 14px", color: "#C49A3C", fontSize: "12px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}>
              {saving ? "Saving…" : "Save to flashcards"}
            </button>
          : <p style={{ color: "#C49A3C", fontSize: "12px" }}>✓ Saved to flashcards</p>
        }
      </div>
    );
  }

  return (
    <div style={wrap}>
      <p style={{ color: "rgba(196,154,60,0.55)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>
        {idx + 1} / {cards.length}
      </p>
      <div style={{ minHeight: "58px", marginBottom: "12px" }}>
        {!flipped ? (
          <>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Question</p>
            <p style={{ color: "var(--text-primary)", fontSize: "14px", lineHeight: "1.6", fontFamily: "'Fraunces',Georgia,serif" }}>{card.q}</p>
          </>
        ) : (
          <>
            <p style={{ color: "rgba(196,154,60,0.55)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>Answer</p>
            <p style={{ color: "var(--text-primary)", fontSize: "14px", lineHeight: "1.6" }}>{card.a}</p>
          </>
        )}
      </div>
      {!flipped
        ? <button onClick={() => setFlipped(true)}
            style={{ width: "100%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "8px", padding: "9px", color: "var(--text-primary)", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
            Reveal answer
          </button>
        : <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => judge(false)}
              style={{ flex: 1, background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.22)", borderRadius: "8px", padding: "9px", color: "rgba(255,85,75,0.9)", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}>
              Missed
            </button>
            <button onClick={() => judge(true)}
              style={{ flex: 1, background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.22)", borderRadius: "8px", padding: "9px", color: "rgba(72,210,110,0.9)", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit" }}>
              Got it
            </button>
          </div>
      }
    </div>
  );
}

const SIZE           = 68;
const RADIUS         = 24;
const VOICE_SIZE     = 156;  // larger sphere for centered voice-mode hero
const VOICE_RADIUS   = 54;
const N              = 28;
const EDGE_THRESHOLD = 0.72;

function fibonacciSphere(n) {
  const pts = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = phi * i;
    pts.push({ x: r * Math.cos(t), y, z: r * Math.sin(t) });
  }
  return pts;
}

const NODES = fibonacciSphere(N);

// Safe-area bottom offset — accounts for iOS home indicator + browser toolbar
function safeBottom() {
  // env(safe-area-inset-bottom) isn't readable from JS directly,
  // so we use a sentinel div approach, or fall back to a generous 90px.
  try {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;bottom:env(safe-area-inset-bottom,0px);height:0;visibility:hidden";
    document.body.appendChild(el);
    const rect = el.getBoundingClientRect();
    document.body.removeChild(el);
    const inset = window.innerHeight - rect.bottom;
    return Math.max(inset, 0) + 80; // 80px above toolbar
  } catch {
    return 90;
  }
}

function defaultPos() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  return { top: H - SIZE - safeBottom(), left: W - SIZE - 22 };
}

function clamp(pos) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  return {
    top:  Math.max(56, Math.min(H - SIZE - safeBottom(), pos.top)),
    left: Math.max(8,  Math.min(W - SIZE - 8, pos.left)),
  };
}

// Premium voice toggle — pill button with animated waveform (unmuted) or slash (muted)
const VoiceToggle = ({ muted, onClick, speaking }) => (
  <button
    onClick={onClick}
    title={muted ? "Voice off — tap to enable" : "Voice on — tap to mute"}
    style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 12px",
      borderRadius: "20px",
      border: `1px solid ${muted ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.16)"}`,
      background: muted
        ? "rgba(255,255,255,0.04)"
        : speaking
          ? "rgba(255,255,255,0.14)"
          : "rgba(255,255,255,0.08)",
      cursor: "pointer",
      flexShrink: 0,
      transition: "all 0.2s ease",
      outline: "none",
      WebkitTapHighlightColor: "transparent",
    }}
  >
    {/* Animated bars or muted icon */}
    {muted ? (
      // Muted — static crossed mic
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.2" strokeLinecap="round">
        <line x1="2" y1="2" x2="22" y2="22"/>
        <path d="M18.89 13.23A7 7 0 0 0 19 12v-2"/>
        <path d="M5 10v2a7 7 0 0 0 11.9 5.1"/>
        <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    ) : (
      // Unmuted — waveform bars (animate when speaking)
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    )}
    <span style={{
      fontSize: "10px",
      fontWeight: "500",
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      color: muted ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.7)",
      fontFamily: "var(--font-sans)",
    }}>
      {speaking ? "Live" : muted ? "Off" : "Voice"}
    </span>
  </button>
);

export default function NeuralRing() {
  const { userData, updateUserField, courses, assignments, setPendingNav, setStudyConfig, userId, flashcardMap, syllabus } = useApp();

  const courseOptions = courses.length
    ? courses.map(c => `${c.courseCode} — ${c.name}`)
    : [];

  // ── Tutor impressions + living mind — loaded once on mount ─────────────────
  const [impressions,  setImpressions]  = useState([]);
  const abortCtrlRef   = useRef(null);   // cancel in-flight fetch
  const audioSourceRef = useRef(null);   // cancel in-flight audio
  const [lastSession,  setLastSession]  = useState(null);
  const [livingMind,   setLivingMind]   = useState(null);


  // ── Session tracking — for session-close payload + self-write trigger ───────
  const sessionStartedAt  = useRef(null);
  const exchangeCountRef  = useRef(0); // increments each AI response

  // Refs — always hold latest prefs without stale closure in speakAndType
  const voiceIdRef     = useRef(userData?.preferred_voice_id ?? null);
  const speedRef       = useRef(userData?.preferred_speed ?? 1.0);
  const toneRef        = useRef(userData?.preferred_tone  ?? "neutral");

  // Voice mode state
  const [voiceMode,        setVoiceMode]        = useState(false);
  const [isRecording,      setIsRecording]      = useState(false);
  const [micDenied,        setMicDenied]        = useState(false);
  const [availableVoices,  setAvailableVoices]  = useState([]);
  const mediaRecorderRef   = useRef(null);
  const audioChunksRef     = useRef([]);
  // Voice mode — auto-listen engine
  const voiceCanvasRef     = useRef(null);   // larger centered sphere in voice mode
  const voiceRafRef        = useRef(null);   // RAF for voice canvas
  const analyserRef        = useRef(null);   // WebAudio AnalyserNode
  const micStreamRef       = useRef(null);   // mic MediaStream (kept open during listen)
  const silenceRafRef      = useRef(null);   // RAF for silence detection tick
  const silenceTimerRef    = useRef(null);   // setTimeout for auto-stop
  const speechDetectedRef  = useRef(false);  // has speech started this utterance?
  const voiceRmsRef        = useRef(0);      // current RMS level 0–1 (no re-render)
  const voiceModeRef       = useRef(false);  // mirrors voiceMode state for async closures
  const speakingRef        = useRef(false);  // mirrors speaking state for RAF barge-in

  const canvasRef      = useRef(null);
  const rafRef         = useRef(null);
  const rotRef         = useRef(0);
  const sphereStateRef = useRef("idle");    // "idle"|"thinking"|"speaking"
  const rotSpeedRef    = useRef(0.004);     // lerped rotation speed
  const colorMixRef    = useRef(0);         // 0=white → 1=gold, lerped
  const pulseSineRef   = useRef(0);         // for speaking radius pulse

  const [pos, setPos]           = useState(defaultPos);
  const [isDragging, setIsDrag] = useState(false);
  const dragStartRef            = useRef(null);
  const hasDraggedRef           = useRef(false);

  const [chatOpen, setChatOpen] = useState(false);

  const [ringName,       setRingName]       = useState("");
  const [editingName,    setEditingName]    = useState(false);
  const [ringNameInput,  setRingNameInput]  = useState("");
  const ringNameInputRef                    = useRef(null);

  const [messages,   setMessages]   = useState([]);
  const [smartChips, setSmartChips] = useState([
    { label: "What's due soon?",  message: "What assignments do I have due soon?" },
    { label: "Take me to study",  message: "Take me to study" },
    { label: "How's my GPA?",     message: "What's my current GPA and grade breakdown?" },
    { label: "Open toolkit",      message: "Open toolkit" },
  ]);
  const historyLoadedRef = useRef(false); // guard: only load history once per mount
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  // Thumbs reaction state — tracks per-message reactions + reason picker
  const [reactions,    setReactions]    = useState({});   // { msgIndex: "up"|"down" }
  const [reasonPicker, setReasonPicker] = useState(null); // msgIndex | null
  const messagesEndRef          = useRef(null);

  const [muted,        setMuted]        = useState(() => {
    try { return localStorage.getItem("fschool_muted") === "1"; } catch { return false; }
  });
  const [speaking,     setSpeaking]     = useState(false);
  const [streamingMsg, setStreamingMsg] = useState("");
  const typeTimerRef = useRef(null);

  // ── Visualization artifact state ────────────────────────────────────────────
  const [artifactCode, setArtifactCode] = useState(null);
  const [artifactType, setArtifactType] = useState("viz"); // tracks latest artifact type for panel header
  const [artifactOpen, setArtifactOpen] = useState(false);

  // ── Stop button — cancels in-flight fetch + audio ───────────────────────────
  const stopResponse = useCallback(() => {
    // Cancel in-flight fetch
    abortCtrlRef.current?.abort();
    abortCtrlRef.current = null;
    // Stop audio playback
    try { audioSourceRef.current?.stop(); } catch (_) {}
    audioSourceRef.current = null;
    // Stop typewriter
    if (typeTimerRef.current) { clearInterval(typeTimerRef.current); typeTimerRef.current = null; }
    setSpeaking(false);
    setLoading(false);
    setStreamingMsg("");
  }, []);

  const sheetStartY             = useRef(null);
  const [sheetDragY, setSheetDragY] = useState(0);

  useEffect(() => {
    const name = userData?.ring_name ?? "";
    setRingName(name);
    setRingNameInput(name);
  }, [userData?.ring_name]);

  // Keep preference + mode refs current
  useEffect(() => { voiceIdRef.current   = userData?.preferred_voice_id ?? null;      }, [userData?.preferred_voice_id]);
  useEffect(() => { speedRef.current     = userData?.preferred_speed    ?? 1.0;       }, [userData?.preferred_speed]);
  useEffect(() => { toneRef.current      = userData?.preferred_tone     ?? "neutral"; }, [userData?.preferred_tone]);
  useEffect(() => { voiceModeRef.current = voiceMode;  }, [voiceMode]);
  useEffect(() => { speakingRef.current  = speaking;   }, [speaking]);

  // Fetch voice list once — needed for Claude context + [VOICE:x] tag resolution
  useEffect(() => {
    fetch("/api/tts?action=voices")
      .then(r => r.ok ? r.json() : [])
      .then(vs => setAvailableVoices(vs ?? []))
      .catch(() => {});
  }, []);

  // ── Load impressions + last session from Supabase on mount ──────────────────
  useEffect(() => {
    if (!userId) return;
    async function loadMemory() {
      try {
        // Load last 10 impressions
        const { data: impData } = await supabase
          .from("tutor_impressions")
          .select("impression, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10);
        if (impData?.length) setImpressions(impData);

        // Load last session summary from chat_logs (last assistant message from a different day)
        const { data: logData } = await supabase
          .from("chat_logs")
          .select("content, created_at")
          .eq("user_id", userId)
          .eq("role", "assistant")
          .order("created_at", { ascending: false })
          .limit(1);
        if (logData?.[0]) {
          const daysAgo = Math.round((Date.now() - new Date(logData[0].created_at)) / 86400000);
          if (daysAgo >= 1) {
            setLastSession(`${daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`} — "${logData[0].content.slice(0, 80)}..."`);
          }
        }

        // Load living mind doc
        const { data: mindData } = await supabase
          .from("tutor_mind")
          .select("mind_doc")
          .eq("user_id", userId)
          .maybeSingle();
        if (mindData?.mind_doc) setLivingMind(mindData.mind_doc);

      } catch { /* non-fatal */ }
    }
    loadMemory();
  }, [userId]);

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m;
      try { localStorage.setItem("fschool_muted", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  // ── Inject keyframes once ──────────────────────────────────────────────────
  useEffect(() => {
    if (document.querySelector("[data-neuralring-style]")) return;
    const style = document.createElement("style");
    style.dataset.neuralringStyle = "1";
    style.textContent = `
      @keyframes neuralPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.10), 0 6px 28px rgba(0,0,0,0.5); }
        50%       { box-shadow: 0 0 0 9px rgba(255,255,255,0.03), 0 0 0 1px rgba(255,255,255,0.12), 0 6px 28px rgba(0,0,0,0.5); }
      }
      .nr-idle { animation: neuralPulse 4s ease-in-out infinite; }
      @keyframes neuralSpeak {
        0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.14), 0 0 0 1px rgba(255,255,255,0.18), 0 6px 28px rgba(0,0,0,0.5); }
        50%       { box-shadow: 0 0 0 14px rgba(255,255,255,0.05), 0 0 0 1px rgba(255,255,255,0.22), 0 6px 28px rgba(0,0,0,0.5); }
      }
      .nr-speaking { animation: neuralSpeak 0.8s ease-in-out infinite; }
      @keyframes blink { 0%, 100% { opacity: 0.4; } 50% { opacity: 0; } }
      @keyframes nrVoiceIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
      @keyframes nrVoicePulse { 0%,100%{opacity:0.35;transform:scale(1)} 50%{opacity:0.55;transform:scale(1.03)} }

      /* ── Message entrance + thinking dots ── */
      @media (prefers-reduced-motion: no-preference) {
        @keyframes nrMsgIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes nrBorderPulse {
          0%   { box-shadow: 0 0 0 1px rgba(196,154,60,0.55); }
          100% { box-shadow: 0 0 0 1px rgba(196,154,60,0); }
        }
        @keyframes nrDot {
          0%, 60%, 100% { transform: scale(0.75); opacity: 0.35; }
          30%            { transform: scale(1.15); opacity: 1; }
        }
        .nr-msg-in  { animation: nrMsgIn 0.24s cubic-bezier(0.22,1,0.36,1) both; }
        .nr-msg-new { animation: nrBorderPulse 1.2s ease-out both; }
        .nr-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #C49A3C; }
        .nr-dot:nth-child(1) { animation: nrDot 0.9s ease-in-out infinite 0s; }
        .nr-dot:nth-child(2) { animation: nrDot 0.9s ease-in-out infinite 0.15s; }
        .nr-dot:nth-child(3) { animation: nrDot 0.9s ease-in-out infinite 0.30s; }
      }
      .nr-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #C49A3C; }

      /* ── Markdown styles ── */
      .nr-md p            { margin: 0 0 6px; }
      .nr-md p:last-child  { margin: 0; }
      .nr-md strong        { color: #C49A3C; font-weight: 600; }
      .nr-md ul            { margin: 4px 0; padding-left: 18px; }
      .nr-md li            { margin: 3px 0; }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // ── Sphere state sync — updates ref so draw loop reads it without re-render ──
  useEffect(() => {
    sphereStateRef.current = loading ? "thinking" : speaking ? "speaking" : "idle";
  }, [loading, speaking]);

  // ── Canvas animation (state-reactive) ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const draw = () => {
      const state = sphereStateRef.current;

      // Target rotation speed per state
      const targetSpeed = state === "thinking" ? 0.010 : state === "speaking" ? 0.006 : 0.004;
      // Target color mix: 0=white, 1=gold #C49A3C=rgb(196,154,60)
      const targetMix   = state === "thinking" || state === "speaking" ? 1 : 0;

      // Lerp smoothly toward targets
      rotSpeedRef.current += (targetSpeed - rotSpeedRef.current) * 0.04;
      colorMixRef.current += (targetMix   - colorMixRef.current) * 0.04;

      ctx.clearRect(0, 0, SIZE, SIZE);
      rotRef.current += rotSpeedRef.current;

      // Radius pulse for speaking state (±6% on sine wave)
      pulseSineRef.current += 0.08;
      const pulse = state === "speaking" ? Math.sin(pulseSineRef.current) * 0.06 : 0;
      const R = RADIUS * (1 + pulse);

      const rot = rotRef.current;
      const mix = colorMixRef.current;

      // Interpolate RGB: white(255,255,255) → gold(196,154,60)
      const cr = Math.round(255 + (196 - 255) * mix);
      const cg = Math.round(255 + (154 - 255) * mix);
      const cb = Math.round(255 + (60  - 255) * mix);

      const projected = NODES.map(({ x, y, z }) => {
        const rx = x * Math.cos(rot) + z * Math.sin(rot);
        const rz = -x * Math.sin(rot) + z * Math.cos(rot);
        return { sx: rx * R + SIZE / 2, sy: y * R + SIZE / 2, sz: rz, depth: (rz + 1) * 0.5 };
      });

      ctx.lineWidth = 0.7;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const ri = projected[i], rj = projected[j];
          const da = { x: ri.sx - rj.sx, y: ri.sy - rj.sy, z: ri.sz - rj.sz };
          const d3 = Math.sqrt(da.x * da.x + da.y * da.y + da.z * da.z);
          if (d3 < RADIUS * 2 * EDGE_THRESHOLD) {
            const alpha = 0.05 + (ri.depth + rj.depth) * 0.07;
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(2)})`;
            ctx.beginPath(); ctx.moveTo(ri.sx, ri.sy); ctx.lineTo(rj.sx, rj.sy); ctx.stroke();
          }
        }
      }
      for (const { sx, sy, depth } of projected) {
        ctx.beginPath();
        ctx.arc(sx, sy, 0.9 + depth * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${(0.5 + depth * 0.4).toFixed(2)})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Voice canvas: DPR-scaled sphere with depth rendering + glow ─────────────
  useEffect(() => {
    if (!voiceMode) { cancelAnimationFrame(voiceRafRef.current); return; }
    const canvas = voiceCanvasRef.current;
    if (!canvas) return;

    // DPR scaling — sharpest single fix for blurry canvas on retina/HiDPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(VOICE_SIZE * dpr);
    canvas.height = Math.round(VOICE_SIZE * dpr);
    canvas.style.width  = VOICE_SIZE + "px";
    canvas.style.height = VOICE_SIZE + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;

    const cx = VOICE_SIZE / 2;
    const cy = VOICE_SIZE / 2;

    const drawVoice = () => {
      ctx.clearRect(0, 0, VOICE_SIZE, VOICE_SIZE);
      const rot  = rotRef.current;
      const mix  = colorMixRef.current;
      const cr   = Math.round(255 + (196 - 255) * mix);
      const cg   = Math.round(255 + (154 - 255) * mix);
      const cb   = Math.round(255 + (60  - 255) * mix);
      const pulse = sphereStateRef.current === "speaking"
        ? Math.sin(pulseSineRef.current) * 0.06 : 0;
      const R    = VOICE_RADIUS * (1 + pulse);

      // Radial gradient body — warm depth glow at sphere center
      const grad = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 1.4);
      grad.addColorStop(0,   `rgba(${cr},${cg},${cb},0.08)`);
      grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.03)`);
      grad.addColorStop(1,   "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.4, 0, Math.PI * 2);
      ctx.fill();

      const projected = NODES.map(({ x, y, z }) => {
        const rx = x * Math.cos(rot) + z * Math.sin(rot);
        const rz = -x * Math.sin(rot) + z * Math.cos(rot);
        return { sx: rx * R + cx, sy: y * R + cy, sz: rz, depth: (rz + 1) * 0.5 };
      });

      // Neural connections — depth-aware alpha
      ctx.shadowBlur = 0;
      ctx.lineWidth = 0.9;
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const ri = projected[i], rj = projected[j];
          const da = { x: ri.sx - rj.sx, y: ri.sy - rj.sy, z: ri.sz - rj.sz };
          const d3 = Math.sqrt(da.x*da.x + da.y*da.y + da.z*da.z);
          if (d3 < VOICE_RADIUS * 2 * EDGE_THRESHOLD) {
            const alpha = 0.04 + Math.min(ri.depth, rj.depth) * 0.12;
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(2)})`;
            ctx.beginPath(); ctx.moveTo(ri.sx, ri.sy); ctx.lineTo(rj.sx, rj.sy); ctx.stroke();
          }
        }
      }

      // Points — depth-sorted (painter's algorithm) with glow on foreground nodes
      const sorted = [...projected].sort((a, b) => a.sz - b.sz);
      for (const { sx, sy, depth } of sorted) {
        const r = 1.2 + depth * 1.5;
        const alpha = 0.3 + depth * 0.6;
        if (depth > 0.55) {
          ctx.shadowBlur  = 5 + depth * 8;
          ctx.shadowColor = `rgba(${cr},${cg},${cb},0.55)`;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(2)})`;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Soft halo ring — always present, very faint
      ctx.beginPath();
      ctx.arc(cx, cy, R + 14, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.04)`;
      ctx.lineWidth = 10;
      ctx.stroke();

      // Gold RMS rim — reacts to live mic input
      const rms = voiceRmsRef.current;
      if (rms > 0.04) {
        ctx.beginPath();
        ctx.arc(cx, cy, R + 5 + rms * 8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(196,154,60,${Math.min(rms * 0.9, 0.6).toFixed(2)})`;
        ctx.lineWidth = 1.5 + rms * 2;
        ctx.stroke();
      }

      voiceRafRef.current = requestAnimationFrame(drawVoice);
    };
    drawVoice();
    return () => cancelAnimationFrame(voiceRafRef.current);
  }, [voiceMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const commitRingName = useCallback(async () => {
    setEditingName(false);
    const trimmed = ringNameInput.trim();
    setRingName(trimmed);
    await updateUserField("ring_name", trimmed);
  }, [ringNameInput, updateUserField]);

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    document.body.dataset.ringDrag = "1";
    dragStartRef.current  = { px: pos.left, py: pos.top, mx: e.clientX, my: e.clientY };
    hasDraggedRef.current = false;
    setIsDrag(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pos]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.mx;
    const dy = e.clientY - dragStartRef.current.my;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasDraggedRef.current = true;
    setPos({ top: dragStartRef.current.py + dy, left: dragStartRef.current.px + dx });
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    delete document.body.dataset.ringDrag;
    setIsDrag(false);
    if (hasDraggedRef.current) {
      setPos(p => clamp(p));
    } else {
      setChatOpen(o => !o);
      setEditingName(false);
    }
  }, [isDragging]);

  // ── Sheet swipe-to-close ────────────────────────────────────────────────────
  const handleSheetHandleTouchStart = useCallback((e) => {
    sheetStartY.current = e.touches[0].clientY;
    setSheetDragY(0);
  }, []);

  const handleSheetHandleTouchMove = useCallback((e) => {
    if (sheetStartY.current === null) return;
    const dy = e.touches[0].clientY - sheetStartY.current;
    if (dy > 0) { e.preventDefault(); setSheetDragY(dy); }
  }, []);

  const handleSheetHandleTouchEnd = useCallback(() => {
    const dy = sheetDragY;
    sheetStartY.current = null;
    setSheetDragY(0);
    if (dy > 80) { setChatOpen(false); setEditingName(false); }
  }, [sheetDragY]);

  // ── Session close queue — fires living mind rewrite when chat closes ────────
  const prevChatOpenClose = useRef(false);
  // Keep a ref to messages so beforeunload can read the latest value
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    const wasOpen = prevChatOpenClose.current;
    prevChatOpenClose.current = chatOpen;
    if (chatOpen && !wasOpen) {
      // Chat just opened — record session start time
      if (!sessionStartedAt.current) sessionStartedAt.current = new Date().toISOString();
    }
    // Chat just closed — fire session-close queue (lowered threshold: 1+ real messages)
    if (wasOpen && !chatOpen && userId && messages.length >= 1) {
      fetch("/api/session-close", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          sessionMessages: messages,
          sessionStartedAt: sessionStartedAt.current,
        }),
      }).catch(() => {});
      // Reset for next session
      sessionStartedAt.current  = null;
      exchangeCountRef.current  = 0;
    }
  }, [chatOpen, userId, messages]);

  // Also fire session-close on page unload/refresh so memory saves even without
  // explicitly closing the chat sheet
  useEffect(() => {
    if (!userId) return;
    function handleUnload() {
      const msgs = messagesRef.current;
      if (!msgs || msgs.length < 1) return;
      // sendBeacon is fire-and-forget — survives page unload
      const payload = JSON.stringify({
        userId,
        sessionMessages: msgs,
        sessionStartedAt: sessionStartedAt.current,
      });
      navigator.sendBeacon("/api/session-close", new Blob([payload], { type: "application/json" }));
    }
    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [userId]);

  // ── On chat open: load history OR show situation greeting + refresh chips ────
  const prevChatOpen = useRef(false);
  useEffect(() => {
    const wasOpen = prevChatOpen.current;
    prevChatOpen.current = chatOpen;
    if (!chatOpen || wasOpen) return; // only fire on false→true transition

    // Always refresh smart chips on open
    setSmartChips(buildSmartChips(assignments, courses, userData));

    // Load history or show greeting only once per mount (not on every reopen)
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;

    (async () => {
      if (userId) {
        const history = await loadChatHistory(userId);
        if (history.length > 0) {
          setMessages(history);
          return; // history loaded — skip greeting
        }
      }
      // No history → situation-aware greeting as first message bubble
      setMessages([{ role: "assistant", content: buildSituationGreeting(assignments, courses, userData) }]);
    })();
  }, [chatOpen, assignments, courses, userData, userId]);

  // ── Typewriter ──────────────────────────────────────────────────────────────────────────
  const typewrite = useCallback((text, durationSecs) => {
    return new Promise((resolve) => {
      if (typeTimerRef.current) clearInterval(typeTimerRef.current);
      let i = 0;
      setStreamingMsg("");
      // Spread typing over actual audio duration, min 1.5s, with slight padding
      const totalMs  = Math.max(1500, durationSecs * 1000 * 0.92);
      const interval = Math.max(16, Math.round(totalMs / text.length));
      typeTimerRef.current = setInterval(() => {
        i++;
        setStreamingMsg(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(typeTimerRef.current);
          typeTimerRef.current = null;
          setMessages(m => [...m, { role: "assistant", content: text }]);
          setStreamingMsg("");
          resolve();
        }
      }, interval);
    });
  }, []);

  // ── Speak + type in sync ───────────────────────────────────────────────────────────────
  // Fetch audio first → get real duration → start both typewriter and playback together.
  // This eliminates the 1-2s delay between text appearing and voice starting.
  const speakAndType = useCallback(async (text) => {
    const plain = text.replace(/<[^>]+>/g, "").trim();
    if (!plain) return;

    if (muted) {
      await typewrite(plain, 3); // ~3s default when no voice
      return;
    }

    try {
      setSpeaking(true);
      // Decode audio first so we have the real duration
      const tone = TONE_PRESETS[toneRef.current] ?? TONE_PRESETS.neutral;
      const { duration, play } = await fetchAndDecodeAudio(plain, voiceIdRef.current, speedRef.current, tone);
      // Now start both simultaneously — typewriter matches actual audio length
      await Promise.all([
        play((src) => { audioSourceRef.current = src; }).finally(() => {
          audioSourceRef.current = null;
          setSpeaking(false);
        }),
        typewrite(plain, duration),
      ]);
    } catch (err) {
      console.warn("TTS failed, staying text-only:", err.message);
      setSpeaking(false);
      await typewrite(plain, 3);
    }
  }, [muted, typewrite]);

  // ── Instant client-side navigation — handles unambiguous "take me to X" phrases ──
  // Fires before any API call so navigation feels instant. Claude's <nav> tags
  // handle all other nav (e.g. "I want to study calculus") — this is just a fast
  // path for the obvious verbs that never need AI interpretation.
  const NAV_INTENTS = [
    { re: /take me to study|open study|go to study/i,               page: "study"       },
    { re: /open toolkit|go to toolkit/i,                             page: "toolkit"     },
    { re: /show.*leaderboard|open leaderboard|go to leaderboard/i,  page: "leaderboard" },
    { re: /go to canvas|open canvas/i,                               page: "canvas"      },
    { re: /go to assignments|open assignments|show assignments/i,    page: "assignment"  },
    { re: /go home|go to dashboard|open work/i,                      page: "work"        },
    { re: /go to courses|open courses|my courses/i,                  page: "courses"     },
    { re: /go to identity|open identity|my profile/i,                page: "identity"    },
  ];

  // ── Voice mode: auto-listen + silence detection + barge-in ──────────────────
  async function startAutoListen() {
    if (isRecording || micDenied) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current    = stream;
      speechDetectedRef.current = false;
      audioChunksRef.current  = [];

      // WebAudio analyser for live RMS (silence detection + barge-in)
      const audCtx   = getAudioContext();
      const analyser = audCtx.createAnalyser();
      analyser.fftSize = 512;
      const src = audCtx.createMediaStreamSource(stream);
      src.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
        analyserRef.current  = null;
        cancelAnimationFrame(silenceRafRef.current);
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
        setIsRecording(false);
        voiceRmsRef.current = 0;
        if (!audioChunksRef.current.length) return;
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        await _transcribeAndSend(blob, mimeType);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
      sphereStateRef.current = "listening";

      // Silence + barge-in detection loop
      const data = new Float32Array(analyser.fftSize);
      const SPEECH_THRESH  = 0.012;
      const SILENCE_MS     = 600;   // time of silence before auto-stop
      const MIN_SPEECH_MS  = 400;   // min speech duration before silence timer arms
      let   speechStartTime = null; // when speech first crossed threshold this utterance

      function silenceTick() {
        if (!analyserRef.current) return;
        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
        voiceRmsRef.current = Math.min(rms * 14, 1);

        // Barge-in: user speaks while tutor is speaking → interrupt
        if (speakingRef.current && rms > SPEECH_THRESH * 2.5) {
          stopResponse();
        }

        if (rms > SPEECH_THRESH) {
          if (!speechDetectedRef.current) {
            speechDetectedRef.current = true;
            speechStartTime = Date.now();
          }
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        } else if (speechDetectedRef.current && !silenceTimerRef.current
                   && mr.state === "recording") {
          // Only arm once speech has lasted long enough to be real speech
          const speechDuration = Date.now() - (speechStartTime ?? 0);
          if (speechDuration >= MIN_SPEECH_MS) {
            silenceTimerRef.current = setTimeout(() => {
              if (mr.state === "recording") mr.stop();
            }, SILENCE_MS);
          }
        }
        silenceRafRef.current = requestAnimationFrame(silenceTick);
      }
      silenceTick();

    } catch (err) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicDenied(true);
      }
      console.warn("[voice] mic error:", err.message);
    }
  }

  function exitVoiceMode() {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    analyserRef.current  = null;
    cancelAnimationFrame(silenceRafRef.current);
    clearTimeout(silenceTimerRef.current);
    cancelAnimationFrame(voiceRafRef.current);
    voiceRmsRef.current = 0;
    setIsRecording(false);
    setVoiceMode(false);
    setMicDenied(false);
    sphereStateRef.current = "idle";
  }

  async function _transcribeAndSend(blob, mimeType) {
    sphereStateRef.current = "thinking";
    try {
      // Convert blob → base64 JSON for /api/stt
      const base64 = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result.split(",")[1]);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      const sttRes = await fetch("/api/stt", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ audio: base64, mimeType }),
      });
      if (!sttRes.ok) throw new Error(`STT ${sttRes.status}`);
      const { text } = await sttRes.json();
      if (!text?.trim()) { sphereStateRef.current = "idle"; return; }
      // Inject into chat exactly like a typed message
      await sendMessage(text.trim());
    } catch (err) {
      console.warn("[voice] STT error:", err.message);
      sphereStateRef.current = "idle";
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────────────
  const sendMessage = async (overrideText) => {
    const text = overrideText ?? input.trim();
    if (!text || loading) return;
    const userMsg = { role: "user", content: text };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setLoading(true);
    logChat(userId, "user", userMsg.content, null);

    // ── Instant nav shortcut (pre-API) ────────────────────────────────────────
    const navMatch = NAV_INTENTS.find(n => n.re.test(text));
    if (navMatch) {
      const reply = "On it.";
      logChat(userId, "assistant", reply, null);
      setMessages(m => [...m, { role: "assistant", content: reply }]);
      setLoading(false);
      setTimeout(() => { setPendingNav({ page: navMatch.page }); setChatOpen(false); }, 380);
      return;
    }

    try {
      // ── Visualization routing — send to Claude artifact builder ───────────
      if (isVizRequest(userMsg.content)) {
        const aType = detectArtifactType(userMsg.content);
        const raw = await fetch("/api/claude", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [userMsg], system: VIZ_SYSTEM, max_tokens: 4096 }),
        }).then(r => r.json()).then(d => d.content ?? "");
        const { code, text: displayText } = parseArtifact(raw);
        if (code) {
          setArtifactCode(code);
          setArtifactType(aType);
          setMessages(m => [...m, { role: "assistant", content: displayText, hasArtifact: true, artifactType: aType }]);
        } else {
          setMessages(m => [...m, { role: "assistant", content: displayText }]);
        }
        setLoading(false);
        return;
      }

      // ── Dynamic context fetch (chatbot agent upgrade) ─────────────────────
      // Fires in parallel — if it resolves before Claude, gets injected into prompt
      let dynamicContext = null;
      abortCtrlRef.current = new AbortController();
      const contextFetch = fetch("/api/tutor-context", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, userMessage: userMsg.content }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => { dynamicContext = d?.context ?? null; })
        .catch(() => {});

      const system = buildChatSystem(
        courseOptions, userData, assignments,
        flashcardMap, syllabus, impressions, lastSession, livingMind,
        messages.length === 0,  // isFirstMessage — no prior exchanges yet
        availableVoices   // full list so Claude can match any voice by description
      );

      // Wait briefly for context fetch (max 1.2s) — if still pending, proceed without it
      await Promise.race([contextFetch, new Promise(r => setTimeout(r, 1200))]);

      // Append dynamic context to system prompt if retrieved
      const finalSystem = dynamicContext
        ? `${system}\n\nLIVE DATA (just fetched for this query):\n${dynamicContext}`
        : system;

      // Use Claude for tutor brain; fall back to Groq if key missing
      // Strip UI-only props (hasArtifact) so they don't reach the Anthropic/Groq API
      const apiMessages = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      let raw;
      let voiceTTSDone = null; // resolves when all sentence-chunked TTS finishes

      if (voiceModeRef.current && !muted) {
        // ── Streaming voice: sentence-chunked TTS pipeline ───────────────────
        // Each sentence is sent to TTS the moment Claude generates it,
        // so audio starts before the full response arrives.
        try {
          const streamRes = await fetch("/api/claude", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: apiMessages, system: finalSystem, max_tokens: 400, stream: true }),
            signal: abortCtrlRef.current?.signal,
          });
          if (!streamRes.ok) throw new Error(`Stream ${streamRes.status}`);

          const reader  = streamRes.body.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = "", pendingSentence = "", fullText = "";
          let ttsChain  = Promise.resolve();

          const enqueueTTS = (text) => {
            const clean = sanitizeForTTS(text.trim());
            if (!clean) return;
            ttsChain = ttsChain.then(async () => {
              if (abortCtrlRef.current?.signal?.aborted) return;
              setSpeaking(true); speakingRef.current = true;
              sphereStateRef.current = "speaking";
              const tone = TONE_PRESETS[toneRef.current] ?? TONE_PRESETS.neutral;
              try {
                const { play } = await fetchAndDecodeAudio(clean, voiceIdRef.current, speedRef.current, tone);
                await play(src => { audioSourceRef.current = src; });
              } catch (e) { console.warn("[voice chunk]", e.message); }
            });
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              sseBuffer += decoder.decode(value, { stream: true });
              const lines = sseBuffer.split("\n");
              sseBuffer = lines.pop() ?? "";
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6).trim();
                if (!data || data === "[DONE]") continue;
                try {
                  const evt = JSON.parse(data);
                  if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                    const chunk = evt.delta.text ?? "";
                    fullText += chunk;
                    pendingSentence += chunk;
                    setStreamingMsg(fullText);
                    // Flush on sentence boundary (.!? followed by space/newline)
                    const sm = /[.!?][ \n]/.exec(pendingSentence);
                    if (sm) {
                      const sent = pendingSentence.slice(0, sm.index + 1);
                      pendingSentence = pendingSentence.slice(sm.index + 2).trimStart();
                      enqueueTTS(sent);
                    }
                  }
                } catch (_) {}
              }
            }
          } catch (err) {
            if (err?.name !== "AbortError") throw err;
          }

          if (abortCtrlRef.current?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
          if (pendingSentence.trim()) enqueueTTS(pendingSentence.trim());

          raw = fullText;
          voiceTTSDone = ttsChain.then(() => {
            setSpeaking(false); speakingRef.current = false;
            sphereStateRef.current = "idle"; audioSourceRef.current = null;
          });
        } catch (err) {
          if (err?.name === "AbortError") throw err;
          console.warn("[voice stream] falling back to non-streaming:", err.message);
          raw = await claudeTutor(apiMessages, finalSystem, abortCtrlRef.current?.signal);
        }
      } else {
        try {
          raw = await claudeTutor(apiMessages, finalSystem, abortCtrlRef.current?.signal);
        } catch {
          raw = await groq(apiMessages, finalSystem);
        }
      }

      // ── Voice intent tag extraction (strip before display/quiz/nav parsing) ──
      const { tags: voiceTags, cleaned: rawNoVoice } = parseVoiceTags(raw);

      // Apply VOICE tag — match by name, persist + apply immediately
      if (voiceTags.VOICE) {
        const query  = voiceTags.VOICE.toLowerCase().trim();
        const words  = query.split(/\s+/).filter(w => w.length > 2);
        // Score each voice: exact name > partial name > label words coverage
        const scored = availableVoices.map(v => {
          const name   = v.name.toLowerCase();
          const labels = Object.values(v.labels ?? {}).join(" ").toLowerCase();
          const all    = name + " " + labels;
          if (name === query) return { v, score: 100 };
          const hits = words.filter(w => all.includes(w)).length;
          return { v, score: hits };
        }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
        const match = scored[0]?.v;
        if (match) {
          voiceIdRef.current = match.voice_id;
          updateUserField("preferred_voice_id", match.voice_id).catch(() => {});
        }
      }
      // Apply SPEED tag
      if (voiceTags.SPEED) {
        const s = Math.min(1.3, Math.max(0.7, parseFloat(voiceTags.SPEED) || 1.0));
        speedRef.current = s;
        updateUserField("preferred_speed", s).catch(() => {});
      }
      // Apply TONE tag
      if (voiceTags.TONE) {
        const t = voiceTags.TONE.toLowerCase();
        if (TONE_PRESETS[t]) {
          toneRef.current = t;
          updateUserField("preferred_tone", t).catch(() => {});
        }
      }
      // [READ:assignments] — Claude's text response IS the reading; tag is stripped
      // [QUIZ:*] — Claude will emit [QUIZ_START]..[QUIZ_END] which is handled below

      // Use cleaned (tag-stripped) response for all downstream processing
      const rawClean = rawNoVoice;

      // ── Quiz detection (before parseNav so tags don't confuse nav parser) ───
      const quizCards = parseQuiz(rawClean);
      if (quizCards) {
        const preText = rawClean.replace(/\[QUIZ_START\][\s\S]*?\[QUIZ_END\]/, "").trim();
        const display = preText || "Here's your quiz:";
        logChat(userId, "assistant", display, null);
        setMessages(m => [...m, { role: "assistant", content: display, quiz: quizCards }]);
        setLoading(false);
        return; // don't TTS the quiz block
      }

      const { cmd, text: displayText } = parseNav(rawClean);
      const cleanText = displayText.replace(/<[^>]+>/g, "").trim();

      if (cmd?.page) {
        if (cmd.course || cmd.mode) setStudyConfig({ course: cmd.course ?? null, mode: cmd.mode ?? "flashcards" });
        setTimeout(() => setPendingNav({ page: cmd.page }), 600);
      }

      logChat(userId, "assistant", cleanText, null);
      writeImpression(userId, userMsg.content, cleanText);

      // ── Self-write trigger — fires every 6th exchange ─────────────────────
      exchangeCountRef.current += 1;
      if (exchangeCountRef.current % 6 === 0) {
        const currentMsgs = [...messages, userMsg, { role: "assistant", content: cleanText }];
        fetch("/api/self-write", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, recentMessages: currentMsgs.slice(-8) }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            // If living mind was patched mid-session, update local state immediately
            if (d?.updated && d?.patch) setLivingMind(d.patch);
          })
          .catch(() => {});
      }

      setLoading(false);
      if (voiceTTSDone) {
        // Streaming voice path: TTS already queued — add message now, wait for audio
        setMessages(m => [...m, { role: "assistant", content: cleanText }]);
        setStreamingMsg("");
        await voiceTTSDone;
      } else {
        await speakAndType(cleanText);
      }
      // Auto-restart listening after reply ends, if still in voice mode
      if (voiceModeRef.current && !micDenied) {
        await startAutoListen();
      }
    } catch (err) {
      console.error("[NeuralRing] sendMessage error:", err?.message ?? err);
      // Only add error message if not aborted by stop button
      if (err?.name !== "AbortError") {
        setMessages(m => [...m, { role: "assistant", content: "Something went wrong. Try again." }]);
      }
      setSpeaking(false);
      setLoading(false);
      setStreamingMsg("");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return createPortal(
    <>
      {/* Floating ring */}
      <div
        style={{
          position: "fixed", top: pos.top, left: pos.left,
          opacity: chatOpen ? 0 : (isDragging ? 1 : 0.82),
          pointerEvents: chatOpen ? "none" : "auto",
          transition: isDragging
            ? "opacity 0.15s"
            : "top 0.22s var(--ease-apple), left 0.22s var(--ease-apple), opacity 0.2s",
          zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
        }}
      >
        <div
          className={speaking ? "nr-speaking" : (isDragging ? undefined : "nr-idle")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            width: SIZE, height: SIZE, borderRadius: "50%",
            cursor: isDragging ? "grabbing" : "grab",
            touchAction: "none", userSelect: "none",
            background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.13), rgba(255,255,255,0.04))",
            border: "1px solid rgba(255,255,255,0.13)",
          }}
        >
          <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: "block", borderRadius: "50%" }} />
        </div>
      </div>

      {/* Chat sheet */}
      {chatOpen && (
        <>
          <div onClick={() => setChatOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9997 }} />
          <div
            onTouchStart={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              height: "72vh", maxHeight: "680px",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              background: "rgba(16,16,16,0.96)",
              backdropFilter: "blur(32px)", WebkitBackdropFilter: "blur(32px)",
              borderRadius: "22px 22px 0 0",
              border: "1px solid rgba(255,255,255,0.09)", borderBottom: "none",
              display: "flex", flexDirection: "column",
              fontFamily: "var(--font-sans)",
              boxShadow: "0 -12px 48px rgba(0,0,0,0.6)",
              zIndex: 9998,
              transform: `translateY(${sheetDragY}px)`,
              transition: sheetDragY > 0 ? "none" : "transform 0.28s var(--ease-apple)",
            }}
          >
            {/* Drag handle */}
            <div
              onTouchStart={handleSheetHandleTouchStart}
              onTouchMove={handleSheetHandleTouchMove}
              onTouchEnd={handleSheetHandleTouchEnd}
              style={{ display: "flex", justifyContent: "center", padding: "14px 0 6px", flexShrink: 0, cursor: "grab", touchAction: "none" }}
            >
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)" }} />
            </div>

            {/* Header */}
            <div style={{ padding: "10px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.18), rgba(255,255,255,0.04))", border: "1px solid rgba(255,255,255,0.12)" }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  {editingName ? (
                    <input
                      ref={ringNameInputRef}
                      value={ringNameInput}
                      onChange={e => setRingNameInput(e.target.value)}
                      onBlur={commitRingName}
                      onKeyDown={e => e.key === "Enter" && commitRingName()}
                      style={{
                        background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.18)",
                        borderRadius: "6px", padding: "3px 9px", color: "var(--text-primary)",
                        fontSize: "17px", fontWeight: "600", letterSpacing: "-0.2px",
                        outline: "none", fontFamily: "inherit", width: "160px",
                      }}
                    />
                  ) : (
                    <p
                      onClick={() => { setRingNameInput(ringName); setEditingName(true); setTimeout(() => ringNameInputRef.current?.focus(), 0); }}
                      style={{ color: "var(--text-primary)", fontSize: "17px", fontWeight: "600", letterSpacing: "-0.2px", cursor: "text" }}
                      title="Tap to rename"
                    >
                      {ringName || "Name your agent"}
                    </p>
                  )}
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", marginTop: "1px", letterSpacing: "0.4px" }}>
                    Academic AI · Always on{speaking ? " · Speaking…" : ""}
                  </p>
                </div>

                {/* Voice toggle */}
                <VoiceToggle muted={muted} onClick={toggleMute} speaking={speaking} />
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {messages.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "40px", gap: "12px" }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.14), rgba(255,255,255,0.03))", border: "1px solid rgba(255,255,255,0.10)" }} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "center", marginTop: "4px" }}>
                    {smartChips.map(chip => (
                      <button
                        key={chip.label}
                        onClick={() => sendMessage(chip.message)}
                        style={{
                          fontSize: "11px", padding: "5px 11px", borderRadius: "20px",
                          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                          color: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className="nr-msg-in" style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "84%" }}>
                    <div
                      className={m.role === "assistant" && i === messages.length - 1 ? "nr-msg-new" : ""}
                      style={{
                        background: m.role === "user" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
                        borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        padding: "10px 14px", color: "var(--text-primary)",
                        fontSize: "14px", lineHeight: "1.6",
                        border: m.hasArtifact ? "1px solid rgba(232,255,107,0.2)" : "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      {m.role === "assistant"
                        ? <div className="nr-md" dangerouslySetInnerHTML={{ __html: renderMessageHTML(m.content) }} />
                        : m.content
                      }
                      {m.quiz && <InlineQuiz cards={m.quiz} userId={userId} courseId={null} />}
                      {m.hasArtifact && (
                        <button
                          onClick={() => { setArtifactType(m.artifactType || "viz"); setArtifactOpen(true); }}
                          style={{
                            display: "block", marginTop: "10px",
                            background: "rgba(196,154,60,0.1)", border: "1px solid rgba(196,154,60,0.3)",
                            borderRadius: "8px", padding: "7px 14px", color: "#C49A3C",
                            fontSize: "12px", fontWeight: "600", cursor: "pointer",
                            fontFamily: "inherit", width: "100%", textAlign: "center",
                          }}
                        >
                          {(ARTIFACT_LABELS[m.artifactType] ?? ARTIFACT_LABELS.viz).button}
                        </button>
                      )}
                    </div>
                    {m.role === "assistant" && (
                      <div style={{ marginTop: "5px", paddingLeft: "2px" }}>
                        {/* Action row — Copy / thumbs */}
                        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                          {/* Copy */}
                          <button
                            onClick={() => {
                              navigator.clipboard?.writeText(m.content);
                              // Flash "Copied" feedback
                              const btn = document.getElementById(`copy-btn-${i}`);
                              if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy"; }, 1500); }
                            }}
                            id={`copy-btn-${i}`}
                            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: "12px", cursor: "pointer", padding: "3px 7px", borderRadius: "6px", fontFamily: "inherit", transition: "color 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
                            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.25)"}
                          >Copy</button>

                          {/* Thumbs up */}
                          <button
                            onClick={() => {
                              if (reactions[i] === "up") return;
                              setReactions(r => ({ ...r, [i]: "up" }));
                              setReasonPicker(null);
                              writeImpression(userId, messages[i-1]?.content ?? "", m.content + " [student liked this response]");
                            }}
                            style={{
                              background: reactions[i] === "up" ? "rgba(52,199,89,0.15)" : "none",
                              border: reactions[i] === "up" ? "1px solid rgba(52,199,89,0.3)" : "1px solid transparent",
                              borderRadius: "6px", fontSize: "13px", cursor: reactions[i] === "up" ? "default" : "pointer",
                              padding: "2px 5px", transition: "all 0.15s",
                              transform: reactions[i] === "up" ? "scale(1.2)" : "scale(1)",
                            }}
                          >👍</button>

                          {/* Thumbs down */}
                          <button
                            onClick={() => {
                              if (reactions[i] === "up") return;
                              setReasonPicker(reasonPicker === i ? null : i);
                            }}
                            style={{
                              background: reactions[i] === "down" ? "rgba(255,80,80,0.12)" : "none",
                              border: reactions[i] === "down" ? "1px solid rgba(255,80,80,0.25)" : "1px solid transparent",
                              borderRadius: "6px", fontSize: "13px", cursor: "pointer",
                              padding: "2px 5px", transition: "all 0.15s",
                              transform: reactions[i] === "down" ? "scale(1.1)" : "scale(1)",
                            }}
                          >👎</button>
                        </div>

                        {/* Reason picker — slides in below thumbs down */}
                        {reasonPicker === i && reactions[i] !== "down" && (
                          <div style={{
                            marginTop: "8px",
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            borderRadius: "12px",
                            padding: "10px",
                            display: "flex", flexDirection: "column", gap: "6px",
                          }}>
                            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginBottom: "2px", letterSpacing: "0.5px" }}>What was wrong?</p>
                            {["Too long", "Off topic", "Wrong info", "Not helpful"].map(reason => (
                              <button
                                key={reason}
                                onClick={() => {
                                  setReactions(r => ({ ...r, [i]: "down" }));
                                  setReasonPicker(null);
                                  writeImpression(userId, messages[i-1]?.content ?? "", m.content + ` [student disliked — reason: ${reason}]`);
                                  // Offer regenerate — set input to last user message
                                  const lastUserMsg = messages[i-1]?.content;
                                  if (lastUserMsg) setInput(lastUserMsg);
                                }}
                                style={{
                                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                                  borderRadius: "8px", padding: "7px 10px", color: "rgba(255,255,255,0.6)",
                                  fontSize: "13px", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                                  transition: "background 0.12s, color 0.12s",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,80,80,0.1)"; e.currentTarget.style.color = "rgba(255,130,120,0.9)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                              >{reason}</button>
                            ))}
                          </div>
                        )}

                        {/* Regenerate prompt — shows after picking a reason */}
                        {reactions[i] === "down" && (
                          <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)" }}>Thanks for the feedback</span>
                            <button
                              onClick={() => {
                                const lastUserMsg = messages[i-1]?.content;
                                if (!lastUserMsg) return;
                                // Remove the bad response + queue regenerate after state settles
                                setMessages(msgs => msgs.slice(0, i));
                                setReactions(r => { const n = {...r}; delete n[i]; return n; });
                                setInput(lastUserMsg);
                                // Use a small delay so setMessages settles, then send
                                setTimeout(() => {
                                  setInput("");
                                  sendMessage(lastUserMsg);
                                }, 100);
                              }}
                              style={{
                                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "6px", padding: "3px 9px", color: "rgba(255,255,255,0.5)",
                                fontSize: "12px", cursor: "pointer", fontFamily: "inherit",
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.85)"; }}
                              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
                            >↺ Try again</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
              {loading && !streamingMsg && (
                <div style={{ alignSelf: "flex-start", padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: "16px 16px 16px 4px", border: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: "5px", alignItems: "center" }}>
                  <span className="nr-dot" />
                  <span className="nr-dot" />
                  <span className="nr-dot" />
                </div>
              )}
              {streamingMsg ? (
                <div style={{
                  alignSelf: "flex-start", maxWidth: "84%",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "16px 16px 16px 4px",
                  padding: "10px 14px", color: "var(--text-primary)",
                  fontSize: "14px", lineHeight: "1.6",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}>
                  <span className="nr-md" dangerouslySetInnerHTML={{ __html: renderStreamingHTML(streamingMsg) }} />
                  <span style={{ opacity: 0.4, animation: "blink 1s step-end infinite" }}>|</span>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Input row (text mode) */}
            {!voiceMode && (
              <div style={{ display: "flex", gap: "10px", padding: "12px 14px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                {/* Subtle waveform glyph — enters voice mode */}
                <button
                  onClick={() => { getAudioContext(); setVoiceMode(true); startAutoListen(); }}
                  title="Voice mode"
                  style={{
                    background: "none", border: "none", padding: "8px 6px",
                    cursor: "pointer", flexShrink: 0, color: "rgba(255,255,255,0.28)",
                    transition: "color 0.15s", outline: "none",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "#C49A3C"}
                  onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.28)"}
                >
                  {/* Waveform glyph — three bars of different heights */}
                  <svg width="16" height="14" viewBox="0 0 16 14" fill="currentColor">
                    <rect x="0"  y="4" width="2.5" height="6"  rx="1.25"/>
                    <rect x="4.5" y="1" width="2.5" height="12" rx="1.25"/>
                    <rect x="9"  y="3" width="2.5" height="8"  rx="1.25"/>
                    <rect x="13.5" y="5" width="2.5" height="4" rx="1.25"/>
                  </svg>
                </button>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); getAudioContext(); sendMessage(); } }}
                  placeholder="Ask about assignments, navigate…"
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: "var(--radius-btn)", padding: "11px 14px", color: "var(--text-primary)",
                    fontSize: "14px", outline: "none", fontFamily: "inherit",
                    transition: "border-color var(--dur-base) var(--ease-apple)",
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)")}
                  onBlur={e  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
                />
                {(loading || speaking) ? (
                  <button onClick={stopResponse} style={{ background: "rgba(255,80,80,0.15)", color: "rgba(255,120,100,0.9)", border: "1px solid rgba(255,80,80,0.25)", borderRadius: "var(--radius-btn)", padding: "11px 16px", fontSize: "14px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                    Stop
                  </button>
                ) : (
                  <button onClick={() => { getAudioContext(); sendMessage(); }} disabled={!input.trim()}
                    style={{ background: !input.trim() ? "rgba(255,255,255,0.18)" : "var(--color-accent)", color: "#111", border: "none", borderRadius: "var(--radius-btn)", padding: "11px 18px", fontSize: "14px", fontWeight: "600", cursor: !input.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", flexShrink: 0, transition: "background var(--dur-base) var(--ease-apple)" }}>
                    Send
                  </button>
                )}
              </div>
            )}

            {/* ── Voice mode overlay: centered sphere hero ── */}
            {voiceMode && (
              <div style={{
                position: "absolute", top: "58px", bottom: 0, left: 0, right: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                background: "rgba(14,14,14,0.97)",
                animation: "nrVoiceIn 0.32s cubic-bezier(0.22,1,0.36,1) both",
                zIndex: 5,
              }}>
                {/* Exit — top-right ghost × */}
                <button
                  onClick={exitVoiceMode}
                  style={{
                    position: "absolute", top: "12px", right: "16px",
                    background: "none", border: "none", color: "rgba(255,255,255,0.22)",
                    fontSize: "22px", lineHeight: 1, cursor: "pointer", padding: "4px 6px",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
                  onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.22)"}
                  aria-label="Exit voice mode"
                >×</button>

                {/* Existing neural sphere — just larger and centered */}
                <div style={{ position: "relative", marginBottom: "26px" }}>
                  {/* RMS rim — reacts to live mic */}
                  <div style={{
                    position: "absolute",
                    inset: `-${8 + Math.round((voiceRmsRef.current ?? 0) * 10)}px`,
                    borderRadius: "50%",
                    border: `1.5px solid rgba(196,154,60,${Math.min((voiceRmsRef.current ?? 0) * 0.75, 0.5).toFixed(2)})`,
                    pointerEvents: "none",
                    transition: "inset 0.06s linear, border-color 0.06s linear",
                  }} />
                  <canvas
                    ref={voiceCanvasRef}
                    width={VOICE_SIZE}
                    height={VOICE_SIZE}
                    className={isRecording && !speaking ? "nr-speaking" : "nr-idle"}
                    style={{ display: "block", borderRadius: "50%" }}
                  />
                </div>

                {/* Tiny small-caps Fraunces caption — crossfades, orb carries the state */}
                <p style={{
                  fontFamily: "'Fraunces',Georgia,serif",
                  fontSize: "11px", fontWeight: "300",
                  fontVariant: "small-caps",
                  letterSpacing: "0.14em",
                  marginBottom: "32px",
                  minHeight: "1em",
                  color: micDenied ? "rgba(255,100,90,0.5)" : "rgba(246,242,233,0.22)",
                  transition: "opacity 0.35s ease, color 0.35s ease",
                  opacity: (micDenied || speaking || loading || isRecording) ? 1 : 0,
                }}>
                  {micDenied    ? "allow microphone access"
                  : speaking    ? "speaking"
                  : loading     ? "thinking"
                  : isRecording ? "listening"
                  : ""}
                </p>

                {/* Inline voice chip strip — slim, horizontal, scrollable */}
                {availableVoices.length > 0 && (
                  <div style={{
                    position: "absolute", bottom: "24px", left: 0, right: 0,
                    overflowX: "auto", display: "flex", gap: "7px",
                    padding: "0 20px",
                    scrollbarWidth: "none", msOverflowStyle: "none",
                  }}>
                    {availableVoices.slice(0, 8).map(v => {
                      const isActive = (voiceIdRef.current ?? userData?.preferred_voice_id) === v.voice_id;
                      const lbls = [v.labels?.accent, v.labels?.gender].filter(Boolean).join("/");
                      return (
                        <button
                          key={v.voice_id}
                          onClick={() => {
                            voiceIdRef.current = v.voice_id;
                            updateUserField("preferred_voice_id", v.voice_id).catch(() => {});
                          }}
                          style={{
                            flexShrink: 0,
                            background: isActive ? "rgba(196,154,60,0.1)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${isActive ? "rgba(196,154,60,0.35)" : "rgba(255,255,255,0.07)"}`,
                            borderRadius: "20px", padding: "5px 11px",
                            color: isActive ? "#C49A3C" : "rgba(255,255,255,0.3)",
                            fontSize: "11px", fontWeight: isActive ? "600" : "400",
                            cursor: "pointer", fontFamily: "inherit",
                            display: "flex", alignItems: "center", gap: "5px",
                            transition: "all 0.15s",
                          }}
                        >
                          <span>{v.name}</span>
                          {lbls && <span style={{ opacity: 0.5, fontSize: "9px" }}>{lbls}</span>}
                          {/* ▶ mini preview */}
                          <span
                            onClick={e => {
                              e.stopPropagation();
                              if (v.preview_url) {
                                const a = new Audio(v.preview_url);
                                a.play().catch(() => {});
                              }
                            }}
                            style={{ opacity: 0.45, cursor: "pointer", fontSize: "10px" }}
                            title="Preview"
                          >▶</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
      {artifactOpen && artifactCode && (
        <ArtifactPanel code={artifactCode} type={artifactType} onClose={() => setArtifactOpen(false)} />
      )}
    </>,
    document.body
  );
}
