// background.js — FschoolAI Extension service worker
//
// Roles:
//   • Fetches file bytes cross-origin (host_permissions bypass CORS; content scripts can't)
//   • Routes every import through /api/lms-ingest — small files inline (base64),
//     big files via ?action=sign → PUT to storage → ingest by storagePath
//     (Vercel rejects request bodies over ~4.5MB, so inline-only would silently
//     fail on lecture decks — the most valuable files)
//   • Serializes imports through a queue (many tabs / auto-capture can't stampede)
//   • Tracks per-URL capture history so auto-capture never re-imports
//   • Captures completed downloads from academic sites (pending list / opt-in auto)

// Dev vs prod: change to "http://localhost:5173" for local testing
const FSCHOOLAI_ORIGIN = "https://fschoolai.com";
const API_BASE         = FSCHOOLAI_ORIGIN;

const INLINE_B64_LIMIT = 3_000_000;             // base64 chars (~2.2MB binary) — under Vercel's cap
const MAX_FILE_BYTES   = 50 * 1024 * 1024;      // absolute cap, matches the server
const CAPTURED_MAX     = 800;                    // LRU size of the "already imported" URL set
const QUEUE_MAX        = 40;                     // max queued imports at once

// ── Auth state ─────────────────────────────────────────────────────────────

async function getAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["userId", "token", "expiresAt"], (data) => {
      if (!data.userId || !data.token) return resolve(null);
      if (data.expiresAt && Date.now() > data.expiresAt) return resolve(null);
      resolve({ userId: data.userId, token: data.token });
    });
  });
}

async function setAuth(userId, token, expiresAt) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ userId, token, expiresAt }, resolve);
  });
}

// ── Settings ────────────────────────────────────────────────────────────────
// autoCapture: content scripts auto-import files found on LMS-looking pages (default ON)
// autoImportDownloads: completed downloads from academic sites import silently (default OFF)

const SETTING_DEFAULTS = { autoCapture: true, autoImportDownloads: false };

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["settings"], ({ settings }) =>
      resolve({ ...SETTING_DEFAULTS, ...(settings ?? {}) }));
  });
}

// ── Captured-URL memory (auto-capture dedup across visits) ──────────────────
// Server dedups too (files.source_url), but this avoids even re-downloading.

async function getCaptured() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["capturedUrls"], ({ capturedUrls }) =>
      resolve(Array.isArray(capturedUrls) ? capturedUrls : []));
  });
}

async function markCaptured(url) {
  const list = await getCaptured();
  if (list.includes(url)) return;
  const updated = [url, ...list].slice(0, CAPTURED_MAX);
  await new Promise((r) => chrome.storage.local.set({ capturedUrls: updated }, r));
}

// Mirror of the server's canonicalizeSourceUrl — keeps client dedup keys aligned
// with what drive-auth's Classroom sync and lms-ingest store.
function canonicalizeUrl(raw) {
  const s = String(raw ?? "");
  const drive = s.match(/drive\.google\.com\/(?:file\/d\/|open\?.*?id=|uc\?.*?id=)([\w-]{10,})/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}`;
  const gdoc = s.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]{10,})/);
  if (gdoc) return `https://docs.google.com/${gdoc[1]}/d/${gdoc[2]}`;
  return s;
}

// ── Failure memory (auto-capture backoff) ────────────────────────────────────
// Files that permanently fail (scanned PDF over OCR cap, 422s, dead links) must not
// re-download on every page visit. 3 strikes → skip for 7 days.

const FAIL_MAX = 3;
const FAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function getFailures() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["failedUrls"], ({ failedUrls }) =>
      resolve(failedUrls && typeof failedUrls === "object" ? failedUrls : {}));
  });
}

