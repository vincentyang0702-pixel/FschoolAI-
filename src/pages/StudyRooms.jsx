// StudyRooms.jsx — MVP: create/join/leave rooms + Supabase Presence (live members).
// Step 1: core real-time proof. Two browser tabs see each other present instantly.
// Defer: AI tutor, voice/video, duels, quests, rich chat (Step 7+).

import { useState, useEffect, useRef, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { supabase } from "../api/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Root — switches between Lobby and RoomView
// ─────────────────────────────────────────────────────────────────────────────
export default function StudyRooms() {
  const [view,        setView]        = useState("lobby"); // "lobby" | "room"
  const [activeRoom,  setActiveRoom]  = useState(null);

  const handleJoin = useCallback((room) => {
    setActiveRoom(room);
    setView("room");
  }, []);

  const handleLeave = useCallback(() => {
    setActiveRoom(null);
    setView("lobby");
  }, []);

  if (view === "room" && activeRoom) {
    return <RoomView room={activeRoom} onLeave={handleLeave} />;
  }
  return <Lobby onJoin={handleJoin} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lobby — list rooms, create, join
// ─────────────────────────────────────────────────────────────────────────────
function Lobby({ onJoin }) {
  const { userId, userData, courses } = useApp();
  const [rooms,      setRooms]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joiningId,  setJoiningId]  = useState(null);
  const [requestSent, setRequestSent] = useState({}); // roomId → true

  useEffect(() => { fetchRooms(); }, []);

  async function fetchRooms() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("study_rooms")
        .select("id, name, room_type, created_by, last_active, course_id")
        .eq("is_active", true)
        .order("last_active", { ascending: false })
        .limit(30);
      setRooms(data || []);
    } catch (e) {
      console.error("[rooms] fetch:", e.message);
    }
    setLoading(false);
  }

  async function handleCreate({ name, courseId, roomType }) {
    const { data: room, error } = await supabase
      .from("study_rooms")
      .insert({ created_by: userId, name: name.trim(), course_id: courseId || null, room_type: roomType })
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
    setJoiningId(room.id);
    if (room.room_type === "invite") {
      await supabase.from("room_members").upsert(
        { room_id: room.id, user_id: userId, role: "member", status: "requested" },
        { onConflict: "room_id,user_id" }
      );
      setRequestSent(r => ({ ...r, [room.id]: true }));
      setJoiningId(null);
      return;
    }
    await supabase.from("room_members").upsert(
      { room_id: room.id, user_id: userId, role: "member", status: "joined" },
      { onConflict: "room_id,user_id" }
    );
    setJoiningId(null);
    onJoin(room);
  }

  const S = styles;

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"28px" }}>
        <div>
          <p style={S.sectionLabel}>Study Rooms</p>
          <h1 style={S.pageTitle}>Study Together</h1>
          <p style={{ color:"var(--text-secondary)", fontSize:"13px", marginTop:"5px" }}>
            Join a room, see who's studying, stay focused.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={S.primaryBtn}
        >
          + Create Room
        </button>
      </div>

      {/* Rooms list */}
      {loading ? (
        <p style={{ color:"var(--text-dim)", fontSize:"14px" }}>Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <div style={S.emptyState}>
          <p style={{ color:"var(--text-secondary)", fontSize:"15px", fontWeight:"500", marginBottom:"6px" }}>
            No active rooms yet
          </p>
          <p style={{ color:"var(--text-dim)", fontSize:"13px" }}>
            Be the first — create one above.
          </p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {rooms.map(room => (
            <RoomCard
              key={room.id}
              room={room}
              joining={joiningId === room.id}
              requestSent={requestSent[room.id]}
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
// RoomCard
// ─────────────────────────────────────────────────────────────────────────────
function RoomCard({ room, joining, requestSent, onJoin }) {
  const S = styles;
  const label = requestSent
    ? "Request sent ✓"
    : joining
    ? "Joining…"
    : room.room_type === "invite"
    ? "Request to join"
    : "Join";

  return (
    <div style={S.card}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color:"var(--text-primary)", fontSize:"15px", fontWeight:"600" }}>{room.name}</p>
        <p style={{ color:"var(--text-dim)", fontSize:"12px", marginTop:"3px" }}>
          {room.room_type === "invite" ? "🔒 Invite only" : "🌐 Public"}
        </p>
      </div>
      <button
        onClick={onJoin}
        disabled={joining || requestSent}
        style={{
          ...S.accentBtn,
          opacity: joining || requestSent ? 0.45 : 1,
          cursor:  joining || requestSent ? "default" : "pointer",
        }}
      >
        {label}
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
          <option value="">No specific course</option>
          {courses.map(c => (
            <option key={c.id} value={c.id}>{c.courseCode ? `${c.courseCode} — ${c.name}` : c.name}</option>
          ))}
        </select>

        <div style={{ display:"flex", gap:"8px", marginBottom:"22px" }}>
          {["public", "invite"].map(t => (
            <button
              key={t}
              onClick={() => setRoomType(t)}
              style={{
                flex: 1, padding: "9px 0", borderRadius: "9px",
                fontSize: "13px", fontWeight: "500", cursor: "pointer", fontFamily: "inherit",
                background: roomType === t ? "rgba(196,154,60,0.14)" : "rgba(255,255,255,0.04)",
                color:      roomType === t ? "var(--color-accent)"    : "var(--text-dim)",
                border: `1px solid ${roomType === t ? "rgba(196,154,60,0.3)" : "rgba(255,255,255,0.08)"}`,
                transition: "all 0.15s",
              }}
            >
              {t === "public" ? "🌐 Public" : "🔒 Invite only"}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", gap:"10px" }}>
          <button onClick={onClose} style={S.ghostBtnLarge}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            style={{ ...S.primaryBtnLarge, opacity: !name.trim() || saving ? 0.4 : 1 }}
          >
            {saving ? "Creating…" : "Create Room →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoomView — live presence via Supabase Realtime
// ─────────────────────────────────────────────────────────────────────────────
function RoomView({ room, onLeave }) {
  const { userId, userData } = useApp();
  const [members,   setMembers]   = useState([]);
  const [workingOn, setWorkingOn] = useState("");
  const [tick,      setTick]      = useState(0);         // second ticker for timers
  const channelRef    = useRef(null);
  const sessionIdRef  = useRef(null);
  const joinedAtRef   = useRef(Date.now());
  const workingOnRef  = useRef("");
  const leftRef       = useRef(false);                   // prevent double-cleanup

  useEffect(() => {
    startSession();
    subscribePresence();
    const timer = setInterval(() => setTick(n => n + 1), 1000);

    // Cleanup on unmount / navigate away
    const handleUnload = () => void endSession();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", handleUnload);
      endSession();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startSession() {
    const { data } = await supabase
      .from("room_sessions")
      .insert({ room_id: room.id, user_id: userId, joined_at: new Date().toISOString() })
      .select("id")
      .single();
    sessionIdRef.current = data?.id ?? null;

    // Touch last_active
    supabase.from("study_rooms")
      .update({ last_active: new Date().toISOString() })
      .eq("id", room.id)
      .then(() => {});
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
      const state = ch.presenceState();
      setMembers(Object.values(state).flat());
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track(presencePayload());
      }
    });

    channelRef.current = ch;
  }

  async function endSession() {
    if (leftRef.current) return;
    leftRef.current = true;

    // Untrack presence
    if (channelRef.current) {
      try { await channelRef.current.untrack(); } catch {}
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Close session record
    if (sessionIdRef.current) {
      const durSecs = Math.round((Date.now() - joinedAtRef.current) / 1000);
      supabase.from("room_sessions")
        .update({ left_at: new Date().toISOString(), duration_secs: durSecs, working_on: workingOnRef.current || null })
        .eq("id", sessionIdRef.current)
        .then(() => {});
    }

    // Remove from room_members
    supabase.from("room_members")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .then(() => {});
  }

  async function handleWorkingOnChange(val) {
    setWorkingOn(val);
    workingOnRef.current = val;
    if (channelRef.current) {
      await channelRef.current.track(presencePayload(val));
    }
  }

  async function handleLeave() {
    await endSession();
    onLeave();
  }

  const S = styles;

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"22px" }}>
        <div>
          <p style={S.sectionLabel}>Study Room</p>
          <h1 style={{ ...S.pageTitle, fontSize:"22px" }}>{room.name}</h1>
          <p style={{
            fontSize:"13px", marginTop:"4px",
            color: members.length > 0 ? "var(--color-accent)" : "var(--text-dim)",
          }}>
            {members.length > 0
              ? `${members.length} ${members.length === 1 ? "person" : "people"} studying now`
              : "Waiting for others to join…"}
          </p>
        </div>
        <button onClick={handleLeave} style={S.leaveBtn}>Leave</button>
      </div>

      {/* Working-on input */}
      <div style={{ marginBottom:"22px" }}>
        <p style={{ ...S.sectionLabel, marginBottom:"8px" }}>What I'm working on</p>
        <input
          value={workingOn}
          onChange={e => handleWorkingOnChange(e.target.value)}
          placeholder="e.g. CDS151 lab question 3…"
          maxLength={80}
          style={S.input}
          onFocus={e => (e.target.style.borderColor = "rgba(255,255,255,0.22)")}
          onBlur={e  => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
        />
        <p style={{ fontSize:"11px", color:"var(--text-dim)", marginTop:"5px" }}>
          Updates live for everyone in the room.
        </p>
      </div>

      {/* Members */}
      <p style={{ ...S.sectionLabel, marginBottom:"12px" }}>In this room</p>

      {members.length === 0 ? (
        <div style={S.emptyState}>
          <p style={{ color:"var(--text-secondary)", fontSize:"14px", fontWeight:"500", marginBottom:"5px" }}>
            You're the first one here
          </p>
          <p style={{ color:"var(--text-dim)", fontSize:"12px" }}>
            Share the room name to study together.
          </p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {members.map(m => (
            <MemberCard key={m.userId} member={m} isMe={m.userId === userId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MemberCard — live timer interpolated from joinedAt
// ─────────────────────────────────────────────────────────────────────────────
function MemberCard({ member, isMe }) {
  const elapsed = Math.max(0, Math.floor((Date.now() - member.joinedAt) / 1000));
  const h   = Math.floor(elapsed / 3600);
  const m   = Math.floor((elapsed % 3600) / 60);
  const s   = elapsed % 60;
  const time = h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    : `${m}:${String(s).padStart(2,"0")}`;

  // Consistent avatar colour from initial char
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
      background: "var(--color-surface)",
      border: `1px solid ${isMe ? "rgba(196,154,60,0.22)" : "var(--color-border)"}`,
      borderRadius: "var(--radius-card)",
      boxShadow: isMe ? "var(--depth-line)" : "none",
      padding: "14px 16px",
      display: "flex", alignItems: "center", gap: "14px",
    }}>
      {/* Avatar */}
      <div style={{
        width:"40px", height:"40px", borderRadius:"50%", flexShrink:0,
        background: col.bg, color: col.fg,
        fontWeight:"700", fontSize:"15px",
        display:"flex", alignItems:"center", justifyContent:"center",
        border:`1.5px solid ${col.fg}30`,
        position:"relative",
      }}>
        {member.initial}
        {/* Live dot */}
        <div style={{
          position:"absolute", bottom:0, right:0,
          width:10, height:10, borderRadius:"50%",
          background:"#7fae6e", border:"2px solid var(--color-surface)",
        }}/>
      </div>

      {/* Name + working on */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          <span style={{ fontWeight:"600", fontSize:"14px", color:"var(--text-primary)" }}>
            {member.name}
          </span>
          {isMe && (
            <span style={{ fontSize:"10px", color:"var(--text-dim)", background:"rgba(255,255,255,0.06)", borderRadius:"8px", padding:"2px 7px" }}>
              you
            </span>
          )}
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

      {/* Timer */}
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <p style={{ fontSize:"14px", fontWeight:"700", color:"var(--color-accent)", fontVariantNumeric:"tabular-nums" }}>
          {time}
        </p>
        <p style={{ fontSize:"10px", color:"var(--text-dim)", marginTop:"2px" }}>focused</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared style objects — our real app tokens
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
  sectionLabel: {
    fontSize:"11px", color:"var(--text-dim)", letterSpacing:"2px",
    textTransform:"uppercase", marginBottom:"6px",
  },
  pageTitle: {
    fontSize:"26px", fontWeight:"600", color:"var(--text-primary)", letterSpacing:"-0.3px",
  },
  card: {
    background:"var(--color-surface)", border:"1px solid var(--color-border)",
    borderRadius:"var(--radius-card)", boxShadow:"var(--depth-line)",
    padding:"16px 18px", display:"flex", alignItems:"center", gap:"14px",
  },
  emptyState: {
    background:"var(--color-surface)", border:"1px solid var(--color-border)",
    borderRadius:"var(--radius-card)", padding:"32px 24px", textAlign:"center",
  },
  input: {
    display:"block", width:"100%", background:"rgba(255,255,255,0.05)",
    border:"1px solid rgba(255,255,255,0.1)", borderRadius:"10px",
    padding:"11px 14px", color:"var(--text-primary)", fontSize:"14px",
    outline:"none", fontFamily:"inherit", boxSizing:"border-box",
    marginTop:"6px", marginBottom:"14px", transition:"border-color 0.15s",
  },
  primaryBtn: {
    background:"var(--color-accent)", color:"#111", border:"none",
    borderRadius:"var(--radius-btn)", padding:"11px 18px",
    fontSize:"14px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit",
    flexShrink:0,
  },
  accentBtn: {
    background:"rgba(196,154,60,0.1)", color:"var(--color-accent)",
    border:"1px solid rgba(196,154,60,0.28)", borderRadius:"8px",
    padding:"8px 18px", fontSize:"13px", fontWeight:"600",
    cursor:"pointer", fontFamily:"inherit", flexShrink:0,
  },
  ghostBtn: {
    marginTop:"16px", background:"none", border:"1px solid rgba(255,255,255,0.09)",
    borderRadius:"8px", padding:"8px 16px", color:"var(--text-dim)",
    fontSize:"12px", cursor:"pointer", fontFamily:"inherit",
  },
  ghostBtnLarge: {
    flex:1, background:"transparent", border:"1px solid rgba(255,255,255,0.1)",
    borderRadius:"10px", padding:"12px", color:"var(--text-dim)",
    fontSize:"14px", cursor:"pointer", fontFamily:"inherit",
  },
  primaryBtnLarge: {
    flex:2, background:"var(--color-accent)", color:"#111", border:"none",
    borderRadius:"10px", padding:"12px", fontSize:"14px", fontWeight:"600",
    cursor:"pointer", fontFamily:"inherit",
  },
  leaveBtn: {
    background:"rgba(255,59,48,0.1)", border:"1px solid rgba(255,59,48,0.22)",
    borderRadius:"8px", padding:"9px 16px", color:"rgba(255,100,90,0.9)",
    fontSize:"13px", fontWeight:"600", cursor:"pointer", fontFamily:"inherit", flexShrink:0,
  },
  modalOverlay: {
    position:"fixed", inset:0, zIndex:1000,
    background:"rgba(8,8,10,0.75)", backdropFilter:"blur(14px)",
    display:"flex", alignItems:"center", justifyContent:"center", padding:"24px",
  },
  modalCard: {
    width:"100%", maxWidth:"400px",
    background:"var(--color-surface)", border:"1px solid var(--color-border)",
    borderRadius:"20px", padding:"28px 24px",
    boxShadow:"0 32px 80px rgba(0,0,0,0.5)",
  },
  fieldLabel: {
    fontSize:"12px", color:"var(--text-secondary)", fontWeight:"500",
  },
};
