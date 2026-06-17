/**
 * api/brain-intervention.js — Vercel Cron Job
 *
 * Runs every 30 minutes. Reads context_window from the Brain DB (NeuroAGI),
 * identifies students who need proactive intervention (high stress, declining
 * momentum, or stalled), and sends them a personalised Discord DM via the
 * FschoolAI bot. Logs every intervention to the Brain DB interventions table.
 *
 * Trigger conditions (any one):
 *   - stress_level >= 7  (high stress)
 *   - momentum_state in ['declining', 'stalled']
 *   - expires_at is past (context stale > 8h) AND stress_level >= 5
 *
 * Cooldown: will NOT re-intervene for the same person within 4 hours unless
 * stress_level has increased by >= 2 since last intervention.
 *
 * Env vars required:
 *   BRAIN_SUPABASE_URL        — NeuroAGI Brain DB URL
 *   BRAIN_SUPABASE_KEY        — NeuroAGI Brain DB service-role key
 *   SUPABASE_URL              — FschoolAI main DB URL (for discord_user_id lookup)
 *   SUPABASE_SERVICE_KEY      — FschoolAI main DB service-role key
 *   DISCORD_BOT_TOKEN         — Discord bot token (same bot used by discord.js)
 *   CRON_SECRET               — Optional bearer token for manual triggers
 *
 * Add to vercel.json crons:
 *   { "path": "/api/brain-intervention", "schedule": "every 30 min" }
 */

const BRAIN_URL  = process.env.BRAIN_SUPABASE_URL;
const BRAIN_KEY  = process.env.BRAIN_SUPABASE_KEY;
const FS_URL     = process.env.SUPABASE_URL;
const FS_KEY     = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const DISCORD_API = "https://discord.com/api/v10";

const COOLDOWN_MS       = 4 * 60 * 60 * 1000;   // 4 hours
const STRESS_ESCALATION = 2;                      // re-intervene if stress rose by this much

// ── Brain DB helpers ──────────────────────────────────────────────────────────
const brainHeaders = {
  apikey:          BRAIN_KEY,
  Authorization:   `Bearer ${BRAIN_KEY}`,
  "Content-Type":  "application/json",
  Prefer:          "return=representation",
};

async function brainGet(path) {
  const res = await fetch(`${BRAIN_URL}/rest/v1/${path}`, { headers: brainHeaders });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Brain GET ${path} failed ${res.status}: ${err}`);
  }
  return res.json();
}

async function brainPost(path, body) {
  const res = await fetch(`${BRAIN_URL}/rest/v1/${path}`, {
    method:  "POST",
    headers: { ...brainHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Brain POST ${path} failed ${res.status}: ${err}`);
  }
}

// ── FschoolAI DB helpers ──────────────────────────────────────────────────────
const fsHeaders = {
  apikey:          FS_KEY,
  Authorization:   `Bearer ${FS_KEY}`,
  "Content-Type":  "application/json",
};

async function fsGet(path) {
  const res = await fetch(`${FS_URL}/rest/v1/${path}`, { headers: fsHeaders });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`FS GET ${path} failed ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Discord helpers ───────────────────────────────────────────────────────────
async function createDM(discordUserId) {
  const res = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method:  "POST",
    headers: {
      Authorization:  `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`createDM failed ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.id; // DM channel ID
}

async function sendDM(channelId, content) {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method:  "POST",
    headers: {
      Authorization:  `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`sendDM failed ${res.status}: ${err}`);
  }
}

// ── Message composer ──────────────────────────────────────────────────────────
function composeMessage(person, ctx) {
  const name       = person.name ?? "there";
  const stress     = ctx.stress_level ?? 5;
  const momentum   = ctx.momentum_state ?? "steady";
  const focus      = ctx.what_to_focus_on ?? null;
  const deadline   = ctx.active_deadline ?? null;
  const gaps       = Array.isArray(ctx.knowledge_gaps) ? ctx.knowledge_gaps : [];
  const summary    = ctx.recent_summary ?? null;

  // Opening line varies by trigger
  let opening;
  if (stress >= 8) {
    opening = `Hey ${name} 👋 — I can see you're under a lot of pressure right now.`;
  } else if (stress >= 7) {
    opening = `Hey ${name} — looks like things are getting a bit intense.`;
  } else if (momentum === "stalled") {
    opening = `Hey ${name} — I noticed you've been a bit stuck lately.`;
  } else {
    opening = `Hey ${name} — your momentum has been dipping a little.`;
  }

  const lines = [opening];

  if (summary) {
    lines.push(`📊 ${summary}`);
  }

  if (deadline) {
    lines.push(`⏰ Upcoming: **${deadline}**`);
  }

  if (focus) {
    lines.push(`🎯 Focus tip: ${focus}`);
  }

  if (gaps.length > 0) {
    lines.push(`🧠 Worth revisiting: ${gaps.slice(0, 2).join(", ")}`);
  }

  lines.push(
    "",
    "I'm here whenever you're ready to work through it. You've got this! 💪",
    "_— Reggie, your academic brain_"
  );

  return lines.join("\n");
}

// ── Intervention eligibility check ───────────────────────────────────────────
function needsIntervention(ctx) {
  const stress   = ctx.stress_level ?? 0;
  const momentum = ctx.momentum_state ?? "steady";
  const stale    = ctx.expires_at ? new Date(ctx.expires_at) < new Date() : false;

  if (stress >= 7)                                       return { reason: "high_stress",      stress };
  if (momentum === "stalled")                            return { reason: "stalled",           stress };
  if (momentum === "declining")                          return { reason: "declining_momentum", stress };
  if (stale && stress >= 5)                              return { reason: "stale_context",     stress };
  return null;
}

