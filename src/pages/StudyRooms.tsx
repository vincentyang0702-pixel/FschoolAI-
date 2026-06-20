// StudyRooms.jsx — Phase 2A: Shared Pomodoro + Goals + Session Summary
// Architecture: root manages global-studying presence channel once; Lobby +
// RoomView receive counts as props. Keeps room core + friends layer modular.

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import { supabase } from "../api/supabase";
import { awardTokens } from "../api/tokens";
import { sendNudge } from "../api/nudge";
import {
  listAccessibleRooms, joinRoom, respondRoomRequest,
  inviteToRoom, leaveRoom, setRoomAccess,
} from "../api/rooms";
import type { AccessFilters } from "../api/rooms";
import { loadRecentMessages, postRoomMessage } from "../api/chat";
import type { ChatMessage } from "../api/chat";
import type { Stroke, Point, PenStyle } from "../api/whiteboard";
import * as Y from "yjs";
import { SupabaseBroadcastProvider } from "../lib/yjsSupabaseProvider";
import Whiteboard, { PEN_COLORS, PEN_WIDTHS, ERASER_SIZES, DEFAULT_BG } from "../components/Whiteboard";
import type { Tool } from "../components/Whiteboard";
import StudyOrb from "../components/StudyOrb";
import VoiceRoom from "../components/VoiceRoom";

// ── Access filters ────────────────────────────────────────────────────────────
// Which eligibility rules an owner can put on a room. Server enforces these via
// the join_room / list_accessible_rooms RPCs; this is just the UI vocabulary.
const ACCESS_OPTIONS: { key: keyof AccessFilters; icon: string; label: string; desc: string; needsCourse?: boolean }[] = [
  { key: "university", icon: "🏫", label: "Same university",   desc: "Only students at your school" },
  { key: "friends",    icon: "👥", label: "Friends only",       desc: "Only your friends" },
  { key: "fof",        icon: "🔗", label: "Friends of friends", desc: "Friends and their friends" },
  { key: "course",     icon: "📚", label: "Course-mates",       desc: "Students taking the linked course", needsCourse: true },
];

function activeFilterKeys(filters?: AccessFilters | null): (keyof AccessFilters)[] {
  if (!filters) return [];
  return ACCESS_OPTIONS.map(o => o.key).filter(k => filters[k]);
}

// Compact badge row describing the active filters on a room.
function FilterBadges({ filters, small = false }: { filters?: AccessFilters | null; small?: boolean }) {
  const keys = activeFilterKeys(filters);
  if (!keys.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {keys.map(k => {
        const meta = ACCESS_OPTIONS.find(o => o.key === k)!;
        return (
          <span key={k} style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            fontSize: small ? "10px" : "11px", fontWeight: 600,
            padding: small ? "2px 7px" : "3px 9px", borderRadius: "6px",
            background: "rgba(196,154,60,0.08)", color: "var(--color-accent)",
            border: "1px solid rgba(196,154,60,0.18)", whiteSpace: "nowrap",
          }}>
            {meta.icon} {meta.label}
          </span>
        );
      })}
    </div>
  );
}

