// background.js — NeuroAgi extension service worker
// Receives page content, uses Claude to extract academic data,
// then writes structured results to Supabase.
// Files never touch the user's disk — Supabase writes happen in memory.

const SUPABASE_URL  = "https://wqgxpouhbwhwpzudrptp.supabase.co";
const SUPABASE_ANON = "sb_publishable_e-3KMudaL-iXf5GGsuiQaA_VW21ZZFA";

// Write to the isolated `neuroagi` schema — the SAME schema the app reads from
// (src/supabase.js sets db.schema = 'neuroagi'). Both sides MUST match or synced
// data is invisible to the app. (not public.* — that namespace is Vincent's.)
const SB_PROFILE = { "Accept-Profile": "public", "Content-Profile": "public" };

// ── Claude extraction via Vercel proxy ────────────────────────────────────────
// We route through our own API to keep ANTHROPIC_API_KEY server-side.
async function callClaude(system, userContent) {
  const res = await fetch("https://neuro-agi-topaz.vercel.app/api/claude", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system,
      messages:   [{ role: "user", content: userContent }],
      max_tokens: 1500,
    }),
  });
  if (!res.ok) throw new Error(`Claude proxy ${res.status}`);
  const { content } = await res.json();
  return content ?? "";
}

const EXTRACT_SYSTEM = `You are an AI that extracts structured academic data from university portal pages.
The user will paste raw text scraped from their portal. Extract whatever academic data is present.

Return ONLY valid JSON with this exact shape — no explanation, no markdown:
{
  "pageType": "courses | assignments | grades | schedule | other",
  "courses": [
    { "name": "string", "code": "string", "instructor": "string", "term": "string" }
  ],
  "assignments": [
    { "name": "string", "course": "string", "dueDate": "string or null", "status": "pending|submitted|graded", "grade": "string or null", "pointsPossible": "string or null" }
  ],
  "grades": [
    { "course": "string", "grade": "string", "score": "string or null", "percentage": "string or null" }
  ]
}

Rules:
- Include ONLY fields you actually found on the page — leave arrays empty if no data
- dueDate: use the format you see on the page, or null
- grade: letter grade (A, B+, etc.) or percentage — whatever is shown
- If the page is a login page or has no academic data, return { "pageType": "other", "courses": [], "assignments": [], "grades": [] }`;

