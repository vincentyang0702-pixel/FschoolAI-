// FriendsSection.jsx — Friends social graph UI, embedded in the Identity page.
//
// Data strategy:
//   • user lookup (name/email) + friendship mutations → Supabase RPCs (migrations 004/005)
//   • friend list + pending requests → fetched from Supabase then cached in localStorage
//     so the UI renders instantly on re-mount even while the network request is in flight
//   • UUID for the acting user → already stored in localStorage as "fschool_uid" by App.jsx
//   • All other display state (input, loading flags) → local React state only
//
// To promote local cache to full cloud sync later:
//   Replace the localStorage read/write calls in `persistLocal` / `readLocal` with
//   a Supabase upsert, and remove the localStorage fallback.

import { useState, useCallback, useEffect, useRef } from "react";
import {
  listFriends,
  listFriendRequests,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  getUserProfiles,
  findUserByEmail,
} from "../api/friends";

// ── Local cache helpers ───────────────────────────────────────────────────────
// Keyed by userId so multiple accounts on the same device don't bleed into each other.

function cacheKey(userId) { return `fschool_friends_cache_${userId}`; }

function readLocal(userId) {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw); // { friends: [...], requests: [...], profiles: {...}, cachedAt: iso }
  } catch { return null; }
}

function writeLocal(userId, data) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify({ ...data, cachedAt: new Date().toISOString() }));
  } catch { /* quota — non-fatal */ }
}

function clearLocal(userId) {
  try { localStorage.removeItem(cacheKey(userId)); } catch { /* */ }
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 32 }) {
  const initials = (name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const hue = [...(name || "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  const bg  = `hsl(${Math.abs(hue) % 360}, 22%, 28%)`;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: bg, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 600, color: "rgba(255,255,255,0.75)",
      flexShrink: 0, letterSpacing: "0.5px",
    }}>
      {initials}
    </div>
  );
}

// ── FriendsSection ────────────────────────────────────────────────────────────

