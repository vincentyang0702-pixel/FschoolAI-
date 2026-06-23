# AI Room Tutor — Phase 0 Plan & Implementation

> Status: **Parked** — endpoint removed from codebase on 2026-06-21, preserved here for future implementation.
> Branch at time of removal: `frontend/dev`

---

## What this feature does

A shared AI tutor for study rooms. Any team member can type `@tutor <question>` in the room text chat; the backend calls Claude Haiku and posts the reply back into the same chat as a special `ai-tutor` message that all teammates see. Differs from the personal NeuralRing buddy (which is private, per-user, and not persisted as room chat).

---

## Architecture decisions

### Identity: `'ai-tutor'` sentinel in `room_messages.user_id`
- `room_messages.user_id` is `TEXT NOT NULL` with no FK to the users table (see `supabase-room-chat-migration.sql`)
- The value `'ai-tutor'` works as a sentinel without any DB migration
- The `post_room_message` RPC is `SECURITY DEFINER` and verifies membership — the service key bypasses it entirely, so we INSERT directly with `supabase-service-key` client

### Model: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
- Fast and cheap — good for shared/high-frequency use across multiple rooms
- Personal NeuralRing buddy stays on Sonnet 4.6

### Entry point: `/api/room-tutor` (POST)
- Called by the client when user sends `@tutor` prefixed message
- NOT exposed as a Vite proxy in dev while parked (was: `roomTutorProxyPlugin`)
- On Vercel: add `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` env vars (they already exist for other endpoints)
- Optional: `ANTHROPIC_TUTOR_MODEL` to override the Haiku default

---

## Full endpoint implementation

```typescript
// api/room-tutor.ts
// POST { roomId, userId, userName, question } → { message: ChatMessage }
// Calls Claude Haiku 4.5 and inserts its reply into room_messages as 'ai-tutor'.
// No migration needed: room_messages.user_id is TEXT with no FK constraint.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const AI_TUTOR_ID   = "ai-tutor";
const AI_TUTOR_NAME = "AI Tutor";
const MAX_BODY = 2000;

// Rate limit: 12 calls per room per 5 minutes (tracked in-memory — resets on cold start)
const RATE_LIMIT = 12;
const WINDOW_MS  = 5 * 60 * 1000;
const roomHits   = new Map<string, number[]>();

function checkRateLimit(roomId: string): boolean {
  const now = Date.now();
  const hits = (roomHits.get(roomId) ?? []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= RATE_LIMIT) return false;
  hits.push(now);
  roomHits.set(roomId, hits);
  return true;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")    return res.status(405).end();

  const { roomId, userId, userName, question } = req.body ?? {};
  if (!roomId || !userId || !question) {
    return res.status(400).json({ error: "roomId, userId, and question are required" });
  }
  if (typeof question !== "string" || question.length > MAX_BODY) {
    return res.status(400).json({ error: `question must be a string ≤ ${MAX_BODY} chars` });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );

  // 1. Verify asker is a joined member of this room
  const { data: membership } = await supabase
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .eq("status", "joined")
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "You are not a joined member of this room" });
  }

  // 2. Rate-limit per room
  if (!checkRateLimit(roomId)) {
    return res.status(429).json({ error: "Too many tutor calls — slow down" });
  }

  // 3. Build context: room info + member goals
  const { data: room } = await supabase
    .from("study_rooms")
    .select("name, course_id")
    .eq("id", roomId)
    .maybeSingle();

  const { data: members } = await supabase
    .from("room_members")
    .select("goal, user_id")
    .eq("room_id", roomId)
    .eq("status", "joined");

  const courseLine = room?.course_id
    ? `Course context: course ID ${room.course_id}.`
    : "";
  const goalLines = (members ?? [])
    .filter(m => m.goal)
    .map(m => `- ${m.user_id === userId ? `${userName} (asker)` : "Teammate"}: ${m.goal}`)
    .join("\n");

  const systemPrompt = [
    "You are a concise study tutor for a collaborative study room.",
    courseLine,
    "Help the student with their question clearly and briefly (2–5 sentences).",
    "Focus on understanding, not just answers.",
    goalLines ? `\nStudent goals in this session:\n${goalLines}` : "",
  ].filter(Boolean).join(" ");

  // 4. Call Claude Haiku 4.5
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_TUTOR_MODEL ?? "claude-haiku-4-5-20251001";

  const completion = await anthropic.messages.create({
    model,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: question }],
  });

  const answer = (completion.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  if (!answer) {
    return res.status(502).json({ error: "Tutor returned an empty response" });
  }

  // 5. Insert the reply into room_messages using the service key (bypasses RPC membership check)
  const { data: message, error: insertErr } = await supabase
    .from("room_messages")
    .insert({
      room_id:  roomId,
      user_id:  AI_TUTOR_ID,
      name:     AI_TUTOR_NAME,
      body:     answer.slice(0, MAX_BODY),
    })
    .select()
    .single();

  if (insertErr) {
    console.error("[room-tutor] insert failed:", insertErr.message);
    return res.status(500).json({ error: "Failed to post tutor reply" });
  }

  return res.status(200).json({ message });
}
```

---

## Vite dev-server proxy plugin (for when this is re-added)

Add this to `vite.config.js` and include in the `plugins: [...]` array:

```javascript
const roomTutorProxyPlugin = {
  name: "room-tutor-proxy",
  configureServer(server) {
    server.middlewares.use("/api/room-tutor", async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
      process.env.ANTHROPIC_API_KEY    = loadEnvKey("ANTHROPIC_API_KEY");
      process.env.SUPABASE_URL         = loadEnvKey("SUPABASE_URL");
      process.env.SUPABASE_SERVICE_KEY = loadEnvKey("SUPABASE_SERVICE_KEY");
      const tutorModel = loadEnvKey("ANTHROPIC_TUTOR_MODEL");
      if (tutorModel) process.env.ANTHROPIC_TUTOR_MODEL = tutorModel;
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", async () => {
        try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
        res.status = (code) => { res.statusCode = code; return res; };
        res.json   = (obj)  => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
        try {
          const { default: handler } = await import("./api/room-tutor.js");
          await handler(req, res);
        } catch (err) {
          res.statusCode = 502; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });
  },
};
```

---

## Phase 1 (future UI work)

When re-implementing:

1. **Trigger detection** — In `StudyRooms.tsx`, detect `@tutor` prefix when user sends a chat message. Strip the prefix and call `POST /api/room-tutor` instead of (or in addition to) posting as a normal message.

2. **Render tutor messages distinctly** — In the chat list, check `msg.user_id === 'ai-tutor'` and apply a different bubble style (e.g. gold border, robot icon, italic text).

3. **Loading state** — Show a typing indicator in the chat while the tutor call is in-flight.

4. **No-migration DB note** — `room_messages.user_id` is `TEXT NOT NULL` with no FK. The `'ai-tutor'` sentinel works as-is. See `supabase-room-chat-migration.sql`.

---

## Env vars needed (already exist on Vercel for other endpoints)

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Call Claude Haiku |
| `SUPABASE_URL` | DB access |
| `SUPABASE_SERVICE_KEY` | Bypass RPC membership check for INSERT |
| `ANTHROPIC_TUTOR_MODEL` | (Optional) override model, default `claude-haiku-4-5-20251001` |
