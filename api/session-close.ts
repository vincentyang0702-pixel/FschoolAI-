// api/session-close.js — Session close queue: living mind rewrite + brain signal write
//
// ARCHITECTURE CONTRACT (from Reggie):
//   FIRES:  when NeuralRing chat closes (non-blocking, fire-and-forget)
//   READS:  chat_logs (current session transcript) + tutor_impressions (last 10)
//           + tutor_mind (existing living mind doc for this user)
//   WRITES: tutor_mind table (one row per user, upserted — full rewrite each session)
//           brain.signals (NeuroAGI Brain DB — session_end signal, fire-and-forget)
//           brain.context_window (NeuroAGI Brain DB — updated with latest mind summary)
//   NEVER:  block the UI — caller fires and forgets
//   NEVER:  modify users/courses/assignments tables
//
// LIVING MIND DOC:
//   A single coherent student profile Claude maintains across all sessions.
//   Not a log — a living document that gets REWRITTEN (not appended) each time.
//   Structured into 5 sections Claude fills in from evidence:
//     1. WHO THEY ARE    — name, school, GPA, quick identity snapshot
//     2. HOW THEY WORK   — study patterns, time of day, procrastination signals
//     3. WHAT THEY KNOW  — course-level confidence map (strong/shaky/blank)
//     4. WHAT TO WATCH   — recurring gaps, avoidance patterns, emotional signals
//     5. HOW TO HELP     — what works for this student, what to avoid
//
// Loaded into every NeuralRing session via buildChatSystem() as LIVING MIND section.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // sendBeacon sends body as text/plain — parse manually if needed
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body ?? {};

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl  = process.env.SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;
  // Brain DB env vars (NeuroAGI) — optional, gracefully skipped if not configured
  const brainUrl = process.env.BRAIN_SUPABASE_URL;
  const brainKey = process.env.BRAIN_SUPABASE_KEY;

  // Fail silently — never surface errors to UI
  if (!anthropicKey || !supabaseUrl || !supabaseKey) {
    return res.status(200).json({ ok: false, reason: "missing env" });
  }

  const { userId, sessionMessages } = body;
  if (!userId) return res.status(200).json({ ok: false, reason: "missing userId" });

  // Need at least 2 real exchanges to be worth rewriting
  const msgs = (sessionMessages || []).filter(m => m.role && m.content?.trim().length > 10);
  if (msgs.length < 2) return res.status(200).json({ ok: false, reason: "session too short" });

  const sbHeaders = {
    "apikey":        supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
    "Accept-Profile":  "public",   // app data lives in the `neuroagi` schema,
    "Content-Profile": "public",   // not public.* (that's Vincent's)
  };

  try {
    // ── 1. Fetch existing living mind doc (if any) ──────────────────────────
    let existingMind = null;
    try {
      const mindRes = await fetch(
        `${supabaseUrl}/rest/v1/tutor_mind?user_id=eq.${userId}&select=mind_doc`,
        { headers: sbHeaders }
      );
      if (mindRes.ok) {
        const rows = await mindRes.json();
        existingMind = rows?.[0]?.mind_doc ?? null;
      }
    } catch { /* non-fatal — build from scratch */ }

    // ── 2. Fetch user profile (for brain signal) ──────────────────────────────
    let userProfile = null;
    try {
      const userRes = await fetch(
        `${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=id,name,brain_person_id,gpa,streak,school&limit=1`,
        { headers: sbHeaders }
      );
      if (userRes.ok) {
        const userData = await userRes.json();
        userProfile = userData?.[0] ?? null;
      }
    } catch { /* non-fatal */ }

    // ── 3. Fetch last 10 impressions ────────────────────────────────────────
    let impressions = [];
    try {
      const impRes = await fetch(
        `${supabaseUrl}/rest/v1/tutor_impressions?user_id=eq.${userId}&order=created_at.desc&limit=10&select=impression`,
        { headers: sbHeaders }
      );
      if (impRes.ok) impressions = await impRes.json();
    } catch { /* non-fatal */ }

    // ── 4. Build the rewrite prompt ─────────────────────────────────────────
    const sessionTranscript = msgs
      .slice(-20) // cap at 20 messages to stay within token budget
      .map(m => `${m.role === "user" ? "STUDENT" : "TUTOR"}: ${m.content.slice(0, 300)}`)
      .join("\n");

    const impressionList = impressions
      .map(i => `• ${i.impression}`)
      .join("\n") || "None yet";

    const existingMindSection = existingMind
      ? `EXISTING LIVING MIND (rewrite and update this — don't just append):\n${existingMind}`
      : "EXISTING LIVING MIND: None — this is the first session. Build from scratch.";

    const prompt = `You are an AI academic tutor maintaining a living mind document for your student. After each session, you rewrite this document — not append to it — incorporating new evidence while preserving accurate prior knowledge.

${existingMindSection}

THIS SESSION TRANSCRIPT:
${sessionTranscript}

MICRO-OBSERVATIONS FROM THIS SESSION:
${impressionList}

Rewrite the living mind document using exactly this structure. Every section must be filled from evidence — never invented. If you don't have evidence for something, write "Unknown" or omit it.

---
WHO THEY ARE
[Name, school, GPA if known. 1-2 sentences max. What defines them as a student at a glance.]

HOW THEY WORK
[Study patterns, when they show up, how they ask questions, procrastination signals, response to pressure. Evidence-based only.]

WHAT THEY KNOW
[Per course: confidence level and specific strong/shaky areas. Only list courses that have appeared in conversation.]

WHAT TO WATCH
[Recurring gaps, avoidance patterns, topics they deflect from, emotional signals. What keeps showing up?]

HOW TO HELP
[What works for this student. What to lead with. What to avoid. Pacing, depth, tone preferences — inferred from how they respond.]
---

RULES:
- Rewrite the whole document — don't just add a new section
- Stay under 400 words total
- Write in present tense, first person as their tutor ("She tends to..." / "He avoids...")
- No filler, no hedging — if you know it, say it directly
- Return ONLY the document, no preamble, no markdown headers with ##`;

    // ── 5. Call Claude Haiku ────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeRes.ok) return res.status(200).json({ ok: false, reason: "claude error" });

    const claudeData = await claudeRes.json();
    const mindDoc    = claudeData.content?.[0]?.text?.trim();
    if (!mindDoc) return res.status(200).json({ ok: false, reason: "empty mind doc" });

    // ── 6. Upsert to tutor_mind (one row per user) ──────────────────────────
    // Uses ON CONFLICT DO UPDATE via Prefer: resolution=merge-duplicates
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/tutor_mind`, {
      method:  "POST",
      headers: { ...sbHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id:     userId,
        mind_doc:    mindDoc,
        updated_at:  new Date().toISOString(),
      }),
    });

    if (!upsertRes.ok) {
      const errText = await upsertRes.text().catch(() => "");
      console.error("[session-close] upsert failed:", errText);
      return res.status(200).json({ ok: false, reason: "upsert failed" });
    }

    // ── 7. Write signal to NeuroAGI Brain DB (fire-and-forget) ─────────────
    // Only fires if brain env vars are set AND user has a brain_person_id
    if (brainUrl && brainKey && userProfile?.brain_person_id) {
      const brainHeaders = {
        "apikey":          brainKey,
        "Authorization":   `Bearer ${brainKey}`,
        "Content-Type":    "application/json",
        "Prefer":          "return=minimal",
        "Accept-Profile":  "brain",   // signals + context_window live in brain schema
        "Content-Profile": "brain",
      };

      // Write session_end signal to brain.signals
      const brainSignal = {
        person_id:   userProfile.brain_person_id,
        signal_type: "academic",
        source:      "fschoolai",
        payload: {
          event:               "session_end",
          session_messages:    msgs.length,
          duration_mins:       Math.round(msgs.length * 1.5),
          living_mind_updated: true,
          user_gpa:            userProfile.gpa,
          user_streak:         userProfile.streak,
          school:              userProfile.school,
        },
        intensity:   Math.min(1.0, msgs.length / 20),
        confidence:  0.8,
        created_at:  new Date().toISOString(),
      };

      fetch(`${brainUrl}/rest/v1/signals`, {
        method: "POST", headers: brainHeaders, body: JSON.stringify(brainSignal),
      }).catch(err => console.error("[session-close] brain signal write failed:", err.message));

      // Update brain.context_window with latest mind summary
      const contextUpdate = {
        person_id:      userProfile.brain_person_id,
        written_at:     new Date().toISOString(),
        expires_at:     new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        recent_summary: mindDoc.slice(0, 300).replace(/\n/g, " ").trim(),
        momentum_state: "neutral",
        stress_level:   0.5,
      };
      fetch(`${brainUrl}/rest/v1/context_window`, {
        method: "POST",
        headers: { ...brainHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(contextUpdate),
      }).catch(err => console.error("[session-close] context_window update failed:", err.message));
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("[session-close] error:", err.message);
    return res.status(200).json({ ok: false, reason: err.message });
  }
}
