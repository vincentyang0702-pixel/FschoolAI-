// content/universal.js — NeuroAgi auto-capture content script
// Runs on every page. Detects if the page contains academic data,
// extracts it silently, and sends to background service worker.
// No user action needed — just browse your portal normally.

const PAGE_PATTERNS = [
  { type: "courses",     test: u => /\/d2l\/home\/?$|\/d2l\/home\/[^/]+$/.test(u) || document.querySelector(".my-courses-content, .d2l-my-courses") !== null },
  { type: "assignments", test: u => /dropbox|assignments|tasks|coursework/i.test(u) },
  { type: "grades",      test: u => /grades|marks|results|progress/i.test(u) },
  { type: "schedule",    test: u => /calendar|schedule|timetable/i.test(u) },
  { type: "courses",     test: u => /courses|my-courses|dashboard|home/i.test(u) },
];

function detectPageType(url) {
  for (const p of PAGE_PATTERNS) {
    if (p.test(url)) return p.type;
  }
  return null;
}

// Deep text extractor — pierces shadow DOM (D2L uses d2l-* web components)
// and reads same-origin iframes (D2L homepage widgets).
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

    // Pierce shadow root (web components like d2l-card)
    if (node.shadowRoot) node.shadowRoot.childNodes.forEach(walk);

    // Pierce same-origin iframes (D2L homepage widgets)
    if (node.tagName === "IFRAME") {
      try {
        const doc = node.contentDocument;
        if (doc?.body) walk(doc.body);
      } catch { /* cross-origin — skip */ }
      return;
    }
    node.childNodes.forEach(walk);
  }
  walk(root);
  return out;
}

function extractContent() {
  const text = deepText(document.body)
    .replace(/\s{3,}/g, "\n").trim().slice(0, 10000);

  // Tables (also search shadow roots and same-origin iframes)
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
  document.querySelectorAll("iframe").forEach(f => {
    try { if (f.contentDocument) collectTables(f.contentDocument); } catch {}
  });

  // D2L course IDs from links (search shadow + iframes too)
  const courseIds = [];
  function collectIds(root) {
    root.querySelectorAll?.("a[href]").forEach(a => {
      const m = a.href.match(/[?&/]ou[=/](\d+)/);
      if (m && !courseIds.includes(m[1])) courseIds.push(m[1]);
    });
    root.querySelectorAll?.("*").forEach(el => { if (el.shadowRoot) collectIds(el.shadowRoot); });
  }
  collectIds(document);

  return {
    text,
    tables:    tables.slice(0, 5).join("\n\n"),
    url:       location.href,
    title:     document.title,
    courseIds,
  };
}

async function tryCapture() {
  // Check if user is logged into NeuroAgi
  const result = await chrome.storage.local.get(["neuroagi_user", "neuroagi_captured_urls"]);
  if (!result.neuroagi_user) return; // not logged in, skip

  const url      = location.href;
  const pageType = detectPageType(url);
  if (!pageType) return; // not an academic page

  // Skip if this exact URL was captured in the last 30 minutes
  const captured = result.neuroagi_captured_urls ?? {};
  const lastTime = captured[url] ?? 0;
  if (Date.now() - lastTime < 30 * 60 * 1000) return;

  const content = extractContent();

  // Must have meaningful content
  if (content.text.length < 100) return;

  // Work out which step this is based on what's already captured
  const { neuroagi_captures = [] } = await chrome.storage.local.get("neuroagi_captures");
  const stepIndex = Math.min(neuroagi_captures.length, 2);
  const stepOrder = ["courses", "assignments", "grades"];
  const effectiveStep = stepOrder.includes(pageType) ? pageType : stepOrder[stepIndex];

  // Send to background for Claude extraction + Supabase write
  chrome.runtime.sendMessage({
    type:        "NEUROAGI_EXTRACT",
    userId:      result.neuroagi_user.id,
    pageContent: content,
    stepHint:    effectiveStep,
  }, (response) => {
    if (response?.ok) {
      // Mark URL as captured and update step progress
      const updatedUrls = { ...captured, [url]: Date.now() };
      const alreadyCaptured = neuroagi_captures.some(c => c.step === effectiveStep);
      const updatedCaptures = alreadyCaptured
        ? neuroagi_captures
        : [...neuroagi_captures, { step: effectiveStep, url, auto: true, timestamp: Date.now() }];
      chrome.storage.local.set({
        neuroagi_captured_urls: updatedUrls,
        neuroagi_captures:      updatedCaptures,
        neuroagi_stats:         response.stats ?? {},
      });
    }
  });
}

// Wait 2.5s after page load for async/JS-rendered content (course cards, grade tables etc.)
function scheduleCapture() {
  setTimeout(tryCapture, 2500);
}

if (document.readyState === "complete") {
  scheduleCapture();
} else {
  window.addEventListener("load", scheduleCapture);
}
