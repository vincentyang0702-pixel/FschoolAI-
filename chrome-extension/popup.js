// popup.js — FschoolAI extension popup controller

// Dev vs prod: change to "http://localhost:5173" for local testing
const FSCHOOLAI_URL = "https://fschoolai.com";

const $ = id => document.getElementById(id);

async function getAuth() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "GET_AUTH_STATUS" }, resolve);
  });
}

async function init() {
  const auth = await getAuth();

  if (auth?.signedIn) {
    $("status-section").style.display    = "block";
    $("signed-out-section").style.display = "none";
    $("uid-label").textContent           = `User: ${auth.userId?.slice(0, 20)}…`;

    // Show pending downloads
    chrome.storage.local.get(["pendingDownloads"], ({ pendingDownloads = [] }) => {
      if (pendingDownloads.length === 0) return;
      $("pending-section").style.display = "block";
      const list = $("pending-list");
      list.innerHTML = "";
      pendingDownloads.forEach(d => {
        const name = d.filename?.split(/[/\\]/).pop() ?? "file";
        const item = document.createElement("div");
        item.className = "pending-item";
        item.innerHTML = `
          <span class="pending-name" title="${name}">${name}</span>
          <button class="pending-btn" data-url="${d.url}" data-filename="${name}">Import</button>
        `;
        list.appendChild(item);
      });

      list.querySelectorAll(".pending-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          btn.textContent = "…";
          btn.disabled = true;
          const res = await chrome.runtime.sendMessage({
            type: "IMPORT_FILE",
            payload: { url: btn.dataset.url, filename: btn.dataset.filename, pageUrl: btn.dataset.url },
          });
          btn.textContent = res?.ok ? "✓" : "Err";
        });
      });
    });

    $("btn-clear-pending")?.addEventListener("click", () => {
      chrome.storage.local.set({ pendingDownloads: [] });
      chrome.action.setBadgeText({ text: "" });
      $("pending-section").style.display = "none";
    });

  } else {
    $("status-section").style.display    = "none";
    $("signed-out-section").style.display = "block";
  }
}

$("btn-sign-in")?.addEventListener("click", () => {
  chrome.tabs.create({ url: `${FSCHOOLAI_URL}/?ext=signin&extId=${chrome.runtime.id}` });
  window.close();
});

$("btn-open-app")?.addEventListener("click", () => {
  chrome.tabs.create({ url: FSCHOOLAI_URL });
  window.close();
});

$("btn-sign-out")?.addEventListener("click", async () => {
  await new Promise(resolve => chrome.runtime.sendMessage({ type: "SIGN_OUT" }, resolve));
  init();
});

init();
