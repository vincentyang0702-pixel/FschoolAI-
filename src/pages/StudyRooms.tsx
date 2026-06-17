// StudyRooms.jsx — Phase 2A: Shared Pomodoro + Goals + Session Summary
// Architecture: root manages global-studying presence channel once; Lobby +
// RoomView receive counts as props. Keeps room core + friends layer modular.

import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { supabase } from "../api/supabase";

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
    return <RoomView room={activeRoom} onLeave={handleLeave} roomCounts={roomCounts} />;
  }
  return (
    <Lobby
      onJoin={handleJoin}
      totalOnline={totalOnline}
      roomCounts={roomCounts}
      pendingInvites={pendingInvites}
      onDismissInvite={dismissInviteRoot}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobby
// ─────────────────────────────────────────────────────────────────────────────
function Lobby({ onJoin, totalOnline, roomCounts, pendingInvites = [], onDismissInvite }) {
  const { userId, userData, courses } = useApp();
  const [rooms,       setRooms]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [joiningId,    setJoiningId]    = useState(null);
  const [pendingReqs,  setPendingReqs]  = useState({});
  const [codeInput,    setCodeInput]    = useState("");
  const [codeError,    setCodeError]    = useState("");
  const [codeLookingUp, setCodeLookingUp] = useState(false);
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

  async function fetchRooms() {
    setLoading(true);
    const { data } = await supabase
      .from("study_rooms")
      .select("id, name, room_type, created_by, last_active, course_id")
      .eq("is_active", true)
      .order("last_active", { ascending: false })
      .limit(30);
    setRooms(data || []);
    setLoading(false);
  }

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
    }, (payload) => {
      if (payload.new?.is_active) {
        setRooms(prev => {
          if (prev.some(r => r.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
      }
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

  async function handleCreate({ name, courseId, roomType }) {
    let room = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const join_code = generateRoomCode();
      const { data, error } = await supabase
        .from("study_rooms")
        .insert({
          created_by: userId,
          name:       name.trim(),
          course_id:  courseId ? Number(courseId) : null,
          room_type:  roomType,
          join_code,
        })
        .select()
        .single();
      if (!error) { room = data; break; }
      if (!error.message?.includes("unique") && !error.message?.includes("join_code")) {
        console.error("[rooms] create:", error.message); return;
      }
    }
    if (!room) { console.error("[rooms] create: failed to generate unique code"); return; }
    await supabase.from("room_members").upsert(
      { room_id: room.id, user_id: userId, role: "host", status: "joined" },
      { onConflict: "room_id,user_id" }
    );
    setShowCreate(false);
    onJoin(room);
  }

  async function handleJoin(room) {
    if (pendingReqs[room.id] === "requested") return;
    if (pendingReqs[room.id] === "accepted" || pendingReqs[room.id] === "joined") {
      onJoin(room); return;
    }
    setJoiningId(room.id);
    const isHost = room.created_by === userId;
    if (room.room_type === "invite" && !isHost) {
      const { error } = await supabase.from("room_members").upsert(
        { room_id: room.id, user_id: userId, role: "member", status: "requested" },
        { onConflict: "room_id,user_id" }
      );
      if (!error) {
        setPendingReqs(p => ({ ...p, [room.id]: "requested" }));
        supabase.from("nudges").insert({
          from_user_id: userId, to_user_id: room.created_by,
          room_id: room.id, kind: "nudge",
        }).then(() => {});
      }
      setJoiningId(null);
      return;
    }
    const { error } = await supabase.from("room_members").upsert(
      { room_id: room.id, user_id: userId,
        role: isHost ? "host" : "member", status: "joined" },
      { onConflict: "room_id,user_id" }
    );
    setJoiningId(null);
    if (!error) onJoin(room);
  }

  async function acceptInvite(invite) {
    onDismissInvite?.(invite.id);
    await supabase.from("room_members").upsert(
      { room_id: invite.room_id, user_id: userId, role: "member", status: "joined" },
      { onConflict: "room_id,user_id" }
    );
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
    await supabase.from("room_members").upsert(
      { room_id: room.id, user_id: userId, role: "member", status: "joined" },
      { onConflict: "room_id,user_id" }
    );
    setCodeInput("");
    onJoin(room);
  }

  const S = styles;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"28px" }}>
        <div>
          <p style={S.sectionLabel}>Study Rooms</p>
          <h1 style={S.pageTitle}>Study Together</h1>
          {totalOnline > 0 ? (
            <p style={{ fontSize:"13px", color:"var(--color-accent)", marginTop:"5px", display:"flex", alignItems:"center", gap:"6px" }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:"var(--color-accent)", display:"inline-block" }}/>
              {totalOnline} {totalOnline === 1 ? "student" : "students"} studying now
            </p>
          ) : (
            <p style={{ fontSize:"13px", color:"var(--text-secondary)", marginTop:"5px" }}>
              Join a room, stay focused, study together.
            </p>
          )}
        </div>
        <button onClick={() => setShowCreate(true)} style={S.primaryBtn}>
          + Create Room
        </button>
      </div>

      {pendingInvites.length > 0 && (
        <div style={{ marginBottom:"16px", display:"flex", flexDirection:"column", gap:"8px" }}>
          {pendingInvites.map(inv => (
            <div key={inv.id} style={{
              background:"rgba(196,154,60,0.08)", border:"1px solid rgba(196,154,60,0.25)",
              borderRadius:"12px", padding:"12px 16px",
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

      {loading ? (
        <p style={{ color:"var(--text-dim)", fontSize:"14px" }}>Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <div style={S.emptyState}>
          <p style={{ color:"var(--text-secondary)", fontSize:"15px", fontWeight:"500", marginBottom:"6px" }}>No active rooms</p>
          <p style={{ color:"var(--text-dim)", fontSize:"13px" }}>Create one and invite friends to study together.</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {rooms.map(room => (
            <RoomCard
              key={room.id}
              room={room}
              liveCount={roomCounts[room.id] || 0}
              joining={joiningId === room.id}
              pendingStatus={pendingReqs[room.id]}
              onJoin={() => handleJoin(room)}
            />
          ))}
        </div>
      )}

      <div style={{ display:"flex", alignItems:"center", gap:"8px", marginTop:"16px", marginBottom:"4px" }}>
        <button onClick={fetchRooms} style={{ ...S.ghostBtn, marginTop:0 }}>↻ Refresh</button>
        <div style={{ display:"flex", gap:"6px", flex:1 }}>
          <input
            value={codeInput}
            onChange={e => { setCodeInput(e.target.value.toUpperCase().slice(0, 6)); setCodeError(""); }}
            onKeyDown={e => e.key === "Enter" && handleJoinByCode()}
            placeholder="Room code (e.g. FS7K2P)"
            maxLength={6}
            style={{
              flex:1, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)",
              borderRadius:"8px", padding:"7px 12px", color:"var(--text-primary)", fontSize:"13px",
              outline:"none", fontFamily:"monospace", letterSpacing:"2px", transition:"border-color 0.15s",
            }}
            onFocus={e => (e.target.style.borderColor="rgba(255,255,255,0.22)")}
            onBlur={e  => (e.target.style.borderColor="rgba(255,255,255,0.09)")}
          />
          <button
            onClick={handleJoinByCode}
            disabled={codeInput.length < 6 || codeLookingUp}
            style={{ ...S.accentBtn, padding:"7px 14px", fontSize:"12px", opacity: codeInput.length < 6 ? 0.4 : 1 }}
          >
            {codeLookingUp ? "…" : "Join"}
          </button>
        </div>
      </div>
      {codeError && (
        <p style={{ fontSize:"12px", color:"rgba(255,100,90,0.8)", marginTop:"4px" }}>{codeError}</p>
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
// RoomCard
// ─────────────────────────────────────────────────────────────────────────────
function RoomCard({ room, liveCount, joining, pendingStatus, onJoin }) {
  const S = styles;
  const btnLabel =
    pendingStatus === "accepted"  ? "Accepted! Joining…" :
    pendingStatus === "joined"    ? "Re-enter" :
    pendingStatus === "requested" ? "Waiting for host…" :
    joining                       ? "Joining…" :
    room.room_type === "invite"   ? "Request to join" : "Join";
  const btnDisabled = joining || pendingStatus === "requested" || pendingStatus === "accepted";
  return (
    <div style={S.card}>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ color:"var(--text-primary)", fontSize:"15px", fontWeight:"600" }}>{room.name}</p>
        <div style={{ display:"flex", alignItems:"center", gap:"10px", marginTop:"4px" }}>
          <span style={{ fontSize:"11px", color:"var(--text-dim)" }}>
            {room.room_type === "invite" ? "🔒 Invite only" : "🌐 Public"}
          </span>
          {liveCount > 0 && (
            <span style={{ fontSize:"11px", color:"var(--color-accent)", display:"flex", alignItems:"center", gap:"4px" }}>
              <span style={{ width:5, height:5, borderRadius:"50%", background:"var(--color-accent)", display:"inline-block" }}/>
              {liveCount} studying
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onJoin}
        disabled={btnDisabled}
        style={{ ...S.accentBtn, opacity: btnDisabled ? 0.5 : 1, cursor: btnDisabled ? "default" : "pointer", fontSize:"12px", padding:"7px 14px" }}
      >
        {btnLabel}
      </button>
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
  const [saving,   setSaving]   = useState(false);
  const S = styles;

  async function handleSubmit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    await onCreate({ name, courseId, roomType });
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
// RoomView — Phase 2A: + Pomodoro, Goal prompt, Session summary
// ─────────────────────────────────────────────────────────────────────────────
function RoomView({ room, onLeave, roomCounts }) {
  const { userId, userData } = useApp();
  const [members,            setMembers]            = useState([]);
  const [workingOn,          setWorkingOn]          = useState("");
  const [requests,           setRequests]           = useState([]);
  const [showInvite,         setShowInvite]         = useState(false);
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

  const channelRef          = useRef(null);
  const reqChRef            = useRef(null);
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
    const timer = setInterval(() => setTick(n => n + 1), 1000);
    const handleUnload = () => void endSession();
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      clearInterval(timer);
      clearTimeout(workingOnDebounce.current);
      window.removeEventListener("beforeunload", handleUnload);
      // Abort any in-flight buddy stream on unmount
      buddyAbortRef.current?.abort();
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
      setMembers(Object.values(ch.presenceState()).flat());
    })
    .on("broadcast", { event: "room_closed" }, () => {
      if (!leftRef.current) endSession().then(() => onLeave());
    })
    .on("broadcast", { event: "pomodoro" }, ({ payload }) => {
      setPomo(payload);
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
    await supabase.from("room_members")
      .update({ status: "joined" })
      .eq("room_id", room.id).eq("user_id", requesterId);
    setRequests(prev => prev.filter(r => r.userId !== requesterId));
  }

  async function declineRequest(requesterId) {
    await supabase.from("room_members")
      .delete().eq("room_id", room.id).eq("user_id", requesterId);
    setRequests(prev => prev.filter(r => r.userId !== requesterId));
  }

  async function endSession(goalMet = null) {
    if (leftRef.current) return;
    leftRef.current = true;
    if (channelRef.current) {
      try { await channelRef.current.untrack(); } catch {}
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (reqChRef.current) {
      supabase.removeChannel(reqChRef.current);
      reqChRef.current = null;
    }
    if (sessionIdRef.current) {
      const durSecs = Math.round((Date.now() - joinedAtRef.current) / 1000);
      supabase.from("room_sessions").update({
        left_at:       new Date().toISOString(),
        duration_secs: durSecs,
        working_on:    workingOnRef.current || null,
        goal_text:     goalTextRef.current || workingOnRef.current || null,
        goal_met:      goalMet,
      }).eq("id", sessionIdRef.current).then(() => {});
    }
    supabase.from("room_members").delete()
      .eq("room_id", room.id).eq("user_id", userId).then(() => {});
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
            onClick={() => setShowInvite(true)}
            style={{ ...S.ghostBtn, marginTop:0, padding:"8px 14px", fontSize:"12px" }}
          >
            Invite friends
          </button>
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

      {showInvite && (
        <InviteModal room={room} userId={userId} userData={userData} onClose={() => setShowInvite(false)} />
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
  return (
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
    </div>
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
  const S = styles;
  return (
    <div style={S.modalOverlay}>
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
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: goal ? "10px" : 0 }}>
            <span style={{ fontSize:"12px", color:"var(--text-dim)" }}>Time focused</span>
            <span style={{ fontSize:"14px", fontWeight:"700", color:"var(--color-accent)" }}>{timeStr}</span>
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
    </div>
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
function InviteModal({ room, userId, userData, onClose }) {
  const [friends, setFriends] = useState(null);
  const [invited, setInvited] = useState({});
  const S = styles;

  useEffect(() => {
    getFriendsForInvite(userId).then(data => setFriends(data));
  }, [userId]);

  async function handleInvite(friend) {
    setInvited(i => ({ ...i, [friend.id]: "sending" }));
    await supabase.from("nudges").insert({
      from_user_id: userId, to_user_id: friend.id, room_id: room.id, kind: "invite",
    });
    await supabase.from("room_members").upsert(
      { room_id: room.id, user_id: friend.id, role: "member", status: "invited" },
      { onConflict: "room_id,user_id" }
    );
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
                    {status === "sent" ? "Invited ✓" : status === "sending" ? "…" : "Invite"}
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
  pageTitle:      { fontSize:"26px", fontWeight:"600", color:"var(--text-primary)", letterSpacing:"-0.3px" },
  card:           { background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"var(--radius-card)", boxShadow:"var(--depth-line)", padding:"16px 18px", display:"flex", alignItems:"center", gap:"14px" },
  emptyState:     { background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"var(--radius-card)", padding:"32px 24px", textAlign:"center" },
  input:          { display:"block", width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"10px", padding:"11px 14px", color:"var(--text-primary)", fontSize:"14px", outline:"none", fontFamily:"inherit", boxSizing:"border-box", marginTop:"6px", marginBottom:"14px", transition:"border-color 0.15s" },
  primaryBtn:     { background:"var(--color-accent)", color:"#111", border:"none", borderRadius:"var(--radius-btn)", padding:"11px 18px", fontSize:"14px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit", flexShrink:0 },
  accentBtn:      { background:"rgba(196,154,60,0.1)", color:"var(--color-accent)", border:"1px solid rgba(196,154,60,0.28)", borderRadius:"8px", padding:"8px 18px", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit", flexShrink:0 },
  ghostBtn:       { marginTop:"16px", background:"none", border:"1px solid rgba(255,255,255,0.09)", borderRadius:"8px", padding:"8px 16px", color:"var(--text-dim)", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
  ghostBtnLarge:  { flex:1, background:"transparent", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"10px", padding:"12px", color:"var(--text-dim)", fontSize:"14px", cursor:"pointer", fontFamily:"inherit" },
  primaryBtnLarge:{ flex:2, background:"var(--color-accent)", color:"#111", border:"none", borderRadius:"10px", padding:"12px", fontSize:"14px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" },
  leaveBtn:       { background:"rgba(255,59,48,0.1)", border:"1px solid rgba(255,59,48,0.22)", borderRadius:"8px", padding:"9px 16px", color:"rgba(255,100,90,0.9)", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit", flexShrink:0 },
  modalOverlay:   { position:"fixed", inset:0, zIndex:1000, background:"rgba(8,8,10,0.75)", backdropFilter:"blur(14px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px" },
  modalCard:      { width:"100%", maxWidth:"400px", background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"20px", padding:"28px 24px", boxShadow:"0 32px 80px rgba(0,0,0,0.5)" },
  fieldLabel:     { fontSize:"12px", color:"var(--text-secondary)", fontWeight:"500" },
};
