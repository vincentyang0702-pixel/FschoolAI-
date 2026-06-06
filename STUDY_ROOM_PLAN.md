# Study Room — Implementation Plan

**Author:** Aryan · **For review by:** Vincent, Rivaan · **Status:** Decisions locked (2026-06-04) — building
**Target:** Working v1 by June 30, refined continuously after.

**Locked decisions (team chat, 2026-06-04):**
- **Transport: Cloudflare Durable Objects from day one.** No Supabase-Realtime-then-migrate — CTO (Johan) call, migration later is painful. Cloudflare access granted to the team.
- **Two Supabase projects** (Vincent migrating 3→2): **NeuroAGI core** = the Brain; **FschoolAI** = agent manager + agents. Study room data lives in **FschoolAI**.
- **DB structure review:** Vincent's Manus does a first pass on the FschoolAI schema, then **CTO + Aryan review the layering** before we commit room tables.
- **Everything pushed to GitHub + double-checked** so AI-built code stays aligned with the brain/agent vision (Vincent's Supabase is GitHub-linked).

> Feature in one line: a student adds a friend, the two join a shared **study room**, and an **AI tutor** teaches them inside that room in real time. Each client talks to a server that holds the **authoritative state** of every room.

---

## 1. Scope

**In scope for v1**
- Add/remove friends (request → accept).
- Create a study room, invite a friend, join via the room.
- Real-time shared chat between members (low latency).
- Presence (who's in the room, who's typing).
- An AI tutor that can be addressed in the room, sees the shared conversation, and streams replies to everyone.
- Pick a course context for the room (reuse the course list we already load).

**Out of scope for v1 (note, don't build yet)**
- Voice/video, shared whiteboard, screen share.
- Group rooms >2 people (design for N, ship with 2).
- Shared flashcard sessions inside the room (Phase 4 candidate — we already have the flashcard engine in [Study.jsx](src/pages/Study.jsx)).

---

## 2. Where it slots into the current app

The codebase is modular — adding a page is a known, small move. We have 8 pages today in a 3×3 swipe grid driven entirely by [navConfig.js](src/navigation/navConfig.js).

- **New page key:** `studyroom` (keep the existing `study` flashcards page — this is a *separate* feature, don't overload it).
- **Files to touch to wire the page in:**
  - [src/navigation/navConfig.js](src/navigation/navConfig.js) — add `studyroom` to `NAV`, place it in `DOT_GRID`, add a `LABEL`. (Grid currently has one empty slot at top-left `[null, ...]` — that's the natural home, or we expand to a 4th row.)
  - [src/App.jsx](src/App.jsx) — `import StudyRoom` and add `studyroom: StudyRoom` to the `PAGES` map. That's the only registration needed.
  - `src/pages/StudyRoom.jsx` — new page.
- **Reuse, don't rebuild:**
  - AI tutor → reuse `/api/claude` ([api/claude.js](api/claude.js)) and the tutor prompt patterns already in [NeuralRing.jsx](src/components/NeuralRing.jsx).
  - User identity → `useApp().userId` (client UUID in `localStorage.fschool_uid`; **no Supabase Auth** today — see §6 risk).
  - Course context → `useApp().courses`, same shape Study/Study use.
  - Styling → existing CSS vars (`--color-surface`, `--radius-card`, etc.) so it matches instantly.

---

## 3. Architecture: Cloudflare Durable Objects (locked)

The conversation framed the model exactly: *"each user is a client interacting with our server which holds the authoritative state of each study room."* That is a **Durable Object**, and the team chose to build it from day one (no Supabase-Realtime stopgap — migration later is painful).

**Design:**
- **One Durable Object instance per room** = the authoritative server for that room. The DO id is derived from `study_rooms.id`, so a room maps to exactly one DO.
- Clients open a **WebSocket** to the room's DO. The DO holds room state in memory (members, presence, recent messages), fans out every message to all sockets, and orchestrates tutor turns (calls Claude server-side, streams tokens back to all members).
- **DO transactional storage** holds the live/recent authoritative state; **Supabase (FschoolAI project)** holds durable history + the social graph (friends, room metadata) for cross-device/cross-surface queries. The DO writes through to Supabase async, off the hot path.
- It sidesteps Vercel's serverless limits entirely (see §4).

**Client abstraction:** still wrap the connection in a thin `roomTransport` interface (`join`, `send`, `onMessage`, `onPresence`, `leave`) — not to swap backends, but to keep the React layer clean and testable against a mock. Single implementation: the DO WebSocket client.

**New infra to stand up:**
- Cloudflare Workers + Durable Objects via **Wrangler** (access granted). One Worker exposes the room WebSocket route; the `StudyRoom` DO class lives in it.
- Per Vincent: this Worker repo gets pushed to GitHub and double-checked against the brain/agent vision like everything else.

**Tutor in the DO:** the DO calls Claude directly with the room transcript + course context (it already holds the authoritative message log), then streams tokens to every socket — so it does **not** consume one of our Vercel function slots. The existing [api/claude.js](api/claude.js) prompt patterns port over to the Worker.

---

## 4. The Vercel constraint (important)

- We're on Vercel **Hobby = max 12 serverless functions**, and [api/](api/) is **already at exactly 12**. We cannot freely add room endpoints there.
- Vercel serverless also **can't hold WebSocket connections** (no persistent processes), so the real-time relay can't live on Vercel regardless.
- Implications with the chosen Durable Object path:
  - Real-time + the in-room tutor both run **on Cloudflare** → adds **0** Vercel functions. The Vercel cap is a non-issue for this feature. ✅
  - The React app stays on Vercel and just opens a WebSocket to the Cloudflare Worker — no new Vercel endpoints needed.
  - If we ever do need a new HTTP endpoint on Vercel, we **merge into an existing function** (we already did this — see commit `0290cef` merging itunes+twilio into `utils.js`).

---

## 5. Data model (FschoolAI Supabase project — pending CTO + Aryan layering review)

These tables live in the **FschoolAI** project (agents/agent-manager side), **not** the NeuroAGI core/Brain project. They're additive and follow the repo's conventions (`user_id text` referencing `users(id)`, open RLS policies like the rest of the schema in [supabase-schema.sql](supabase-schema.sql)). The DO is the live authoritative store; these are the durable backing.

> **Gate:** Vincent's Manus does the first FschoolAI schema pass, then CTO + Aryan review the layering before we run these. Treat the DDL below as the proposed shape, not final.

```sql
-- friendships: one row per relationship, symmetric via status
create table if not exists public.friendships (
  id          bigint generated always as identity primary key,
  requester   text references public.users(id) on delete cascade,
  addressee   text references public.users(id) on delete cascade,
  status      text default 'pending',          -- pending | accepted | blocked
  created_at  timestamptz default now(),
  unique(requester, addressee)
);

-- study_rooms: room metadata + authoritative owner
create table if not exists public.study_rooms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text references public.users(id) on delete cascade,
  name        text,
  course_ref  text,                            -- course code/label for tutor context
  status      text default 'active',           -- active | ended
  created_at  timestamptz default now()
);

-- room_members: who is allowed in / currently in
create table if not exists public.room_members (
  id          bigint generated always as identity primary key,
  room_id     uuid references public.study_rooms(id) on delete cascade,
  user_id     text references public.users(id) on delete cascade,
  role        text default 'member',           -- owner | member
  joined_at   timestamptz default now(),
  unique(room_id, user_id)
);

-- room_messages: durable chat history (live delivery is via Realtime/DO, not this)
create table if not exists public.room_messages (
  id          bigint generated always as identity primary key,
  room_id     uuid references public.study_rooms(id) on delete cascade,
  user_id     text references public.users(id),  -- null/'tutor' for AI turns
  role        text,                              -- user | tutor
  content     text,
  created_at  timestamptz default now()
);
```
- Add the same `enable RLS + open_all policy` block these tables already use (RLS is open by design — no Supabase Auth; see §6).
- Index `room_messages(room_id, created_at)` for history loads.

---

## 6. Risks / open questions for the spec doc

1. **Identity has no real auth.** Today `users.id` is a client-generated UUID in localStorage with open RLS ([App.jsx:141-203](src/App.jsx)). For a social feature (friends, shared rooms) this means anyone could spoof a user_id. **Pratik is on auth + Discord** — friends/rooms should land *after or alongside* his auth so identity is trustworthy. **The DO must authenticate the WebSocket** (validate the user token on `join`), otherwise the authoritative server trusts a spoofable id. Depends on Pratik's auth landing.
2. **DB cutover.** Code still points at the intern's personal project (`yjiqqattsefunpbuewlk` in [src/supabase.js](src/supabase.js) / [src/api/supabase.js](src/api/supabase.js)). Once Vincent's 3→2 migration lands and the FschoolAI project is live, swap keys (5-min change, no schema migration of existing tables) — friends require **all users on one shared DB**. Blocking for any multi-user test.
3. ~~Transport decision~~ — **resolved: Durable Objects (§3).**
4. **Tutor cost/rate-limiting** — in a shared room, multiple people can trigger the tutor. The DO enforces a per-room rate limit + max_tokens cap server-side (we already cap at 4096 in [api/claude.js:30](api/claude.js)). Easy now that the DO owns turn orchestration.
5. **Relationship to neuroagi-core / Brain SDK** — room transcripts are exactly the kind of interaction the brain should learn from. Long-term the in-room tutor should call `brain.getContext()` instead of the manual prompt, same migration noted for NeuralRing. Out of scope for v1 but design the DO's message log so it's easy to feed to `brain.update()` later. Keeping FschoolAI and NeuroAGI core as separate Supabase projects keeps that boundary clean.
6. **GitHub alignment** (Vincent) — the Cloudflare Worker/DO repo + any schema get pushed to GitHub and reviewed so AI-built code doesn't drift from the brain/agent vision.

---

## 7. Latency strategy (the "reduce chat latency" research ask)

Concrete techniques, in priority order:

1. **Optimistic UI.** Render the sender's own message instantly from local state; reconcile on server ack. Removes all perceived send latency. (Same pattern as NeuralRing's `streamingMsg`.)
2. **WebSocket / Broadcast, never polling.** Both Supabase Broadcast and Durable Objects give push delivery. No `setInterval` fetching.
3. **Separate the live path from the durable path.** Deliver messages over the realtime channel *first* (fast), write to `room_messages` *async* after (durable). Never block delivery on the DB insert.
4. **Stream the tutor's tokens (SSE), don't wait for the full reply.** NeuralRing already streams; do the same in-room so all members watch the answer build. Big perceived-latency win on AI turns.
5. **Edge-locate the server.** Durable Objects run at the nearest edge; if on Supabase, pick the region closest to our users. Round-trip distance is the dominant cost.
6. **Debounce presence & typing.** Typing indicators every ~300ms max; presence diffs, not full snapshots. Keeps the channel quiet so real messages aren't queued behind chatter.
7. **Small payloads.** Send `{id, userId, text, ts}` — not fat objects. Hydrate names/avatars from local member list.
8. **Reconnect with backoff + replay.** On reconnect, fetch messages since last-seen `created_at` so a dropped connection never loses history.

Expected result: own-message latency ≈ 0 (optimistic), peer-message latency ≈ one network hop (tens of ms on Broadcast/DO), tutor *first token* in ~1s with streaming instead of multi-second full-reply waits.

---

## 8. Phased build plan

**Phase 0 — Foundations (depends on Vincent's 3→2 migration + DB review)**
- Stand up the Cloudflare Worker + `StudyRoom` Durable Object skeleton via Wrangler; echo WebSocket working end-to-end. (Can start now — no Supabase dependency for the skeleton.)
- After CTO + Aryan layering review: create the room tables (§5) on the FschoolAI project; swap app keys off the personal project.
- Add `studyroom` to navConfig + App.jsx; stub page renders + connects to the DO.

**Phase 1 — Friends**
- Friend search/add by email or name; request → accept flow against `friendships`.
- Friends list UI in the StudyRoom page (or Identity page — TBD with UI designer).

**Phase 2 — Rooms + real-time chat (Durable Object)**
- Create room, invite a friend, join. `study_rooms` + `room_members`; DO id derived from room id.
- `roomTransport` client wraps the DO WebSocket (`join`/`send`/`onMessage`/`onPresence`/`leave`).
- DO holds authoritative state in memory, fans out messages, write-through to `room_messages` async.
- Optimistic chat UI + presence + typing. Auth the socket on `join` (§6.1).

**Phase 3 — In-room AI tutor**
- "@tutor" / a tutor button → the DO calls Claude with the room transcript + course context and **streams tokens to all members** over the WebSocket.
- Tutor context reuses `buildCourseContext`-style logic from [Study.jsx](src/pages/Study.jsx) and prompt patterns from [NeuralRing.jsx](src/components/NeuralRing.jsx).
- Per-room rate limit enforced in the DO.

**Phase 4 — Polish (post-June-30)**
- Reconnect/replay hardening, group rooms >2 (DO already designed for N).
- Optional: shared flashcard session in-room (reuse the StudySession engine).
- Begin Brain SDK wiring for the tutor (§6.5).

---

## 9. What I need to unblock

- **Vincent:** finish the 3→2 Supabase migration; Manus first-pass on the FschoolAI schema, then CTO + Aryan layering review (§5) before room tables go in; confirm room/tutor behavior in the spec doc.
- **Pratik:** auth timeline (§6.1) — friends/rooms + the DO socket need trustworthy identity.
- **Cloudflare:** ✅ access granted — I can start the Worker/DO skeleton (Phase 0) now.
- **Already unblocked:** I'll begin the Durable Object skeleton + `studyroom` page wiring immediately; room tables wait on the DB review.
</content>
</invoke>