async function recordFailure(key) {
  const map = await getFailures();
  const cur = map[key] ?? { n: 0, t: 0 };
  map[key] = { n: cur.n + 1, t: Date.now() };
  // Bound the map — drop expired entries.
  for (const k of Object.keys(map)) if (Date.now() - map[k].t > FAIL_TTL_MS) delete map[k];
  await new Promise((r) => chrome.storage.local.set({ failedUrls: map }, r));
}

async function isBlockedByFailures(key) {
  const map = await getFailures();
  const f = map[key];
  return !!f && f.n >= FAIL_MAX && Date.now() - f.t < FAIL_TTL_MS;
}

// ── SSRF guard ───────────────────────────────────────────────────────────────
// Auto-capture fetches URLs harvested from page DOMs. A hostile page could plant
// links to internal services (localhost, router admin, cloud metadata) and have the
// extension exfiltrate them into the user's own account. Refuse private targets.

function isPrivateTarget(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!/^https?:$/.test(u.protocol)) return true;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h === "0.0.0.0" || h.endsWith(".local") || h.endsWith(".internal")) return true;
    if (h === "[::1]" || h === "::1") return true;
    if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    return false;
  } catch { return true; }
}

// ── SW keepalive while the import queue is busy ──────────────────────────────
// MV3 kills idle service workers after ~30s; long ingest awaits (OCR, embedding)
// can exceed the extended grace. A trivial API heartbeat keeps the worker alive
// exactly while queueDepth > 0.

let keepaliveTimer = null;
function keepaliveStart() {
  if (keepaliveTimer) return;
  keepaliveTimer = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20_000);
}
function keepaliveStop() {
  if (keepaliveTimer && queueDepth === 0) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
}

// ── Byte helpers ─────────────────────────────────────────────────────────────