export default function FriendsSection({ userId }) {
  // friends: { id, name, email, friends_since }
  // requests: { friendship_id, other_user_id, direction, requested_at }
  // reqProfiles: { [other_user_id]: { name, email } }
  const [friends,     setFriends]     = useState([]);
  const [requests,    setRequests]    = useState([]);
  const [reqProfiles, setReqProfiles] = useState({});

  const [addInput, setAddInput] = useState("");
  const [addState, setAddState] = useState("idle"); // idle | loading | sent | error
  const [addMsg,   setAddMsg]   = useState("");

  // "warm" = loaded from cache, still fetching live; "live" = live fetch done; "error"
  const [loadState, setLoadState] = useState("warm");
  const inputRef = useRef(null);

  // Apply a loaded data set to state and persist locally
  const applyData = useCallback((data, persist = true) => {
    setFriends(data.friends ?? []);
    setRequests(data.requests ?? []);
    setReqProfiles(data.profiles ?? {});
    if (persist) writeLocal(userId, data);
  }, [userId]);

  const load = useCallback(async () => {
    // 1. Show cached data immediately (zero-latency paint)
    const cached = readLocal(userId);
    if (cached) applyData(cached, false);

    // 2. Fetch live from Supabase
    try {
      const [friendRows, reqRows] = await Promise.all([
        listFriends(userId),
        listFriendRequests(userId),
      ]);

      const allIds = [
        ...friendRows.map(r => r.friend_id),
        ...reqRows.map(r => r.other_user_id),
      ];
      const profiles = await getUserProfiles([...new Set(allIds)]);

      const hydratedFriends = friendRows.map(r => ({
        id:            r.friend_id,
        friends_since: r.friends_since,
        ...(profiles[r.friend_id] ?? {}),
      }));

      applyData({ friends: hydratedFriends, requests: reqRows, profiles });
      setLoadState("live");
    } catch (e) {
      console.warn("[FriendsSection] load error:", e.message);
      setLoadState(cached ? "warm" : "error"); // keep showing cache on error
    }
  }, [userId, applyData]);

  useEffect(() => { load(); }, [load]);

  // ── Add by email ────────────────────────────────────────────────────────────

  async function handleAdd() {
    const val = addInput.trim();
    if (!val) return;
    setAddState("loading");
    setAddMsg("");
    try {
      const target = await findUserByEmail(val);
      if (!target)          { setAddState("error"); setAddMsg("No account found with that email."); return; }
      if (target.id === userId) { setAddState("error"); setAddMsg("That's you!"); return; }
      await sendFriendRequest(userId, target.id);
      setAddState("sent");
      setAddMsg(`Request sent to ${target.name || target.email}.`);
      setAddInput("");
      await load();
    } catch (e) {
      const msg = e.message?.includes("blocked")        ? "You've been blocked by this user."
                : e.message?.includes("already friends") ? "Already friends."
                : e.message || "Couldn't send request.";
      setAddState("error");
      setAddMsg(msg);
    }
    setTimeout(() => setAddState("idle"), 3500);
  }

  // ── Accept / Decline ────────────────────────────────────────────────────────

  async function handleRespond(otherId, accept) {
    try {
      await respondFriendRequest(userId, otherId, accept);
      await load();
    } catch (e) { console.warn("[FriendsSection] respond error:", e.message); }
  }

  // ── Remove ──────────────────────────────────────────────────────────────────

  async function handleRemove(friendId) {
    // Optimistic update — remove from local state + cache immediately
    setFriends(prev => {
      const next = prev.filter(f => f.id !== friendId);
      writeLocal(userId, { friends: next, requests, profiles: reqProfiles });
      return next;
    });
    try {
      await removeFriend(userId, friendId);
    } catch (e) {
      console.warn("[FriendsSection] remove error:", e.message);
      load(); // roll back on failure
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const incoming = requests.filter(r => r.direction === "incoming");
  const outgoing = requests.filter(r => r.direction === "outgoing");

  function fmtSince(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  // ── Shared style tokens ─────────────────────────────────────────────────────

  const LABEL = {
    fontSize: "11px", color: "var(--text-dim)", letterSpacing: "2px",
    textTransform: "uppercase", marginBottom: "12px",
  };
  const CARD = {
    background: "var(--color-surface)", border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-card)", padding: "14px 16px",
  };
  const ROW = {
    display: "flex", alignItems: "center", gap: "10px", padding: "10px 0",
  };
  const ROW_BORDER = { borderBottom: "1px solid rgba(255,255,255,0.05)" };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ marginBottom: "32px" }}>
      <p style={LABEL}>Friends</p>

      {/* ── Add by email ──────────────────────────────────────────────── */}
      <div style={{ ...CARD, marginBottom: "12px" }}>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "10px" }}>
          Add a friend by email
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            ref={inputRef}
            type="email"
            placeholder="friend@school.edu"
            value={addInput}
            onChange={e => setAddInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: "var(--radius-sm)", padding: "9px 12px",
              color: "var(--text-primary)", fontSize: "13px",
              outline: "none", fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={addState === "loading" || !addInput.trim()}
            style={{
              background: addState === "sent" ? "rgba(52,199,89,0.15)" : "rgba(255,255,255,0.08)",
              border:     "1px solid " + (addState === "sent" ? "rgba(52,199,89,0.3)" : "rgba(255,255,255,0.12)"),
              borderRadius: "var(--radius-sm)", padding: "9px 14px",
              color:   addState === "sent" ? "rgba(52,199,89,0.9)" : "var(--text-primary)",
              fontSize: "13px", fontWeight: 500, cursor: "pointer",
              fontFamily: "inherit", transition: "all 0.15s",
              opacity: addState === "loading" ? 0.55 : 1,
            }}
          >
            {addState === "loading" ? "…" : addState === "sent" ? "✓" : "Add"}
          </button>
        </div>
        {addMsg && (
          <p style={{
            fontSize: "12px", marginTop: "8px",
            color: addState === "error" ? "rgba(255,100,90,0.85)" : "rgba(52,199,89,0.85)",
          }}>
            {addMsg}
          </p>
        )}
      </div>

      {/* ── Incoming requests ─────────────────────────────────────────── */}
      {incoming.length > 0 && (
        <div style={{ ...CARD, marginBottom: "12px" }}>
          <p style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "2px" }}>
            Requests · {incoming.length}
          </p>
          {incoming.map((r, i) => {
            const p = reqProfiles[r.other_user_id] ?? {};
            return (
              <div key={r.friendship_id} style={{ ...ROW, ...(i < incoming.length - 1 ? ROW_BORDER : {}) }}>
                <Avatar name={p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name || "Unknown"}
                  </p>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.email || r.other_user_id.slice(0, 8) + "…"}
                  </p>
                </div>
                <button
                  onClick={() => handleRespond(r.other_user_id, true)}
                  style={{ background: "rgba(52,199,89,0.12)", border: "1px solid rgba(52,199,89,0.25)", borderRadius: "8px", padding: "5px 10px", color: "rgba(52,199,89,0.9)", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Accept
                </button>
                <button
                  onClick={() => handleRespond(r.other_user_id, false)}
                  style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "5px 10px", color: "var(--text-dim)", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Decline
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Outgoing pending ──────────────────────────────────────────── */}
      {outgoing.length > 0 && (
        <div style={{ ...CARD, marginBottom: "12px" }}>
          <p style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "2px" }}>
            Sent · {outgoing.length}
          </p>
          {outgoing.map((r, i) => {
            const p = reqProfiles[r.other_user_id] ?? {};
            return (
              <div key={r.friendship_id} style={{ ...ROW, ...(i < outgoing.length - 1 ? ROW_BORDER : {}) }}>
                <Avatar name={p.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name || "Unknown"}
                  </p>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Pending</p>
                </div>
                <button
                  onClick={() => handleRemove(r.other_user_id)}
                  style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "5px 10px", color: "var(--text-dim)", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Cancel
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Friends list ──────────────────────────────────────────────── */}
      {loadState === "error" && friends.length === 0 ? (
        <p style={{ fontSize: "13px", color: "rgba(255,100,90,0.7)", padding: "4px 0" }}>
          Couldn't load friends. Check your connection.
        </p>
      ) : friends.length === 0 && incoming.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--text-dim)", padding: "4px 0" }}>
          {loadState === "warm" ? "Loading…" : "No friends yet — add someone above."}
        </p>
      ) : friends.length > 0 ? (
        <div style={CARD}>
          <p style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "2px" }}>
            Friends · {friends.length}
          </p>
          {friends.map((f, i) => (
            <div key={f.id} style={{ ...ROW, ...(i < friends.length - 1 ? ROW_BORDER : {}) }}>
              <Avatar name={f.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name || "Unknown"}
                </p>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[f.email, f.friends_since && `since ${fmtSince(f.friends_since)}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button
                onClick={() => handleRemove(f.id)}
                title="Remove friend"
                style={{ background: "transparent", border: "none", padding: "4px 8px", color: "rgba(255,255,255,0.18)", fontSize: "16px", cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