// ── Supabase write ────────────────────────────────────────────────────────────
// onConflict (e.g. "user_id,data_type") is required so PostgREST UPDATES the
// existing row instead of INSERTing a duplicate (which hits the unique constraint).
async function sbUpsert(table, rows, onConflict) {
  if (!rows?.length) return;
  const url = onConflict
    ? `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`
    : `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "apikey":        SUPABASE_ANON,
      "Authorization": `Bearer ${SUPABASE_ANON}`,
      "Content-Type":  "application/json",
      "Prefer":        "resolution=merge-duplicates",
      ...SB_PROFILE,
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[NeuroAgi] Supabase ${table} error:`, body);
    throw new Error(`Supabase ${table} write failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

// Read existing canvas_data blob, append new items (deduped by key), write back.
// Needed because auto-crawl captures many courses — each must add to the blob, not replace it.
async function appendBlob(userId, dataType, newItems, keyFn) {
  let existing = [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/canvas_data?user_id=eq.${userId}&data_type=eq.${dataType}&select=payload`,
      { headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`, ...SB_PROFILE } }
    );
    const rows = await res.json();
    if (Array.isArray(rows?.[0]?.payload)) existing = rows[0].payload;
  } catch { /* no existing row */ }

  // Merge + dedup
  const seen = new Set(existing.map(keyFn));
  const merged = [...existing];
  for (const item of newItems) {
    const k = keyFn(item);
    if (!seen.has(k)) { seen.add(k); merged.push(item); }
  }

  await sbUpsert("canvas_data", [{
    user_id:   userId,
    data_type: dataType,
    payload:   merged,
    synced_at: new Date().toISOString(),
  }], "user_id,data_type");
}

// ── Structured-table ingest ───────────────────────────────────────────────────
// Derive a stable join key from any course string:
//   "CPS420 - Discrete Structures" → "cps420"
//   "cp8204cps506_w26_01"          → "cp8204"
//   "CMTH108 - Linear Algebra"     → "cmth108"
function deriveCode(s) {
  const str = String(s || "").trim().toLowerCase();
  const m = str.match(/^[a-z]{2,}\s*\d+/);
  return m ? m[0].replace(/\s+/g, "") : str.slice(0, 24);
}

// Parse "85%", "85 / 100", "85" → number (0-100). Letter grades → null.
function parseScore(g) {
  if (g == null) return null;
  const s = String(g);
  const pct  = s.match(/(\d{1,3}(?:\.\d+)?)\s*%/);          if (pct)  return parseFloat(pct[1]);
  const frac = s.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/); if (frac) return (parseFloat(frac[1]) / parseFloat(frac[2])) * 100;
  const num  = s.match(/^\s*(\d{1,3}(?:\.\d+)?)\s*$/);      if (num)  return parseFloat(num[1]);
  return null;
}
function parseNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : n;
}

async function ingestStructured(userId, parsed) {
  const now = new Date().toISOString();
  const courses     = parsed.courses     ?? [];
  const assignments = parsed.assignments ?? [];
  const grades      = parsed.grades      ?? [];

  // 1. Upsert courses (keyed by derived code in canvas_course_id)
  for (const c of courses) {
    const code = deriveCode(c.code || c.name);
    await sbUpsert("courses", [{
      user_id:          userId,
      canvas_course_id: code,
      name:             c.name || c.code || code,
      course_code:      c.code || code,
      source:           "extension",
      updated_at:       now,
    }], "user_id,canvas_course_id");
  }

  // 2. Grades → average percentage per course → set current_score
  const pctByCode = {};
  for (const g of grades) {
    const code = deriveCode(g.course);
    const pct  = parseScore(g.percentage) ?? parseScore(g.score);
    if (pct != null) (pctByCode[code] ||= []).push(pct);
  }
  for (const [code, pcts] of Object.entries(pctByCode)) {
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    await sbUpsert("courses", [{
      user_id:          userId,
      canvas_course_id: code,
      current_score:    Math.round(avg * 10) / 10,
      source:           "extension",
      updated_at:       now,
    }], "user_id,canvas_course_id");
  }

  // 3. Fetch course UUIDs so assignments can reference them
  const codeToId = {};
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/courses?user_id=eq.${userId}&select=id,canvas_course_id`,
      { headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`, ...SB_PROFILE } }
    );
    (await res.json()).forEach(r => { codeToId[r.canvas_course_id] = r.id; });
  } catch { /* leave empty */ }

  // 4. Upsert assignments (canvas_assignment_id = stable code_name key)
  for (const a of assignments) {
    const code = deriveCode(a.course);
    const due  = a.dueDate ? new Date(a.dueDate) : null;
    const submitted = a.status === "submitted" || a.status === "graded";
    await sbUpsert("assignments", [{
      user_id:              userId,
      course_id:            codeToId[code] ?? null,
      canvas_assignment_id: `${code}_${String(a.name || "").slice(0, 48)}`,
      title:                a.name || "Assignment",
      due_at:               due && !isNaN(due.getTime()) ? due.toISOString() : null,
      points_possible:      parseNum(a.pointsPossible),
      score:                parseScore(a.grade),
      submitted_at:         submitted ? now : null,
      missing:              a.status === "missing",
      source:               "extension",
      updated_at:           now,
    }], "user_id,canvas_assignment_id");
  }

  return { courses: courses.length, assignments: assignments.length, grades: grades.length };
}

// ── Main extraction handler ───────────────────────────────────────────────────
// ── Structured ingest straight from an LMS API (no Claude needed) ─────────────
async function ingestApiData(userId, data) {
  const now = new Date().toISOString();
  const courses     = data.courses     || [];
  const assignments = data.assignments || [];

  // 1. Bulk-upsert courses, keyed by the real LMS course id.
  if (courses.length) {
    await sbUpsert("courses", courses.map(c => ({
      user_id:          userId,
      canvas_course_id: String(c.id),
      name:             c.name || c.course_code || String(c.id),
      course_code:      c.course_code || null,
      current_score:    c.current_score ?? null,
      final_score:      c.final_score ?? null,
      source:           "extension",
      updated_at:       now,
    })), "user_id,canvas_course_id");
  }

  // 2. Map course id → row UUID so assignments can reference it.
  const refToId = {};
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/courses?user_id=eq.${userId}&select=id,canvas_course_id`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, ...SB_PROFILE } }
    );
    (await res.json()).forEach(r => { refToId[String(r.canvas_course_id)] = r.id; });
  } catch { /* leave empty */ }

  // 3. Bulk-upsert assignments.
  if (assignments.length) {
    await sbUpsert("assignments", assignments.map(a => ({
      user_id:              userId,
      course_id:            refToId[String(a.course_ref)] ?? null,
      canvas_assignment_id: String(a.id),
      title:                a.title || "Assignment",
      due_at:               a.due_at || null,
      points_possible:      a.points_possible ?? null,
      score:                a.score ?? null,
      submitted_at:         a.submitted_at || null,
      missing:              Boolean(a.missing),
      source:               "extension",
      updated_at:           now,
    })), "user_id,canvas_assignment_id");
  }

  return {
    courses:     courses.length,
    assignments: assignments.length,
    grades:      courses.filter(c => c.current_score != null).length
                 + assignments.filter(a => a.score != null).length,
  };
}

