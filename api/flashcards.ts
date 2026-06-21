// api/flashcards.js — Save and load flashcards server-side using service key (bypasses RLS)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Supabase env vars not configured" });
  }

  const sbHeaders = {
    "apikey":          supabaseKey,
    "Authorization":   `Bearer ${supabaseKey}`,
    "Content-Type":    "application/json",
    "Accept-Profile":  "public",
    "Content-Profile": "public",
  };

  const { action, userId, courseId, cards } = req.body ?? {};

  if (!action || !userId) {
    return res.status(400).json({ error: "action and userId are required" });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  if (action === "save") {
    if (!cards) {
      return res.status(400).json({ error: "cards are required for save" });
    }

    // When courseId is provided: upsert (merge with existing deck for that course).
    // When courseId is null/missing (YouLearn docs without a linked course): plain INSERT
    // so each session's cards survive independently.
    const hasCourse = !!courseId;
    const url = hasCourse
      ? `${supabaseUrl}/rest/v1/flashcards?on_conflict=user_id,course_id`
      : `${supabaseUrl}/rest/v1/flashcards`;

    const r = await fetch(url, {
      method:  "POST",
      headers: {
        ...sbHeaders,
        "Prefer": hasCourse ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
      },
      body: JSON.stringify({
        user_id:      userId,
        course_id:    courseId ?? null,
        cards,
        generated_at: new Date().toISOString(),
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.message ?? `Supabase ${r.status}` });
    }

    return res.status(200).json({ ok: true });
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  if (action === "load") {
    if (!courseId) {
      return res.status(400).json({ error: "courseId is required for load" });
    }

    const r = await fetch(
      `${supabaseUrl}/rest/v1/flashcards?user_id=eq.${userId}&course_id=eq.${courseId}&select=cards&limit=1`,
      { headers: { ...sbHeaders, "Prefer": "return=representation" } }
    );

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.message ?? `Supabase ${r.status}` });
    }

    const rows = await r.json();
    return res.status(200).json({ cards: rows?.[0]?.cards ?? null });
  }

  return res.status(400).json({ error: "Unknown action. Use save or load." });
}
