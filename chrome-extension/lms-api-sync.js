// lms-api-sync.js — full-course file enumeration via each LMS's OWN API.
//
// Ported/trimmed from the legacy NeuroAgi extension's shared-sync.js (proven in
// the field). Given the student's live login session, this lists EVERY course
// file without opening tabs or scraping the DOM — the LMS hands us its own file
// index as JSON. The background worker injects lmsFileSync() into the page's
// MAIN world (chrome.scripting.executeScript {world:"MAIN"}), because reaching
// window.ENV (Canvas) / M.cfg.sesskey (Moodle) / the D2L XSRF token requires the
// page's own JS context, which content scripts (isolated world) can't see.
//
// CRITICAL: lmsFileSync MUST stay fully self-contained (every helper defined
// inside its body). executeScript serializes it via Function.prototype.toString,
// so any reference to module scope would throw ReferenceError once injected.
//
// Returns { lms: "canvas"|"moodle"|"d2l"|null, files: [{url, filename, courseId}] }.
// Each `url` is a DIRECT-download URL fetchable with the session cookie:
//   Canvas  — file.url (already carries /download + verifier)
//   Moodle  — content.fileurl (pluginfile.php, session-cookie served)
//   D2L     — .../topics/files/download/{topicId}/DirectFileTopicDownload
//             (the "Download" button URL — plain cookie auth, no XSRF needed,
//              unlike the Valence /content/topics/{id}/file API endpoint)

export function lmsFileSync() {
  const origin = location.origin;
  const CAP = 3000; // absolute safety ceiling on files enumerated per sync

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

  // ── CANVAS ────────────────────────────────────────────────────────────────
  const canvas = async () => {
    const pageAll = async (path) => {
      let url = origin + "/api/v1" + path + (path.includes("?") ? "&" : "?") + "per_page=100";
      const out = [];
      for (let i = 0; i < 40 && url; i++) {
        const { r, data } = await getJSON(url);
        if (Array.isArray(data)) out.push(...data); else break;
        const m = (r.headers.get("Link") || "").match(/<([^>]+)>;\s*rel="next"/);
        url = m ? m[1] : null;
      }
      return out;
    };
    let courses = await pageAll("/courses?enrollment_state=active&enrollment_type=student");
    if (!courses.length) courses = await pageAll("/courses");
    courses = courses.filter((c) => c.id && c.name && !c.access_restricted_by_date);
    const files = [];
    await Promise.all(courses.map(async (c) => {
      try {
        for (const f of await pageAll(`/courses/${c.id}/files`)) {
          if (!f.url) continue;                                   // locked/undownloadable
          files.push({ url: f.url, filename: f.display_name || f.filename || ("file_" + f.id), courseId: String(c.id) });
        }
      } catch { /* Files tab disabled for this course (403) */ }
    }));
    return { lms: "canvas", files: files.slice(0, CAP) };
  };

  // ── MOODLE (internal AJAX; needs M.cfg.sesskey) ─────────────────────────────
  const moodle = async () => {
    const sesskey = window.M.cfg.sesskey;
    const call = async (methodname, args) => {
      const { data } = await getJSON(
        `${origin}/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}&info=${methodname}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([{ index: 0, methodname, args }]) });
      if (Array.isArray(data) && data[0] && !data[0].error) return data[0].data;
      throw new Error("moodle " + methodname);
    };
    const cres = await call("core_course_get_enrolled_courses_by_timeline_classification",
      { classification: "all", limit: 0, offset: 0, sort: "fullname" });
    const mc = (cres && cres.courses) || [];
    const files = [];
    await Promise.all(mc.map(async (c) => {
      try {
        const sections = await call("core_course_get_contents", { courseid: Number(c.id) });
        for (const sec of (sections || [])) {
          for (const mod of (sec.modules || [])) {
            for (const ct of (mod.contents || [])) {
              if (ct.type !== "file" || !ct.fileurl) continue;
              files.push({ url: ct.fileurl, filename: ct.filename || mod.name || "file", courseId: String(c.id) });
            }
          }
        }
      } catch { /* core_course_get_contents not exposed via ajax on this site */ }
    }));
    return { lms: "moodle", files: files.slice(0, CAP) };
  };

  // ── D2L / BRIGHTSPACE (internal Valence via session + XSRF token) ───────────
  const d2l = async () => {
    const xsrf = localStorage.getItem("XSRF.Token") || "";
    const dget = async (path) => (await getJSON(origin + path, { credentials: "include", headers: { "X-Csrf-Token": xsrf } })).data;
    // Tenants run different API versions — discover them, fall back to known-good.
    let lpV = "1.30", leV = "1.50";
    try {
      const vers = await dget("/d2l/api/versions/");
      const pick = (code) => (vers.find((v) => v.ProductCode === code) || {}).LatestVersion;
      lpV = pick("lp") || lpV; leV = pick("le") || leV;
    } catch { /* keep defaults */ }

    const courses = [];
    let bookmark = "";
    for (let i = 0; i < 25; i++) {
      const ps = await dget(`/d2l/api/lp/${lpV}/enrollments/myenrollments/?orgUnitTypeId=3&isActive=true${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ""}`);
      for (const it of (ps.Items || [])) { const o = it.OrgUnit || {}; if (o.Id) courses.push(String(o.Id)); }
      if (ps.PagingInfo && ps.PagingInfo.HasMoreItems) bookmark = ps.PagingInfo.Bookmark; else break;
    }
    const files = [];
    await Promise.all(courses.map(async (ou) => {
      try {
        const toc = await dget(`/d2l/api/le/${leV}/${ou}/content/toc`);
        const walk = (mod) => {
          for (const t of (mod.Topics || [])) {
            if (t.TypeIdentifier === "File" && t.TopicId) {
              files.push({
                url: `${origin}/d2l/le/content/${ou}/topics/files/download/${t.TopicId}/DirectFileTopicDownload`,
                filename: t.Title || ("topic_" + t.TopicId),
                courseId: String(ou),
              });
            }
          }
          for (const sub of (mod.Modules || [])) walk(sub);
        };
        for (const m of ((toc && toc.Modules) || [])) walk(m);
      } catch { /* skip course */ }
    }));
    return { lms: "d2l", files: files.slice(0, CAP) };
  };

  // Detect the platform SYNCHRONOUSLY from the page's own globals, then run its
  // adapter. Detection is separated from enumeration so the caller can tell a
  // transient API failure (429/5xx → detected LMS but error:true, retry next
  // visit) apart from "no supported LMS here" (lms:null) — the two must NOT be
  // throttled the same way, or a rate-limit would blacklist the host for hours.
  return (async () => {
    let platform = null;
    try {
      if (window.ENV && window.ENV.current_user_id) platform = "canvas";
      else if (window.M && window.M.cfg && window.M.cfg.sesskey) platform = "moodle";
      else if (window.D2L || localStorage.getItem("XSRF.Token")) platform = "d2l";
    } catch { platform = null; }
    if (!platform) return { lms: null, files: [] };
    try {
      if (platform === "canvas") return await canvas();
      if (platform === "moodle") return await moodle();
      return await d2l();
    } catch (e) {
      // Detected a supported LMS but enumeration failed → signal a retryable error.
      return { lms: platform, error: true, files: [] };
    }
  })();
}