async function extract(userId, pageContent, stepHint) {
  const { text, tables, url, title } = pageContent;

  const userContent = `Page URL: ${url}
Page title: ${title}
Step hint: I'm expecting to find "${stepHint}" data on this page.

Page content:
${text}

${tables ? `Tables found:\n${tables}` : ""}`;

  // DIAGNOSTIC — show exactly what text we captured from the page
  console.log("[NeuroAgi] Captured text length:", text?.length ?? 0);
  console.log("[NeuroAgi] Captured text preview:", (text ?? "").slice(0, 600));
  console.log("[NeuroAgi] Tables captured:", tables?.slice(0, 300));
  console.log("[NeuroAgi] Course IDs found:", pageContent.courseIds);

  // Call Claude to parse
  const raw = await callClaude(EXTRACT_SYSTEM, userContent);
  console.log("[NeuroAgi] Claude raw response:", raw);

  // Parse JSON from Claude response — robustly extract the JSON object
  let parsed;
  try {
    let jsonStr = raw.trim();
    // Strip markdown code fences if present
    jsonStr = jsonStr.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
    // Extract the outermost { ... } object even if Claude added prose around it
    const first = jsonStr.indexOf("{");
    const last  = jsonStr.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      jsonStr = jsonStr.slice(first, last + 1);
    }
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    console.error("[NeuroAgi] JSON parse failed. Raw was:", raw);
    throw new Error(`Could not parse Claude response: ${raw.slice(0, 120)}`);
  }

  if (parsed.pageType === "other") {
    return {
      ok:      true,
      message: "No academic data found on this page — try a different page",
      stats:   await getCurrentStats(userId),
    };
  }

  // Write to the structured courses + assignments tables so the WHOLE app
  // (dashboard, study page, AI tutor) sees the data — not just blobs.
  const counts = await ingestStructured(userId, parsed);
  const stats  = await getCurrentStats(userId);

  const parts = [];
  if (counts.courses)     parts.push(`${counts.courses} courses`);
  if (counts.assignments) parts.push(`${counts.assignments} assignments`);
  if (counts.grades)      parts.push(`${counts.grades} grades`);

  return {
    ok:      true,
    message: parts.length ? `Captured ${parts.join(", ")} ✓` : "Page captured — minimal data found",
    stats,
    counts,
  };
}

