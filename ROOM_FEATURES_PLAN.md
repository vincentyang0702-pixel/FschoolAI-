# FschoolAI Study Rooms — Feature Build Plan

Build order: **1 → 2 → 3 → 4**. Each phase is independently shippable.

## Decisions locked in

| Feature | Decision |
| --- | --- |
| Access filters | **Server-enforced** via SECURITY DEFINER RPCs; lobby also hides ineligible rooms |
| Chat | **Persist to DB** (history survives refresh / re-entry) |
| Whiteboard | **Lightweight custom canvas** — pen, small color palette, 3–4 pen styles, eraser, adjustable thickness |
| Voice | **Daily.co (placeholder)** — re-confirm provider + keys with team before wiring |

---

## Cross-cutting groundwork (done once, before Phase 1)

**Room dock UX.** Today the room stacks panels vertically (AI Buddy renders inline). Adding chat + whiteboard + voice on top would get unwieldy. Proposal: a **bottom tab dock** inside the room with one active panel at a time:

```
🤖 AI  ·  💬 Chat  ·  🖊 Board  ·  🎙 Voice
```

The existing AI Buddy moves into this dock. *(Visible change to current room layout — needs sign-off.)*

**Enforcement reality check.** Filters, joins, and writes will be truly server-enforced via SECURITY DEFINER RPCs, with **direct anon writes revoked** on the gated tables so the RPC is the only way in. The one thing that **cannot** be cryptographically sealed without real auth (the app uses an anon key, no `auth.uid()`) is the **Supabase realtime channel itself** — anyone holding a room's UUID could subscribe to its presence/chat/board stream. Room IDs are unguessable UUIDs, so risk is low, but recorded here rather than implied.

---

## Phase 1 — Server-enforced access filters

**Goal:** Owner restricts who can join by **University / Friends / Friends-of-friends / Course-takers**. Multiple enabled filters combine with **OR** (eligible if you satisfy *any* enabled rule). Owner is always eligible; existing members are **grandfathered** when a filter tightens.

### Schema — `supabase-room-access-migration.sql`
- `study_rooms.access_filters JSONB DEFAULT '{}'`
  e.g. `{"university":true,"friends":true,"fof":false,"course":false}`
- Orthogonal to `room_type`: filters decide **eligibility**; `room_type` still decides **join-directly (public) vs request-approval (invite)**.

### RPCs (SECURITY DEFINER, granted to `anon`)
- `check_room_access(p_user, p_room) → boolean` — OR across enabled rules:
  - **university** — `users.school` of user == owner's (trimmed, case-insensitive, non-null)
  - **friends** — accepted `friendships` row between user & owner
  - **fof** — 2-hop on `friendships` (shares an accepted friend with the owner)
  - **course** — user has a `courses` row whose `canvas_course_id` matches the room's linked course (requires a linked course with a canvas id)
- `list_accessible_rooms(p_user) → rooms[]` — lobby shows only rooms the user may see (empty filters = visible to all)
- `join_room(p_user, p_room, p_code) → status` — validates eligibility, then inserts the `room_members` row. **Revoke anon INSERT/UPDATE on `room_members`** so this RPC is the only join path. Request/invite/host-approve flows also move behind RPCs (`request_room_join`, `respond_room_request`)
- `set_room_access(p_user, p_room, p_filters)` — checks `p_user = created_by`; **owner-only** filter edits

### Frontend
- **CreateRoomModal** — "Access" section with the four toggles (Course toggle disabled unless a course is linked)
- **RoomView** — owner-only gear → live filter edit → `set_room_access` → broadcast so member badges update
- **Lobby** — `fetchRooms` → `list_accessible_rooms`; RoomCard shows filter badges; join uses `join_room` and surfaces a friendly "You're not eligible" message

### Verify-first risk
`supabase-schema.sql` says `courses.id` is UUID, but the rooms migration declares `course_id BIGINT`. Query the live DB (anon key) to confirm the real type before finalizing the course-taker filter and the room→course link.

---

## Phase 2 — In-room chat (persisted)

### Schema — `supabase-room-chat-migration.sql`
- `room_messages (id, room_id, user_id, name, body, created_at)` + index `(room_id, created_at)`

### Delivery
- **Live** via broadcast on the existing `room:<id>` channel (instant)
- **Persisted** via `post_room_message` RPC (verifies sender is a joined member; anon direct insert revoked)
- On enter, load the last ~100 messages
- Light client-side anti-spam throttle

### Frontend
- Chat panel in the dock — message list (your messages right-aligned), input, auto-scroll; reuses existing room styles

---

## Phase 3 — Collaborative whiteboard (lightweight, custom)

### Features
- Pen; small color palette (~6 swatches)
- **3–4 pen styles** (solid ink, highlighter/marker semi-transparent, dashed, fine liner)
- Eraser; thickness control
- HTML5 Canvas; pointer + touch input

### Sync model — stroke-based
- **Live** — throttled point batches broadcast as `wb_stroke` while drawing; full stroke committed on pointer-up
- **Persist** (`supabase-room-whiteboard-migration.sql`): `room_whiteboard (id, room_id, user_id, stroke JSONB, created_at)`, append-only
  - `stroke = { tool, color, style, thickness, points[] }`
  - Late-joiners / refreshers replay strokes in insertion order
  - Eraser = stroke with destination-out compositing → replays deterministically
- **Clear board** + **undo my last stroke** broadcast and update rows

### Open choice
Can **anyone** in the room clear the board (with a confirm), or **owner-only**? Defaulting to *anyone-with-confirm* unless told otherwise.

---

## Phase 4 — Live voice (Daily.co placeholder)

**Scaffold now, wire keys on the team's go-ahead.**
- Serverless `/api/daily` — create/fetch a Daily room per study room + mint a meeting token (needs `DAILY_API_KEY`)
- Frontend voice panel via `@daily-co/daily-js`: audio-only, **muted on join**, mute/unmute toggle, live speaking indicators, participant list tied to existing members; auto-leave on room exit
- Build the UI + integration seams against Daily and stub the token call; flip to live once provider is confirmed and the key is in env (re-ask before this step)

---

## Working agreement
- Each phase independently shippable; SQL goes in versioned `supabase-*-migration.sql` files (existing convention) to run in the Supabase SQL editor
- After each phase: run `typecheck` + `build`, and verify Phases 1–3 locally via the dev preview (anon key is enough; voice needs the Daily key)
- **No commits/pushes** unless explicitly asked
- No new token-economy rules for chat/board/voice unless requested

---

## To confirm before Phase 1
1. **Bottom tab dock** consolidation (incl. moving AI Buddy into it) — OK?
2. **OR logic** for combined filters — correct, or AND for some pairs?
3. Whiteboard **clear** = anyone-with-confirm vs owner-only?
4. Anything to add / re-order?