function bufferToBase64(buffer) {
  const uint8 = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < uint8.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Decode the first bytes of a base64 string and check for an HTML page —
// an expired LMS session serves a login page instead of the file.
function base64LooksLikeHtml(b64) {
  try {
    const head = atob(String(b64).slice(0, 120)).trimStart().toLowerCase();
    return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<head");
  } catch { return false; }
}

// ── Cloud storage file fetcher ─────────────────────────────────────────────
// Covers: Google Drive/Docs, Dropbox, OneDrive, SharePoint, Box.

function transformCloudUrl(href) {
  try {
    const u = new URL(href);
    const h = u.hostname;

    // ── Google Drive ──────────────────────────────────────────────────────
    if (/drive\.google\.com/.test(h)) {
      const fileMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (fileMatch) return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
      const id = u.searchParams.get("id");
      if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
    }

    // ── Google Docs / Slides / Sheets → export as PDF ────────────────────
    if (/docs\.google\.com/.test(h)) {
      const docMatch = u.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
      if (docMatch) return `https://docs.google.com/document/d/${docMatch[1]}/export?format=pdf`;

      const slidesMatch = u.pathname.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
      if (slidesMatch) return `https://docs.google.com/presentation/d/${slidesMatch[1]}/export/pdf`;

      const sheetsMatch = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (sheetsMatch) return `https://docs.google.com/spreadsheets/d/${sheetsMatch[1]}/export?format=pdf`;
    }

    // ── Dropbox ───────────────────────────────────────────────────────────
    if (/(^|\.)dropbox\.com$/.test(h)) {
      u.hostname = "dl.dropboxusercontent.com";
      u.searchParams.set("dl", "1");
      return u.toString();
    }

    // ── OneDrive personal — handled by fetchOneDriveFile() (no static URL) ─

    // ── SharePoint / OneDrive for Business ───────────────────────────────
    if (/sharepoint\.com/.test(h)) {
      u.searchParams.set("download", "1");
      return u.toString();
    }

    // ── Box ───────────────────────────────────────────────────────────────
    if (/box\.com/.test(h)) {
      const shareMatch = u.pathname.match(/\/s\/([a-zA-Z0-9]+)/);
      if (shareMatch) return `https://app.box.com/shared/static/${shareMatch[1]}`;
    }

  } catch {}
  return null;
}

// OneDrive personal share links need a redirect-following two-step (no static URL).
async function fetchOneDriveFile(href) {
  let res = await fetch(href, { credentials: "include", redirect: "follow" });
  let ct  = res.headers.get("content-type") ?? "";

  if (res.ok && !ct.includes("text/html")) {
    const mimeType = ct.split(";")[0]?.trim() || "application/octet-stream";
    return { bytes: bufferToBase64(await res.arrayBuffer()), mimeType };
  }

  let resolved;
  try { resolved = new URL(res.url); } catch { resolved = null; }
  if (resolved) {
    resolved.searchParams.set("download", "1");
    res = await fetch(resolved.toString(), { credentials: "include", redirect: "follow" });
    ct  = res.headers.get("content-type") ?? "";
  }

  if (!res.ok || ct.includes("text/html")) {
    throw new Error("OneDrive needs sign-in. Open the link in this browser while signed in to OneDrive, or download the file and import it manually.");
  }
  const mimeType = ct.split(";")[0]?.trim() || "application/octet-stream";
  return { bytes: bufferToBase64(await res.arrayBuffer()), mimeType };
}

async function fetchCloudFile(href) {
  let host = "";
  try { host = new URL(href).hostname; } catch {}
  if (/(^|\.)1drv\.ms$|(^|\.)onedrive\.live\.com$/.test(host)) {
    return fetchOneDriveFile(href);
  }

  const downloadUrl = transformCloudUrl(href);
  if (!downloadUrl) throw new Error("Not a recognised cloud storage URL");

  let res = await fetch(downloadUrl, { credentials: "include" });

  // Google Drive: large files return a virus-scan HTML page → confirm token retry.
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    const html = await res.text();
    const confirmMatch = html.match(/[?&]confirm=([0-9A-Za-z_-]+)/);
    if (!confirmMatch) throw new Error("Cloud storage returned HTML — file may be private or login required");
    const sep = downloadUrl.includes("?") ? "&" : "?";
    res = await fetch(`${downloadUrl}${sep}confirm=${confirmMatch[1]}`, { credentials: "include" });
    const ct2 = res.headers.get("content-type") ?? "";
    if (ct2.includes("text/html")) throw new Error("Cloud storage returned HTML — file may be private or login required");
  }

  if (!res.ok) throw new Error(`Cloud fetch failed: HTTP ${res.status}`);

  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
  const buffer   = await res.arrayBuffer();
  return { bytes: bufferToBase64(buffer), mimeType };
}

// ── SW-side file fetch (CORS bypass; used when the content script can't) ────

async function fetchFileBytes(url) {
  const res = await fetch(url, { credentials: "include", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("File too large (max 50 MB)");
  if (buffer.byteLength === 0) throw new Error("Empty response");
  const b64 = bufferToBase64(buffer);
  if (mimeType.includes("text/html") || base64LooksLikeHtml(b64)) {
    throw new Error("Got a login/HTML page instead of the file — are you signed in to the LMS?");
  }
  return { bytes: b64, mimeType };
}

// ── Signed-upload path for big files (Vercel body limit) ────────────────────

async function uploadViaStorage(auth, filename, b64, mimeType) {
  const signRes = await fetch(`${API_BASE}/api/lms-ingest?action=sign`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ userId: auth.userId, name: filename }),
  });
  const sign = await signRes.json().catch(() => ({}));
  if (!signRes.ok || !sign.signedUrl) throw new Error(sign.error ?? "could not get upload URL");

  // Rebuild the binary from base64 for the PUT body.
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const putRes = await fetch(sign.signedUrl, {
    method:  "PUT",
    headers: { "Content-Type": mimeType || "application/octet-stream" },
    body:    bytes,
  });
  if (!putRes.ok) throw new Error(`storage upload failed (${putRes.status})`);
  return { storagePath: sign.path, bucket: sign.bucket };
}

