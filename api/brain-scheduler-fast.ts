/**
 * brain-scheduler-fast.js — Tier 1 Brain Scheduler (every 5 minutes)
 *
 * Lightweight signal aggregator — no Claude call, pure math.
 * Reads the last 3 signals per student and updates stress_score + momentum
 * in brain.context_window for near-real-time intervention detection.
 *
 * Vercel Cron: runs every 5 minutes (see vercel.json)
 * Protected by CRON_SECRET header.
 *
 * Two-tier architecture:
 *   Tier 1 (this file)  — every 5 min — fast math update, no LLM
 *   Tier 2 (brain-scheduler.js) — every hour — full Claude synthesis
 */

import { createClient } from "@supabase/supabase-js";

const fschool = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const brain = createClient(
  process.env.BRAIN_SUPABASE_URL,
  process.env.BRAIN_SUPABASE_KEY,
  { db: { schema: "brain" } }   // signals + context_window live in brain schema
);

export default async function handler(req, res) {
  // Auth check — FAIL CLOSED: reject if CRON_SECRET is missing or wrong.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: "CRON_SECRET not configured" });
  const auth = req.headers.authorization ?? req.headers["x-cron-secret"] ?? req.query.secret;
  if (auth !== `Bearer ${cronSecret}` && auth !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const startTime = Date.now();

  try {
    // Get all students who have a brain_person_id
    const { data: students, error: studentsErr } = await fschool
      .from("users")
      .select("id, brain_person_id")
      .not("brain_person_id", "is", null)
      .limit(200);

    if (studentsErr) throw studentsErr;
    if (!students || students.length === 0) {
      return res.status(200).json({ message: "No students with brain links", processed: 0 });
    }

    let updated = 0;
    const errors = [];

    for (const student of students) {
      try {
        await updateStudentFastSignals(student.id, student.brain_person_id);
        updated++;
      } catch (e) {
        errors.push({ userId: student.id, error: e.message });
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[brain-scheduler-fast] Updated ${updated}/${students.length} students in ${elapsed}ms`);

    return res.status(200).json({
      tier: 1,
      processed: updated,
      errors: errors.length,
      elapsed_ms: elapsed,
    });
  } catch (e) {
    console.error("[brain-scheduler-fast] Fatal error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}

/**
 * Update a single student's stress_score and momentum from their last 3 signals.
 * Pure math — no LLM call.
 */
async function updateStudentFastSignals(userId, brainPersonId) {
  // Get the last 3 signals from Brain DB
  const { data: signals, error } = await brain
    .from("signals")
    .select("signal_type, payload, created_at")
    .eq("person_id", brainPersonId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error || !signals || signals.length === 0) return;

  // ── Stress score: 0–100 ───────────────────────────────────────────────────
  // Based on: overdue assignments, late-night sessions, negative emotional tone
  let stressScore = 50; // baseline

  for (const sig of signals) {
    const p = sig.payload || {};

    if (sig.signal_type === "chat_message") {
      // Emotional tone from message analysis
      if (p.stress_level === "high")   stressScore = Math.min(100, stressScore + 15);
      if (p.stress_level === "low")    stressScore = Math.max(0,   stressScore - 10);
      // Late night sessions increase stress
      const hour = new Date(sig.created_at).getHours();
      if (hour >= 23 || hour <= 4)     stressScore = Math.min(100, stressScore + 10);
    }

    if (sig.signal_type === "session_end") {
      // Low score on recent work increases stress
      if (p.score !== undefined && p.score < 60) stressScore = Math.min(100, stressScore + 20);
      if (p.score !== undefined && p.score > 80) stressScore = Math.max(0,   stressScore - 15);
    }
  }

  // ── Momentum: -1 to 1 ────────────────────────────────────────────────────
  // Positive = student is on track, negative = falling behind
  let momentum = 0;
  const recentSignalCount = signals.length;
  const latestSignal = signals[0];
  const latestAge = (Date.now() - new Date(latestSignal.created_at).getTime()) / (1000 * 60); // minutes

  // If student was active in last 30 minutes, positive momentum
  if (latestAge < 30) momentum += 0.3;
  // Multiple signals in last 3 = engaged
  if (recentSignalCount >= 3) momentum += 0.2;
  // Stress drags momentum
  if (stressScore > 75) momentum -= 0.4;
  if (stressScore < 30) momentum += 0.2;

  momentum = Math.max(-1, Math.min(1, momentum));

  // ── Update context_window with fast metrics ───────────────────────────────
  // Only update the numeric fields — don't overwrite the full Claude summary
  const { data: existing } = await brain
    .from("context_window")
    .select("id, metadata")
    .eq("person_id", brainPersonId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update existing record with fresh fast metrics
    const updatedMetadata = {
      ...(existing.metadata || {}),
      stress_score:    Math.round(stressScore),
      momentum:        parseFloat(momentum.toFixed(2)),
      fast_updated_at: new Date().toISOString(),
    };

    await brain
      .from("context_window")
      .update({ metadata: updatedMetadata })
      .eq("id", existing.id);
  } else {
    // No context_window yet — create a minimal one
    await brain
      .from("context_window")
      .insert({
        person_id: brainPersonId,
        metadata: {
          stress_score:    Math.round(stressScore),
          momentum:        parseFloat(momentum.toFixed(2)),
          fast_updated_at: new Date().toISOString(),
        },
        summary: "Initializing...",
        created_at: new Date().toISOString(),
      });
  }
}
