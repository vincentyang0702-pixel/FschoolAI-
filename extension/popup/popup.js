// popup.js — NeuroAgi extension popup
// Handles auth and triggers page capture via background service worker.

const SUPABASE_URL  = "https://wqgxpouhbwhwpzudrptp.supabase.co";
const SUPABASE_ANON = "sb_publishable_e-3KMudaL-iXf5GGsuiQaA_VW21ZZFA";

// Write to the isolated `neuroagi` schema — the SAME schema the app reads from
// (src/supabase.js sets db.schema = 'neuroagi'). Both sides MUST match or synced
// data (and login, which reads the users table) is invisible. (not public.* — Vincent's.)
const SB_PROFILE = { "Accept-Profile": "public", "Content-Profile": "public" };

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...SB_PROFILE,
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(json?.message ?? json?.error ?? `Supabase ${res.status}`);
  return json;
}

function randomUUID() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

// ── Screen helpers ────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg; el.classList.add("visible");
}
function clearError(id) { document.getElementById(id).classList.remove("visible"); }

// ── Auth ──────────────────────────────────────────────────────────────────────
async function login(email, password) {
  const hash = await sha256(password);
  const rows = await sbFetch(
    `users?email=eq.${encodeURIComponent(email.toLowerCase())}&password_hash=eq.${hash}&select=id,name,email`,
    { method: "GET" }
  );
  if (!rows?.length) throw new Error("Incorrect email or password");
  return rows[0];
}

async function signup(name, email, password) {
  const hash = await sha256(password);
  const id   = randomUUID();
  const rows = await sbFetch("users", {
    method: "POST",
    body: JSON.stringify({ id, name, email: email.toLowerCase(), password_hash: hash }),
  });
  return rows?.[0] ?? { id, name, email };
}

async function saveSession(user) { await chrome.storage.local.set({ neuroagi_user: user }); }
async function getSession()      { const { neuroagi_user } = await chrome.storage.local.get("neuroagi_user"); return neuroagi_user ?? null; }
async function clearSession()    { await chrome.storage.local.remove(["neuroagi_user", "neuroagi_captures", "neuroagi_stats", "neuroagi_captured_urls"]); }
// Switching accounts: wipe the previous user's captures/stats/dedupe map so they
// never bleed into (or get attributed to) the newly logged-in user.
async function switchToUser(user) {
  const prior = await getSession();
  if (prior && prior.id !== user.id) await clearSession();
  await saveSession(user);
}

// ── Capture screen state ──────────────────────────────────────────────────────
const STEPS = ["courses", "assignments", "grades"];

async function loadCaptureScreen(user) {
  showScreen("screen-capture");
  document.getElementById("user-initial").textContent   = (user.name?.[0] ?? "?").toUpperCase();
  document.getElementById("user-name-display").textContent  = user.name ?? "";
  document.getElementById("user-email-display").textContent = user.email ?? "";

  const { neuroagi_captures = [], neuroagi_stats = {} } = await chrome.storage.local.get(["neuroagi_captures","neuroagi_stats"]);
  renderSteps(neuroagi_captures);
  renderStats(neuroagi_stats);
}

function renderSteps(captures) {
  STEPS.forEach((_, i) => {
    const el = document.getElementById(`step-${i}`);
    el.className = "step";
    if (i < captures.length)  el.classList.add("done");
    else if (i === captures.length) el.classList.add("active");
  });
  const allDone = captures.length >= STEPS.length;
  document.getElementById("reset-btn").style.display = allDone ? "block" : "none";
  document.getElementById("status-msg").textContent = allDone
    ? "All pages captured — data synced to NeuroAgi ✓"
    : "Navigate to the highlighted page on your portal, then click Capture";
}

function renderStats(stats) {
  document.getElementById("stat-courses").textContent     = stats.courses     ?? "—";
  document.getElementById("stat-assignments").textContent = stats.assignments ?? "—";
  document.getElementById("stat-grades").textContent      = stats.grades      ?? "—";
}

function setProcessing(visible, label = "Reading page…") {
  const row = document.getElementById("processing-row");
  row.classList.toggle("visible", visible);
  document.getElementById("processing-label").textContent = label;
  document.getElementById("capture-btn").disabled = visible;
}