// ── File import (single entry point; queue-serialized) ──────────────────────

let importChain = Promise.resolve();
let queueDepth  = 0;
const inFlight  = new Set();   // canonical URLs currently queued/downloading (cross-frame dedup)

function enqueueImport(task) {
  if (queueDepth >= QUEUE_MAX) {
    return Promise.resolve({ error: "Import queue is full — try again in a minute" });
  }
  queueDepth++;
  keepaliveStart();
  const run = importChain.then(task).finally(() => { queueDepth--; keepaliveStop(); });
  // Keep the chain alive even when a task rejects.
  importChain = run.catch(() => {});
  return run;
}

// Filename ↔ mimeType reconciliation: auto-captured "/files/download?id=N"-style links
// have no real filename, and a guessed wrong extension would mislead the server's
// type detection (it prefers the name's extension). Trust the fetched mimeType.
const MIME_EXT = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/plain": "txt",
  "text/csv": "csv",
};
function reconcileFilename(filename, mimeType) {
  const wantExt = MIME_EXT[mimeType];
  if (!wantExt) return filename;
  const m = String(filename ?? "file").match(/^(.*?)(\.[a-z0-9]{2,5})?$/i);
  const stem = (m?.[1] || "file").replace(/\.$/, "");
  const haveExt = (m?.[2] ?? "").slice(1).toLowerCase();
  return haveExt === wantExt ? filename : `${stem}.${wantExt}`;
}

async function importFileInner({ url, filename, pageUrl, courseId, bytes, mimeType, platform, fetchUrl }) {
  const auth = await getAuth();
  if (!auth) return { error: "Not signed in. Open the extension popup to sign in." };

  const canonicalKey = canonicalizeUrl(url ?? fetchUrl);
  try {
    // Cross-frame race: top frame and an iframe often list the same file — the second
    // occurrence waits in the queue, so re-check history when its turn comes.
    if ((await getCaptured()).includes(canonicalKey)) return { ok: true, skipped: true };

    // Fetch here (SW bypasses CORS) when the content script couldn't, or for
    // pending-download imports where only the URL is known.
    if (!bytes && fetchUrl) {
      if (isPrivateTarget(fetchUrl)) return { error: "Refusing to fetch a private/internal address" };
      const fetched = await fetchFileBytes(fetchUrl);
      bytes    = fetched.bytes;
      mimeType = mimeType && mimeType !== "application/octet-stream" ? mimeType : fetched.mimeType;
    }
    if (!bytes) return { error: "No file data" };
    if (base64LooksLikeHtml(bytes)) {
      return { error: "Got a login/HTML page instead of the file — are you signed in to the LMS?" };
    }

    filename = reconcileFilename(filename, mimeType);
    const sourceUrl = canonicalKey;
    const filePayload = {
      name:      filename,
      mimeType:  mimeType ?? "application/octet-stream",
      sourceUrl,
      provider:  "extension",
      metadata:  { platform: platform ?? "web", courseId: courseId ?? null },
    };

    // Big files can't ride an inline JSON body (Vercel ~4.5MB cap) → storage path.
    if (bytes.length > INLINE_B64_LIMIT) {
      const { storagePath, bucket } = await uploadViaStorage(auth, filename, bytes, filePayload.mimeType);
      filePayload.storagePath = storagePath;
      filePayload.bucket      = bucket;
    } else {
      filePayload.bytes = bytes;
    }

    const res = await fetch(`${API_BASE}/api/lms-ingest`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: auth.userId, courseId: courseId ?? null, file: filePayload }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error ?? `Ingest failed (${res.status})` };

    await markCaptured(sourceUrl);
    // Imported downloads leave the pending list (and the badge shrinks with them).
    if (platform === "download") {
      chrome.storage.local.get(["pendingDownloads"], ({ pendingDownloads = [] }) => {
        const remaining = pendingDownloads.filter(d => d.url !== (fetchUrl ?? url));
        chrome.storage.local.set({ pendingDownloads: remaining });
        chrome.action.setBadgeText({ text: remaining.length ? String(remaining.length) : "" });
      });
    }
    return { ok: true, skipped: data.skipped, documentId: data.documentId };
  } catch (e) {
    return { error: e.message ?? "Network error" };
  }
}