// Toggle grid reused by CreateRoomModal + the in-room access settings.
function AccessToggles({ value, onChange, hasCourse }: {
  value: AccessFilters; onChange: (next: AccessFilters) => void; hasCourse: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {ACCESS_OPTIONS.map(opt => {
        const disabled = opt.needsCourse && !hasCourse;
        const on = !!value[opt.key] && !disabled;
        return (
          <button
            key={opt.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ ...value, [opt.key]: !on })}
            style={{
              display: "flex", alignItems: "center", gap: "10px", textAlign: "left",
              padding: "10px 12px", borderRadius: "10px", cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "inherit", width: "100%",
              background: on ? "rgba(196,154,60,0.12)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${on ? "rgba(196,154,60,0.3)" : "rgba(255,255,255,0.08)"}`,
              opacity: disabled ? 0.4 : 1, transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: "17px", flexShrink: 0 }}>{opt.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "13px", fontWeight: 600, color: on ? "var(--color-accent)" : "var(--text-primary)" }}>
                {opt.label}
              </span>
              <span style={{ display: "block", fontSize: "11px", color: "var(--text-dim)", marginTop: "1px" }}>
                {disabled ? "Link a course first" : opt.desc}
              </span>
            </span>
            <span style={{
              width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
              border: `1.5px solid ${on ? "var(--color-accent)" : "rgba(255,255,255,0.2)"}`,
              background: on ? "var(--color-accent)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {on && <span style={{ color: "#111", fontSize: "11px", fontWeight: 700, lineHeight: 1 }}>✓</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Room code generator ───────────────────────────────────────────────────────
// Unambiguous chars (no 0/O, 1/I/L). 6 chars = 32^6 = ~1B combinations.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateRoomCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

// ── Pomodoro helpers ──────────────────────────────────────────────────────────
// pomo shape: { phase:'focus'|'break'|'idle', paused:bool,
//   startedAt:ms|null, durationSec:number, pausedRemaining:number|null }
function getRemaining(p) {
  if (!p || p.phase === "idle") return null;
  if (p.paused) return p.pausedRemaining ?? p.durationSec;
  const elapsed = (Date.now() - p.startedAt) / 1000;
  return Math.max(0, p.durationSec - elapsed);
}

function formatPomoTime(secs) {
  if (secs == null) return "--:--";
  const total = Math.ceil(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Friends adapter ───────────────────────────────────────────────────────────
// Wraps Siddharth's friends.js so the invite UI doesn't depend on its internals.
async function getFriendsForInvite(userId) {
  try {
    const { listFriends, getUserProfiles } = await import("../api/friends.js");
    const rows = await listFriends(userId);
    if (!rows?.length) return [];
    const ids      = rows.map(r => r.friend_id);
    const profiles = await getUserProfiles(ids);
    return rows.map(r => ({
      id:           r.friend_id,
      name:         profiles[r.friend_id]?.name  ?? "Unknown",
      email:        profiles[r.friend_id]?.email ?? "",
      friends_since: r.friends_since,
    }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Root — owns global-studying presence channel shared across Lobby ↔ RoomView
// ─────────────────────────────────────────────────────────────────────────────
export default function StudyRooms() {
  const { userId, userData } = useApp();
  const [view,        setView]        = useState("lobby");
  const [activeRoom,  setActiveRoom]  = useState(null);
  const [globalState, setGlobalState] = useState({});
  const [pendingInvites, setPendingInvites] = useState([]);
  const globalCh   = useRef(null);
  const personalCh = useRef(null);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel("global-studying", {
      config: { presence: { key: userId } },
    });
    ch.on("presence", { event: "sync" }, () => {
      setGlobalState({ ...ch.presenceState() });
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ userId, roomId: null });
      }
    });
    globalCh.current = ch;
    return () => {
      try { ch.untrack(); } catch {}
      supabase.removeChannel(ch);
      globalCh.current = null;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`user:${userId}`);
    ch.on("broadcast", { event: "nudge" }, ({ payload }) => {
      if (payload?.kind === "invite") {
        setPendingInvites(prev => [{
          id: payload.id ?? `${payload.fromUserId}-${Date.now()}`,
          from_user_id: payload.fromUserId,
          fromName:     payload.fromName ?? "Someone",
          room_id:      payload.roomId,
          roomName:     payload.roomName,
          created_at:   new Date().toISOString(),
        }, ...prev].slice(0, 5));
      }
    })
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "nudges",
      filter: `to_user_id=eq.${userId}`,
    }, (payload) => {
      if (payload.new?.kind === "invite") {
        setPendingInvites(prev => [{ ...payload.new, fromName: null }, ...prev].slice(0, 5));
      }
    })
    .subscribe();
    personalCh.current = ch;
    return () => {
      supabase.removeChannel(ch);
      personalCh.current = null;
    };
  }, [userId]);

  async function trackGlobal(roomId = null) {
    if (globalCh.current) {
      try { await globalCh.current.track({ userId, roomId }); } catch {}
    }
  }

  const totalOnline = Object.keys(globalState).length;
  const roomCounts  = {};
  for (const sessions of Object.values(globalState)) {
    const roomId = sessions?.[0]?.roomId;
    if (roomId) roomCounts[roomId] = (roomCounts[roomId] || 0) + 1;
  }

  const handleJoin = useCallback(async (room) => {
    await trackGlobal(room.id);
    setActiveRoom(room);
    setView("room");
  }, [userId]); // eslint-disable-line

  const handleLeave = useCallback(async () => {
    await trackGlobal(null);
    setActiveRoom(null);
    setView("lobby");
  }, [userId]); // eslint-disable-line

  const dismissInviteRoot = useCallback((id) => {
    setPendingInvites(prev => prev.filter(i => i.id !== id));
    supabase.from("nudges").update({ seen: true }).eq("id", id).then(() => {});
  }, []);

  if (view === "room" && activeRoom) {
    return <RoomView room={activeRoom} onLeave={handleLeave} roomCounts={roomCounts} onlineIds={Object.keys(globalState)} />;
  }
  return (
    <Lobby
      onJoin={handleJoin}
      totalOnline={totalOnline}
      roomCounts={roomCounts}
      globalState={globalState}
      pendingInvites={pendingInvites}
      onDismissInvite={dismissInviteRoot}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobby
// ─────────────────────────────────────────────────────────────────────────────
function Lobby({ onJoin, totalOnline, roomCounts, globalState = {}, pendingInvites = [], onDismissInvite }) {
  const { userId, userData, courses } = useApp();
  const [rooms,       setRooms]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [joiningId,    setJoiningId]    = useState(null);
  const [pendingReqs,  setPendingReqs]  = useState({});
  const [codeInput,    setCodeInput]    = useState("");
  const [codeError,    setCodeError]    = useState("");
  const [joinError,    setJoinError]    = useState("");
  const [codeLookingUp, setCodeLookingUp] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [friends,      setFriends]      = useState([]);
  const [nudged,       setNudged]       = useState({});  // friendId → "sending"|"sent"|"limited"
  const lobbyChannelRef = useRef(null);
  const onJoinRef       = useRef(onJoin);
  useEffect(() => { onJoinRef.current = onJoin; }, [onJoin]);

  useEffect(() => {
    fetchRooms();
    fetchPendingRequests();
    subscribeToLobby();
    return () => {
      if (lobbyChannelRef.current) supabase.removeChannel(lobbyChannelRef.current);
    };
  }, []); // eslint-disable-line

  // Friends-studying strip: load the user's friends; presence comes from globalState.
  useEffect(() => {
    getFriendsForInvite(userId).then(setFriends).catch(() => {});
  }, [userId]);

  // Map each friend → the room they're studying in right now (if any).
  const friendRoomMap = {};
  for (const f of friends) {
    const roomId = Array.isArray(globalState[f.id]) ? globalState[f.id][0]?.roomId : null;
    if (roomId) friendRoomMap[f.id] = roomId;
  }
  const studyingFriends = friends.filter(f => friendRoomMap[f.id]);
  const offlineFriends  = friends.filter(f => !friendRoomMap[f.id]);

  async function joinFriendRoom(roomId) {
    let room = rooms.find(r => r.id === roomId);
    if (!room) {
      const { data } = await supabase.from("study_rooms").select().eq("id", roomId).maybeSingle();
      room = data;
    }
    if (room) onJoin(room);
  }

  async function nudgeFriend(friend) {
    setNudged(n => ({ ...n, [friend.id]: "sending" }));
    const result = await sendNudge({
      fromUserId: userId, toUserId: friend.id, roomId: null,
      fromName: userData?.name ?? "Someone", roomName: null, recipientOnline: false,
    });
    setNudged(n => ({ ...n, [friend.id]: result?.sent === false && result.reason === "rate_limited" ? "limited" : "sent" }));
  }

  async function fetchRooms() {
    setLoading(true);
    try {
      // Server-filtered: only rooms this user is eligible to see.
      const data = await listAccessibleRooms(userId);
      setRooms(data || []);
    } catch (err) {
      console.error("[rooms] list:", (err as any)?.message);
      setRooms([]);
    }
    setLoading(false);
  }

  // Auto-clear the "not eligible" banner.
  useEffect(() => {
    if (!joinError) return;
    const t = setTimeout(() => setJoinError(""), 4000);
    return () => clearTimeout(t);
  }, [joinError]);

  async function fetchPendingRequests() {
    const { data } = await supabase
      .from("room_members")
      .select("room_id, status")
      .eq("user_id", userId)
      .in("status", ["requested", "joined"]);
    const map = {};
    (data || []).forEach(r => { map[r.room_id] = r.status; });
    setPendingReqs(map);
  }

  function subscribeToLobby() {
    const ch = supabase.channel("lobby-watch-" + userId);
    ch.on("postgres_changes", {
      event: "INSERT", schema: "public", table: "study_rooms",
    }, () => {
      // A new room appeared — refetch through the access RPC so we never show a
      // room this user isn't eligible for (can't tell from the raw row alone).
      fetchRooms();
    });
    ch.on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "room_members",
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      if (payload.new?.status === "joined" && pendingReqs[payload.new.room_id] === "requested") {
        setPendingReqs(p => ({ ...p, [payload.new.room_id]: "accepted" }));
        setRooms(prev => {
          const room = prev.find(r => r.id === payload.new.room_id);
          if (room) setTimeout(() => onJoinRef.current(room), 1200);
          return prev;
        });
      }
    });
    ch.subscribe();
    lobbyChannelRef.current = ch;
  }

  async function handleCreate({ name, courseId, roomType, accessFilters }) {
    // Course-mates filter is meaningless without a linked course — drop it.
    const filters = { ...(accessFilters ?? {}) };
    if (!courseId) delete filters.course;

    let room = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const join_code = generateRoomCode();
      const { data, error } = await supabase
        .from("study_rooms")
        .insert({
          created_by:     userId,
          name:           name.trim(),
          course_id:      courseId ? Number(courseId) : null,
          room_type:      roomType,
          join_code,
          access_filters: filters,
        })
        .select()
        .single();
      if (!error) { room = data; break; }
      if (!error.message?.includes("unique") && !error.message?.includes("join_code")) {
        console.error("[rooms] create:", error.message); return;
      }
    }
    if (!room) { console.error("[rooms] create: failed to generate unique code"); return; }
    // Host membership is written by the RPC (direct room_members writes are revoked).
    try {
      await joinRoom(userId, room.id);
    } catch (err) {
      console.error("[rooms] host join:", (err as any)?.message);
      // Room row exists but host couldn't join — mark inactive so it doesn't linger as an ownerless room.
      await supabase.from("study_rooms").update({ is_active: false }).eq("id", room.id);
      return;
    }
    setShowCreate(false);
    onJoin(room);
  }

  async function handleJoin(room) {
    if (pendingReqs[room.id] === "requested") return;
    if (pendingReqs[room.id] === "accepted" || pendingReqs[room.id] === "joined") {
      onJoin(room); return;
    }
    setJoiningId(room.id);
    setJoinError("");
    try {
      const status = await joinRoom(userId, room.id);
      if (status === "joined") { setJoiningId(null); onJoin(room); return; }
      if (status === "requested") {
        setPendingReqs(p => ({ ...p, [room.id]: "requested" }));
        // Ping the host so they see the request promptly.
        supabase.from("nudges").insert({
          from_user_id: userId, to_user_id: room.created_by,
          room_id: room.id, kind: "nudge",
        }).then(() => {});
        setJoiningId(null);
        return;
      }
      if (status === "denied") {
        setJoinError("You're not eligible to join this room.");
        setRooms(prev => prev.filter(r => r.id !== room.id)); // hide what we can't access
      }
      setJoiningId(null);
    } catch (err) {
      console.error("[rooms] join:", (err as any)?.message);
      setJoiningId(null);
    }
  }

  async function acceptInvite(invite) {
    onDismissInvite?.(invite.id);
    // An 'invited' row already exists → join_room flips it to joined.
    try { await joinRoom(userId, invite.room_id); } catch (err) { console.error("[rooms] accept invite:", (err as any)?.message); }
    const { data: room } = await supabase
      .from("study_rooms").select().eq("id", invite.room_id).single();
    if (room) onJoin(room);
  }

  async function handleJoinByCode() {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 6) return;
    setCodeLookingUp(true);
    setCodeError("");
    const { data: room } = await supabase
      .from("study_rooms")
      .select()
      .eq("join_code", code)
      .eq("is_active", true)
      .maybeSingle();
    setCodeLookingUp(false);
    if (!room) { setCodeError("No active room found with that code."); return; }
    // A valid code bypasses room type + access filters (server-side).
    try {
      const status = await joinRoom(userId, room.id, code);
      if (status === "joined") { setCodeInput(""); onJoin(room); }
      else { setCodeError("Couldn't join this room."); }
    } catch (err) {
      console.error("[rooms] join by code:", (err as any)?.message);
      setCodeError("Couldn't join this room.");
    }
  }

  const S = styles;

  const FILTERS      = ["all", "public", "private", "friends"];
  const FILTER_LABELS: Record<string, string> = { all: "All", public: "Public", private: "Private", friends: "Friends" };

  const filteredRooms = rooms.filter(room => {
    if (activeFilter === "public")  return room.room_type === "public";
    if (activeFilter === "private") return room.room_type === "invite";
    if (activeFilter === "friends") return false;
    return true;
  });

  const emptyMsg = ({
    all:     { title: "No active rooms", sub: "Create one and start studying together!" },
    public:  { title: "No public rooms", sub: "Create a public room — anyone can join." },
    private: { title: "No private rooms", sub: "Create an invite-only room for your group." },
    friends: { title: "No friend rooms yet", sub: "Invite friends from Identity, then start a room together." },
  } as Record<string, { title: string; sub: string }>)[activeFilter];

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"12px", marginBottom:"22px" }}>
        <div>
          <p style={S.sectionLabel}>Study Rooms</p>
          <h1 style={S.pageTitle}>Study Together</h1>
          {totalOnline > 0 && (
            <div style={{
              display:"inline-flex", alignItems:"center", gap:"6px", marginTop:"8px",
              background:"rgba(196,154,60,0.08)", border:"1px solid rgba(196,154,60,0.2)",
              borderRadius:"20px", padding:"4px 10px 4px 8px",
            }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--color-accent)", flexShrink:0,
                display:"inline-block", boxShadow:"0 0 0 2px rgba(196,154,60,0.2)" }} />
              <span style={{ fontSize:"13px", fontWeight:"700", color:"var(--color-accent)" }}>
                {totalOnline} {totalOnline === 1 ? "student" : "students"} studying now
              </span>
            </div>
          )}
        </div>
        <button onClick={() => setShowCreate(true)} style={{ ...S.primaryBtn, whiteSpace:"nowrap", flexShrink:0 }}>
          + Create Room
        </button>
      </div>

      {/* ── Join with code ─────────────────────────────────────── */}
      <div style={{
        display:"flex", gap:"8px", alignItems:"center", marginBottom:"6px",
        background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.07)",
        borderRadius:"12px", padding:"9px 12px", transition:"border-color 0.15s",
      }}
        onFocusCapture={e => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(196,154,60,0.25)")}
        onBlurCapture={e  => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)")}
      >
        <input
          value={codeInput}
          onChange={e => { setCodeInput(e.target.value.toUpperCase().slice(0, 6)); setCodeError(""); }}
          onKeyDown={e => e.key === "Enter" && handleJoinByCode()}
          placeholder="Enter room code…"
          maxLength={6}
          style={{
            flex:1, background:"transparent", border:"none",
            color:"var(--text-primary)", fontSize:"13px",
            outline:"none", fontFamily:"monospace", letterSpacing:"3px",
          }}
        />
        <button
          onClick={handleJoinByCode}
          disabled={codeInput.length < 6 || codeLookingUp}
          style={{ ...S.accentBtn, padding:"6px 14px", fontSize:"12px", opacity: codeInput.length < 6 ? 0.35 : 1, flexShrink:0 }}
        >
          {codeLookingUp ? "…" : "Join →"}
        </button>
      </div>
      {codeError && (
        <p style={{ fontSize:"12px", color:"rgba(255,100,90,0.8)", marginBottom:"10px", paddingLeft:"4px" }}>{codeError}</p>
      )}
      {joinError && (
        <div style={{
          background:"rgba(255,59,48,0.07)", border:"1px solid rgba(255,59,48,0.2)",
          borderRadius:"12px", padding:"11px 16px", margin:"4px 0 10px",
          fontSize:"13px", color:"rgba(255,120,110,0.95)",
        }}>
          🔒 {joinError}
        </div>
      )}

      {/* ── Pending invites ────────────────────────────────────── */}
      {pendingInvites.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:"8px", margin:"14px 0" }}>
          {pendingInvites.map(inv => (
            <div key={inv.id} style={{
              background:"rgba(196,154,60,0.06)", border:"1px solid rgba(196,154,60,0.2)",
              borderRadius:"12px", padding:"11px 16px",
              display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px",
            }}>
              <p style={{ fontSize:"13px", color:"var(--text-secondary)", flex:1, minWidth:0 }}>
                📩 <b style={{ color:"var(--text-primary)" }}>{inv.fromName || "Someone"}</b> invited you to their study room
              </p>
              <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
                <button onClick={() => acceptInvite(inv)} style={{ ...S.accentBtn, padding:"6px 14px", fontSize:"12px" }}>Join</button>
                <button onClick={() => onDismissInvite?.(inv.id)} style={{ ...S.ghostBtn, marginTop:0, padding:"6px 12px", fontSize:"12px" }}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Friends strip — who's studying now (Join), plus nudge the rest */}
      {friends.length > 0 && (
        <div style={{ marginBottom:"18px" }}>
          <p style={{ ...S.sectionLabel, marginBottom:"10px" }}>Friends</p>
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {studyingFriends.map(f => (
              <div key={f.id} style={{ display:"flex", alignItems:"center", gap:"10px", background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"12px", padding:"10px 14px" }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:"var(--color-accent)", flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:"13px", fontWeight:"500", color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</p>
                  <p style={{ fontSize:"11px", color:"var(--color-accent)" }}>studying now</p>
                </div>
                <button onClick={() => joinFriendRoom(friendRoomMap[f.id])} style={{ ...S.accentBtn, padding:"6px 14px", fontSize:"12px" }}>Join</button>
              </div>
            ))}
            {offlineFriends.map(f => {
              const st = nudged[f.id];
              return (
                <div key={f.id} style={{ display:"flex", alignItems:"center", gap:"10px", background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"12px", padding:"10px 14px" }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", background:"rgba(255,255,255,0.15)", flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:"13px", fontWeight:"500", color:"var(--text-secondary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</p>
                    <p style={{ fontSize:"11px", color:"var(--text-dim)" }}>offline</p>
                  </div>
                  <button
                    onClick={() => { if (!st) nudgeFriend(f); }}
                    disabled={!!st}
                    style={{ ...S.ghostBtn, marginTop:0, padding:"6px 12px", fontSize:"12px", opacity: st ? 0.5 : 1, cursor: st ? "default" : "pointer" }}
                  >
                    {st === "sent" ? "Nudged ✓" : st === "limited" ? "Limit reached" : st === "sending" ? "…" : "Nudge"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filter tabs + refresh ───────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", margin:"18px 0 14px" }}>
        <div style={{ display:"flex", gap:"2px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"20px", padding:"3px" }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              style={{
                padding:"5px 14px", borderRadius:"16px",
                border: activeFilter === f ? "1px solid rgba(196,154,60,0.28)" : "1px solid transparent",
                fontSize:"12px", fontWeight: activeFilter === f ? "600" : "500",
                cursor:"pointer", fontFamily:"inherit",
                background: activeFilter === f ? "rgba(196,154,60,0.15)" : "transparent",
                color: activeFilter === f ? "var(--color-accent)" : "var(--text-secondary)",
                transition:"all 0.15s",
              }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <button onClick={fetchRooms} style={{ ...S.ghostBtn, marginTop:0, padding:"5px 10px", fontSize:"13px" }}>↻</button>
      </div>

      {/* ── Room grid ───────────────────────────────────────────── */}
      {loading ? (
        <p style={{ color:"var(--text-dim)", fontSize:"14px", textAlign:"center", padding:"40px 0" }}>Loading rooms…</p>
      ) : filteredRooms.length === 0 ? (
        <div style={{ ...S.emptyState, padding:"40px 24px" }}>
          <p style={{ color:"var(--text-secondary)", fontSize:"15px", fontWeight:"600", marginBottom:"6px" }}>{emptyMsg.title}</p>
          <p style={{ color:"var(--text-dim)", fontSize:"13px" }}>{emptyMsg.sub}</p>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:"14px" }}>
          {filteredRooms.map(room => {
            const courseMatch = courses?.find(c => Number(c.dbId) === room.course_id);
            const courseLabel = courseMatch
              ? (courseMatch.courseCode ? `${courseMatch.courseCode} — ${courseMatch.name}` : courseMatch.name)
              : null;
            return (
              <RoomCard
                key={room.id}
                room={room}
                liveCount={roomCounts[room.id] || 0}
                joining={joiningId === room.id}
                pendingStatus={pendingReqs[room.id]}
                courseLabel={courseLabel}
                onJoin={() => handleJoin(room)}
              />
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateRoomModal
          courses={courses}
          onCreate={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoomCard — tile layout for the lobby grid
// ─────────────────────────────────────────────────────────────────────────────
function RoomCard({ room, liveCount, joining, pendingStatus, courseLabel, onJoin }: {
  room: any; liveCount: number; joining: boolean; pendingStatus: string | undefined;
  courseLabel: string | null; onJoin: () => void;
}) {
  const isPrivate = room.room_type === "invite";
  const btnLabel =
    pendingStatus === "accepted"  ? "Joining…" :
    pendingStatus === "joined"    ? "Re-enter" :
    pendingStatus === "requested" ? "Waiting…" :
    joining                       ? "Joining…" :
    isPrivate                     ? "Request" : "Join →";
  const btnDisabled = joining || pendingStatus === "requested" || pendingStatus === "accepted";

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "14px",
        padding: "20px",
        display: "flex", flexDirection: "column", gap: "0",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        transition: "border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.13)";
        (e.currentTarget as HTMLDivElement).style.boxShadow   = "0 4px 16px rgba(0,0,0,0.18)";
        (e.currentTarget as HTMLDivElement).style.transform   = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--color-border)";
        (e.currentTarget as HTMLDivElement).style.boxShadow   = "0 1px 3px rgba(0,0,0,0.1)";
        (e.currentTarget as HTMLDivElement).style.transform   = "translateY(0)";
      }}
    >
      {/* Room name + type badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
        <p style={{
          fontSize: "15px", fontWeight: "600", fontFamily: "'Fraunces', serif",
          color: "var(--text-primary)", lineHeight: "1.3",
          flex: 1, minWidth: 0, wordBreak: "break-word", margin: 0,
        }}>
          {room.name}
        </p>
        <span style={{
          fontSize: "10px", fontWeight: "700", letterSpacing: "0.6px",
          textTransform: "uppercase",
          padding: "3px 8px", borderRadius: "5px", flexShrink: 0, whiteSpace: "nowrap",
          background: isPrivate ? "rgba(196,100,100,0.08)" : "rgba(127,174,110,0.08)",
          color: isPrivate ? "rgba(210,110,110,0.85)" : "rgba(110,185,120,0.85)",
          border: `1px solid ${isPrivate ? "rgba(196,100,100,0.15)" : "rgba(127,174,110,0.15)"}`,
        }}>
          {isPrivate ? "Private" : "Public"}
        </span>
      </div>

      {/* Course label */}
      {courseLabel && (
        <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "0 0 12px", lineHeight: "1.4" }}>
          {courseLabel}
        </p>
      )}

      {/* Access filter badges */}
      {activeFilterKeys(room.access_filters).length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <FilterBadges filters={room.access_filters} small />
        </div>
      )}

      {/* Divider */}
      <div style={{ height: "1px", background: "rgba(255,255,255,0.05)", margin: courseLabel ? "0 0 12px" : "8px 0 12px" }} />

      {/* Live count + action */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        {liveCount > 0 ? (
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-accent)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-accent)", display: "inline-block", flexShrink: 0 }}/>
            {liveCount} focusing
          </span>
        ) : (
          <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>No one yet</span>
        )}
        <button
          onClick={onJoin}
          disabled={btnDisabled}
          style={{
            padding: "7px 16px", borderRadius: "8px",
            fontSize: "12px", fontWeight: "600",
            cursor: btnDisabled ? "default" : "pointer",
            fontFamily: "inherit", flexShrink: 0,
            background: btnDisabled ? "rgba(255,255,255,0.04)" : "rgba(196,154,60,0.1)",
            color: btnDisabled ? "var(--text-dim)" : "var(--color-accent)",
            border: `1px solid ${btnDisabled ? "rgba(255,255,255,0.07)" : "rgba(196,154,60,0.25)"}`,
            opacity: pendingStatus === "requested" ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {btnLabel}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateRoomModal
// ─────────────────────────────────────────────────────────────────────────────
function CreateRoomModal({ courses, onCreate, onClose }) {
  const [name,     setName]     = useState("");
  const [courseId, setCourseId] = useState("");
  const [roomType, setRoomType] = useState("public");
  const [accessFilters, setAccessFilters] = useState<AccessFilters>({});
  const [saving,   setSaving]   = useState(false);
  const S = styles;

  async function handleSubmit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    await onCreate({ name, courseId, roomType, accessFilters });
    setSaving(false);
  }

  return (
    <div style={S.modalOverlay}>
      <div style={S.modalCard}>
        <h2 style={{ fontSize:"20px", fontWeight:"700", color:"var(--text-primary)", marginBottom:"22px" }}>
          Create a Room
        </h2>
        <label style={S.fieldLabel}>Room name</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="e.g. CDS151 Study Session"
          style={S.input}
        />
        <label style={S.fieldLabel}>Course (optional)</label>
        <select value={courseId} onChange={e => setCourseId(e.target.value)} style={S.input}>
          <option value="">No course / general</option>
          {(courses || []).map(c => (
            <option key={c.dbId ?? c.id} value={c.dbId || ""} disabled={!c.dbId}>
              {c.courseCode ? `${c.courseCode} — ${c.name}` : c.name}{!c.dbId ? " (sync to link)" : ""}
            </option>
          ))}
        </select>
        <div style={{ display:"flex", gap:"8px", marginBottom:"22px" }}>
          {["public","invite"].map(t => (
            <button key={t} onClick={() => setRoomType(t)} style={{
              flex:1, padding:"9px 0", borderRadius:"9px",
              fontSize:"13px", fontWeight:"500", cursor:"pointer", fontFamily:"inherit",
              background: roomType===t ? "rgba(196,154,60,0.14)" : "rgba(255,255,255,0.04)",
              color:      roomType===t ? "var(--color-accent)" : "var(--text-dim)",
              border: `1px solid ${roomType===t ? "rgba(196,154,60,0.3)" : "rgba(255,255,255,0.08)"}`,
              transition:"all 0.15s",
            }}>
              {t==="public" ? "🌐 Public" : "🔒 Invite only"}
            </button>
          ))}
        </div>

        {/* Who can join — access filters (combined with OR) */}
        <label style={S.fieldLabel}>Who can join</label>
        <p style={{ fontSize:"11px", color:"var(--text-dim)", margin:"4px 0 10px" }}>
          Leave all off for anyone. Pick one or more — a student who matches <b>any</b> of them can join.
        </p>
        <div style={{ marginBottom:"22px" }}>
          <AccessToggles
            value={accessFilters}
            onChange={setAccessFilters}
            hasCourse={!!courseId}
          />
        </div>

        <div style={{ display:"flex", gap:"10px" }}>
          <button onClick={onClose} style={S.ghostBtnLarge}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            style={{ ...S.primaryBtnLarge, opacity: !name.trim()||saving ? 0.4 : 1 }}
          >
            {saving ? "Creating…" : "Create Room →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AccessSettingsModal — owner edits who can join an existing room
// ─────────────────────────────────────────────────────────────────────────────
function AccessSettingsModal({ initial, hasCourse, onSave, onClose }: {
  initial: AccessFilters; hasCourse: boolean;
  onSave: (f: AccessFilters) => void; onClose: () => void;
}) {
  const [filters, setFilters] = useState<AccessFilters>(initial || {});
  const S = styles;
  return (
    <div style={S.modalOverlay}>
      <div style={{ ...S.modalCard, maxWidth:"380px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px" }}>
          <h2 style={{ fontSize:"18px", fontWeight:"700", color:"var(--text-primary)" }}>Who can join</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--text-dim)", fontSize:"18px", cursor:"pointer", padding:"0 4px" }}>×</button>
        </div>
        <p style={{ fontSize:"12px", color:"var(--text-dim)", margin:"0 0 16px", lineHeight:1.5 }}>
          Leave all off for anyone. Pick one or more — a student who matches <b>any</b> of them can join. Already-joined members stay.
        </p>
        <div style={{ marginBottom:"22px" }}>
          <AccessToggles value={filters} onChange={setFilters} hasCourse={hasCourse} />
        </div>
        <div style={{ display:"flex", gap:"10px" }}>
          <button onClick={onClose} style={S.ghostBtnLarge}>Cancel</button>
          <button onClick={() => onSave(filters)} style={S.primaryBtnLarge}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoomView — Phase 2A: + Pomodoro, Goal prompt, Session summary
// ─────────────────────────────────────────────────────────────────────────────
function RoomView({ room, onLeave, roomCounts, onlineIds = [] }) {
  const { userId, userData } = useApp();
  const [members,            setMembers]            = useState([]);
  const [workingOn,          setWorkingOn]          = useState("");
  const [requests,           setRequests]           = useState([]);
  const [showInvite,         setShowInvite]         = useState(false);
  const [showAccess,         setShowAccess]         = useState(false);
  const [accessFilters,      setAccessFilters]      = useState<AccessFilters>(room.access_filters || {});
  const [tick,               setTick]               = useState(0);
  const [pomo,               setPomo]               = useState(null);
  const [showGoalPrompt,     setShowGoalPrompt]     = useState(false);
  const [showSummary,        setShowSummary]        = useState(false);
  const [summaryDurationSecs,setSummaryDurationSecs]= useState(0);
  // Phase 2C — AI Study Buddy
  const [showBuddy,          setShowBuddy]          = useState(false);
  const [buddyQAs,           setBuddyQAs]           = useState([]);
  const [buddyStreaming,     setBuddyStreaming]     = useState(false);
  const [courseName,         setCourseName]         = useState("");
  // Voice chat (Daily.co placeholder)
  const [showVoice,          setShowVoice]          = useState(false);
  // Phase 2 — Chat
  const [showChat,           setShowChat]           = useState(false);
  const [chatMessages,       setChatMessages]       = useState<ChatMessage[]>([]);
  const [chatInput,          setChatInput]          = useState("");
  const [chatSending,        setChatSending]        = useState(false);
  const chatLoadedRef = useRef(false);
  // Phase 3 — Whiteboard
  const [showBoard,          setShowBoard]          = useState(false);
  const [strokes,            setStrokes]            = useState<Stroke[]>([]);
  const [wbTool,             setWbTool]             = useState<Tool>("pen");
  const [wbStyle,            setWbStyle]            = useState<PenStyle>("normal");
  const [wbColor,            setWbColor]            = useState(PEN_COLORS[2]);
  const [wbPenWidth,         setWbPenWidth]         = useState(PEN_WIDTHS[1]);
  const [wbEraserSize,       setWbEraserSize]       = useState(ERASER_SIZES[1]);
  const [wbBg,               setWbBg]               = useState(DEFAULT_BG);
  const [liveStrokes,        setLiveStrokes]        = useState<Record<string, { mode: "pen" | "erase"; style: PenStyle; color: string; width: number; points: Point[] }>>({});
  const lastLiveSentRef = useRef(0);
  const yjsDocRef       = useRef<Y.Doc | null>(null);
  const yjsProviderRef  = useRef<SupabaseBroadcastProvider | null>(null);
  const yjsStrokesRef   = useRef<Y.Array<any> | null>(null);
  const yjsMetaRef      = useRef<Y.Map<any> | null>(null);

  const channelRef          = useRef(null);
  const reqChRef            = useRef(null);
  const wbChRef             = useRef(null);
  const sessionIdRef        = useRef(null);
  const joinedAtRef         = useRef(Date.now());
  const workingOnRef        = useRef("");
  const leftRef             = useRef(false);
  const workingOnDebounce   = useRef(null);
  const pomoRef             = useRef(null);
  const pomoAutoAdvancedRef = useRef(null);
  const goalTextRef         = useRef("");
  const buddyCallsRef       = useRef([]);   // timestamps for rate limiting (5/5min)
  const buddyAbortRef       = useRef(null); // AbortController for current buddy stream

  const isHost = room.created_by === userId;

  // Main setup
  useEffect(() => {
    startSession();
    subscribePresence();
    fetchPomodoroState();
    fetchCourseName();
    if (isHost) subscribeRequests();
    wbChRef.current = subscribeWhiteboard();
    const timer = setInterval(() => setTick(n => n + 1), 1000);
    const handleUnload = () => void endSession();
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      clearInterval(timer);
      clearTimeout(workingOnDebounce.current);
      window.removeEventListener("beforeunload", handleUnload);
      // Abort any in-flight buddy stream on unmount
      buddyAbortRef.current?.abort();
      yjsProviderRef.current?.destroy();
      yjsDocRef.current?.destroy();
      try { wbChRef.current?.unsubscribe(); } catch {}
      endSession();
    };
  }, []); // eslint-disable-line

  // Keep pomoRef in sync for use in effects without stale closure
  useEffect(() => { pomoRef.current = pomo; }, [pomo]);

  // Show goal prompt 500ms after entering, only once
  useEffect(() => {
    const t = setTimeout(() => setShowGoalPrompt(true), 500);
    return () => clearTimeout(t);
  }, []);

  // Host: auto-advance timer phase when countdown hits zero
  useEffect(() => {
    if (!isHost) return;
    const p = pomoRef.current;
    if (!p || p.phase === "idle" || p.paused) return;
    const rem = getRemaining(p);
    if (rem !== null && rem <= 0 && pomoAutoAdvancedRef.current !== p.startedAt) {
      pomoAutoAdvancedRef.current = p.startedAt;
      const nextPhase = p.phase === "focus" ? "break" : "focus";
      const nextDur   = nextPhase === "focus" ? 25 * 60 : 5 * 60;
      const next = { phase: nextPhase, paused: false, startedAt: Date.now(), durationSec: nextDur, pausedRemaining: null };
      setPomo(next);
      pomoRef.current = next;
      if (channelRef.current) {
        channelRef.current.send({ type: "broadcast", event: "pomodoro", payload: next }).catch(() => {});
      }
      supabase.from("study_rooms").update({ pomodoro_state: next }).eq("id", room.id).then(() => {});
    }
  }, [tick]); // eslint-disable-line

  async function fetchPomodoroState() {
    const { data } = await supabase
      .from("study_rooms").select("pomodoro_state").eq("id", room.id).single();
    if (data?.pomodoro_state) {
      const p = data.pomodoro_state;
      const rem = getRemaining(p);
      // If the phase expired while the user was navigating in, treat as idle
      if (p.phase !== "idle" && !p.paused && rem !== null && rem <= 0) {
        setPomo({ phase: "idle", paused: false, startedAt: null, durationSec: 25 * 60, pausedRemaining: null });
      } else {
        setPomo(p);
      }
    }
  }

  function broadcastAndSavePomo(state) {
    setPomo(state);
    pomoRef.current = state;
    if (channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "pomodoro", payload: state }).catch(() => {});
    }
    supabase.from("study_rooms").update({ pomodoro_state: state }).eq("id", room.id).then(() => {});
  }

  function handlePomoStart() {
    broadcastAndSavePomo({ phase: "focus", paused: false, startedAt: Date.now(), durationSec: 25 * 60, pausedRemaining: null });
  }
  function handlePomoPause() {
    const p = pomoRef.current;
    if (!p || p.phase === "idle" || p.paused) return;
    broadcastAndSavePomo({ ...p, paused: true, pausedRemaining: Math.max(0, getRemaining(p)) });
  }
  function handlePomoResume() {
    const p = pomoRef.current;
    if (!p || !p.paused) return;
    broadcastAndSavePomo({ phase: p.phase, paused: false, startedAt: Date.now(), durationSec: p.pausedRemaining ?? p.durationSec, pausedRemaining: null });
  }
  function handlePomoReset() {
    broadcastAndSavePomo({ phase: "idle", paused: false, startedAt: null, durationSec: 25 * 60, pausedRemaining: null });
  }
  function handlePomoSkip() {
    const p = pomoRef.current;
    if (!p || p.phase === "idle") return;
    const nextPhase = p.phase === "focus" ? "break" : "focus";
    const nextDur   = nextPhase === "focus" ? 25 * 60 : 5 * 60;
    broadcastAndSavePomo({ phase: nextPhase, paused: false, startedAt: Date.now(), durationSec: nextDur, pausedRemaining: null });
  }

  async function startSession() {
    const { data } = await supabase
      .from("room_sessions")
      .insert({ room_id: room.id, user_id: userId, joined_at: new Date().toISOString() })
      .select("id").single();
    sessionIdRef.current = data?.id ?? null;
    // +2 for joining a study room (server caps at 3/day, deduped per session)
    if (sessionIdRef.current) {
      awardTokens("study_room_join", { sessionId: sessionIdRef.current, roomId: room.id }).catch(() => {});
    }
    supabase.from("study_rooms")
      .update({ last_active: new Date().toISOString() }).eq("id", room.id).then(() => {});
  }

  function presencePayload(wo = workingOnRef.current) {
    return {
      userId,
      name:      userData?.name ?? "Anonymous",
      initial:   (userData?.name?.[0] ?? "?").toUpperCase(),
      workingOn: wo,
      joinedAt:  joinedAtRef.current,
    };
  }

  function subscribePresence() {
    const ch = supabase.channel("room:" + room.id, {
      config: { presence: { key: userId } },
    });
    ch.on("presence", { event: "sync" }, () => {
      const all = Object.values(ch.presenceState()).flat();
      // Collapse duplicate presences for the same user (a stale "ghost" presence
      // can linger under the same key after a re-track). Prefer the entry that has
      // a goal set; otherwise the most recently joined one.
      const byUser = new Map();
      for (const m of all as any[]) {
        const prev = byUser.get(m.userId);
        if (!prev) { byUser.set(m.userId, m); continue; }
        const better = (!!m.workingOn !== !!prev.workingOn)
          ? !!m.workingOn
          : (m.joinedAt ?? 0) >= (prev.joinedAt ?? 0);
        if (better) byUser.set(m.userId, m);
      }
      const collapsed = Array.from(byUser.values());
      setMembers(collapsed);
      // Remove live strokes for users no longer present.
      setLiveStrokes(prev => {
        const presentIds = new Set(byUser.keys());
        const next = { ...prev };
        for (const id of Object.keys(next)) if (!presentIds.has(id)) delete next[id];
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    })
    .on("broadcast", { event: "room_closed" }, () => {
      if (!leftRef.current) endSession().then(() => onLeave());
    })
    .on("broadcast", { event: "pomodoro" }, ({ payload }) => {
      setPomo(payload);
    })
    .on("broadcast", { event: "access_changed" }, ({ payload }) => {
      setAccessFilters(payload?.filters || {});
    })
    // AI Buddy — shared Q&A events
    .on("broadcast", { event: "buddy_question" }, ({ payload }) => {
      setBuddyQAs(prev => {
        if (prev.some(q => q.id === payload.qaId)) return prev;
        return [...prev, { id: payload.qaId, question: payload.question, askerName: payload.askerName, answer: "", done: false, streaming: true }];
      });
      setShowBuddy(true);
    })
    .on("broadcast", { event: "buddy_stream" }, ({ payload }) => {
      setBuddyQAs(prev => prev.map(qa => qa.id === payload.qaId ? { ...qa, answer: payload.text } : qa));
    })
    .on("broadcast", { event: "buddy_done" }, ({ payload }) => {
      setBuddyQAs(prev => prev.map(qa => qa.id === payload.qaId ? { ...qa, answer: payload.text, done: true, streaming: false } : qa));
    })
    .on("broadcast", { event: "chat_message" }, ({ payload }) => {
      setChatMessages(prev => {
        if (prev.some(m => m.id === payload.id)) return prev;
        return [...prev, payload as ChatMessage];
      });
    })
    // Whiteboard — a peer is actively drawing (live preview)
    .on("broadcast", { event: "wb_live" }, ({ payload }) => {
      if (payload.userId === userId) return;
      setLiveStrokes(prev => ({ ...prev, [payload.userId]: { mode: payload.mode, style: payload.style, color: payload.color, width: payload.width, points: payload.points } }));
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") await ch.track(presencePayload());
    });
    channelRef.current = ch;
  }

  function subscribeRequests() {
    supabase.from("room_members")
      .select("user_id, joined_at")
      .eq("room_id", room.id)
      .eq("status", "requested")
      .then(({ data }) => { if (data?.length) enrichRequests(data); });
    const ch = supabase.channel("requests-" + room.id);
    ch.on("postgres_changes", {
      event: "*", schema: "public", table: "room_members",
      filter: `room_id=eq.${room.id}`,
    }, (payload: any) => {
      if (payload.new?.status === "requested") enrichRequests([payload.new]);
      if (payload.eventType === "DELETE" || payload.new?.status === "joined" || payload.new?.status === "declined") {
        setRequests(prev => prev.filter(r => r.userId !== (payload.new?.user_id || payload.old?.user_id)));
      }
    }).subscribe();
    reqChRef.current = ch;
  }

  function subscribeWhiteboard() {
    const ch = supabase.channel("wb-" + room.id);

    const doc = new Y.Doc();
    const yStrokes = doc.getArray<any>("strokes");
    const yMeta    = doc.getMap<any>("meta");

    yjsDocRef.current      = doc;
    yjsStrokesRef.current  = yStrokes;
    yjsMetaRef.current     = yMeta;

    // When the strokes array changes, update React state and clear the live
    // preview for any peer whose stroke just committed.
    let prevLength = 0;
    yStrokes.observe(() => {
      const arr = yStrokes.toArray() as Stroke[];
      setStrokes(arr);
      if (arr.length > prevLength) {
        const added = arr.slice(prevLength);
        setLiveStrokes(prev => {
          const next = { ...prev };
          added.forEach((s: any) => { if (s.user_id && s.user_id !== userId) delete next[s.user_id]; });
          return next;
        });
      }
      prevLength = arr.length;
    });

    // Background colour is stored in the Yjs meta map so it syncs like strokes.
    yMeta.observe(() => {
      const bg = yMeta.get("bg");
      if (bg) setWbBg(bg as string);
    });

    const provider = new SupabaseBroadcastProvider(doc, ch, room.id);
    yjsProviderRef.current = provider;

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Seed from persisted DB state, then ask live peers for any newer updates.
        await provider.loadPersistedState();
        provider.requestSync();
      }
    });

    return ch;
  }

  async function enrichRequests(rows) {
    const ids = rows.map(r => r.user_id);
    const { data: users } = await supabase.from("users").select("id, name").in("id", ids);
    const nameMap = {};
    (users || []).forEach(u => { nameMap[u.id] = u.name; });
    setRequests(prev => {
      const existing = new Set(prev.map(r => r.userId));
      const fresh = rows
        .filter(r => !existing.has(r.user_id))
        .map(r => ({ userId: r.user_id, name: nameMap[r.user_id] || "Unknown", requestedAt: r.joined_at }));
      return [...prev, ...fresh];
    });
  }

  async function acceptRequest(requesterId) {
    try { await respondRoomRequest(userId, room.id, requesterId, true); }
    catch (err) { console.error("[rooms] accept:", (err as any)?.message); }
    setRequests(prev => prev.filter(r => r.userId !== requesterId));
  }

  async function declineRequest(requesterId) {
    try { await respondRoomRequest(userId, room.id, requesterId, false); }
    catch (err) { console.error("[rooms] decline:", (err as any)?.message); }
    setRequests(prev => prev.filter(r => r.userId !== requesterId));
  }

  async function endSession(goalMet = null) {
    if (leftRef.current) return;
    leftRef.current = true;
    if (channelRef.current) {
      // Session-only whiteboard: if I'm the last present member, wipe the board.
      // Read presence BEFORE untracking and clear BEFORE leaveRoom drops my
      // membership (the clear RPC requires me to still be a joined member).
      try {
        const present = Object.values(channelRef.current.presenceState()).flat() as any[];
        const othersOnline = new Set(present.map(p => p.userId).filter(id => id !== userId));
        if (othersOnline.size === 0) {
          // Last person leaving — wipe board so next session starts fresh.
          const arr = yjsStrokesRef.current;
          if (arr && arr.length > 0) arr.doc?.transact(() => { arr.delete(0, arr.length); });
          yjsMetaRef.current?.set("bg", DEFAULT_BG);
          await yjsProviderRef.current?.persistState().catch(() => {});
        } else {
          yjsProviderRef.current?.persistState().catch(() => {});
        }
      } catch {}
      try { await channelRef.current.untrack(); } catch {}
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (reqChRef.current) {
      supabase.removeChannel(reqChRef.current);
      reqChRef.current = null;
    }
    if (sessionIdRef.current) {
      const sid = sessionIdRef.current;
      const durSecs = Math.round((Date.now() - joinedAtRef.current) / 1000);
      supabase.from("room_sessions").update({
        left_at:       new Date().toISOString(),
        duration_secs: durSecs,
        working_on:    workingOnRef.current || null,
        goal_text:     goalTextRef.current || workingOnRef.current || null,
        goal_met:      goalMet,
      }).eq("id", sid).then(() => {
        // +5 per completed 15-min block — server recomputes duration from joined_at
        awardTokens("study_session_15min", { sessionId: sid }).catch(() => {});
      });
    }
    // Owners keep their membership so they can re-enter without re-joining.
    // Only guests have their row cleaned up when they leave.
    if (!isHost) leaveRoom(userId, room.id).catch(() => {});
  }

  function handleWorkingOnChange(val) {
    setWorkingOn(val);
    workingOnRef.current = val;
    clearTimeout(workingOnDebounce.current);
    workingOnDebounce.current = setTimeout(async () => {
      if (channelRef.current) {
        try { await channelRef.current.track(presencePayload(val)); } catch {}
      }
    }, 500);
  }

  async function handleLeave() {
    setSummaryDurationSecs(Math.round((Date.now() - joinedAtRef.current) / 1000));
    setShowSummary(true);
  }

  async function confirmLeave(goalMet) {
    setShowSummary(false);
    await endSession(goalMet);
    onLeave();
  }

  async function fetchCourseName() {
    if (!room.course_id) return;
    const { data } = await supabase.from("courses").select("name, course_code").eq("id", room.course_id).maybeSingle();
    if (data) setCourseName(data.course_code ? `${data.course_code} — ${data.name}` : data.name);
  }

  async function handleBuddyAsk(question) {
    if (buddyStreaming) return;
    // Rate limit: 5 calls per 5-minute window, per client
    const now = Date.now();
    buddyCallsRef.current = buddyCallsRef.current.filter(t => now - t < 5 * 60 * 1000);
    if (buddyCallsRef.current.length >= 5) return;
    buddyCallsRef.current.push(now);

    const qaId       = `${userId}-${now}`;
    const askerName  = userData?.name ?? "Someone";

    // Add to local state immediately (asker doesn't receive own broadcast)
    setBuddyQAs(prev => [...prev, { id: qaId, question, askerName, answer: "", done: false, streaming: true }]);

    // Notify room that a question was asked
    if (channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "buddy_question",
        payload: { qaId, question, askerName } }).catch(() => {});
    }

    // System prompt: inject room context the buddy knows automatically
    const workingOnLines = members
      .filter(m => m.workingOn)
      .map(m => `  • ${m.name}: ${m.workingOn}`)
      .join("\n") || "  (no goals set yet)";
    const system = [
      "You are an AI study buddy in a shared study room. Be concise (2-4 sentences unless depth truly warrants more), encouraging, and academically accurate. Format for readability — use a short list if it helps, but default to prose.",
      "",
      "ROOM CONTEXT (injected automatically — do not repeat this back):",
      `Course: ${courseName || "General study session"}`,
      "Students currently studying:",
      workingOnLines,
      "",
      "Answer the question directly. If you don't have enough information, say what you know and suggest where to find more.",
    ].join("\n");

    setBuddyStreaming(true);
    buddyAbortRef.current = new AbortController();

    try {
      const resp = await fetch("/api/claude", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: true, messages: [{ role: "user", content: question }], system, max_tokens: 600 }),
        signal: buddyAbortRef.current.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        setBuddyQAs(prev => prev.map(qa => qa.id === qaId
          ? { ...qa, answer: errData.error || "Sorry, I couldn't answer that right now. Try again.", done: true, streaming: false }
          : qa));
        return;
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "", fullText = "";
      let broadcastTimer = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const evt = JSON.parse(data);
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              fullText += evt.delta.text ?? "";
              setBuddyQAs(prev => prev.map(qa => qa.id === qaId ? { ...qa, answer: fullText } : qa));
              // Broadcast accumulated text every 300ms (debounced) — not per-token
              clearTimeout(broadcastTimer);
              broadcastTimer = setTimeout(() => {
                if (channelRef.current) {
                  channelRef.current.send({ type: "broadcast", event: "buddy_stream",
                    payload: { qaId, text: fullText } }).catch(() => {});
                }
              }, 300);
            }
          } catch {}
        }
      }

      // Final: mark done locally + broadcast complete answer
      clearTimeout(broadcastTimer);
      setBuddyQAs(prev => prev.map(qa => qa.id === qaId
        ? { ...qa, answer: fullText, done: true, streaming: false } : qa));
      if (channelRef.current) {
        channelRef.current.send({ type: "broadcast", event: "buddy_done",
          payload: { qaId, text: fullText } }).catch(() => {});
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        setBuddyQAs(prev => prev.map(qa => qa.id === qaId
          ? { ...qa, answer: "Connection error. Please try again.", done: true, streaming: false }
          : qa));
      }
    } finally {
      setBuddyStreaming(false);
      buddyAbortRef.current = null;
    }
  }

  async function handleCloseRoom() {
    await supabase.from("study_rooms").update({ is_active: false }).eq("id", room.id);
    if (channelRef.current) {
      try {
        await channelRef.current.send({ type: "broadcast", event: "room_closed", payload: {} });
      } catch {}
    }
    await endSession();
    onLeave();
  }

  // Owner-only: persist new access filters (server checks ownership) + tell the room.
  async function saveAccess(filters: AccessFilters) {
    const clean = { ...filters };
    if (!room.course_id) delete clean.course;
    setAccessFilters(clean);
    setShowAccess(false);
    try {
      await setRoomAccess(userId, room.id, clean);
      room.access_filters = clean; // keep the prop mirror in sync for re-renders
      channelRef.current?.send({ type: "broadcast", event: "access_changed", payload: { filters: clean } }).catch(() => {});
    } catch (err) {
      console.error("[rooms] set access:", (err as any)?.message);
    }
  }

  function handleOpenChat() {
    setShowChat(true);
    if (!chatLoadedRef.current) {
      chatLoadedRef.current = true;
      loadRecentMessages(userId, room.id).then(setChatMessages).catch(err => {
        console.error("[chat] load:", (err as any)?.message);
        chatLoadedRef.current = false; // allow retry on next open if it failed
      });
    }
  }

  function handleOpenBoard() {
    setShowBoard(true);
    // Yjs state loads automatically via subscribeWhiteboard() on room join.
  }

  function handleStrokeComplete(stroke: { mode: "pen" | "erase"; style: PenStyle; color: string; width: number; points: Point[] }) {
    yjsStrokesRef.current?.push([{
      id: crypto.randomUUID(),
      room_id: room.id,
      user_id: userId,
      name: userData?.name ?? "Anonymous",
      created_at: new Date().toISOString(),
      ...stroke,
    }]);
    // Yjs observer fires → setStrokes() → canvas re-renders.
    // Provider broadcasts the binary delta to all peers automatically.
  }

  function handleEraseStroke(strokeId: string) {
    const arr = yjsStrokesRef.current;
    if (!arr) return;
    const idx = (arr.toArray() as any[]).findIndex(s => s.id === strokeId);
    if (idx !== -1) arr.delete(idx, 1);
    // Yjs observer fires → setStrokes() → canvas re-renders and peers sync.
  }

  function handleBgChange(bg: string) {
    setWbBg(bg);
    yjsMetaRef.current?.set("bg", bg);
    // Yjs meta observer on peers fires → setWbBg(). Provider broadcasts the delta.
  }

  function handleLiveStroke(draft: { mode: "pen" | "erase"; style: PenStyle; color: string; width: number; points: Point[] } | null) {
    if (!draft) return; // stroke finished — wb_stroke broadcast clears peers' live preview
    const now = Date.now();
    if (now - lastLiveSentRef.current < 70) return; // ~14/s — under the 30/s realtime budget
    lastLiveSentRef.current = now;
    channelRef.current?.send({ type: "broadcast", event: "wb_live", payload: { userId, ...draft } }).catch(() => {});
  }

  function handleClearBoard() {
    const arr = yjsStrokesRef.current;
    if (arr && arr.length > 0) arr.doc?.transact(() => { arr.delete(0, arr.length); });
    yjsMetaRef.current?.set("bg", DEFAULT_BG);
    setLiveStrokes({});
    // Yjs observers fire on all peers → canvas clears everywhere.
  }

  async function sendChatMessage() {
    const body = chatInput.trim();
    if (!body || chatSending) return;
    setChatInput("");
    setChatSending(true);
    try {
      const msg = await postRoomMessage(userId, room.id, userData?.name ?? "Anonymous", body);
      setChatMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      channelRef.current?.send({
        type: "broadcast", event: "chat_message", payload: msg,
      }).catch(() => {});
    } catch (err) {
      console.error("[chat] send:", (err as any)?.message);
      setChatInput(body);
    } finally {
      setChatSending(false);
    }
  }

  const totalFocusMins = members.reduce((sum, m) => {
    return sum + Math.floor((Date.now() - m.joinedAt) / 60000);
  }, 0);

  const S = styles;
  const remaining = getRemaining(pomo);

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"20px" }}>
        <div>
          <p style={S.sectionLabel}>Study Room</p>
          <h1 style={{ ...S.pageTitle, fontSize:"22px" }}>{room.name}</h1>
          <p style={{ fontSize:"12px", color:"var(--text-dim)", marginTop:"3px" }}>
            {room.room_type === "invite" ? "🔒 Invite only" : "🌐 Public"}
            {members.length > 0 && (
              <span style={{ marginLeft:"10px", color:"var(--color-accent)" }}>
                · {members.length} focusing now
              </span>
            )}
          </p>
          {activeFilterKeys(accessFilters).length > 0 && (
            <div style={{ marginTop:"8px" }}>
              <FilterBadges filters={accessFilters} small />
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
          <button
            onClick={() => setShowBuddy(b => !b)}
            style={{
              ...S.ghostBtn, marginTop:0, padding:"8px 14px", fontSize:"12px",
              background: showBuddy ? "rgba(111,179,196,0.1)" : "none",
              borderColor: showBuddy ? "rgba(111,179,196,0.3)" : "rgba(255,255,255,0.09)",
              color: showBuddy ? "#6fb3c4" : "var(--text-dim)",
            }}
          >
            🤖 AI
          </button>
          <button
            onClick={() => showChat ? setShowChat(false) : handleOpenChat()}
            style={{
              ...S.ghostBtn, marginTop:0, padding:"8px 14px", fontSize:"12px",
              background: showChat ? "rgba(127,174,110,0.1)" : "none",
              borderColor: showChat ? "rgba(127,174,110,0.3)" : "rgba(255,255,255,0.09)",
              color: showChat ? "#7fae6e" : "var(--text-dim)",
            }}
          >
            💬 Chat
          </button>
          <button
            onClick={() => showBoard ? setShowBoard(false) : handleOpenBoard()}
            style={{
              ...S.ghostBtn, marginTop:0, padding:"8px 14px", fontSize:"12px",
              background: showBoard ? "rgba(196,154,60,0.1)" : "none",
              borderColor: showBoard ? "rgba(196,154,60,0.3)" : "rgba(255,255,255,0.09)",
              color: showBoard ? "#c49a3c" : "var(--text-dim)",
            }}
          >
            🖊 Board
          </button>
          <button
            onClick={() => setShowVoice(v => !v)}
            style={{
              ...S.ghostBtn, marginTop:0, padding:"8px 14px", fontSize:"12px",
              background: showVoice ? "rgba(96,165,250,0.1)" : "none",
              borderColor: showVoice ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.09)",
              color: showVoice ? "#60a5fa" : "var(--text-dim)",
            }}
          >
            🎙 Voice
          </button>
          <button
            onClick={() => setShowInvite(true)}
            style={{ ...S.ghostBtn, marginTop:0, padding:"8px 14px", fontSize:"12px" }}
          >
            Invite friends
          </button>
          {isHost && (
            <button
              onClick={() => setShowAccess(true)}
              style={{ ...S.ghostBtn, marginTop:0, padding:"8px 14px", fontSize:"12px" }}
              title="Who can join this room"
            >
              ⚙ Access
            </button>
          )}
          {isHost && (
            <button
              onClick={handleCloseRoom}
              style={{
                background:"rgba(255,59,48,0.07)", border:"1px solid rgba(255,59,48,0.18)",
                borderRadius:"8px", padding:"8px 14px", color:"rgba(255,100,90,0.7)",
                fontSize:"12px", fontWeight:"500", cursor:"pointer", fontFamily:"inherit",
              }}
              title="Close room for everyone"
            >
              Close room
            </button>
          )}
          <button onClick={handleLeave} style={S.leaveBtn}>Leave</button>
        </div>
      </div>

      {/* Living focus orb — members orbit the core, intensifies during a sprint */}
      <StudyOrb
        active={!!pomo && pomo.phase === "focus" && !pomo.paused}
        members={members}
      />

      {/* Pomodoro Timer — centerpiece */}
      <PomodoroPanel
        pomo={pomo}
        remaining={remaining}
        isHost={isHost}
        onStart={handlePomoStart}
        onPause={handlePomoPause}
        onResume={handlePomoResume}
        onReset={handlePomoReset}
        onSkip={handlePomoSkip}
      />

      {/* Collective focus strip */}
      {members.length > 1 && (
        <div style={{
          background:"rgba(196,154,60,0.06)", border:"1px solid rgba(196,154,60,0.14)",
          borderRadius:"10px", padding:"10px 16px", marginBottom:"18px",
          display:"flex", alignItems:"center", justifyContent:"space-between",
        }}>
          <span style={{ fontSize:"12px", color:"var(--text-secondary)" }}>
            Focus pact · {members.length} people, {totalFocusMins} min total this session
          </span>
          <span style={{ fontSize:"12px", fontWeight:"600", color:"var(--color-accent)" }}>Together 💪</span>
        </div>
      )}

      {/* Pending requests (host only) */}
      {isHost && requests.length > 0 && (
        <div style={{ marginBottom:"18px" }}>
          <p style={{ ...S.sectionLabel, marginBottom:"10px" }}>Requests to join ({requests.length})</p>
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            {requests.map(r => (
              <RequestCard
                key={r.userId}
                request={r}
                onAccept={() => acceptRequest(r.userId)}
                onDecline={() => declineRequest(r.userId)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Working-on / session goal */}
      <div style={{ marginBottom:"20px" }}>
        <p style={{ ...S.sectionLabel, marginBottom:"8px" }}>What I'm working on</p>
        <input
          value={workingOn}
          onChange={e => handleWorkingOnChange(e.target.value)}
          placeholder="e.g. CDS151 lab question 3…"
          maxLength={80}
          style={S.input}
          onFocus={e => (e.target.style.borderColor="rgba(255,255,255,0.22)")}
          onBlur={e  => (e.target.style.borderColor="rgba(255,255,255,0.1)")}
        />
        <p style={{ fontSize:"11px", color:"var(--text-dim)", marginTop:"4px" }}>
          Visible to everyone in the room.
        </p>
      </div>

      {/* Room code */}
      {room.join_code && (
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          background:"rgba(255,255,255,0.03)", border:"1px solid var(--color-border)",
          borderRadius:"10px", padding:"10px 14px", marginBottom:"20px",
        }}>
          <div>
            <span style={{ fontSize:"10px", color:"var(--text-dim)", letterSpacing:"1.5px", textTransform:"uppercase" }}>Room code</span>
            <p style={{ fontFamily:"'Fraunces',serif", fontSize:"18px", fontWeight:"600",
              color:"var(--color-accent)", letterSpacing:"3px", marginTop:"2px" }}>
              {room.join_code}
            </p>
          </div>
          <button
            onClick={() => { navigator.clipboard?.writeText(room.join_code).catch(() => {}); }}
            style={{ ...S.ghostBtn, marginTop:0, padding:"6px 14px", fontSize:"12px" }}
          >
            Copy
          </button>
        </div>
      )}

      {/* Member list */}
      <p style={{ ...S.sectionLabel, marginBottom:"12px" }}>In this room</p>
      {members.length === 0 ? (
        <div style={S.emptyState}>
          <p style={{ color:"var(--text-secondary)", fontSize:"14px", fontWeight:"500", marginBottom:"5px" }}>You're the first one here</p>
          <p style={{ color:"var(--text-dim)", fontSize:"12px" }}>Invite friends or share the room code.</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {members.map(m => (
            <MemberCard key={m.userId} member={m} isMe={m.userId === userId} />
          ))}
        </div>
      )}

      {/* AI Study Buddy panel — collapsible, shared Q&A */}
      {showBuddy && (
        <BuddyPanel
          qaItems={buddyQAs}
          streaming={buddyStreaming}
          callsLeft={Math.max(0, 5 - buddyCallsRef.current.filter(t => Date.now() - t < 5 * 60 * 1000).length)}
          onAsk={handleBuddyAsk}
          onClose={() => setShowBuddy(false)}
        />
      )}

      {/* Voice chat panel — Daily.co placeholder, audio-first */}
      {showVoice && (
        <VoiceRoom roomId={room.id} userName={userData?.name ?? ""} onClose={() => setShowVoice(false)} />
      )}

      {/* Chat panel — persisted, WhatsApp-style */}
      {showChat && (
        <ChatPanel
          messages={chatMessages}
          myUserId={userId}
          input={chatInput}
          sending={chatSending}
          onInputChange={setChatInput}
          onSend={sendChatMessage}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Whiteboard panel — session-only, clears when everyone leaves */}
      {showBoard && (
        <Whiteboard
          strokes={strokes}
          liveStrokes={liveStrokes}
          tool={wbTool}
          style={wbStyle}
          color={wbColor}
          penWidth={wbPenWidth}
          eraserSize={wbEraserSize}
          bg={wbBg}
          onToolChange={setWbTool}
          onStyleChange={setWbStyle}
          onColorChange={setWbColor}
          onPenWidthChange={setWbPenWidth}
          onEraserSizeChange={setWbEraserSize}
          onBgChange={handleBgChange}
          onStrokeComplete={handleStrokeComplete}
          onEraseStroke={handleEraseStroke}
          onLiveStroke={handleLiveStroke}
          onClear={handleClearBoard}
          onClose={() => setShowBoard(false)}
        />
      )}

      {showInvite && (
        <InviteModal room={room} userId={userId} userData={userData} onlineIds={onlineIds} onClose={() => setShowInvite(false)} />
      )}

      {showAccess && (
        <AccessSettingsModal
          initial={accessFilters}
          hasCourse={!!room.course_id}
          onSave={saveAccess}
          onClose={() => setShowAccess(false)}
        />
      )}

      {/* Goal prompt on enter */}
      {showGoalPrompt && (
        <GoalPromptModal
          onSet={(goal) => {
            goalTextRef.current = goal;
            handleWorkingOnChange(goal);
            setShowGoalPrompt(false);
          }}
          onSkip={() => setShowGoalPrompt(false)}
        />
      )}

      {/* Session summary on leave */}
      {showSummary && (
        <SessionSummaryModal
          durationSecs={summaryDurationSecs}
          goal={goalTextRef.current || workingOn}
          onConfirm={confirmLeave}
          onBack={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PomodoroPanel — synced timer display + host controls
// ─────────────────────────────────────────────────────────────────────────────
function pomoCtrlStyle(variant) {
  const v = {
    dim:    { bg:"rgba(255,255,255,0.05)", color:"var(--text-dim)",      border:"rgba(255,255,255,0.09)" },
    accent: { bg:"rgba(196,154,60,0.12)", color:"#C49A3C",              border:"rgba(196,154,60,0.3)"   },
    red:    { bg:"rgba(255,59,48,0.07)",  color:"rgba(255,100,90,0.7)", border:"rgba(255,59,48,0.18)"   },
  }[variant] || { bg:"rgba(255,255,255,0.05)", color:"var(--text-dim)", border:"rgba(255,255,255,0.09)" };
  return {
    background:v.bg, color:v.color, border:`1px solid ${v.border}`,
    borderRadius:"8px", padding:"8px 16px", fontSize:"12px", fontWeight:"500",
    cursor:"pointer", fontFamily:"inherit",
  };
}

function PomodoroPanel({ pomo, remaining, isHost, onStart, onPause, onResume, onReset, onSkip }) {
  const isIdle    = !pomo || pomo.phase === "idle";
  const isFocus   = pomo?.phase === "focus";
  const isBreak   = pomo?.phase === "break";
  const isPaused  = !!pomo?.paused;
  const isRunning = !isIdle && !isPaused;

  const accentColor = isFocus ? "#C49A3C" : isBreak ? "#6fb3c4" : "var(--text-dim)";
  const bgColor     = isFocus ? "rgba(196,154,60,0.05)" : isBreak ? "rgba(111,179,196,0.05)" : "rgba(255,255,255,0.02)";
  const borderColor = isFocus ? "rgba(196,154,60,0.18)" : isBreak ? "rgba(111,179,196,0.18)" : "rgba(255,255,255,0.07)";
  const phaseLabel  = isFocus ? "Focus" : isBreak ? "Break" : "Pomodoro";
  const phaseEmoji  = isFocus ? "🍅" : isBreak ? "☕" : "⏱";

  return (
    <div style={{
      background:bgColor, border:`1px solid ${borderColor}`,
      borderRadius:"14px", padding:"20px 20px 16px", marginBottom:"18px",
      transition:"background 0.4s, border-color 0.4s",
    }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"10px" }}>
        <span style={{ fontSize:"11px", letterSpacing:"2px", textTransform:"uppercase", color:accentColor, fontWeight:"600" }}>
          {phaseEmoji} {phaseLabel}{isPaused ? " · Paused" : ""}
        </span>
        <span style={{ fontSize:"11px", color:"var(--text-dim)" }}>
          {isIdle ? "25 min focus / 5 min break" : isFocus ? "Stay focused" : "Rest up ☕"}
        </span>
      </div>

      {/* Countdown */}
      <div style={{ textAlign:"center", margin:"4px 0 14px" }}>
        <span style={{
          fontSize:"56px", fontWeight:"700", letterSpacing:"-2px",
          fontVariantNumeric:"tabular-nums", display:"block", lineHeight:1,
          color: isIdle ? "rgba(255,255,255,0.15)" : accentColor,
          opacity: isPaused ? 0.55 : 1,
          transition:"color 0.4s",
        }}>
          {isIdle ? "25:00" : formatPomoTime(remaining)}
        </span>
      </div>

      {/* Controls */}
      {isHost ? (
        <div style={{ display:"flex", gap:"8px", justifyContent:"center", flexWrap:"wrap" }}>
          {isIdle && (
            <button onClick={onStart} style={{
              background:"rgba(196,154,60,0.14)", color:"#C49A3C",
              border:"1px solid rgba(196,154,60,0.35)", borderRadius:"9px",
              padding:"9px 24px", fontSize:"13px", fontWeight:"600",
              cursor:"pointer", fontFamily:"inherit",
            }}>
              Start Focus →
            </button>
          )}
          {isRunning && (
            <>
              <button onClick={onPause}  style={pomoCtrlStyle("dim")}>Pause</button>
              <button onClick={onSkip}   style={pomoCtrlStyle("dim")}>Skip ›</button>
              <button onClick={onReset}  style={pomoCtrlStyle("red")}>Reset</button>
            </>
          )}
          {isPaused && (
            <>
              <button onClick={onResume} style={pomoCtrlStyle("accent")}>Resume</button>
              <button onClick={onReset}  style={pomoCtrlStyle("red")}>Reset</button>
            </>
          )}
        </div>
      ) : (
        <p style={{ textAlign:"center", fontSize:"12px", color:"var(--text-dim)", margin:0 }}>
          {isIdle ? "Waiting for host to start the timer…" :
           isFocus ? "Stay focused — you've got this." :
           "Enjoy your break!"}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GoalPromptModal — appears ~500ms after joining, skippable
// ─────────────────────────────────────────────────────────────────────────────
function GoalPromptModal({ onSet, onSkip }) {
  const [goal, setGoal] = useState("");
  const S = styles;
  // Render into document.body so position:fixed centers against the true
  // viewport — not the transformed app-page-transition ancestor.
  return createPortal(
    <div style={S.modalOverlay}>
      <div style={{ ...S.modalCard, maxWidth:"360px" }}>
        <div style={{ textAlign:"center", marginBottom:"20px" }}>
          <p style={{ fontSize:"30px", marginBottom:"10px" }}>🎯</p>
          <h2 style={{ fontSize:"18px", fontWeight:"700", color:"var(--text-primary)", marginBottom:"6px" }}>
            Set your session goal
          </h2>
          <p style={{ fontSize:"13px", color:"var(--text-dim)", lineHeight:1.5 }}>
            What will you finish today? Everyone in the room will see this.
          </p>
        </div>
        <input
          autoFocus
          value={goal}
          onChange={e => setGoal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && goal.trim() && onSet(goal.trim())}
          placeholder="e.g. Finish CDS151 lab question 3"
          maxLength={80}
          style={S.input}
          onFocus={e => (e.target.style.borderColor="rgba(255,255,255,0.22)")}
          onBlur={e  => (e.target.style.borderColor="rgba(255,255,255,0.1)")}
        />
        <div style={{ display:"flex", gap:"10px" }}>
          <button onClick={onSkip} style={S.ghostBtnLarge}>Skip</button>
          <button
            onClick={() => goal.trim() && onSet(goal.trim())}
            disabled={!goal.trim()}
            style={{ ...S.primaryBtnLarge, opacity: goal.trim() ? 1 : 0.4 }}
          >
            Let's go →
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionSummaryModal — leave flow with goal completion self-report
// ─────────────────────────────────────────────────────────────────────────────
function SessionSummaryModal({ durationSecs, goal, onConfirm, onBack }) {
  const hours   = Math.floor(durationSecs / 3600);
  const mins    = Math.floor((durationSecs % 3600) / 60);
  const secs    = durationSecs % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  // Mirror the server award formula (api/token-engine.ts): +2 for joining, +5 per
  // completed 15-min block. Display only — the server is authoritative.
  const tokensEarned = 2 + Math.floor(durationSecs / (15 * 60)) * 5;
  const S = styles;
  return createPortal(
    <div style={{ position:"fixed", top:0, left:0, width:"100vw", height:"100vh", zIndex:9999, background:"rgba(8,8,10,0.75)", backdropFilter:"blur(14px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px" }}>
      <div style={{ ...S.modalCard, maxWidth:"340px", textAlign:"center", position:"relative" }}>
        <button
          onClick={onBack}
          title="Back to room"
          style={{ position:"absolute", top:"14px", right:"18px", background:"none", border:"none", color:"var(--text-dim)", fontSize:"20px", cursor:"pointer", lineHeight:1, padding:"2px 4px" }}
        >
          ×
        </button>

        <p style={{ fontSize:"34px", marginBottom:"8px" }}>
          {durationSecs >= 1200 ? "🔥" : "⏱"}
        </p>
        <h2 style={{ fontSize:"19px", fontWeight:"700", color:"var(--text-primary)", marginBottom:"6px" }}>
          {durationSecs >= 1200 ? "Great session!" : "Session complete"}
        </h2>

        <div style={{
          background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:"10px", padding:"14px 16px", margin:"16px 0", textAlign:"left",
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
            <span style={{ fontSize:"12px", color:"var(--text-dim)" }}>Time focused</span>
            <span style={{ fontSize:"14px", fontWeight:"700", color:"var(--color-accent)" }}>{timeStr}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: goal ? "10px" : 0 }}>
            <span style={{ fontSize:"12px", color:"var(--text-dim)" }}>Tokens earned</span>
            <span style={{ fontSize:"14px", fontWeight:"700", color:"var(--color-accent)" }}>🪙 {tokensEarned}</span>
          </div>
          {goal && (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"12px" }}>
              <span style={{ fontSize:"12px", color:"var(--text-dim)", flexShrink:0 }}>Goal</span>
              <span style={{ fontSize:"12px", color:"var(--text-secondary)", textAlign:"right" }}>{goal}</span>
            </div>
          )}
        </div>

        <p style={{ fontSize:"13px", color:"var(--text-secondary)", marginBottom:"14px" }}>
          Did you finish your goal?
        </p>

        <div style={{ display:"flex", gap:"10px" }}>
          <button
            onClick={() => onConfirm(false)}
            style={{
              flex:1, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)",
              borderRadius:"10px", padding:"12px", fontSize:"14px",
              cursor:"pointer", fontFamily:"inherit", color:"var(--text-dim)",
            }}
          >
            👎 Not quite
          </button>
          <button
            onClick={() => onConfirm(true)}
            style={{
              flex:1, background:"rgba(196,154,60,0.12)", border:"1px solid rgba(196,154,60,0.3)",
              borderRadius:"10px", padding:"12px", fontSize:"14px", fontWeight:"600",
              cursor:"pointer", fontFamily:"inherit", color:"var(--color-accent)",
            }}
          >
            👍 Got it!
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BuddyPanel — AI Study Buddy: shared Q&A, streaming, rate-limited
// ─────────────────────────────────────────────────────────────────────────────
function BuddyPanel({ qaItems, streaming, callsLeft, onAsk, onClose }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  // Auto-scroll to latest answer
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaItems]);

  function handleSend() {
    const q = input.trim();
    if (!q || streaming || callsLeft <= 0) return;
    setInput("");
    onAsk(q);
  }

  return (
    <div style={{
      border: "1px solid rgba(111,179,196,0.2)",
      borderRadius: "14px",
      background: "rgba(111,179,196,0.03)",
      marginBottom: "20px",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: "1px solid rgba(111,179,196,0.12)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "15px" }}>🤖</span>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "#6fb3c4" }}>AI Study Buddy</span>
          <span style={{ fontSize: "11px", color: "var(--text-dim)", background: "rgba(255,255,255,0.05)", borderRadius: "6px", padding: "2px 7px" }}>
            shared with room
          </span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "18px", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</button>
      </div>

      {/* Q&A history */}
      <div style={{ maxHeight: "340px", overflowY: "auto", padding: qaItems.length ? "12px 16px" : "0" }}>
        {qaItems.length === 0 && !streaming && (
          <div style={{ padding: "20px 16px", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.5 }}>
              Ask anything about the coursework.<br />
              <span style={{ fontSize: "12px", opacity: 0.7 }}>Everyone in the room sees the answer.</span>
            </p>
          </div>
        )}
        {qaItems.map((qa, i) => (
          <div key={qa.id} style={{ marginBottom: i < qaItems.length - 1 ? "18px" : "4px" }}>
            {/* Question */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-dim)", flexShrink: 0 }}>{qa.askerName}</span>
              <p style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: "500", margin: 0 }}>{qa.question}</p>
            </div>
            {/* Answer */}
            <div style={{
              background: "rgba(111,179,196,0.06)", border: "1px solid rgba(111,179,196,0.12)",
              borderRadius: "10px", padding: "10px 14px",
              fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.65",
              whiteSpace: "pre-wrap",
            }}>
              {qa.answer ? (
                <>
                  {qa.answer}
                  {qa.streaming && <span style={{ opacity: 0.4, animation: "blink 1s step-end infinite" }}>|</span>}
                </>
              ) : (
                <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>
                  {qa.streaming ? "Thinking…" : "—"}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "10px 16px 14px", borderTop: qaItems.length ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={callsLeft <= 0 ? "Rate limit reached — try again in a few minutes" : "Ask about the coursework…"}
            disabled={streaming || callsLeft <= 0}
            maxLength={400}
            style={{
              flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: "9px", padding: "9px 12px", color: "var(--text-primary)", fontSize: "13px",
              outline: "none", fontFamily: "inherit", opacity: (streaming || callsLeft <= 0) ? 0.5 : 1,
              transition: "border-color 0.15s",
            }}
            onFocus={e => (e.target.style.borderColor = "rgba(111,179,196,0.3)")}
            onBlur={e  => (e.target.style.borderColor = "rgba(255,255,255,0.09)")}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming || callsLeft <= 0}
            style={{
              background: "rgba(111,179,196,0.12)", color: "#6fb3c4",
              border: "1px solid rgba(111,179,196,0.28)", borderRadius: "9px",
              padding: "9px 16px", fontSize: "13px", fontWeight: "600",
              cursor: (!input.trim() || streaming || callsLeft <= 0) ? "default" : "pointer",
              fontFamily: "inherit", opacity: (!input.trim() || streaming || callsLeft <= 0) ? 0.4 : 1,
              flexShrink: 0,
            }}
          >
            {streaming ? "…" : "Ask →"}
          </button>
        </div>
        <p style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "6px" }}>
          {callsLeft <= 0 ? "Rate limit reached — resets in a few minutes" : `${callsLeft} question${callsLeft === 1 ? "" : "s"} remaining this window`}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RequestCard
// ─────────────────────────────────────────────────────────────────────────────
function RequestCard({ request, onAccept, onDecline }) {
  const COLORS = [
    { bg:"rgba(196,154,60,0.15)",  fg:"#C49A3C" },
    { bg:"rgba(111,179,196,0.15)", fg:"#6fb3c4" },
    { bg:"rgba(127,174,110,0.15)", fg:"#7fae6e" },
    { bg:"rgba(196,100,100,0.15)", fg:"#d47878" },
    { bg:"rgba(160,110,196,0.15)", fg:"#b888e0" },
  ];
  const col = COLORS[(request.name?.[0]?.charCodeAt(0) ?? 0) % COLORS.length];
  const S = styles;
  return (
    <div style={{ ...S.card, padding:"12px 16px" }}>
      <div style={{
        width:34, height:34, borderRadius:"50%", flexShrink:0,
        background:col.bg, color:col.fg, fontWeight:"700", fontSize:"13px",
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>
        {request.name?.[0]?.toUpperCase() ?? "?"}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontWeight:"600", fontSize:"14px", color:"var(--text-primary)" }}>{request.name}</p>
        <p style={{ fontSize:"11px", color:"var(--text-dim)", marginTop:"2px" }}>Wants to join</p>
      </div>
      <div style={{ display:"flex", gap:"8px", flexShrink:0 }}>
        <button onClick={onAccept}  style={{ ...S.accentBtn, padding:"6px 14px", fontSize:"12px" }}>Accept</button>
        <button onClick={onDecline} style={{ ...S.ghostBtn, marginTop:0, padding:"6px 12px", fontSize:"12px", color:"rgba(255,100,90,0.7)" }}>Decline</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InviteModal
// ─────────────────────────────────────────────────────────────────────────────
function InviteModal({ room, userId, userData, onlineIds = [], onClose }) {
  const [friends, setFriends] = useState(null);
  const [invited, setInvited] = useState({});
  const S = styles;

  useEffect(() => {
    getFriendsForInvite(userId).then(data => setFriends(data));
  }, [userId]);

  async function handleInvite(friend) {
    setInvited(i => ({ ...i, [friend.id]: "sending" }));
    try { await inviteToRoom(userId, room.id, friend.id); }
    catch (err) { console.error("[rooms] invite:", (err as any)?.message); }

    // Server enforces the 2/friend/24h rate limit, writes the nudge row, and
    // emails the friend if they're offline. onlineIds = who's present in rooms now.
    const online = onlineIds.includes(friend.id);
    const result = await sendNudge({
      fromUserId: userId, toUserId: friend.id, roomId: room.id,
      fromName: userData?.name ?? "Someone", roomName: room.name,
      recipientOnline: online,
    });

    if (result?.sent === false && result.reason === "rate_limited") {
      setInvited(i => ({ ...i, [friend.id]: "limited" }));
      return;
    }

    // Instant in-app ping for an online friend (also the local-dev path when the
    // serverless endpoint isn't running — best-effort, never throws).
    supabase.channel(`user:${friend.id}`).send({
      type: "broadcast", event: "nudge",
      payload: {
        kind: "invite", id: `${userId}-${friend.id}-${Date.now()}`,
        fromUserId: userId, fromName: userData?.name ?? "Someone",
        roomId: room.id, roomName: room.name,
      },
    }).catch(() => {});
    setInvited(i => ({ ...i, [friend.id]: "sent" }));
  }

  return (
    <div style={S.modalOverlay}>
      <div style={{ ...S.modalCard, maxWidth:"360px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"18px" }}>
          <h2 style={{ fontSize:"18px", fontWeight:"700", color:"var(--text-primary)" }}>Invite friends</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--text-dim)", fontSize:"18px", cursor:"pointer", padding:"0 4px" }}>×</button>
        </div>
        {friends === null ? (
          <p style={{ color:"var(--text-dim)", fontSize:"13px", textAlign:"center", padding:"24px 0" }}>Loading friends…</p>
        ) : friends.length === 0 ? (
          <div style={{ textAlign:"center", padding:"24px 0" }}>
            <p style={{ color:"var(--text-secondary)", fontSize:"14px", marginBottom:"6px" }}>No friends yet</p>
            <p style={{ color:"var(--text-dim)", fontSize:"12px" }}>Add friends from your Identity page.</p>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px", maxHeight:"320px", overflowY:"auto" }}>
            {friends.map(f => {
              const status = invited[f.id];
              return (
                <div key={f.id} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"10px 4px" }}>
                  <div style={{
                    width:34, height:34, borderRadius:"50%", flexShrink:0,
                    background:"rgba(196,154,60,0.12)", color:"var(--color-accent)",
                    fontWeight:"700", fontSize:"13px",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {f.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:"500", fontSize:"14px", color:"var(--text-primary)" }}>{f.name}</p>
                    <p style={{ fontSize:"11px", color:"var(--text-dim)", marginTop:"2px" }}>{f.email}</p>
                  </div>
                  <button
                    onClick={() => handleInvite(f)}
                    disabled={!!status}
                    style={{ ...S.accentBtn, padding:"6px 14px", fontSize:"12px", opacity: status ? 0.5 : 1, cursor: status ? "default" : "pointer" }}
                  >
                    {status === "sent" ? "Invited ✓" : status === "limited" ? "Limit reached" : status === "sending" ? "…" : "Invite"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatPanel — persisted room chat, WhatsApp-style
// ─────────────────────────────────────────────────────────────────────────────
function ChatPanel({ messages, myUserId, input, sending, onInputChange, onSend, onClose }: {
  messages: ChatMessage[]; myUserId: string;
  input: string; sending: boolean;
  onInputChange: (v: string) => void; onSend: () => void; onClose: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const S = styles;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div style={{
      border: "1px solid rgba(127,174,110,0.2)",
      borderRadius: "14px",
      background: "rgba(127,174,110,0.03)",
      marginBottom: "20px",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: "1px solid rgba(127,174,110,0.12)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "15px" }}>💬</span>
          <span style={{ fontSize: "13px", fontWeight: "600", color: "#7fae6e" }}>Room Chat</span>
          <span style={{ fontSize: "11px", color: "var(--text-dim)", background: "rgba(255,255,255,0.05)", borderRadius: "6px", padding: "2px 7px" }}>
            persists across refresh
          </span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: "18px", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</button>
      </div>

      {/* Message list */}
      <div style={{ height: "320px", overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {messages.length === 0 ? (
          <div style={{ margin: "auto 0", textAlign: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.5 }}>
              No messages yet — say hello!<br />
              <span style={{ fontSize: "11px", opacity: 0.6 }}>History stays even after a refresh.</span>
            </p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.user_id === myUserId;
            return (
              <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                {!isMe && (
                  <span style={{ fontSize: "10px", color: "var(--text-dim)", marginBottom: "3px", paddingLeft: "4px" }}>
                    {msg.name}
                  </span>
                )}
                <div style={{
                  maxWidth: "78%", padding: "8px 12px", wordBreak: "break-word",
                  borderRadius: isMe ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                  background: isMe ? "rgba(196,154,60,0.14)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${isMe ? "rgba(196,154,60,0.22)" : "rgba(255,255,255,0.09)"}`,
                  fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.5,
                }}>
                  {msg.body}
                </div>
                <span style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px", paddingRight: isMe ? "2px" : 0, paddingLeft: isMe ? 0 : "4px" }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: "1px solid rgba(127,174,110,0.12)", padding: "10px 12px", display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="Message the room…"
          maxLength={2000}
          style={{
            flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: "9px", padding: "9px 12px", fontSize: "13px",
            color: "var(--text-primary)", outline: "none", fontFamily: "inherit",
            transition: "border-color 0.15s",
          }}
          onFocus={e => (e.target.style.borderColor = "rgba(127,174,110,0.35)")}
          onBlur={e  => (e.target.style.borderColor = "rgba(255,255,255,0.09)")}
        />
        <button
          onClick={onSend}
          disabled={!input.trim() || sending}
          style={{
            background: "rgba(127,174,110,0.12)", color: "#7fae6e",
            border: "1px solid rgba(127,174,110,0.28)", borderRadius: "9px",
            padding: "9px 16px", fontSize: "13px", fontWeight: "600",
            cursor: (!input.trim() || sending) ? "default" : "pointer",
            fontFamily: "inherit", flexShrink: 0,
            opacity: (!input.trim() || sending) ? 0.4 : 1,
          }}
        >
          {sending ? "…" : "Send →"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MemberCard
// ─────────────────────────────────────────────────────────────────────────────
function MemberCard({ member, isMe }) {
  const elapsed = Math.max(0, Math.floor((Date.now() - member.joinedAt) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const time = h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    : `${m}:${String(s).padStart(2,"0")}`;

  const COLORS = [
    { bg:"rgba(196,154,60,0.15)",  fg:"#C49A3C" },
    { bg:"rgba(111,179,196,0.15)", fg:"#6fb3c4" },
    { bg:"rgba(127,174,110,0.15)", fg:"#7fae6e" },
    { bg:"rgba(196,100,100,0.15)", fg:"#d47878" },
    { bg:"rgba(160,110,196,0.15)", fg:"#b888e0" },
  ];
  const col = COLORS[(member.initial?.charCodeAt(0) ?? 0) % COLORS.length];

  return (
    <div style={{
      background:"var(--color-surface)",
      border:`1px solid ${isMe ? "rgba(196,154,60,0.22)" : "var(--color-border)"}`,
      borderRadius:"var(--radius-card)", boxShadow: isMe ? "var(--depth-line)" : "none",
      padding:"14px 16px", display:"flex", alignItems:"center", gap:"14px",
    }}>
      <div style={{
        width:40, height:40, borderRadius:"50%", flexShrink:0,
        background:col.bg, color:col.fg, fontWeight:"700", fontSize:"15px",
        display:"flex", alignItems:"center", justifyContent:"center",
        border:`1.5px solid ${col.fg}30`, position:"relative",
      }}>
        {member.initial}
        <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:"50%", background:"#7fae6e", border:"2px solid var(--color-surface)" }}/>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          <span style={{ fontWeight:"600", fontSize:"14px", color:"var(--text-primary)" }}>{member.name}</span>
          {isMe && <span style={{ fontSize:"10px", color:"var(--text-dim)", background:"rgba(255,255,255,0.06)", borderRadius:"8px", padding:"2px 7px" }}>you</span>}
        </div>
        <p style={{
          fontSize:"12px", marginTop:"3px",
          color: member.workingOn ? "var(--text-secondary)" : "var(--text-dim)",
          fontStyle: member.workingOn ? "normal" : "italic",
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
        }}>
          {member.workingOn || "not set"}
        </p>
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <p style={{ fontSize:"14px", fontWeight:"700", color:"var(--color-accent)", fontVariantNumeric:"tabular-nums" }}>{time}</p>
        <p style={{ fontSize:"10px", color:"var(--text-dim)", marginTop:"2px" }}>focused</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  sectionLabel:   { fontSize:"11px", color:"var(--text-dim)", letterSpacing:"2px", textTransform:"uppercase", marginBottom:"6px" },
  pageTitle:      { fontSize:"26px", fontWeight:"600", color:"var(--text-primary)", letterSpacing:"-0.3px", fontFamily:"'Fraunces', serif" },
  card:           { background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"var(--radius-card)", boxShadow:"var(--depth-line)", padding:"16px 18px", display:"flex", alignItems:"center", gap:"14px" },
  emptyState:     { background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"var(--radius-card)", padding:"32px 24px", textAlign:"center" },
  input:          { display:"block", width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"10px", padding:"11px 14px", color:"var(--text-primary)", fontSize:"14px", outline:"none", fontFamily:"inherit", boxSizing:"border-box", marginTop:"6px", marginBottom:"14px", transition:"border-color 0.15s" },
  primaryBtn:     { background:"var(--color-accent)", color:"#111", border:"none", borderRadius:"var(--radius-btn)", padding:"11px 18px", fontSize:"14px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit", flexShrink:0 },
  accentBtn:      { background:"rgba(196,154,60,0.1)", color:"var(--color-accent)", border:"1px solid rgba(196,154,60,0.28)", borderRadius:"8px", padding:"8px 18px", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit", flexShrink:0 },
  ghostBtn:       { marginTop:"16px", background:"none", border:"1px solid rgba(255,255,255,0.09)", borderRadius:"8px", padding:"8px 16px", color:"var(--text-dim)", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
  ghostBtnLarge:  { flex:1, background:"transparent", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"10px", padding:"12px", color:"var(--text-dim)", fontSize:"14px", cursor:"pointer", fontFamily:"inherit" },
  primaryBtnLarge:{ flex:2, background:"var(--color-accent)", color:"#111", border:"none", borderRadius:"10px", padding:"12px", fontSize:"14px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" },
  leaveBtn:       { background:"rgba(255,59,48,0.1)", border:"1px solid rgba(255,59,48,0.22)", borderRadius:"8px", padding:"9px 16px", color:"rgba(255,100,90,0.9)", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit", flexShrink:0 },
  modalOverlay:   { position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:1000, background:"rgba(8,8,10,0.75)", backdropFilter:"blur(14px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px" },
  modalCard:      { width:"100%", maxWidth:"400px", background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"20px", padding:"28px 24px", boxShadow:"0 32px 80px rgba(0,0,0,0.5)" },
  fieldLabel:     { fontSize:"12px", color:"var(--text-secondary)", fontWeight:"500" },
};