async function getCurrentStats(userId) {
  // Count rows in the structured tables (HEAD request returns Content-Range count)
  const stats = { courses: "—", assignments: "—", grades: "—" };
  try {
    const headers = {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${SUPABASE_ANON}`,
      "Prefer": "count=exact",
      "Range": "0-0",
      ...SB_PROFILE,
    };
    const countFrom = async (q) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers });
      const cr  = res.headers.get("content-range"); // e.g. "0-0/23"
      const total = cr?.split("/")?.[1];
      return total != null ? Number(total) : "—";
    };
    stats.courses     = await countFrom(`courses?user_id=eq.${userId}&source=eq.extension&select=id`);
    stats.assignments = await countFrom(`assignments?user_id=eq.${userId}&source=eq.extension&select=id`);
    stats.grades      = await countFrom(`assignments?user_id=eq.${userId}&source=eq.extension&score=not.is.null&select=id`);
  } catch { /* leave dashes */ }
  return stats;
}

// ── Adaptive auto-crawl ───────────────────────────────────────────────────────
// Instead of hardcoding each LMS's URLs, we DISCOVER navigation by reading the
// real links on the page, then LEARN (cache) the working URL template per domain
// so future syncs are instant. Falls back to Claude link-reasoning for portals
// the heuristics don't recognize, and self-heals when a template stops working.

const NAV_DISCOVERY_SYSTEM = `You help a browser extension navigate a student's university LMS — could be Canvas, Moodle, Blackboard, Brightspace/D2L, or anything else.
You get the current page URL and a list of on-page links ({t: visible text, h: url}). Identify navigation targets.
Return ONLY JSON, no prose, no markdown:
{
  "courseLinks": [{ "id": "short id from the url", "name": "course name", "href": "exact url" }],
  "assignmentsHref": "exact url of the link on THIS page leading to assignments/coursework/tasks, or null",
  "gradesHref": "exact url of the link on THIS page leading to grades/marks/results, or null"
}
Rules:
- courseLinks = links to individual course home pages only (ignore global nav, calendars, settings). Empty array if this isn't a course-list page.
- assignmentsHref / gradesHref = the single best link for the CURRENT course, or null if not present on this page.
- Always copy exact href strings from the input.`;

function parseClaudeJSON(raw) {
  let s = (raw || "").trim().replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

// Claude fallback: reason over the page's links when heuristics come up empty.
async function discoverNav(pageContent, pageUrl) {
  const linkList = (pageContent.links || []).map(l => `${l.t} -> ${l.h}`).join("\n").slice(0, 8000);
  try { return parseClaudeJSON(await callClaude(NAV_DISCOVERY_SYSTEM, `Current page: ${pageUrl}\n\nLinks on this page:\n${linkList}`)); }
  catch { return { courseLinks: [], assignmentsHref: null, gradesHref: null }; }
}

// Cheap heuristic course-link detection for the common LMSs (no Claude call).
function harvestCourseLinks(links = []) {
  const pats = [
    /\/courses\/(\d+)/,                            // Canvas
    /[?&]ou=(\d+)/,                                // D2L Brightspace
    /\/course\/view\.php\?id=(\d+)/,               // Moodle
    /\/ultra\/courses\/_(\d+)_/,                   // Blackboard Ultra
    /\/webapps\/blackboard\/.*course_id=_(\d+)_/,  // Blackboard classic
  ];
  const byId = new Map();
  for (const l of links) {
    for (const p of pats) {
      const m = l.h.match(p);
      if (m) { if (!byId.has(m[1])) byId.set(m[1], { id: m[1], href: l.h, name: l.t || "" }); break; }
    }
  }
  return [...byId.values()];
}

// Pick a link by keyword on its visible text first, then its url.
function findLinkByKeywords(links = [], re) {
  return (links.find(l => re.test(l.t)) || links.find(l => re.test(l.h)) || null)?.h ?? null;
}

// Generalize a discovered URL into a reusable template by masking origin + course id.
function toTemplate(href, origin, id) {
  return href.split(origin).join("{origin}").split(id).join("{id}");
}
function fillTemplate(t, origin, id) {
  return t.split("{origin}").join(origin).split("{id}").join(id);
}

// Per-domain learned patterns — the "self-training" memory.
const PATTERNS_KEY = "neuroagi_portal_patterns";
async function getPattern(domain) {
  const { [PATTERNS_KEY]: all = {} } = await chrome.storage.local.get(PATTERNS_KEY);
  return all[domain] ?? null;
}
async function savePattern(domain, pattern) {
  const { [PATTERNS_KEY]: all = {} } = await chrome.storage.local.get(PATTERNS_KEY);
  all[domain] = { ...pattern, learnedAt: Date.now() };
  await chrome.storage.local.set({ [PATTERNS_KEY]: all });
}

async function autoCrawl(userId, pageContent, originTabId) {
  const baseUrl = (await chrome.tabs.get(originTabId)).url;
  const origin  = new URL(baseUrl).origin;
  const domain  = new URL(baseUrl).host;

  // 1. Discover the course list — heuristic first, Claude fallback.
  let courses = harvestCourseLinks(pageContent.links);
  if (courses.length === 0) {
    const disc = await discoverNav(pageContent, baseUrl);
    courses = (disc.courseLinks || []).filter(c => c.href && c.id);
  }
  if (courses.length === 0) return { totalAssignments: 0, totalGrades: 0, note: "no courses found on this page" };

  // 2. Load any learned URL templates for this portal.
  let tpl = await getPattern(domain);   // { assignmentsTemplate, gradesTemplate } | null

  let totalAssignments = 0, totalGrades = 0;

  for (const course of courses) {
    if (!course.id) continue;
    try {
      let assignUrl = tpl?.assignmentsTemplate ? fillTemplate(tpl.assignmentsTemplate, origin, course.id) : null;
      let gradesUrl = tpl?.gradesTemplate     ? fillTemplate(tpl.gradesTemplate, origin, course.id)     : null;

      // 3. No template yet → discover from this course's own page, then LEARN it.
      if (!assignUrl || !gradesUrl) {
        const coursePage = await fetchPageContent(course.href);
        const clinks = coursePage?.links || [];
        let aHref = assignUrl || findLinkByKeywords(clinks, /assignment|dropbox|coursework|\btask/i);
        let gHref = gradesUrl || findLinkByKeywords(clinks, /grade|\bmark|result|score|progress/i);
        if ((!aHref || !gHref) && clinks.length) {
          const disc = await discoverNav(coursePage, course.href);   // Claude fallback
          aHref = aHref || disc.assignmentsHref;
          gHref = gHref || disc.gradesHref;
        }
        assignUrl = aHref || assignUrl;
        gradesUrl = gHref || gradesUrl;
        if (!tpl && (aHref || gHref)) {
          tpl = {
            assignmentsTemplate: aHref ? toTemplate(aHref, origin, course.id) : null,
            gradesTemplate:      gHref ? toTemplate(gHref, origin, course.id) : null,
          };
          await savePattern(domain, tpl);  // reused for every later course + future syncs
        }
      }

      if (assignUrl) {
        const c = await fetchPageContent(assignUrl);
        if (c) { const r = await extract(userId, c, "assignments"); if (r.ok) totalAssignments += r.counts?.assignments ?? 0; }
      }
      if (gradesUrl) {
        const c = await fetchPageContent(gradesUrl);
        if (c) { const r = await extract(userId, c, "grades"); if (r.ok) totalGrades += r.counts?.grades ?? 0; }
      }
    } catch { /* skip failed course */ }
  }

  return { totalAssignments, totalGrades };
}

// Fetch a page's text content via a background tab (invisible to user)
async function fetchPageContent(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      const tabId = tab.id;
      // Wait for page to load
      function onUpdated(updatedTabId, info) {
        if (updatedTabId !== tabId || info.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        // Inject content extractor
        chrome.scripting.executeScript(
          { target: { tabId }, func: extractPageContentFn },
          (results) => {
            chrome.tabs.remove(tabId); // close background tab
            resolve(results?.[0]?.result ?? null);
          }
        );
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
      // Timeout after 10s
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.remove(tabId).catch(() => {});
        resolve(null);
      }, 10000);
    });
  });
}

// Shadow-DOM-piercing extractor injected into background tabs (D2L uses web components)
function extractPageContentFn() {
  function deepText(root) {
    let out = "";
    const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG"]);
    function walk(node) {
      if (!node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.replace(/\s+/g, " ").trim();
        if (t) out += t + " ";
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (skip.has(node.tagName)) return;
      if (node.shadowRoot) node.shadowRoot.childNodes.forEach(walk);
      if (node.tagName === "IFRAME") {
        try { const doc = node.contentDocument; if (doc?.body) walk(doc.body); } catch {}
        return;
      }
      node.childNodes.forEach(walk);
    }
    walk(root);
    return out;
  }
  const text = deepText(document.body).replace(/\s{3,}/g, "\n").trim().slice(0, 10000);
  const tables = [];
  function collectTables(root) {
    root.querySelectorAll?.("table").forEach(t => {
      const rows = [];
      t.querySelectorAll("tr").forEach(row => {
        const cells = [...row.querySelectorAll("th,td")].map(c => c.innerText.trim());
        if (cells.some(c => c)) rows.push(cells.join(" | "));
      });
      if (rows.length > 1) tables.push(rows.join("\n"));
    });
    root.querySelectorAll?.("*").forEach(el => { if (el.shadowRoot) collectTables(el.shadowRoot); });
  }
  collectTables(document);
  const links = [];
  const seenHref = new Set();
  function collectLinks(root) {
    root.querySelectorAll?.("a[href]").forEach(a => {
      const h = a.href;
      if (!h || seenHref.has(h) || !h.startsWith(location.origin)) return;
      seenHref.add(h);
      links.push({ t: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80), h });
    });
    root.querySelectorAll?.("*").forEach(el => { if (el.shadowRoot) collectLinks(el.shadowRoot); });
  }
  collectLinks(document);
  return { text, tables: tables.slice(0, 5).join("\n\n"), url: location.href, title: document.title, links: links.slice(0, 200) };
}

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "NEUROAGI_EXTRACT") {
    extract(msg.userId, msg.pageContent, msg.stepHint)
      .then(result => sendResponse(result))
      .catch(err   => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "NEUROAGI_AUTOCRAWL") {
    autoCrawl(msg.userId, msg.pageContent, msg.originTabId)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err   => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "NEUROAGI_API_INGEST") {
    (async () => {
      const counts = await ingestApiData(msg.userId, msg.data);
      const stats  = await getCurrentStats(msg.userId);
      return { ok: true, counts, stats };
    })().then(sendResponse).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "NEUROAGI_STATS") {
    getCurrentStats(msg.userId)
      .then(stats => sendResponse({ ok: true, stats }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
