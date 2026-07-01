// background.js — FschoolAI Extension service worker
// Content script fetches file bytes (with live session cookies), sends here.
// We call /api/lms-ingest directly — no cookie relay, no allowlist, any website.

// Dev vs prod: change to "http://localhost:5173" for local testing
const FSCHOOLAI_ORIGIN = "https://fschoolai.com";
const API_BASE         = FSCHOOLAI_ORIGIN;

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

// ── Cloud storage file fetcher ─────────────────────────────────────────────
// Covers: Google Drive/Docs, Dropbox, OneDrive, SharePoint, Box.
// Background service workers bypass CORS — content scripts cannot fetch
// cross-origin URLs from these domains even with credentials: "include".
// All providers: fetch with credentials so shared/private files work when the
// user is already signed in to that service in their browser.

function bufferToBase64(buffer) {
  const uint8 = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < uint8.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Transforms a cloud storage share/viewer URL into a direct download URL.
// Returns null if the URL is not a recognised cloud storage link.
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
    // Share links (www.dropbox.com/s/… or /scl/fi/…) end in ?dl=0 (viewer page).
    // Rewriting the host to dl.dropboxusercontent.com + dl=1 serves the raw file
    // bytes directly, avoiding the HTML interstitial that ?dl=1 alone can return.
    if (/(^|\.)dropbox\.com$/.test(h)) {
      u.hostname = "dl.dropboxusercontent.com";
      u.searchParams.set("dl", "1");
      return u.toString();
    }

    // ── OneDrive personal (1drv.ms / onedrive.live.com) ───────────────────
    // NOT handled here. Microsoft gates these behind a JS/auth handshake, so
    // there is no static download URL. fetchCloudFile() routes OneDrive to the
    // dedicated fetchOneDriveFile() two-step resolver instead.

    // ── SharePoint / OneDrive for Business ───────────────────────────────
    // File share links contain /:b:/ (PDF), /:w:/ (Word), /:p:/ (PPT), etc.
    // Appending ?download=1 forces the browser/server to return raw bytes.
    if (/sharepoint\.com/.test(h)) {
      u.searchParams.set("download", "1");
      return u.toString();
    }

    // ── Box ───────────────────────────────────────────────────────────────
    // Public share links: /s/{hash} — Box serves the file at /shared/static/{hash}
    if (/box\.com/.test(h)) {
      const shareMatch = u.pathname.match(/\/s\/([a-zA-Z0-9]+)/);
      if (shareMatch) return `https://app.box.com/shared/static/${shareMatch[1]}`;
    }

  } catch {}
  return null;
}

// OneDrive personal share links can't be turned into a static download URL —
// Microsoft requires a JS/auth handshake. Best effort: follow the share-link
// redirect to the resolved viewer URL, then re-request it with download=1,
// relying on the user's existing OneDrive browser session (credentials) for
// their own / shared-with-them files. Anonymous strangers will hit a sign-in
// wall — that's Microsoft's design, not a bug here.
async function fetchOneDriveFile(href) {
  // Step 1 — follow the redirect to the resolved onedrive.live.com viewer URL.
  let res = await fetch(href, { credentials: "include", redirect: "follow" });
  let ct  = res.headers.get("content-type") ?? "";

  // If the first hop already returned the raw file, use it.
  if (res.ok && !ct.includes("text/html")) {
    const mimeType = ct.split(";")[0]?.trim() || "application/octet-stream";
    return { bytes: bufferToBase64(await res.arrayBuffer()), mimeType };
  }

  // Step 2 — re-request the resolved URL with download=1 to force raw bytes.
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
  // OneDrive personal needs the dedicated two-step resolver (see above).
  let host = "";
  try { host = new URL(href).hostname; } catch {}
  if (/(^|\.)1drv\.ms$|(^|\.)onedrive\.live\.com$/.test(host)) {
    return fetchOneDriveFile(href);
  }

  const downloadUrl = transformCloudUrl(href);
  if (!downloadUrl) throw new Error("Not a recognised cloud storage URL");

  // Fetch with live session cookies — if the user is signed in to the service,
  // shared/private files are served automatically. Public files need no auth.
  let res = await fetch(downloadUrl, { credentials: "include" });

  // Google Drive: large files (>25 MB) return a virus-scan HTML page.
  // Extract the confirm= token and retry.
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/html")) {
    const html = await res.text();
    const confirmMatch = html.match(/[?&]confirm=([0-9A-Za-z_-]+)/);
    if (!confirmMatch) throw new Error("Cloud storage returned HTML — file may be private or login required");
    const sep = downloadUrl.includes("?") ? "&" : "?";
    res = await fetch(`${downloadUrl}${sep}confirm=${confirmMatch[1]}`, { credentials: "include" });
  }

  if (!res.ok) throw new Error(`Cloud fetch failed: HTTP ${res.status}`);

  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
  const buffer   = await res.arrayBuffer();
  return { bytes: bufferToBase64(buffer), mimeType };
}

// ── File import ────────────────────────────────────────────────────────────

async function importFile({ url, filename, pageUrl, courseId, bytes, mimeType, platform }) {
  const auth = await getAuth();
  if (!auth) {
    return { error: "Not signed in. Open the extension popup to sign in." };
  }

  try {
    const res = await fetch(`${API_BASE}/api/lms-ingest`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        userId: auth.userId,
        file: {
          name:      filename,
          mimeType:  mimeType ?? "application/octet-stream",
          bytes,
          sourceUrl: url,
          provider:  "extension",
          metadata:  { platform: platform ?? "web", courseId: courseId ?? null },
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) return { error: data.error ?? `Ingest failed (${res.status})` };
    return { ok: true, skipped: data.skipped, documentId: data.documentId };
  } catch (e) {
    return { error: e.message ?? "Network error" };
  }
}

// ── Message handlers ───────────────────────────────────────────────────────

// External sign-in handshake from the FschoolAI web app (externally_connectable).
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SIGN_IN") {
    const { userId, token, expiresAt } = msg.payload;
    setAuth(userId, token, expiresAt).then(() => sendResponse({ ok: true }));
    return true;
  }
});

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

  if (msg.type === "GET_AUTH_STATUS") {
    getAuth().then(auth => sendResponse({ signedIn: !!auth, userId: auth?.userId ?? null }));
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

// ── Download capture (opt-in) ──────────────────────────────────────────────

const ACADEMIC_PATTERNS = [
  /edu/, /\.ac\.[a-z]{2}$/, /chaoxing\.com/, /zhihuishu\.com/,
  /pronote\.net/, /brightspace\.com/, /blackboard\.com/,
  /instructure\.com/, /desire2learn\.com/, /moodle/,
  /sharepoint\.com/, /teams\.microsoft\.com/,
];

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

  const refUrl = item.referrer ?? item.url;
  if (!isAcademic(refUrl)) return;

  chrome.storage.local.get(["autoImport", "pendingDownloads"], ({ autoImport, pendingDownloads = [] }) => {
    if (autoImport === false) return;
    const updated = [
      { id: delta.id, filename: item.filename, url: item.url, referrer: item.referrer, timestamp: Date.now() },
      ...pendingDownloads.slice(0, 9),
    ];
    chrome.storage.local.set({ pendingDownloads: updated });
    chrome.action.setBadgeText({ text: String(updated.length) });
    chrome.action.setBadgeBackgroundColor({ color: "#4285F4" });
  });
});