function importFile(payload) {
  return enqueueImport(() => importFileInner(payload));
}

// ── Auto-capture (from content scripts on LMS-looking pages) ────────────────

async function autoImportBatch({ items, pageUrl, platform }) {
  const auth = await getAuth();
  if (!auth) return { ok: false, reason: "signed-out" };
  const settings = await getSettings();
  if (!settings.autoCapture) return { ok: false, reason: "disabled" };

  const captured = await getCaptured();
  const fresh = [];
  const seenThisBatch = new Set();
  for (const it of (items ?? [])) {
    const key = canonicalizeUrl(it.url);
    if (captured.includes(key) || seenThisBatch.has(key) || inFlight.has(key)) continue;
    if (isPrivateTarget(it.url)) continue;              // SSRF guard (defense in depth)
    if (await isBlockedByFailures(key)) continue;       // 3-strike backoff — no eternal retries
    seenThisBatch.add(key);
    inFlight.add(key);
    fresh.push({ ...it, key });
  }

  let imported = 0, skipped = 0, failed = 0;
  try {
    for (const it of fresh) {
      const r = await importFile({
        url: it.url, fetchUrl: it.url, filename: it.filename,
        pageUrl, courseId: null, platform,
      });
      if (r?.ok) { if (r.skipped) skipped++; else imported++; }
      else { failed++; await recordFailure(it.key); }
    }
  } finally {
    for (const it of fresh) inFlight.delete(it.key);
  }
  if (imported > 0) bumpStat("autoImported", imported);
  return { ok: true, imported, skipped, failed, considered: fresh.length };
}

function bumpStat(key, by) {
  chrome.storage.local.get(["stats"], ({ stats = {} }) => {
    stats[key] = (stats[key] ?? 0) + by;
    chrome.storage.local.set({ stats });
  });
}

// ── Message handlers ───────────────────────────────────────────────────────

