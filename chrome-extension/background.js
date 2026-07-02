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

import { lmsFileSync } from "./lms-api-sync.js";

// Dev vs prod: change to "http://localhost:5173" for local testing
const FSCHOOLAI_ORIGIN = "https://fschoolai.com";
const API_BASE         = FSCHOOLAI_ORIGIN;

const FULL_SYNC_TTL_MS = 6 * 60 * 60 * 1000;    // re-sync a given LMS host at most every 6h

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

// Server-declared filename beats anything guessed from link text — viewer links
// (D2L topics, Canvas files, Moodle resources) carry no filename in the URL at all.
function filenameFromDisposition(cd) {
  if (!cd) return null;
  // RFC 5987: filename*=UTF-8'lang'encoded — the language tag is optional but
  // legal (UTF-8'en'r%C3%A9sum%C3%A9.pdf); preferred when both forms are present.
  let m = cd.match(/filename\*\s*=\s*utf-8'[^']*'([^;]+)/i);
  if (m) { try { return decodeURIComponent(m[1].trim()); } catch { /* fall through */ } }
  m = cd.match(/filename\s*=\s*"([^"]+)"/i) || cd.match(/filename\s*=\s*([^;]+)/i);
  if (m) return m[1].trim().replace(/^"+|"+$/g, "") || null;
  return null;
}

// Fallback: the final (post-redirect) URL often carries the real filename —
// e.g. Moodle's /pluginfile.php/.../lecture1.pdf, D2L's signed CDN URLs.
function filenameFromUrl(u) {
  try {
    const seg = new URL(u).pathname.split("/").filter(Boolean).pop() ?? "";
    if (/\.[a-z0-9]{2,8}$/i.test(seg)) return decodeURIComponent(seg);
  } catch {}
  return null;
}

// Redirect chains that end on an SSO/login endpoint mean the LMS session is
// stale — an environmental condition, not a property of the file. Detecting it
// gives a precise error AND keeps it out of the permanent failure backoff.
function looksLikeLoginUrl(u) {
  try {
    const { hostname, pathname } = new URL(u);
    return /(^|\/)(login|signin|sign-in|sso|saml2?|cas|adfs|idp|oauth2?|authorize|authentication)(\/|$|\.)/i.test(pathname)
        || /^(login|sso|auth|idp|cas|adfs)\./i.test(hostname);
  } catch { return false; }
}

function transientError(message) {
  const e = new Error(message);
  e.transient = true;      // importFileWork surfaces this so backoff never strikes it
  return e;
}

// Shared response→bytes pipeline: size caps, HTML/login-wall rejection, and
// server-declared filename extraction (Content-Disposition, then final URL).
async function bytesFromResponse(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Redirect chains can land anywhere — a public viewer URL 302ing to an internal
  // host must not have its content ingested (same rationale as isPrivateTarget on
  // the entry URL; this covers every resolver-derived and post-redirect fetch).
  if (res.url && isPrivateTarget(res.url)) throw new Error("Refusing a private/internal address");
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("File too large (max 50 MB)");
  if (buffer.byteLength === 0) throw new Error("Empty response");
  const b64 = bufferToBase64(buffer);
  if (mimeType.includes("text/html") || base64LooksLikeHtml(b64)) {
    if (looksLikeLoginUrl(res.url)) throw transientError("LMS session expired — log in to your LMS and retry");
    throw new Error("Got a login/HTML page instead of the file — are you signed in to the LMS?");
  }
  const filename = filenameFromDisposition(res.headers.get("content-disposition")) || filenameFromUrl(res.url);
  return { bytes: b64, mimeType, filename, finalUrl: res.url };
}

async function fetchFileBytes(url) {
  const res = await fetch(url, { credentials: "include", redirect: "follow" });
  return bytesFromResponse(res);
}