// ── Capture flow ──────────────────────────────────────────────────────────────
async function captureCurrentPage(user) {
  setProcessing(true, "Connecting to your portal…");
  try {
    // 1. Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");

    // ── PRIMARY: call the LMS's own API via the logged-in session ─────────────
    // Runs in the page's MAIN world so it can read window.ENV / M.cfg / D2L and
    // fetch with the session cookie. Complete + accurate + fast (no Claude, no
    // hidden tabs). Returns { lms:null } on Blackboard/unknown → we scrape instead.
    let api = null;
    try {
      const [inj] = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, world: "MAIN", func: lmsApiSync,
      });
      api = inj?.result ?? null;
    } catch { /* injection blocked → fall through to scrape */ }

    if (api?.lms && (api.courses?.length || api.assignments?.length)) {
      setProcessing(true, `Syncing ${api.courses.length} courses via ${api.lms}…`);
      const res = await chrome.runtime.sendMessage({ type: "NEUROAGI_API_INGEST", userId: user.id, data: api });
      if (!res?.ok) throw new Error(res?.error ?? "Sync failed");
      const allCaptures = ["courses", "assignments", "grades"].map(step => ({ step, auto: true, timestamp: Date.now() }));
      await chrome.storage.local.set({ neuroagi_captures: allCaptures, neuroagi_stats: res.stats });
      renderSteps(allCaptures);
      renderStats(res.stats);
      document.getElementById("status-msg").textContent =
        `Synced ✓ — ${res.counts.courses} courses, ${res.counts.assignments} assignments, ${res.counts.grades} grades (${api.lms} API)`;
      return;
    }

    // ── FALLBACK: scrape the page + Claude (works on any portal) ───────────────
    setProcessing(true, "Reading page content…");
    const [{ result: pageContent }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent,
    });

    if (!pageContent?.text) throw new Error("Could not read page content");

    setProcessing(true, "Extracting academic data…");

    // 3. Send to background — Claude parses it
    const { neuroagi_captures = [] } = await chrome.storage.local.get("neuroagi_captures");
    const stepIndex = Math.min(neuroagi_captures.length, STEPS.length - 1);
    const stepHint  = STEPS[stepIndex]; // "courses" | "assignments" | "grades"

    const result = await chrome.runtime.sendMessage({
      type:     "NEUROAGI_EXTRACT",
      userId:   user.id,
      pageContent,
      stepHint,
    });

    if (!result?.ok) throw new Error(result?.error ?? "Extraction failed");

    // 4. Save capture record and update stats
    const updatedCaptures = [...neuroagi_captures, { step: stepHint, url: tab.url, timestamp: Date.now() }];
    let stats = result.stats;
    await chrome.storage.local.set({ neuroagi_captures: updatedCaptures, neuroagi_stats: stats });

    renderSteps(updatedCaptures);
    renderStats(stats);
    document.getElementById("status-msg").textContent = result.message ?? "Captured ✓";

    // 5. Auto-crawl: the background worker DISCOVERS each course's assignments +
    //    grades pages from the page's real links (works on any portal) and learns
    //    the pattern per domain. Runs after any "courses" capture.
    if (stepHint === "courses") {
      setProcessing(true, `Discovering your courses & syncing grades…`);
      document.getElementById("status-msg").textContent =
        `Auto-syncing your courses — this may take a minute…`;

      const crawl = await chrome.runtime.sendMessage({
        type:        "NEUROAGI_AUTOCRAWL",
        userId:      user.id,
        pageContent,  // includes links → worker discovers + learns the portal layout
        originTabId: tab.id,
      });

      if (crawl?.ok) {
        const allCaptures = [
          ...updatedCaptures,
          { step: "assignments", auto: true, timestamp: Date.now() },
          { step: "grades",      auto: true, timestamp: Date.now() },
        ];
        const finalStats = await chrome.runtime.sendMessage({
          type: "NEUROAGI_STATS", userId: user.id,
        }).then(r => r?.stats ?? stats).catch(() => stats);

        await chrome.storage.local.set({ neuroagi_captures: allCaptures, neuroagi_stats: finalStats });
        renderSteps(allCaptures);
        renderStats(finalStats);
        document.getElementById("status-msg").textContent =
          `All done ✓ — ${crawl.totalAssignments ?? 0} assignments, ${crawl.totalGrades ?? 0} grades synced`;
      } else {
        document.getElementById("status-msg").textContent =
          "Courses synced. Visit a grades/assignments page and click Capture to add more.";
      }
    }

  } catch (err) {
    document.getElementById("status-msg").textContent = `Error: ${err.message}`;
  } finally {
    setProcessing(false);
  }
}