// (No onMessageExternal handler: web pages must never be able to set this
// extension's identity. The popup's GoTrue login is the only session entry.)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "IMPORT_FILE") {
    importFile(msg.payload).then(sendResponse);
    return true;
  }

  if (msg.type === "IMPORT_CLOUD_FILE") {
    const { href, filename, pageUrl, platform } = msg.payload;
    (async () => {
      const auth = await getAuth();
      if (!auth) return { error: "Not signed in. Open the extension popup to sign in." };
      try {
        const { bytes, mimeType } = await fetchCloudFile(href);
        return await importFile({ url: href, filename, pageUrl, courseId: null, bytes, mimeType, platform });
      } catch (e) {
        return { error: e.message ?? "Cloud fetch failed" };
      }
    })().then(sendResponse);
    return true;
  }

  if (msg.type === "AUTO_IMPORT") {
    autoImportBatch(msg.payload ?? {}).then(sendResponse);
    return true;
  }

  if (msg.type === "GET_AUTH_STATUS") {
    getAuth().then(auth => sendResponse({ signedIn: !!auth, userId: auth?.userId ?? null }));
    return true;
  }

  if (msg.type === "GET_SETTINGS") {
    (async () => {
      const settings = await getSettings();
      const captured = await getCaptured();
      const { stats = {} } = await new Promise(r => chrome.storage.local.get(["stats"], r));
      return { settings, capturedCount: captured.length, stats };
    })().then(sendResponse);
    return true;
  }

  if (msg.type === "SET_SETTINGS") {
    (async () => {
      const current = await getSettings();
      const settings = { ...current, ...(msg.payload ?? {}) };
      await new Promise(r => chrome.storage.local.set({ settings }, r));
      return { ok: true, settings };
    })().then(sendResponse);
    return true;
  }

  if (msg.type === "GET_SITE_MODE") {
    chrome.storage.local.get(["autoSites"], ({ autoSites = {} }) => {
      const mode = autoSites[msg.payload?.host];
      sendResponse({ mode: mode === "on" || mode === "off" ? mode : "unknown" });
    });
    return true;
  }

  if (msg.type === "SET_SITE_MODE") {
    chrome.storage.local.get(["autoSites"], ({ autoSites = {} }) => {
      const host = String(msg.payload?.host ?? "");
      const mode = msg.payload?.mode === "on" ? "on" : "off";
      if (host) autoSites[host] = mode;
      // Bound the map.
      const keys = Object.keys(autoSites);
      if (keys.length > 200) delete autoSites[keys[0]];
      chrome.storage.local.set({ autoSites }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  if (msg.type === "CLEAR_PENDING") {
    chrome.storage.local.set({ pendingDownloads: [] }, () => {
      chrome.action.setBadgeText({ text: "" });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "SIGN_IN") {
    const { userId, token, expiresAt } = msg.payload;
    setAuth(userId, token, expiresAt).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "SIGN_OUT") {
    chrome.storage.local.remove(["userId", "token", "expiresAt"], () => sendResponse({ ok: true }));
    return true;
  }
});

// ── Download capture ─────────────────────────────────────────────────────────
// Completed downloads from academic sites are queued in the popup ("Captured
// downloads"), or imported silently when autoImportDownloads is on.

const ACADEMIC_PATTERNS = [
  /(^|\.)edu(\.[a-z]{2})?$/,     // *.edu / *.edu.au — anchored ("seduction.com" must not match)
  /\.ac\.[a-z]{2}$/, /chaoxing\.com$/, /zhihuishu\.com$/,
  /pronote\.net$/, /brightspace\.com$/, /blackboard\.com$/,
  /instructure\.com$/, /desire2learn\.com$/, /moodle/,
  /sharepoint\.com$/, /teams\.microsoft\.com$/,
];

const DOC_EXT_RE = /\.(pdf|docx?|pptx?|xlsx?|txt|csv)(\?|#|$)/i;

function isAcademic(url) {
  try {
    const { hostname } = new URL(url);
    return ACADEMIC_PATTERNS.some(p => p.test(hostname));
  } catch { return false; }
}

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state || delta.state.current !== "complete") return;

  const [item] = await new Promise(resolve => chrome.downloads.search({ id: delta.id }, resolve));
  if (!item) return;

  // referrer is "" (not null) when absent — `??` would never fall back to the URL.
  const refUrl = item.referrer || item.url;
  if (!isAcademic(refUrl)) return;

  const netUrl = item.finalUrl ?? item.url;           // the network URL (never file://)
  const name   = (item.filename ?? "").split(/[/\\]/).pop() || "file";

  const settings = await getSettings();
  const auth     = await getAuth();

  // Opt-in silent auto-import — document types only.
  if (settings.autoImportDownloads && auth && DOC_EXT_RE.test(netUrl + name)) {
    const r = await importFile({ url: netUrl, fetchUrl: netUrl, filename: name, platform: "download" });
    if (r?.ok) { bumpStat("autoImported", 1); return; }
    // fall through to the pending list so the user can retry manually
  }

  chrome.storage.local.get(["pendingDownloads"], ({ pendingDownloads = [] }) => {
    const updated = [
      { id: delta.id, filename: name, url: netUrl, referrer: item.referrer, timestamp: Date.now() },
      ...pendingDownloads.filter(d => d.url !== netUrl).slice(0, 9),
    ];
    chrome.storage.local.set({ pendingDownloads: updated });
    chrome.action.setBadgeText({ text: String(updated.length) });
    chrome.action.setBadgeBackgroundColor({ color: "#4285F4" });
  });
});