// ── Cooldown check ────────────────────────────────────────────────────────────
function withinCooldown(lastIntervention, currentStress) {
  if (!lastIntervention) return false;
  const age = Date.now() - new Date(lastIntervention.sent_at ?? lastIntervention.created_at).getTime();
  if (age > COOLDOWN_MS) return false;
  // Still within cooldown — but allow re-intervention if stress escalated
  const prevStress = lastIntervention.metadata?.stress_level ?? 0;
  if (currentStress - prevStress >= STRESS_ESCALATION) return false;
  return true;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Auth check — FAIL CLOSED: reject if CRON_SECRET is missing or wrong.
  // This endpoint sends Discord DMs and calls external APIs — must not be publicly triggerable.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: "CRON_SECRET not configured" });
  const auth = req.headers.authorization ?? req.headers["x-cron-secret"];
  if (auth !== `Bearer ${cronSecret}` && auth !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!BRAIN_URL || !BRAIN_KEY) {
    return res.status(200).json({ ok: false, reason: "brain db not configured" });
  }
  if (!BOT_TOKEN) {
    return res.status(200).json({ ok: false, reason: "discord bot token not configured" });
  }

  const startTime = Date.now();
  const results   = { sent: 0, skipped: 0, errors: 0, persons: [] };

  try {
    // 1. Fetch all active context windows (not expired or high-stress)
    const contexts = await brainGet(
      "context_window?select=*,persons(id,name,fschool_user_id)&order=stress_level.desc"
    );

    console.log(`[brain-intervention] ${contexts.length} context windows loaded`);

    for (const ctx of contexts) {
      const person = ctx.persons;
      if (!person) {
        console.warn(`[brain-intervention] context_window ${ctx.id} has no linked person — skipping`);
        results.skipped++;
        continue;
      }

      const trigger = needsIntervention(ctx);
      if (!trigger) {
        results.skipped++;
        continue;
      }

      try {
        // 2. Check cooldown — fetch last intervention for this person
        const recentInterventions = await brainGet(
          `interventions?person_id=eq.${person.id}&order=created_at.desc&limit=1`
        );
        const lastIntervention = recentInterventions[0] ?? null;

        if (withinCooldown(lastIntervention, trigger.stress)) {
          console.log(`[brain-intervention] ${person.name ?? person.id} — cooldown active, skipping`);
          results.skipped++;
          continue;
        }

        // 3. Look up Discord user ID from FschoolAI DB
        let discordUserId = null;
        if (FS_URL && FS_KEY && person.fschool_user_id) {
          const fsUsers = await fsGet(
            `users?id=eq.${person.fschool_user_id}&select=discord_user_id&limit=1`
          );
          discordUserId = fsUsers[0]?.discord_user_id ?? null;
        }

        if (!discordUserId) {
          console.log(`[brain-intervention] ${person.name ?? person.id} — no discord_user_id, skipping`);
          results.skipped++;
          // Log as skipped intervention so we don't keep retrying
          await brainPost("interventions", {
            person_id:      person.id,
            trigger_reason: trigger.reason,
            message:        null,
            channel:        "discord",
            status:         "skipped_no_discord",
            sent_at:        new Date().toISOString(),
            metadata:       { stress_level: trigger.stress, momentum: ctx.momentum_state },
          }).catch(e => console.error("[brain-intervention] log skip failed:", e.message));
          continue;
        }

        // 4. Compose and send DM
        const message = composeMessage(person, ctx);
        const dmChannelId = await createDM(discordUserId);
        await sendDM(dmChannelId, message);

        // 5. Log successful intervention
        await brainPost("interventions", {
          person_id:      person.id,
          trigger_reason: trigger.reason,
          message,
          channel:        "discord",
          status:         "sent",
          sent_at:        new Date().toISOString(),
          metadata:       {
            stress_level: trigger.stress,
            momentum:     ctx.momentum_state,
            discord_user_id: discordUserId,
          },
        });

        results.sent++;
        results.persons.push({
          id:      person.id,
          name:    person.name,
          reason:  trigger.reason,
          stress:  trigger.stress,
        });

        console.log(
          `[brain-intervention] ✓ DM sent to ${person.name ?? person.id} | reason=${trigger.reason} stress=${trigger.stress}`
        );

        // Rate-limit: avoid Discord rate limits
        await new Promise(r => setTimeout(r, 300));

      } catch (err) {
        console.error(`[brain-intervention] Error for ${person.id}:`, err.message);
        results.errors++;

        // Log failed intervention
        await brainPost("interventions", {
          person_id:      person.id,
          trigger_reason: trigger?.reason ?? "unknown",
          message:        null,
          channel:        "discord",
          status:         "error",
          sent_at:        new Date().toISOString(),
          metadata:       { error: err.message, stress_level: trigger?.stress },
        }).catch(() => {});
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[brain-intervention] Done in ${elapsed}ms. Sent: ${results.sent}, Skipped: ${results.skipped}, Errors: ${results.errors}`
    );
    return res.status(200).json({ ok: true, elapsed_ms: elapsed, ...results });

  } catch (err) {
    console.error("[brain-intervention] Fatal:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
