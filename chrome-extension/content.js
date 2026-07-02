// content.js — Injected into every page to detect file links and inject "Import" buttons.
// Regular files: fetched here using live session cookies (credentials: "include").
// Cloud storage public links (Google Drive/Docs, Dropbox, OneDrive, SharePoint, Box):
// routed to background.js (bypasses CORS restriction).

(function () {
  "use strict";

  // Frame/protocol guards: only http(s) documents with a real host (all_frames
  // injects into iframes — LMS render file lists inside them — but never
  // about:blank, srcdoc, or extension pages).
  if (!/^https?:$/.test(location.protocol) || !location.hostname) return;

  // Never inject on search engines, social media, or the cloud providers' own pages.
  // drive.google.com, docs.google.com, dropbox.com, 1drv.ms, onedrive.live.com, box.com are
  // excluded here only as a page-to-inject-on check — we still catch links TO them from other
  // pages. sharepoint.com is NOT skipped: it's often used as the LMS/course portal itself.
  const SKIP_DOMAINS = /^(www\.)?(search\.brave\.com|google\.com|drive\.google\.com|docs\.google\.com|dropbox\.com|1drv\.ms|onedrive\.live\.com|app\.box\.com|bing\.com|duckduckgo\.com|yahoo\.com|search\.yahoo\.com|yandex\.(com|ru)|baidu\.com|reddit\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|tiktok\.com|youtube\.com|linkedin\.com|github\.com|stackoverflow\.com|amazon\.com|wikipedia\.org|news\.ycombinator\.com)$/i;
  if (SKIP_DOMAINS.test(location.hostname)) return;

  // File extensions we can import
  const IMPORTABLE_EXT = /\.(pdf|docx?|pptx?|xlsx?|txt|csv|mp4|mp3|wav|ogg|m4a|jpg|jpeg|png|gif|webp)(\?|#|$)/i;

  // Cloud storage public/shared link patterns — these must be fetched from the background
  // worker (CORS bypass), not here. Covers Google Drive/Docs, Dropbox, OneDrive, SharePoint, Box.
  const CLOUD_STORAGE_RE = /drive\.google\.com\/(file\/d\/|open\?|uc\?)|docs\.google\.com\/(document|presentation|spreadsheets)\/d\/|dropbox\.com\/s\/|dropbox\.com\/scl\/fi\/|1drv\.ms\/|onedrive\.live\.com\/|[\w-]+\.sharepoint\.com\/|app\.box\.com\/s\//i;

  // Platform tag for metadata only
  function detectPlatform(hostname) {
    if (/chaoxing\.com/.test(hostname))      return "chaoxing";
    if (/zhihuishu\.com/.test(hostname))     return "zhihuishu";
    if (/pronote\.net/.test(hostname))       return "pronote";
    if (/brightspace\.com/.test(hostname))   return "brightspace";
    if (/blackboard\.com/.test(hostname))    return "blackboard";
    if (/instructure\.com/.test(hostname))   return "canvas";
    if (/desire2learn\.com/.test(hostname))  return "d2l";
    if (/moodle/.test(hostname))             return "moodle";
    if (/google\.com/.test(hostname))        return "google";
    if (/microsoft\.com|sharepoint\.com|teams\.microsoft\.com/.test(hostname)) return "microsoft";
    return "web";
  }

  const platform = detectPlatform(location.hostname);

  // ── LMS detection (gates auto-capture — buttons appear everywhere) ─────────
  // Universities often self-host (canvas.uoft.ca has no "instructure" in it), so a
  // hostname match alone misses the most common case. Combine: known platform,
  // LMS-ish URL paths, and LMS-specific DOM markers.
  function looksLikeLms() {
    if (platform !== "web" && platform !== "google" && platform !== "microsoft") return true;
    const path = location.pathname.toLowerCase();
    if (/\/(courses?|course)\/\d+|\/mod\/|\/d2l\/|\/webapps\/|\/ultra\/|\/pluginfile\.php|\/portal\/|\/learn\//.test(path)) return true;
    if (/^(canvas|lms|moodle|elearning|learn|bb|brightspace|classes|courseware)\./i.test(location.hostname)) return true;
    try {
      if (document.querySelector("#application.ic-app, .ic-app, [class*='d2l-'], body[class*='moodle'], #page-mymoodle, meta[name='generator'][content*='Moodle'], #globalNavBar, .bb-offcanvas-panel")) return true;
    } catch { /* DOM not ready */ }
    return false;
  }

  // Google Classroom is owned by the Drive OAuth sync (same files, canonical dedup) —
  // auto-capture there would only duplicate work, so it stays manual-button-only.
  const AUTO_EXCLUDED_HOSTS = /classroom\.google\.com$/i;

  // Auto-capture imports DOCUMENT types only (media is large + often not study
  // material); the manual button still covers everything.
  const AUTO_EXT = /\.(pdf|docx?|pptx?|xlsx?|txt|csv)(\?|#|$)/i;
  const AUTO_URL_HINTS = /\/files\/download|[?&]download=1|\/pluginfile\.php\//i;
  const AUTO_BUDGET = window === window.top ? 8 : 3;   // per page-load; iframes get less
  let autoSent = 0;
  const autoSeen = new Set();

  function collectAutoCandidates() {
    const out = [];
    document.querySelectorAll("a[href]").forEach((a) => {
      const href = a.href;
      if (!href || autoSeen.has(href)) return;
      if (!(AUTO_EXT.test(href) || (AUTO_URL_HINTS.test(href) && !/logout|login/i.test(href)))) return;
      autoSeen.add(href);
      out.push({ url: href, filename: guessFilename(href, a.textContent) });
    });
    return out;
  }

  // Per-site consent: heuristics alone must never grant a random website the power
  // to silently push documents into the student's knowledge base (RAG poisoning).
  // First qualifying visit → one small prompt; the answer is remembered per host.
  function askSiteConsent() {
    return new Promise((resolve) => {
      if (window !== window.top) return resolve(false);   // iframes never prompt
      if (document.getElementById("fschoolai-consent")) return resolve(false);
      const bar = document.createElement("div");
      bar.id = "fschoolai-consent";
      bar.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#111;color:#eee;padding:12px 14px;border-radius:12px;font:13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,0.4);max-width:300px";
      const text = document.createElement("div");
      text.textContent = "FschoolAI: auto-import course files from this site?";
      text.style.marginBottom = "8px";
      const yes = document.createElement("button");
      yes.textContent = "Yes, auto-import";
      yes.style.cssText = "background:#4285F4;color:#fff;border:none;border-radius:8px;padding:6px 12px;margin-right:8px;cursor:pointer;font:inherit";
      const no = document.createElement("button");
      no.textContent = "No";
      no.style.cssText = "background:rgba(255,255,255,0.1);color:#ccc;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit";
      const done = (v) => { bar.remove(); resolve(v); };
      yes.addEventListener("click", () => done(true));
      no.addEventListener("click", () => done(false));
      bar.append(text, yes, no);
      document.body.appendChild(bar);
      setTimeout(() => { if (bar.isConnected) done(false); }, 30_000);  // no answer = no
    });
  }

  let autoTimer = null;
  function scheduleAutoCapture() {
    if (autoTimer) return;
    autoTimer = setTimeout(async () => {
      autoTimer = null;
      try {
        if (!chrome?.runtime?.sendMessage) return;             // orphaned script
        if (AUTO_EXCLUDED_HOSTS.test(location.hostname)) return;
        if (!looksLikeLms()) return;
        if (autoSent >= AUTO_BUDGET) return;
        const items = collectAutoCandidates().slice(0, AUTO_BUDGET - autoSent);
        if (!items.length) return;

        // Per-host consent (remembered): "on" proceeds, "off" stops, unknown prompts once.
        const mode = await new Promise((r) =>
          chrome.runtime.sendMessage({ type: "GET_SITE_MODE", payload: { host: location.hostname } },
            (res) => r(chrome.runtime.lastError ? "off" : (res?.mode ?? "off"))));
        if (mode === "off") return;
        if (mode === "unknown") {
          const authed = await new Promise((r) =>
            chrome.runtime.sendMessage({ type: "GET_AUTH_STATUS" }, (res) => r(!chrome.runtime.lastError && !!res?.signedIn)));
          if (!authed) return;                                  // never prompt signed-out users
          const yes = await askSiteConsent();
          chrome.runtime.sendMessage({ type: "SET_SITE_MODE", payload: { host: location.hostname, mode: yes ? "on" : "off" } },
            () => void chrome.runtime.lastError);
          if (!yes) return;
        }

        autoSent += items.length;
        // Background gates on signed-in + the autoCapture setting, dedups against
        // its captured-URL memory + failure backoff, and serializes the downloads.
        chrome.runtime.sendMessage({
          type: "AUTO_IMPORT",
          payload: { items, pageUrl: location.href, platform },
        }, () => void chrome.runtime.lastError);
      } catch { /* never break the host page */ }
    }, 2500);   // let SPA content settle; batches instead of per-link spam
  }

  // Universal selector — catches file links on any website.
  const SELECTOR = [
    "a[download]",
    "a[href$='.pdf']",  "a[href*='.pdf?']",  "a[href*='.pdf#']",
    "a[href$='.docx']", "a[href*='.docx?']",
    "a[href$='.doc']",  "a[href*='.doc?']",
    "a[href$='.pptx']", "a[href*='.pptx?']",
    "a[href$='.ppt']",  "a[href*='.ppt?']",
    "a[href$='.xlsx']", "a[href*='.xlsx?']",
    "a[href$='.xls']",
    "a[href$='.txt']",  "a[href$='.csv']",
    "a[href$='.mp4']",  "a[href$='.mp3']",
    "a[href*='/download']",
    "a[href*='download=1']",
    "a[href*='/files/download']",
    // Google Drive / Docs public share links
    "a[href*='drive.google.com/file/d/']",
    "a[href*='drive.google.com/open']",
    "a[href*='docs.google.com/document/d/']",
    "a[href*='docs.google.com/presentation/d/']",
    "a[href*='docs.google.com/spreadsheets/d/']",
    // Dropbox public share links
    "a[href*='dropbox.com/s/']",
    "a[href*='dropbox.com/scl/fi/']",
    // OneDrive personal short links + long links
    "a[href*='1drv.ms/']",
    "a[href*='onedrive.live.com/']",
    // SharePoint / OneDrive for Business
    "a[href*='.sharepoint.com/']",
    // Box public share links
    "a[href*='app.box.com/s/']",
  ].join(", ");

  // Text heuristic: links whose visible label mentions a file type
  const TEXT_FILE_RE = /\b(pdf|docx?|pptx?|xlsx?|csv)\b/i;

  const ATTR = "data-fschoolai-btn";

  function guessFilename(href, linkText) {
    try {
      const u   = new URL(href, location.href);
      const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
      if (seg && /\.\w{2,5}$/.test(seg)) return decodeURIComponent(seg);
    } catch {}
    // No real filename in the URL: use the link text WITHOUT inventing an extension —
    // the background reconciles the name against the fetched mimeType (a fabricated
    // ".pdf" would mislead the server's extension-first type detection).
    const clean = (linkText ?? "file").replace(/[^\w\s.-]/g, "").trim().slice(0, 80);
    return clean || "file";
  }

  // ArrayBuffer → base64 in chunks to avoid stack overflow on large files
  function bufferToBase64(buffer) {
    const uint8 = new Uint8Array(buffer);
    const CHUNK = 8192;
    let binary = "";
    for (let i = 0; i < uint8.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, uint8.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  function makeButton(href, filename) {
    const btn = document.createElement("button");
    btn.textContent   = "⬆ Import to FschoolAI";
    btn.style.cssText = `
      display:        inline-flex;
      align-items:    center;
      gap:            5px;
      margin-left:    8px;
      padding:        3px 10px;
      border-radius:  8px;
      border:         none;
      background:     #4285F4;
      color:          #fff;
      font-size:      12px;
      font-weight:    600;
      cursor:         pointer;
      font-family:    -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
      vertical-align: middle;
      transition:     opacity 0.15s;
      white-space:    nowrap;
      z-index:        999999;
    `;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Any sendMessage can reject ("message port closed") if the SW restarts —
      // never leave the button stuck on "Importing…".
      const send = async (message) => {
        try { return await chrome.runtime.sendMessage(message); }
        catch (err) { return { error: err?.message ?? "Extension restarted — try again" }; }
      };

      // Step 1 — check auth first
      const authStatus = await send({ type: "GET_AUTH_STATUS" });
      if (!authStatus?.signedIn) {
        btn.textContent      = "Sign in first ↗";
        btn.style.background = "#ff9500";
        setTimeout(() => { btn.textContent = "⬆ Import to FschoolAI"; btn.style.background = "#4285F4"; }, 3000);
        return;
      }

      btn.textContent   = "Downloading…";
      btn.disabled      = true;
      btn.style.opacity = "0.7";

      // Step 2 — cloud storage links must be fetched from the background service worker
      // because CORS blocks cross-origin fetches from content scripts even with credentials.
      // Background workers with host_permissions bypass CORS entirely.
      if (CLOUD_STORAGE_RE.test(href)) {
        btn.textContent = "Importing…";
        const result = await send({
          type:    "IMPORT_CLOUD_FILE",
          payload: { href, filename, pageUrl: location.href, platform },
        });

        if (result?.ok) {
          btn.textContent      = result.skipped ? "Already indexed ✓" : "Indexed ✓";
          btn.style.background = "#30d158";
          btn.style.opacity    = "1";
        } else {
          btn.textContent      = result?.error?.slice(0, 40) ?? "Failed";
          btn.style.background = "#ff453a";
          btn.style.opacity    = "1";
          btn.disabled         = false;
          setTimeout(() => { btn.textContent = "⬆ Import to FschoolAI"; btn.style.background = "#4285F4"; }, 3000);
        }
        return;
      }

      // Step 2b — regular file: fetch here using live session cookies
      let bytes, mimeType;
      try {
        const fileRes = await fetch(href, { credentials: "include" });
        if (!fileRes.ok) throw new Error(`HTTP ${fileRes.status}`);
        mimeType = fileRes.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
        const buffer = await fileRes.arrayBuffer();
        if (buffer.byteLength > 50 * 1024 * 1024) throw new Error("File too large (max 50 MB)");

        // Validate we got an actual PDF and not an HTML redirect/login page.
        if (mimeType === "application/pdf" || href.match(/\.pdf/i)) {
          const magic = new Uint8Array(buffer.slice(0, 5));
          const isPdf = magic[0] === 0x25 && magic[1] === 0x50 && magic[2] === 0x44 && magic[3] === 0x46 && magic[4] === 0x2D;
          if (!isPdf) throw new Error("Server returned HTML instead of PDF (login wall or redirect)");
        }

        // Big files: don't base64 + copy through sendMessage (message-size + memory
        // limits) — let the background re-fetch and take the storage-upload path.
        if (buffer.byteLength > 2_500_000) throw new Error("__delegate_to_background__");

        bytes = bufferToBase64(buffer);
      } catch (err) {
        // Cross-origin file host (CDN, storage domain) → the content script's fetch is
        // CORS-blocked. The background service worker has host permissions and can
        // fetch it with the same session cookies.
        btn.textContent = "Importing…";
        const bgResult = await send({
          type:    "IMPORT_FILE",
          payload: { url: href, fetchUrl: href, filename, pageUrl: location.href, courseId: null, platform },
        });
        if (bgResult?.ok) {
          btn.textContent      = bgResult.skipped ? "Already indexed ✓" : "Indexed ✓";
          btn.style.background = "#30d158";
          btn.style.opacity    = "1";
        } else {
          btn.textContent      = bgResult?.error?.slice(0, 40) ?? "Download failed";
          btn.style.background = "#ff453a";
          btn.style.opacity    = "1";
          btn.disabled         = false;
          setTimeout(() => { btn.textContent = "⬆ Import to FschoolAI"; btn.style.background = "#4285F4"; }, 3000);
        }
        return;
      }

      // Step 3 — hand bytes to background → lms-ingest
      btn.textContent = "Importing…";

      const result = await send({
        type:    "IMPORT_FILE",
        payload: { url: href, filename, pageUrl: location.href, courseId: null, bytes, mimeType, platform },
      });

      if (result?.ok) {
        btn.textContent      = result.skipped ? "Already indexed ✓" : "Indexed ✓";
        btn.style.background = "#30d158";
        btn.style.opacity    = "1";
      } else {
        btn.textContent      = result?.error?.slice(0, 40) ?? "Failed";
        btn.style.background = "#ff453a";
        btn.style.opacity    = "1";
        btn.disabled         = false;
        setTimeout(() => { btn.textContent = "⬆ Import to FschoolAI"; btn.style.background = "#4285F4"; }, 3000);
      }
    });

    return btn;
  }

  function tryInject(a) {
    if (a.getAttribute(ATTR)) return;
    const href = a.href;
    if (!href || href.startsWith("javascript") || href === location.href) return;
    a.setAttribute(ATTR, "1");
    const btn = makeButton(href, guessFilename(href, a.textContent));
    a.parentNode?.insertBefore(btn, a.nextSibling);
  }

  function injectButtons() {
    // Pass 1: href-based (extension in URL or known cloud storage pattern)
    document.querySelectorAll(SELECTOR).forEach((a) => {
      if (a.getAttribute(ATTR)) return;
      if (IMPORTABLE_EXT.test(a.href) || CLOUD_STORAGE_RE.test(a.href)) tryInject(a);
    });

    // Pass 2: text-based (e.g. links that say "(PDF - 1.1 MB)" but href is a redirect)
    document.querySelectorAll("a[href]").forEach((a) => {
      if (a.getAttribute(ATTR)) return;
      const text = a.textContent?.trim() ?? "";
      if (TEXT_FILE_RE.test(text) && a.href && !a.href.startsWith("javascript")) {
        tryInject(a);
      }
    });
  }

  function scan() {
    injectButtons();
    scheduleAutoCapture();
  }

  // Debounced: MutationObserver fires on every DOM batch, and injectButtons runs two
  // document-wide querySelectorAll passes — unthrottled it would burn CPU on busy
  // SPAs (and now runs in every iframe via all_frames).
  let scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = null; scan(); }, 400);
  }

  if (document.body) scan();
  else window.addEventListener("DOMContentLoaded", scan);

  // Re-scan when the DOM changes (SPA navigation, lazy-loaded content). SPA URL
  // changes always mutate the DOM, so the observer covers them too — a pushState
  // monkey-patch would be dead code in MV3's isolated world anyway.
  if (document.body) {
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener("popstate", scheduleScan);
})();