// ── Viewer-link resolver ─────────────────────────────────────────────────────
// Some LMS links need more than a straight fetch (see viewerRuleFor in content.js):
//   canvas-module-item — /courses/{c}/modules/items/{i} 302s to the item; only
//     File items land on /files/{id} (then rewritten to the raw-bytes URL).
//     fetch() can't expose Location headers (opaqueredirect), so we follow the
//     redirect chain and inspect the FINAL URL instead.
//   moodle-resource — /mod/resource/view.php?id= 302s straight to /pluginfile.php
//     in the common display modes (plain fetch works); embed/frame modes return
//     an HTML wrapper whose pluginfile link we extract (same-origin only).
// Everything else: plain fetch + HTML rejection is the verification.

async function resolveViewerFile(url, hint) {
  if (hint === "canvas-module-item") {
    const res = await fetch(url, { credentials: "include", redirect: "follow" });
    // A stale Canvas session redirects to SSO — that's not "not a file".
    if (looksLikeLoginUrl(res.url)) throw transientError("LMS session expired — log in to your LMS and retry");
    const m = (res.url ?? "").match(/\/files\/(\d+)/);
    if (!m) throw new Error("Not a file (module item is a page/quiz/link)");
    const origin = new URL(res.url).origin;
    return fetchFileBytes(`${origin}/files/${m[1]}/download?download_frd=1`);
  }

  if (hint === "moodle-resource") {
    const res = await fetch(url, { credentials: "include", redirect: "follow" });
    const ct = res.headers.get("content-type") ?? "";
    if (res.ok && !ct.includes("text/html")) return bytesFromResponse(res);  // 302'd straight to the file
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Embed/in-frame display mode: the wrapper HTML carries the pluginfile link.
    // The FIRST match isn't necessarily the resource — intro/description images
    // are served via pluginfile too. Score every candidate: the mod_resource
    // content area is the actual file, and document extensions beat images.
    const html = await res.text();
    const candidates = [...html.matchAll(/(?:href|src)\s*=\s*"([^"]*\/pluginfile\.php\/[^"]+)"/gi)]
      .map((m) => m[1].replace(/&amp;/g, "&"));
    if (!candidates.length) throw new Error("No file found in Moodle resource page");
    const score = (u) =>
      (/\/mod_resource\/content\//i.test(u) ? 2 : 0) +
      (/\.(pdf|docx?|pptx?|xlsx?|txt|csv)([?#]|$)/i.test(u) ? 1 : 0);
    candidates.sort((a, b) => score(b) - score(a));
    const target = new URL(candidates[0], res.url);
    if (target.origin !== new URL(url).origin) throw new Error("Cross-origin file blocked");
    return fetchFileBytes(target.toString());
  }

  return fetchFileBytes(url);
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

// ── Live activity (surfaced to the popup so it isn't a static screen) ────────
// The popup is a throwaway context and can't read the SW's in-memory queue vars,
// so we mirror a compact snapshot into chrome.storage.local. The popup renders it
// on open (via GET_STATUS, which also wakes the SW for a fresh read) and then
// updates live through chrome.storage.onChanged. The counter + recent feed are
// restored from the last snapshot on SW (re)start (see the startup block) so an
// open popup's number never jumps backward when MV3 recycles the worker; both
// reset on sign-out.

let activeFile       = null;   // filename currently importing, or null when idle
let sessionImported  = 0;      // successful (non-skipped) imports, restored across SW recycles
const recentActivity = [];     // [{ name, status: "done"|"skipped"|"failed", t }]
const RECENT_MAX = 6;
let fullSyncActive   = false;   // an LMS full-course API sync is in progress

function buildLiveState() {
  return {
    scanning:        queueDepth > 0,
    queueDepth,
    inFlight:        inFlight.size,
    activeFile,
    sessionImported,
    recent:          recentActivity.slice(),
    fullSync:        fullSyncActive,
    updatedAt:       Date.now(),
  };
}

// Trailing-debounced mirror: a batch of auto-captured files fires many queue/
// activity transitions in a burst — collapse them into one storage write per
// ~120ms so the popup gets a steady stream, not a stampede of onChanged events.
// Always converges to the latest state within the window.
//
// flush=true bypasses the debounce and writes synchronously — used for the queue
// rising/falling edges so the "scanning" spinner turns on/off instantly and can't
// be lost to an MV3 worker eviction inside the debounce window (a pending
// setTimeout doesn't keep the worker alive; the eager set() is issued in the same
// tick, before keepalive teardown can let the worker sleep).
let liveTimer = null, liveDirty = false;
function writeLiveState(flush = false) {
  liveDirty = true;
  if (flush) {
    if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
    liveDirty = false;
    chrome.storage.local.set({ liveState: buildLiveState() });
    return;
  }
  if (liveTimer) return;
  liveTimer = setTimeout(() => {
    liveTimer = null;
    if (!liveDirty) return;
    liveDirty = false;
    chrome.storage.local.set({ liveState: buildLiveState() });
  }, 120);
}

function pushActivity(name, status) {
  recentActivity.unshift({ name: name || "file", status, t: Date.now() });
  if (recentActivity.length > RECENT_MAX) recentActivity.length = RECENT_MAX;
  writeLiveState();
}

function enqueueImport(task) {
  if (queueDepth >= QUEUE_MAX) {
    // transient: queue pressure says nothing about the file — must not burn backoff strikes.
    return Promise.resolve({ error: "Import queue is full — try again in a minute", transient: true });
  }
  queueDepth++;
  keepaliveStart();
  writeLiveState(queueDepth === 1);       // 0→1: flush so the spinner turns on instantly
  const run = importChain.then(task).finally(() => {
    queueDepth--; keepaliveStop();
    writeLiveState(queueDepth === 0);     // →0: flush the idle edge before the worker can sleep
  });
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

// Thin wrapper around the real import: tracks the active filename + records the
// outcome so the popup can show live "Importing X…" and a ticking counter. Never
// lets a thrown error leave activeFile stuck (which would spin the popup forever).
async function importFileInner(payload) {
  const displayName = String(payload.filename || "file").split(/[/\\]/).pop() || "file";
  activeFile = displayName;
  writeLiveState();
  let result;
  try {
    result = await importFileWork(payload);
  } catch (e) {
    result = { error: e?.message ?? "Network error" };
  }
  activeFile = null;
  if (result?.ok && !result.skipped) sessionImported++;
  pushActivity(displayName, result?.ok ? (result.skipped ? "skipped" : "done") : "failed");
  return result;
}

async function importFileWork({ url, filename, pageUrl, courseId, bytes, mimeType, platform, fetchUrl, resolveHint }) {
  const auth = await getAuth();
  // transient: signed-out is not a property of the file — must not burn backoff strikes.
  if (!auth) return { error: "Not signed in. Open the extension popup to sign in.", transient: true };

  const canonicalKey = canonicalizeUrl(url ?? fetchUrl);
  try {
    // Cross-frame race: top frame and an iframe often list the same file — the second
    // occurrence waits in the queue, so re-check history when its turn comes.
    if ((await getCaptured()).includes(canonicalKey)) return { ok: true, skipped: true };

    // Fetch here (SW bypasses CORS) when the content script couldn't, or for
    // pending-download imports where only the URL is known. Viewer links carry a
    // resolveHint and go through the platform resolver.
    if (!bytes && fetchUrl) {
      if (isPrivateTarget(fetchUrl)) return { error: "Refusing to fetch a private/internal address" };
      const fetched = await resolveViewerFile(fetchUrl, resolveHint);
      bytes    = fetched.bytes;
      mimeType = mimeType && mimeType !== "application/octet-stream" ? mimeType : fetched.mimeType;
      // Server-declared name (Content-Disposition / final URL) beats link-text guesses.
      if (fetched.filename) filename = fetched.filename;
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
    // Environmental failures must not burn backoff strikes: fetch() throws
    // TypeError on network-level failures (offline, DNS, blocked), and resolvers
    // flag login-wall redirects with e.transient (see transientError()).
    return { error: e.message ?? "Network error", transient: e instanceof TypeError || e?.transient === true };
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
  const strikeKeys = [];
  try {
    for (const it of fresh) {
      const r = await importFile({
        url: it.url, fetchUrl: it.url, filename: it.filename,
        pageUrl, courseId: null, platform, resolveHint: it.resolveHint,
      });
      if (r?.ok) { if (r.skipped) skipped++; else imported++; }
      else {
        failed++;
        // Only permanent failures count toward the 3-strike/7-day backoff.
        // Queue-full, signed-out, and network errors are transient — striking
        // them would silently blacklist perfectly good files for a week.
        if (!r?.transient) strikeKeys.push(it.key);
      }
    }
  } finally {
    for (const it of fresh) inFlight.delete(it.key);
  }
  // Login-wall heuristic: when EVERYTHING in a 3+ batch failed and nothing
  // actually imported, the cause is almost certainly environmental (expired LMS
  // session serving login pages) — don't strike, or good files get blacklisted
  // while the user is merely logged out. Mixed batches strike normally: a
  // failure next to real imports is file-specific (e.g. a D2L Link topic).
  // Note `skipped` doesn't count as proof of life — dedup-skips never hit the
  // network, so they say nothing about whether the LMS session works.
  if (imported > 0 || strikeKeys.length < 3) {
    for (const k of strikeKeys) await recordFailure(k);
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

// ── Full-course API sync ─────────────────────────────────────────────────────
// The zero-friction path: once the user has consented to a host, enumerate EVERY
// course file via the LMS's own API (injected into the page's MAIN world) and
// import them all — no tabs opened, no page-by-page clicking. Gated on consent
// (mode "on"), throttled per host, and serialized through the same import queue
// (with a small pool so we never overflow QUEUE_MAX or hammer the LMS).

const fullSyncHosts = new Set();   // hosts with a sync in flight (re-entry guard)
const SYNC_ERROR_COOLDOWN_MS = 5 * 60 * 1000;   // back off a host after a transient enum error
const syncErrorAt = new Map();                   // host → last-error ts (in-memory)

// In-memory cache of hosts the user consented to ("on"), so tabs.onUpdated can
// pre-filter with a synchronous Set lookup instead of a storage read on EVERY
// navigation the user makes anywhere. Repopulated on SW start; kept in sync by
// SET_SITE_MODE and a storage.onChanged listener.
const consentedHosts = new Set();
async function refreshConsentedHosts() {
  const autoSites = await new Promise((r) => chrome.storage.local.get(["autoSites"], ({ autoSites = {} }) => r(autoSites)));
  consentedHosts.clear();
  for (const h in autoSites) if (autoSites[h] === "on") consentedHosts.add(h);
}

// eTLD+1 approximation (no public-suffix list in a service worker): the last two
// labels. Defence-in-depth only — it over-allows within a shared ccTLD but never
// under-allows a legitimate same-host file, and pairs with the CDN allowlist.
function registrableDomain(host) {
  const p = String(host || "").toLowerCase().split(".").filter(Boolean);
  return p.slice(-2).join(".");
}
// LMS file CDNs that legitimately serve files off a different domain than the portal.
const LMS_FILE_HOST_ALLOW = [
  /(^|\.)inscloudgate\.net$/,        // Canvas inst-fs
  /(^|\.)instructure-uploads[.-]/,   // Canvas S3 upload buckets
  /(^|\.)brightspace\.com$/,         // D2L CDN
  /(^|\.)brightspacecdn\.com$/,
  /(^|\.)desire2learn\.com$/,
];
// The enumerated file URL comes from the page's MAIN world, which the site fully
// controls (it can override window.fetch/ENV to return arbitrary URLs). Before
// fetching it WITH CREDENTIALS, constrain it to the consented host's own org
// domain or a known LMS CDN — otherwise a hostile consented page could drive
// credentialed cross-origin GETs or poison the RAG with third-party content.
function isAllowedSyncFileUrl(fileUrl, tabHost) {
  try {
    const h = new URL(fileUrl).hostname.toLowerCase();
    const th = String(tabHost || "").toLowerCase();
    if (!h) return false;
    if (h === th || h.endsWith("." + th) || th.endsWith("." + h)) return true;
    if (registrableDomain(h) && registrableDomain(h) === registrableDomain(th)) return true;
    return LMS_FILE_HOST_ALLOW.some((re) => re.test(h));
  } catch { return false; }
}

async function getSyncTimes() {
  return new Promise((r) => chrome.storage.local.get(["syncTimes"], ({ syncTimes }) =>
    r(syncTimes && typeof syncTimes === "object" ? syncTimes : {})));
}
async function markSynced(host) {
  const m = await getSyncTimes();
  m[host] = Date.now();
  const keys = Object.keys(m);
  if (keys.length > 100) delete m[keys[0]];   // bound the map
  await new Promise((r) => chrome.storage.local.set({ syncTimes: m }, r));
}

// Bounded-concurrency runner: caps outstanding work so we neither overflow the
// import queue nor stampede the LMS with parallel downloads.
async function runPool(items, limit, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; try { await fn(items[idx]); } catch { /* isolate */ } } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function siteMode(host) {
  return new Promise((r) => chrome.storage.local.get(["autoSites"], ({ autoSites = {} }) =>
    r(autoSites[host])));
}

async function runFullSync(tabId, host, { force = false } = {}) {
  // Atomic re-entry guard: claim the host SYNCHRONOUSLY before any await, so two
  // near-simultaneous triggers (two tabs, or consent racing an onUpdated) can't
  // both pass a check-then-act gate and double-enumerate the whole library.
  if (!host || fullSyncHosts.has(host)) return;
  fullSyncHosts.add(host);
  let started = false;
  try {
    const auth = await getAuth();
    if (!auth) return;
    if (await siteMode(host) !== "on") return;            // consent required
    if (!(await getSettings()).autoCapture) return;       // respect the master toggle
    if (!force) {
      const times = await getSyncTimes();
      if (times[host] && Date.now() - times[host] < FULL_SYNC_TTL_MS) return;      // 6h success throttle
      const eAt = syncErrorAt.get(host);
      if (eAt && Date.now() - eAt < SYNC_ERROR_COOLDOWN_MS) return;                 // don't hammer during an outage
    }

    started = true;
    fullSyncActive = true;
    writeLiveState();

    let res;
    try {
      const [inj] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: lmsFileSync });
      res = inj?.result;
    } catch {
      return;   // restricted page / tab navigated away — not marked, a real page retries
    }

    // Detected a supported LMS but enumeration errored (429/5xx) → do NOT mark
    // synced (that would blacklist a working host for 6h); brief in-memory cooldown.
    if (res && res.error) { syncErrorAt.set(host, Date.now()); return; }
    // No supported LMS on this page (dashboard, login redirect, js-only portal) →
    // don't mark: a later course page on the same host must still get its shot.
    // lmsFileSync returns immediately here (no API calls), so re-injection is cheap.
    if (!res || !res.lms) return;
    syncErrorAt.delete(host);

    const files = Array.isArray(res.files) ? res.files : [];
    let imported = 0, blocked = 0;
    await runPool(files, 6, async (f) => {
      if (!f || !f.url) return;
      // isPrivateTarget blocks internal hosts; isAllowedSyncFileUrl blocks
      // MAIN-world-supplied third-party URLs (credentialed-fetch SSRF / RAG poison).
      if (isPrivateTarget(f.url) || !isAllowedSyncFileUrl(f.url, host)) { blocked++; return; }
      const key = canonicalizeUrl(f.url);
      if ((await getCaptured()).includes(key) || inFlight.has(key)) return;   // dedup vs history + concurrent captures
      if (await isBlockedByFailures(key)) return;                             // respect the 3-strike backoff
      inFlight.add(key);
      try {
        const r = await importFile({ url: f.url, fetchUrl: f.url, filename: f.filename, courseId: f.courseId ?? null, platform: res.lms });
        if (r?.ok) { if (!r.skipped) imported++; }
        else if (!r?.transient) await recordFailure(key);   // permanent-only strike (login walls/network are transient)
      } finally {
        inFlight.delete(key);
      }
    });
    if (blocked > 0) console.warn(`[FschoolAI] full-sync skipped ${blocked} off-domain file URL(s) on ${host}`);
    if (imported > 0) bumpStat("autoImported", imported);
    // Mark AFTER a completed run: if the SW is killed mid-sync, the next visit
    // resumes (dedup makes already-imported files cheap skips).
    await markSynced(host);
  } finally {
    fullSyncHosts.delete(host);
    // Only touch the live flag if we actually started work — gate-bail
    // navigations (throttled revisits) must not churn storage.
    if (started) {
      fullSyncActive = fullSyncHosts.size > 0;
      writeLiveState();
    }
  }
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

  // Live activity snapshot for the popup — one round-trip for live state + the
  // current settings + all-time stats. Reading it also wakes the SW, so a stale
  // "scanning" mirror from a previously-killed worker self-heals (queueDepth is 0
  // on a fresh worker → scanning:false).
  if (msg.type === "GET_STATUS") {
    (async () => {
      const settings = await getSettings();
      const { stats = {} } = await new Promise(r => chrome.storage.local.get(["stats"], r));
      return { ...buildLiveState(), settings, stats };
    })().then(sendResponse);
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
      if (host) { if (mode === "on") consentedHosts.add(host); else consentedHosts.delete(host); }
      // Bound the map.
      const keys = Object.keys(autoSites);
      if (keys.length > 200) delete autoSites[keys[0]];
      chrome.storage.local.set({ autoSites }, () => {
        sendResponse({ ok: true });
        // Consent just granted → immediately pull the whole course library via
        // the LMS API (force past the throttle: this is the user's first opt-in).
        if (mode === "on" && sender.tab?.id) runFullSync(sender.tab.id, host, { force: true });
      });
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
    // Reset the live counters/feed so the next user doesn't inherit this session's numbers.
    sessionImported = 0; activeFile = null; recentActivity.length = 0;
    chrome.storage.local.remove(["userId", "token", "expiresAt"], () => {
      writeLiveState(true);
      sendResponse({ ok: true });
    });
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

// Subsequent visits to an already-consented LMS: re-run the full API sync on
// page load (self-gates on consent "on" + the 6h throttle inside runFullSync).
// Cheap when it no-ops — a couple of storage reads, no executeScript unless due.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  let host;
  try {
    const u = new URL(tab.url);
    if (!/^https?:$/.test(u.protocol)) return;
    host = u.hostname;
  } catch { return; }
  // Cheap synchronous gate: only ever touch consented hosts. Non-LMS browsing
  // (news, email, shopping) never wakes the sync path. runFullSync re-checks
  // consent authoritatively from storage.
  if (!consentedHosts.has(host)) return;
  runFullSync(tabId, host);
});

// Keep the consented-host cache correct if autoSites is written anywhere.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.autoSites) refreshConsentedHosts();
});

// On SW (re)start nothing is running yet. Restore the running counter + recent
// feed from the last snapshot (so an open popup's counter doesn't jump backward
// when MV3 recycles the worker), then publish a clean snapshot — queueDepth is 0
// on a fresh worker, so this also forces scanning:false, healing any stale
// "scanning" state a killed worker left behind. Counters are only restored while
// signed in; a signed-out start clears them.
(async () => {
  const auth = await getAuth();
  const { liveState } = await new Promise((r) => chrome.storage.local.get(["liveState"], r));
  if (auth && liveState && typeof liveState === "object") {
    sessionImported = Number(liveState.sessionImported) || 0;
    if (Array.isArray(liveState.recent)) {
      recentActivity.length = 0;
      recentActivity.push(...liveState.recent.slice(0, RECENT_MAX));
    }
  }
  writeLiveState(true);
  await refreshConsentedHosts();   // repopulate the consented-host cache after an SW (re)start
})();