// Injected into the page's MAIN world — talks to the LMS's own API using the
// student's existing login session (cookies). Returns normalized courses +
// assignments + grades, or { lms: null } if no supported API → caller scrapes.
// Must be fully self-contained (no outside references — it is serialized + injected).
async function lmsApiSync() {
  const origin = location.origin;
  const D = (...a) => { try { console.log("[NeuroAgi]", ...a); } catch {} };
  D("sync start — Canvas:", !!(window.ENV && window.ENV.current_user_id),
    "Moodle:", !!(window.M && window.M.cfg && window.M.cfg.sesskey),
    "D2L:", !!(window.D2L || localStorage.getItem("XSRF.Token")));
  const getJSON = async (url, opts = {}) => {
    const r = await fetch(url, {
      credentials: opts.credentials || "same-origin",
      headers: { Accept: "application/json", ...(opts.headers || {}) },
      method: opts.method || "GET",
      body: opts.body,
    });
    if (!r.ok) throw new Error(url + " -> " + r.status);
    return { r, data: await r.json() };
  };

  // ── CANVAS ──────────────────────────────────────────────────────────────
  try {
    if (window.ENV && window.ENV.current_user_id) {
      const pageAll = async (path) => {
        let url = origin + "/api/v1" + path + (path.includes("?") ? "&" : "?") + "per_page=100";
        const out = [];
        for (let i = 0; i < 25 && url; i++) {
          const { r, data } = await getJSON(url);
          if (Array.isArray(data)) out.push(...data); else break;
          const m = (r.headers.get("Link") || "").match(/<([^>]+)>;\s*rel="next"/);
          url = m ? m[1] : null;
        }
        return out;
      };
      let rawCourses = await pageAll("/courses?enrollment_state=active&enrollment_type=student&include[]=total_scores");
      if (!rawCourses.length) rawCourses = await pageAll("/courses?include[]=total_scores");
      const courses = rawCourses
        .filter(c => c.name && !c.access_restricted_by_date)
        .map(c => {
          const es = Array.isArray(c.enrollments) ? c.enrollments : [];
          const e = es.find(x => x.type === "student" || x.role === "StudentEnrollment") || es[0] || null;
          return { id: String(c.id), name: c.name || "", course_code: c.course_code || "",
                   current_score: e?.computed_current_score ?? null, final_score: e?.computed_final_score ?? null };
        });
      const assignments = [];
      await Promise.all(courses.map(async (c) => {
        try {
          const raw = await pageAll(`/courses/${c.id}/assignments?include[]=submission`);
          for (const a of raw) {
            const s = a.submission || {};
            assignments.push({ course_ref: c.id, id: String(a.id), title: a.name || "Assignment",
              due_at: a.due_at || null, points_possible: a.points_possible ?? null,
              score: s.score ?? null, submitted_at: s.submitted_at || null,
              missing: Boolean(s.missing) || s.workflow_state === "unsubmitted" });
          }
        } catch { /* skip course */ }
      }));
      D("Canvas synced — courses", courses.length, "| assignments", assignments.length, "| graded courses", courses.filter(c => c.current_score != null).length);
      return { lms: "canvas", courses, assignments };
    }
  } catch (e) { D("adapter error:", e && e.message); }

  // ── MOODLE (internal AJAX, needs M.cfg.sesskey) ──────────────────────────
  try {
    if (window.M && window.M.cfg && window.M.cfg.sesskey) {
      const sesskey = window.M.cfg.sesskey;
      const call = async (methodname, args) => {
        const { data } = await getJSON(`${origin}/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}&info=${methodname}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([{ index: 0, methodname, args }]) });
        if (Array.isArray(data) && data[0] && !data[0].error) return data[0].data;
        throw new Error("moodle " + methodname);
      };
      const cres = await call("core_course_get_enrolled_courses_by_timeline_classification",
        { classification: "all", limit: 0, offset: 0, sort: "fullname" });
      const mc = (cres && cres.courses) || [];
      const gradeBy = {};
      try { (((await call("gradereport_overview_get_course_grades", {})) || {}).grades || [])
        .forEach(x => { gradeBy[x.courseid] = parseFloat(String(x.grade).replace(/[^\d.]/g, "")) || null; }); } catch {}
      const courses = mc.map(c => ({ id: String(c.id), name: c.fullname || "", course_code: c.shortname || "",
        current_score: gradeBy[c.id] ?? null, final_score: null }));
      const assignments = [];
      await Promise.all(courses.map(async (c) => {
        try {
          const ar = await call("mod_assign_get_assignments", { courseids: [Number(c.id)] });
          for (const a of ((ar && ar.courses && ar.courses[0] && ar.courses[0].assignments) || [])) {
            assignments.push({ course_ref: c.id, id: String(a.id), title: a.name || "Assignment",
              due_at: a.duedate ? new Date(a.duedate * 1000).toISOString() : null,
              points_possible: a.grade > 0 ? a.grade : null, score: null, submitted_at: null, missing: false });
          }
        } catch { /* skip */ }
      }));
      return { lms: "moodle", courses, assignments };
    }
  } catch (e) { D("adapter error:", e && e.message); }

  // ── BRIGHTSPACE / D2L (Valence via session + XSRF token) ─────────────────
  try {
    if (window.D2L || localStorage.getItem("XSRF.Token")) {
      const xsrf = localStorage.getItem("XSRF.Token") || "";
      const dget = async (path) => (await getJSON(origin + path,
        { credentials: "include", headers: { "X-Csrf-Token": xsrf } })).data;

      // Tenants run different API versions — discover them, fall back to known-good.
      let lpV = "1.30", leV = "1.50";
      try {
        const vers = await dget("/d2l/api/versions/");
        const pick = (code) => (vers.find(v => v.ProductCode === code) || {}).LatestVersion;
        lpV = pick("lp") || lpV; leV = pick("le") || leV;
      } catch {}

      const courses = [];
      let bookmark = "";
      for (let i = 0; i < 20; i++) {
        const ps = await dget(`/d2l/api/lp/${lpV}/enrollments/myenrollments/?orgUnitTypeId=3&isActive=true${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ""}`);
        for (const it of (ps.Items || [])) { const o = it.OrgUnit || {}; courses.push({ id: String(o.Id), name: o.Name || "", course_code: o.Code || "", current_score: null, final_score: null }); }
        if (ps.PagingInfo && ps.PagingInfo.HasMoreItems) bookmark = ps.PagingInfo.Bookmark; else break;
      }
      const assignments = [];
      await Promise.all(courses.map(async (c) => {
        const courseAssigns = [];
        // Assignment folders (Dropbox)
        try {
          for (const f of (await dget(`/d2l/api/le/${leV}/${c.id}/dropbox/folders/`) || []))
            courseAssigns.push({ course_ref: c.id, id: String(f.Id), title: f.Name || "Assignment", due_at: f.DueDate || null, points_possible: null, score: null, submitted_at: null, missing: false });
        } catch {}
        // Grades: per-item values give us assignment scores AND a computed course %
        try {
          const items = (await dget(`/d2l/api/le/${leV}/${c.id}/grades/values/myGradeValues/`)) || [];
          let num = 0, den = 0; const scoreByName = {};
          for (const it of items) {
            if (it.PointsNumerator != null && it.PointsDenominator) {
              num += it.PointsNumerator; den += it.PointsDenominator;
              scoreByName[(it.GradeObjectName || "").toLowerCase()] = { score: it.PointsNumerator, max: it.PointsDenominator };
            }
          }
          for (const a of courseAssigns) {
            const m = scoreByName[(a.title || "").toLowerCase()];
            if (m) { a.score = m.score; if (a.points_possible == null) a.points_possible = m.max; }
          }
          if (den > 0) c.current_score = Math.round((num / den) * 1000) / 10;
        } catch {}
        // Released final grade overrides the computed one when present
        try {
          const gv = await dget(`/d2l/api/le/${leV}/${c.id}/grades/final/values/myGradeValue/`);
          if (gv && gv.PointsNumerator != null && gv.PointsDenominator)
            c.current_score = Math.round((gv.PointsNumerator / gv.PointsDenominator) * 1000) / 10;
        } catch {}
        assignments.push(...courseAssigns);
      }));
      D("D2L synced — versions", lpV, leV, "| courses", courses.length, "| assignments", assignments.length, "| graded courses", courses.filter(c => c.current_score != null).length);
      return { lms: "d2l", courses, assignments };
    }
  } catch (e) { D("adapter error:", e && e.message); }

  D("no supported LMS API detected → falling back to scrape");
  return { lms: null };  // Blackboard / unknown → caller falls back to scraping
}

// Injected into the page via scripting API — runs in page context
function extractPageContent() {
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

  const courseIds = [];
  function addId(id) { if (id && !courseIds.includes(id)) courseIds.push(id); }
  function collectIds(root) {
    root.querySelectorAll?.("a[href]").forEach(a => {
      // D2L course links appear as ?ou=123, /d2l/home/123, or /d2l/le/.../123/
      const patterns = [/[?&]ou=(\d+)/, /\/d2l\/home\/(\d+)/, /\/d2l\/le\/[^/]+\/(\d+)/];
      for (const p of patterns) { const m = a.href.match(p); if (m) addId(m[1]); }
    });
    root.querySelectorAll?.("*").forEach(el => { if (el.shadowRoot) collectIds(el.shadowRoot); });
  }
  collectIds(document);

  // Harvest links (text + href) so the background worker can DISCOVER navigation
  // (courses → assignments → grades) on any portal, instead of hardcoded URLs.
  const links = [];
  const seenHref = new Set();
  function collectLinks(root) {
    root.querySelectorAll?.("a[href]").forEach(a => {
      const h = a.href;
      if (!h || seenHref.has(h) || !h.startsWith(window.location.origin)) return;
      seenHref.add(h);
      links.push({ t: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80), h });
    });
    root.querySelectorAll?.("*").forEach(el => { if (el.shadowRoot) collectLinks(el.shadowRoot); });
  }
  collectLinks(document);

  return {
    text,
    tables:    tables.slice(0, 5).join("\n\n"),
    url:       window.location.href,
    title:     document.title,
    courseIds,
    links:     links.slice(0, 200),
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const user = await getSession();
  user ? await loadCaptureScreen(user) : showScreen("screen-login");

  // Navigation
  document.getElementById("go-signup").addEventListener("click", () => { clearError("signup-error"); showScreen("screen-signup"); });
  document.getElementById("go-login").addEventListener("click",  () => { clearError("login-error");  showScreen("screen-login");  });

  // Login
  document.getElementById("login-btn").addEventListener("click", async () => {
    clearError("login-error");
    const email = document.getElementById("login-email").value.trim();
    const pass  = document.getElementById("login-password").value;
    if (!email || !pass) return showError("login-error", "Please fill in all fields");
    const btn = document.getElementById("login-btn");
    btn.disabled = true; btn.textContent = "Logging in…";
    try {
      const user = await login(email, pass);
      await switchToUser(user);
      await loadCaptureScreen(user);
    } catch (err) {
      showError("login-error", err.message);
    } finally { btn.disabled = false; btn.textContent = "Log In"; }
  });

  // Signup
  document.getElementById("signup-btn").addEventListener("click", async () => {
    clearError("signup-error");
    const name  = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const pass  = document.getElementById("signup-password").value;
    if (!name || !email || !pass) return showError("signup-error", "Please fill in all fields");
    if (pass.length < 6) return showError("signup-error", "Password must be at least 6 characters");
    const btn = document.getElementById("signup-btn");
    btn.disabled = true; btn.textContent = "Creating account…";
    try {
      const user = await signup(name, email, pass);
      await switchToUser(user);
      await loadCaptureScreen(user);
    } catch (err) {
      showError("signup-error", err.message.includes("duplicate") ? "Email already registered" : err.message);
    } finally { btn.disabled = false; btn.textContent = "Create Account"; }
  });

  // Capture
  document.getElementById("capture-btn").addEventListener("click", async () => {
    const user = await getSession();
    if (user) captureCurrentPage(user);
  });

  // Reset
  document.getElementById("reset-btn").addEventListener("click", async () => {
    await chrome.storage.local.remove(["neuroagi_captures","neuroagi_stats"]);
    const user = await getSession();
    if (user) await loadCaptureScreen(user);
  });

  // Logout
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await clearSession(); showScreen("screen-login");
  });

  // Enter key
  document.getElementById("login-password").addEventListener("keydown",  e => { if (e.key==="Enter") document.getElementById("login-btn").click(); });
  document.getElementById("signup-password").addEventListener("keydown", e => { if (e.key==="Enter") document.getElementById("signup-btn").click(); });
}

init();

// Live-update the popup whenever storage changes (auto-capture from content script)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.neuroagi_captures || changes.neuroagi_stats) {
    const captures = changes.neuroagi_captures?.newValue ?? [];
    const stats    = changes.neuroagi_stats?.newValue    ?? {};
    renderSteps(captures);
    renderStats(stats);
    // Show a brief "auto-synced" message
    if (changes.neuroagi_captures?.newValue?.length > (changes.neuroagi_captures?.oldValue?.length ?? 0)) {
      document.getElementById("status-msg").textContent = "Auto-captured ✓ — browse to the next page";
    }
  }
});
