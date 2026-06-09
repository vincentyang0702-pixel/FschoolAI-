// api/tutor-context.js — Dynamic context fetcher for chatbot agent upgrade
//
// FIRES:  before Claude responds, when the query seems to need live DB data
//         that isn't already in the system prompt
// READS:  Supabase — assignments, courses, flashcards — filtered to what's relevant
// WRITES: nothing — read-only
// RETURNS: a context string injected into the Claude call as an extra system section
//
// WHAT THIS SOLVES:
//   The system prompt has static context (top 5 assignments, course list, GPA).
//   But students ask specific questions: "What's my score in BIO 101?"
//   "What flashcards do I have for Media Studies?" "Which assignments am I missing?"
//   This endpoint detects those queries and fetches the exact data needed.
//
// QUERY CLASSIFICATION (done by Claude Haiku — fast, cheap):
//   assignment_detail  → fetch specific assignment(s) matching query
//   course_grades      → fetch all courses with scores
//   missing_late       → fetch missing/late assignments
//   flashcard_detail   → fetch flashcards for a specific course
//   none               → no DB fetch needed

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl  = process.env.SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!anthropicKey || !supabaseUrl || !supabaseKey) {
    return res.status(200).json({ context: null, reason: "missing env" });
  }

  const { userId, userMessage } = req.body ?? {};
  if (!userId || !userMessage) return res.status(200).json({ context: null });

  const sbHeaders = {
    "apikey":        supabaseKey,
    "Authorization": `Bearer ${supabaseKey}`,
    "Content-Type":  "application/json",
    "Accept-Profile":  "neuroagi",   // app data lives in the `neuroagi` schema,
    "Content-Profile": "neuroagi",   // not public.* (that's Vincent's)
  };

  // ── 1. Classify the query ──────────────────────────────────────────────────
  let queryType = "none";
  let keyword   = null;

  try {
    const classifyRes = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 40,
        messages:   [{
          role: "user",
          content: `Classify this student query for a DB lookup. Return JSON only: {"type":"assignment_detail"|"course_grades"|"missing_late"|"flashcard_detail"|"file_lookup"|"none","keyword":"extracted course/assignment/file name or null"}

Query: "${userMessage.slice(0, 200)}"

Examples:
"What's my score in BIO 101?" → {"type":"course_grades","keyword":"BIO 101"}
"Which assignments am I missing?" → {"type":"missing_late","keyword":null}
"Show me my Physics flashcards" → {"type":"flashcard_detail","keyword":"Physics"}
"What's due for Media Studies essay?" → {"type":"assignment_detail","keyword":"Media Studies"}
"Do you have the Haskell project file?" → {"type":"file_lookup","keyword":"Haskell project"}
"What files / readings do I have for Linear Algebra?" → {"type":"file_lookup","keyword":"Linear Algebra"}
"Send me the syllabus" → {"type":"file_lookup","keyword":"syllabus"}
"How's my GPA?" → {"type":"none","keyword":null}
"What's up?" → {"type":"none","keyword":null}`,
        }],
      }),
    });

    if (classifyRes.ok) {
      const data = await classifyRes.json();
      const text = data.content?.[0]?.text?.trim() ?? "{}";
      // Strip possible markdown fences
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      queryType = parsed.type  ?? "none";
      keyword   = parsed.keyword ?? null;
    }
  } catch { /* fall through to none */ }

  if (queryType === "none") return res.status(200).json({ context: null });

  // ── 2. Fetch relevant data ─────────────────────────────────────────────────
  let context = null;

  try {
    if (queryType === "course_grades") {
      // All courses with scores
      let url = `${supabaseUrl}/rest/v1/courses?user_id=eq.${userId}&select=name,course_code,current_score,final_score&order=name.asc`;
      if (keyword) url += `&or=(name.ilike.*${encodeURIComponent(keyword)}*,course_code.ilike.*${encodeURIComponent(keyword)}*)`;
      const r = await fetch(url, { headers: sbHeaders });
      if (r.ok) {
        const rows = await r.json();
        if (rows.length) {
          context = "LIVE GRADE DATA:\n" + rows
            .map(c => `• ${c.course_code ?? ""} ${c.name}: current ${c.current_score ?? "N/A"}%, final ${c.final_score ?? "N/A"}%`)
            .join("\n");
        }
      }
    }

    else if (queryType === "missing_late") {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/assignments?user_id=eq.${userId}&or=(missing.eq.true,late.eq.true)&select=title,due_at,missing,late,score,points_possible&order=due_at.desc&limit=15`,
        { headers: sbHeaders }
      );
      if (r.ok) {
        const rows = await r.json();
        if (rows.length) {
          context = "MISSING / LATE ASSIGNMENTS:\n" + rows
            .map(a => `• ${a.title} — ${a.missing ? "MISSING" : "LATE"} — due ${a.due_at ? new Date(a.due_at).toLocaleDateString() : "unknown"}${a.score != null ? ` — scored ${a.score}/${a.points_possible}` : ""}`)
            .join("\n");
        } else {
          context = "MISSING / LATE ASSIGNMENTS: None found — all caught up.";
        }
      }
    }

    else if (queryType === "assignment_detail") {
      // `description` = the assignment instructions, so the tutor can advise on what
      // the work actually requires (keyword-matched queries pull the most detail).
      let url = `${supabaseUrl}/rest/v1/assignments?user_id=eq.${userId}&select=title,due_at,score,points_possible,missing,late,submitted_at,description&order=due_at.asc&limit=20`;
      if (keyword) url += `&title=ilike.*${encodeURIComponent(keyword)}*`;
      const r = await fetch(url, { headers: sbHeaders });
      if (r.ok) {
        const rows = await r.json();
        if (rows.length) {
          // When the query targets a specific assignment (keyword), include the full
          // instructions for the top matches; otherwise just the one-line summary.
          context = "ASSIGNMENT DETAILS:\n" + rows
            .map(a => {
              const line = [
                `• ${a.title}`,
                a.due_at        ? `due ${new Date(a.due_at).toLocaleDateString()}` : null,
                a.score != null ? `score ${a.score}/${a.points_possible}` : null,
                a.submitted_at  ? `submitted` : null,
                a.missing       ? "MISSING" : null,
                a.late          ? "LATE"    : null,
              ].filter(Boolean).join(" | ");
              const instr = keyword && a.description
                ? `\n   instructions: ${String(a.description).slice(0, 1200)}`
                : "";
              return line + instr;
            })
            .join("\n");
        }
      }
    }

    else if (queryType === "file_lookup") {
      // Resolve keyword → matching course ids so a course name ("Linear Algebra")
      // and a file/topic name ("Haskell project") both work.
      let courseIds = [];
      if (keyword) {
        const cr = await fetch(
          `${supabaseUrl}/rest/v1/courses?user_id=eq.${userId}&select=id&or=(name.ilike.*${encodeURIComponent(keyword)}*,course_code.ilike.*${encodeURIComponent(keyword)}*)`,
          { headers: sbHeaders }
        );
        if (cr.ok) courseIds = (await cr.json()).map(c => c.id);
      }

      // Embed the course via the files→courses FK so each file shows its course.
      let url = `${supabaseUrl}/rest/v1/files?user_id=eq.${userId}&select=name,file_type,status,folder,source_url,courses(name,course_code)&order=name.asc&limit=25`;
      if (keyword) {
        const kw  = encodeURIComponent(keyword);
        const ors = [`name.ilike.*${kw}*`, `folder.ilike.*${kw}*`];
        if (courseIds.length) ors.push(`course_id.in.(${courseIds.join(",")})`);
        url += `&or=(${ors.join(",")})`;
      }
      const r = await fetch(url, { headers: sbHeaders });
      if (r.ok) {
        const rows = await r.json();
        if (rows.length) {
          // NOTE for the model: this is the file INDEX. You have names + links, NOT
          // the file contents — point the student to source_url; do not pretend to
          // have read the file.
          context = "FILES (synced index — you have names + links, NOT contents; share source_url, don't invent contents):\n" + rows
            .map(f => {
              const course = f.courses?.course_code || f.courses?.name || "";
              return [
                `• ${f.name}`,
                f.file_type ? `(${f.file_type})` : null,
                course      ? `— ${course}` : null,
                f.status    ? `— ${f.status}` : null,
                f.source_url ? `— ${f.source_url}` : null,
              ].filter(Boolean).join(" ");
            })
            .join("\n");
        } else {
          context = "FILES: none matching that in the synced index.";
        }
      }
    }

    else if (queryType === "flashcard_detail") {
      // Find course_id first
      let courseUrl = `${supabaseUrl}/rest/v1/courses?user_id=eq.${userId}&select=id,name,course_code`;
      if (keyword) courseUrl += `&or=(name.ilike.*${encodeURIComponent(keyword)}*,course_code.ilike.*${encodeURIComponent(keyword)}*)`;
      const cr = await fetch(courseUrl, { headers: sbHeaders });
      if (cr.ok) {
        const courses = await cr.json();
        if (courses.length) {
          const courseId = courses[0].id;
          const fr = await fetch(
            `${supabaseUrl}/rest/v1/flashcards?user_id=eq.${userId}&course_id=eq.${courseId}&select=cards`,
            { headers: sbHeaders }
          );
          if (fr.ok) {
            const frows = await fr.json();
            const cards = frows?.[0]?.cards;
            if (cards?.length) {
              context = `FLASHCARDS for ${courses[0].name}:\n` + cards
                .slice(0, 8)
                .map(c => `Q: ${c.question}\nA: ${c.answer}`)
                .join("\n---\n");
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[tutor-context] fetch error:", err.message);
  }

  return res.status(200).json({ context });
}
