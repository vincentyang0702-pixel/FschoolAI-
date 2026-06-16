// StudyRooms.jsx — Steps 2-4: live lobby, invite-only request/accept, friend invites.
// Architecture: root manages global-studying presence channel once; Lobby +
// RoomView receive counts as props. Keeps room core + friends layer modular.

import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { supabase } from "../api/supabase";

// ── Friends adapter ──────────────────────────────────────────────────────────
// Wraps Siddharth's friends.js so the invite UI doesn't depend on its internals.
// listFriends returns [{ friend_id, friends_since }] — enrich with names via
// getUserProfiles. If the RPC doesn't exist yet (migrations 004/005 not run),
// the RPC throws → caught here → returns [] gracefully.
async function getFriendsForInvite(userId) {
  try {
    const { listFriends, getUserProfiles } = await import("../api/friends.js");
    const rows = await listFriends(userId); // [{ friend_id, friends_since }]
    if (!rows?.length) return [];
    const ids      = rows.map(r => r.friend_id);
    const profiles = await getUserProfiles(ids); // { [id]: { name, email } }
    return rows.map(r => ({
      id:           r.friend_id,
      name:         profiles[r.friend_id]?.name  ?? "Unknown",
      email:        profiles[r.friend_id]?.email ?? "",
      friends_since: r.friends_since,
    }));
  } catch {
    return []; // RPC missing (migrations not run) or user has no friends
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
  const [pendingInvites, setPendingInvites] = useState([]); // root-level so visible in room too
  const globalCh   = useRef(null);
  const personalCh = useRef(null);

  // Global presence — stays alive across Lobby ↔ RoomView transitions
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

  // Personal channel — stays alive always so invites/nudges arrive in-room too.
  // Previously only subscribed in Lobby, so users missed invites while in a room.
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
    // postgres_changes for nudges on personal channel (when sender/receiver may not both be online)
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

  // Count UNIQUE users (by key) — never double-count a user with multiple tabs/sessions.
  // Supabase Presence keys by userId; each key can have multiple session entries.
  // Object.keys gives unique users; Object.values().flat() inflates on multi-tab.
  const totalOnline = Object.keys(globalState).length;
  const roomCounts  = {};
  for (const sessions of Object.values(globalState)) {
    // Take the first (latest) session's roomId for this user — one vote per user per room.
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
// Lobby — live room list + global count + join / request flow
// ─────────────────────────────────────────────────────────────────────────────
// pendingInvites + onDismissInvite now come from root (so invites arrive even while in a room)
function Lobby({ onJoin, totalOnline, roomCounts, pendingInvites = [], onDismissInvite }) {
  const { userId, userData, courses } = useApp();
  const [rooms,       setRooms]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [joiningId,   setJoiningId]   = useState(null);
  const [pendingReqs, setPendingReqs] = useState({}); // roomId → 'requested'|'accepted'
  const lobbyChannelRef = useRef(null);
  const onJoinRef       = useRef(onJoin);
  useEffect(() => { onJoinRef.current = onJoin; }, [onJoin]);

  // Initial load — personal channel removed (now at root level)
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

    // New rooms appear live
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

    // Request accepted by host
    ch.on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "room_members",
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      if (payload.new?.status === "joined" && pendingReqs[payload.new.room_id] === "requested") {
        setPendingReqs(p => ({ ...p, [payload.new.room_id]: "accepted" }));
        // Find room and auto-enter after brief delay (show "Accepted!")
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
  // Note: personal channel (invites/nudges) is now at root StudyRooms level
  // so invites arrive even when the user is inside a room.

  async function handleCreate({ name, courseId, roomType }) {
    const { data: room, error } = await supabase
      .from("study_rooms")
      .insert({
        created_by: userId,
        name:       name.trim(),
        // ── FIX: course_id is BIGINT — parse to Number, send null when empty ──
        course_id:  courseId ? Number(courseId) : null,
        room_type:  roomType,
      })
      .select()
      .single();
    if (error || !room) { console.error("[rooms] create:", error?.message); return; }

    await supabase.from("room_members").upsert(
      { room_id: room.id, user_id: userId, role: "host", status: "joined" },
      { onConflict: "room_id,user_id" }
    );
    setShowCreate(false);
    onJoin(room);
  }

  async function handleJoin(room) {
    if (pendingReqs[room.id] === "requested") return; // already requested, show waiting state
    // Already joined (fetchPendingRequests returned 'joined') OR accepted → re-enter directly
    if (pendingReqs[room.id] === "accepted" || pendingReqs[room.id] === "joined") {
      onJoin(room); return;
    }
    setJoiningId(room.id);

    const isHost = room.created_by === userId;

    if (room.room_type === "invite" && !isHost) {
      // Non-host member requesting access to an invite-only room
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

    // Host of an invite-only room OR any public room — join directly as correct role
    const { error } = await supabase.from("room_members").upsert(
      { room_id: room.id, user_id: userId,
        role: isHost ? "host" : "member", status: "joined" },
      { onConflict: "room_id,user_id" }
    );
    setJoiningId(null);
    if (!error) onJoin(room);
  }

  async function acceptInvite(invite) {
    onDismissInvite?.(invite.id); // remove from root state
    await supabase.from("room_members").upsert(
      { room_id: invite.room_id, user_id: userId, role: "member", status: "joined" },
      { onConflict: "room_id,user_id" }
    );
    const { data: room } = await supabase
      .from("study_rooms").select().eq("id", invite.room_id).single();
    if (room) onJoin(room);
  }

  const S = styles;

  return (
    <div>
      {/* Header */}
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

      {/* Pending invites banner — driven by root-level pendingInvites */}
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

      {/* Rooms */}
      {loading ? (
        <p style={{ color:"var(--text-dim)", fontSize:"14px" }}>Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <div style={S.emptyState}>
          <p style={{ color:"var(--text-secondary)", fontSize:"15px", fontWeight:"500", marginBottom:"6px" }}>
            No active rooms
          </p>
          <p style={{ color:"var(--text-dim)", fontSize:"13px" }}>
            Create one and invite friends to study together.
          </p>
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

      <button onClick={fetchRooms} style={S.ghostBtn}>↻ Refresh</button>

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
// RoomCard — with live member count + pending states
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
        style={{
          ...S.accentBtn,
          opacity: btnDisabled ? 0.5 : 1,
          cursor:  btnDisabled ? "default" : "pointer",
          fontSize: "12px",
          padding: "7px 14px",
        }}
      >
        {btnLabel}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateRoomModal — course_id fix: Number() parse, null when empty
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
            // Only use c.dbId (the actual DB BIGINT pk) as the value.
            // If dbId is absent (courses from syncCanvasData before the next
            // loadCanvasData runs), value="" so handleCreate sends null — never
            // a canvas_course_id string that would FK-fail.
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
// RoomView — presence + requests (host) + invite friends
// ─────────────────────────────────────────────────────────────────────────────
function RoomView({ room, onLeave, roomCounts }) {
  const { userId, userData } = useApp();
  const [members,       setMembers]       = useState([]);
  const [workingOn,     setWorkingOn]     = useState("");
  const [requests,      setRequests]      = useState([]); // pending join requests (host only)
  const [showInvite,    setShowInvite]    = useState(false);
  const [tick,          setTick]          = useState(0);
  const channelRef   = useRef(null);
  const reqChRef     = useRef(null);
  const sessionIdRef = useRef(null);
  const joinedAtRef  = useRef(Date.now());
  const workingOnRef = useRef("");
  const leftRef      = useRef(false);
  const isHost       = room.created_by === userId;

  useEffect(() => {
    startSession();
    subscribePresence();
    if (isHost) subscribeRequests();
    const timer = setInterval(() => setTick(n => n + 1), 1000);
    const handleUnload = () => void endSession();
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", handleUnload);
      endSession();
    };
  }, []); // eslint-disable-line

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
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") await ch.track(presencePayload());
    });
    channelRef.current = ch;
  }

  function subscribeRequests() {
    // Load existing pending requests
    supabase.from("room_members")
      .select("user_id, joined_at")
      .eq("room_id", room.id)
      .eq("status", "requested")
      .then(({ data }) => {
        if (data?.length) enrichRequests(data);
      });

    // Watch for new requests in real time
    const ch = supabase.channel("requests-" + room.id);
    ch.on("postgres_changes", {
      event: "*", schema: "public", table: "room_members",
      filter: `room_id=eq.${room.id}`,
    }, (payload) => {
      if (payload.new?.status === "requested") {
        enrichRequests([payload.new]);
      }
      if (payload.eventType === "DELETE" || payload.new?.status === "joined" || payload.new?.status === "declined") {
        setRequests(prev => prev.filter(r => r.userId !== (payload.new?.user_id || payload.old?.user_id)));
      }
    }).subscribe();
    reqChRef.current = ch;
  }

  async function enrichRequests(rows) {
    const ids = rows.map(r => r.user_id);
    const { data: users } = await supabase
      .from("users").select("id, name").in("id", ids);
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
    // Notify via nudges table (requester's lobby watches this)
    setRequests(prev => prev.filter(r => r.userId !== requesterId));
  }

  async function declineRequest(requesterId) {
    await supabase.from("room_members")
      .delete()
      .eq("room_id", room.id).eq("user_id", requesterId);
    setRequests(prev => prev.filter(r => r.userId !== requesterId));
  }

  async function endSession() {
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
        left_at: new Date().toISOString(),
        duration_secs: durSecs,
        working_on: workingOnRef.current || null,
      }).eq("id", sessionIdRef.current).then(() => {});
    }
    supabase.from("room_members").delete()
      .eq("room_id", room.id).eq("user_id", userId).then(() => {});
  }

  async function handleWorkingOnChange(val) {
    setWorkingOn(val);
    workingOnRef.current = val;
    if (channelRef.current) {
      try { await channelRef.current.track(presencePayload(val)); } catch {}
    }
  }

  async function handleLeave() {
    await endSession();
    onLeave();
  }

  // Collective session stats
  const totalFocusMins = members.reduce((sum, m) => {
    return sum + Math.floor((Date.now() - m.joinedAt) / 60000);
  }, 0);

  const S = styles;

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
            onClick={() => setShowInvite(true)}
            style={{ ...S.ghostBtn, marginTop:0, padding:"8px 14px", fontSize:"12px" }}
          >
            Invite friends
          </button>
          <button onClick={handleLeave} style={S.leaveBtn}>Leave</button>
        </div>
      </div>

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
          <span style={{ fontSize:"12px", fontWeight:"600", color:"var(--color-accent)" }}>
            Together 💪
          </span>
        </div>
      )}

      {/* Pending requests (host only) */}
      {isHost && requests.length > 0 && (
        <div style={{ marginBottom:"18px" }}>
          <p style={{ ...S.sectionLabel, marginBottom:"10px" }}>
            Requests to join ({requests.length})
          </p>
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

      {/* Working-on */}
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

      {/* Member list */}
      <p style={{ ...S.sectionLabel, marginBottom:"12px" }}>In this room</p>
      {members.length === 0 ? (
        <div style={S.emptyState}>
          <p style={{ color:"var(--text-secondary)", fontSize:"14px", fontWeight:"500", marginBottom:"5px" }}>
            You're the first one here
          </p>
          <p style={{ color:"var(--text-dim)", fontSize:"12px" }}>
            Invite friends or share the room name.
          </p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {members.map(m => (
            <MemberCard key={m.userId} member={m} isMe={m.userId === userId} />
          ))}
        </div>
      )}

      {showInvite && (
        <InviteModal
          room={room}
          userId={userId}
          userData={userData}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RequestCard — host sees pending join requests
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
        <button
          onClick={onAccept}
          style={{ ...S.accentBtn, padding:"6px 14px", fontSize:"12px" }}
        >
          Accept
        </button>
        <button
          onClick={onDecline}
          style={{ ...S.ghostBtn, marginTop:0, padding:"6px 12px", fontSize:"12px", color:"rgba(255,100,90,0.7)" }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InviteModal — friends picker with live status, invite + nudge
// ─────────────────────────────────────────────────────────────────────────────
function InviteModal({ room, userId, userData, onClose }) {
  const [friends, setFriends] = useState(null); // null = loading
  const [invited, setInvited] = useState({});   // friendId → true
  const S = styles;

  useEffect(() => {
    getFriendsForInvite(userId).then(data => setFriends(data));
  }, [userId]);

  async function handleInvite(friend) {
    setInvited(i => ({ ...i, [friend.id]: "sending" }));

    // Insert nudge row (kind='invite')
    await supabase.from("nudges").insert({
      from_user_id: userId,
      to_user_id:   friend.id,
      room_id:      room.id,
      kind:         "invite",
    });

    // Pre-approve: insert room_members as 'invited' so they can join without request
    await supabase.from("room_members").upsert(
      { room_id: room.id, user_id: friend.id, role: "member", status: "invited" },
      { onConflict: "room_id,user_id" }
    );

    // Broadcast to friend's personal channel if they're online
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
          <h2 style={{ fontSize:"18px", fontWeight:"700", color:"var(--text-primary)" }}>
            Invite friends
          </h2>
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
                    style={{
                      ...S.accentBtn,
                      padding: "6px 14px", fontSize: "12px",
                      opacity: status ? 0.5 : 1,
                      cursor:  status ? "default" : "pointer",
                    }}
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
// MemberCard — unchanged from Step 1
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
const styles = {
  sectionLabel: { fontSize:"11px", color:"var(--text-dim)", letterSpacing:"2px", textTransform:"uppercase", marginBottom:"6px" },
  pageTitle:    { fontSize:"26px", fontWeight:"600", color:"var(--text-primary)", letterSpacing:"-0.3px" },
  card:         { background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"var(--radius-card)", boxShadow:"var(--depth-line)", padding:"16px 18px", display:"flex", alignItems:"center", gap:"14px" },
  emptyState:   { background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"var(--radius-card)", padding:"32px 24px", textAlign:"center" },
  input:        { display:"block", width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"10px", padding:"11px 14px", color:"var(--text-primary)", fontSize:"14px", outline:"none", fontFamily:"inherit", boxSizing:"border-box", marginTop:"6px", marginBottom:"14px", transition:"border-color 0.15s" },
  primaryBtn:   { background:"var(--color-accent)", color:"#111", border:"none", borderRadius:"var(--radius-btn)", padding:"11px 18px", fontSize:"14px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit", flexShrink:0 },
  accentBtn:    { background:"rgba(196,154,60,0.1)", color:"var(--color-accent)", border:"1px solid rgba(196,154,60,0.28)", borderRadius:"8px", padding:"8px 18px", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit", flexShrink:0 },
  ghostBtn:     { marginTop:"16px", background:"none", border:"1px solid rgba(255,255,255,0.09)", borderRadius:"8px", padding:"8px 16px", color:"var(--text-dim)", fontSize:"12px", cursor:"pointer", fontFamily:"inherit" },
  ghostBtnLarge:{ flex:1, background:"transparent", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"10px", padding:"12px", color:"var(--text-dim)", fontSize:"14px", cursor:"pointer", fontFamily:"inherit" },
  primaryBtnLarge:{ flex:2, background:"var(--color-accent)", color:"#111", border:"none", borderRadius:"10px", padding:"12px", fontSize:"14px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit" },
  leaveBtn:     { background:"rgba(255,59,48,0.1)", border:"1px solid rgba(255,59,48,0.22)", borderRadius:"8px", padding:"9px 16px", color:"rgba(255,100,90,0.9)", fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit", flexShrink:0 },
  modalOverlay: { position:"fixed", inset:0, zIndex:1000, background:"rgba(8,8,10,0.75)", backdropFilter:"blur(14px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px" },
  modalCard:    { width:"100%", maxWidth:"400px", background:"var(--color-surface)", border:"1px solid var(--color-border)", borderRadius:"20px", padding:"28px 24px", boxShadow:"0 32px 80px rgba(0,0,0,0.5)" },
  fieldLabel:   { fontSize:"12px", color:"var(--text-secondary)", fontWeight:"500" },
};
