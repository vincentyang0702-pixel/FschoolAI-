# Changelog — Extension / Brain / Library

**Living doc, maintained by Claude. Updated every turn.**
**Watches:** `vincentyang0702-pixel/FschoolAI-` (remote `vincent`) + `pr3tik/NeuroAgi` (remote `origin`).
**Local branch:** `extension-aryan` (work below is UNCOMMITTED unless noted).

---

## GitHub Watch — last checked 2026-06-08

### `vincent/main` @ `cf4e5ef` — NEW since last check
- **`MEMORY_ARCHITECTURE.md`** added — incorporates this session's `BRAIN_MEMORY_SPEC.md`, with the `neuroagi.files` (personal) vs `public.course_content` (shared) clarification baked in.
- **`ARYAN_NEXT_STEPS.md`** added — a task list addressed to you (see "Open / Next" below; it cites "your Claude's memory spec").
- Prior docs still current: `LIBRARY_ARCHITECTURE.md`, `EXTENSION_ARCHITECTURE.md`, `BACKEND_GAPS.md`.

### `vincent/backend/dev` @ `b63ca99` — `/api/extension/*` routes now exist (Gap 2 partially closed)
Real shapes in `backend/server/routes/extension.ts` (4 routes, JWT via `req.user.userId`):
- `POST /api/extension/sync` — `{ courses, assignments, grades, modules, portal_url }` → `public.courses/assignments/modules` + `users`.
- `POST /api/extension/content` — `{ canvas_course_id, content_type, title, body, url, captured_at }` → writes **`canvas_data`** (`data_type` = `syllabus|lecture_notes|page|announcement`).
- `POST /api/extension/signal` — `{ signal_type, subtype, value, value_text, value_json, source, metadata, occurred_at }` → **requires `users.brain_person_id`** (Gap 1 bridge must be populated first).
- `GET /api/extension/status` — counts + `brain_connected`.

⚠️ **Divergence from `LIBRARY_ARCHITECTURE.md` / our `EXTENSION_V2_PLAN.md`:** the `/content` route is a **stopgap** — it does **not** yet do dedup-by-`content_hash`, has **no `university_id`**, **no `professor_name`**, and writes to `canvas_data` rather than a dedicated **`public.course_content`** table. So **the compounding/shared library (the moat) is not actually built in the route yet.** Also missing: `GET /api/extension/library/exists`. Reconcile before wiring the extension to `/content`.

### `vincent/extension/dev` @ `2d672a3`
- Pulled **our** extension in (`feat: add Chrome extension from pr3tik/NeuroAgi:extension-aryan`).

### `vincent/fix/extension-neuroagi-schema` @ `6a3e21b`
- The `public`→`neuroagi` schema fix branch, **not yet merged** to `extension/dev` (ARYAN_NEXT_STEPS Step 2).

---

## Local work this session — branch `extension-aryan` (UNCOMMITTED)

**Extension**
- File harvesting added to `lmsApiSync()` (Canvas course files + submission attachments, D2L content TOC, Moodle course contents).
- File ingest in `background.js` → structured `files` table (upsert + stale-prune); "Files" stat in popup.
- `chrome.alarms` periodic background sync + `alarms` permission; orphaned-content-script guard in `universal.js`.
- **`SB_PROFILE` flipped `public` → `neuroagi`** in `background.js` + `popup.js` (matches what the app reads); misleading comments corrected.
- Version bumped to **1.10.0**.

**App**
- New **Files page** (`src/pages/Files.jsx`) — files grouped by course, type/status, LMS link.
- `loadCanvasData` loads `neuroagi.files`; `files` threaded through `AppContext`; registered in `App.jsx` + `navConfig.js`.

**Agent / backend-ish (this repo)**
- `api/tutor-context.js` — added `file_lookup` query type (returns file names + links; explicitly NOT contents).
- `vite.config.js` — `/api/tutor-context` dev middleware so the route runs under `npm run dev`.
- **Live agent upgraded to general-agent + tool-use + prompt caching (2026-06-08, verified locally):**
  - `NeuralRing.jsx` — replaced the classify→prefetch→6s-race with a **tool-use loop**: one `recall` tool (input `{query}`), executed by `/api/tutor-context`, so the model fetches live data only when it needs it (simple chat skips the DB). System prompt is now a **cached prefix block** (`cache_control: ephemeral`); recalled data arrives as tool results after the breakpoint.
  - `api/claude.js` + `vite.config.js` claude proxy — accept `tools` + array `system` (preserving `cache_control`), preserve array message content (tool_use/tool_result blocks), and return `contentBlocks` + `stop_reason` + `usage` (kept `content` string for existing viz/flashcard callers).
  - Verified: tool loop returns real grades end-to-end; caching reads 14.4K tokens from cache on the 2nd call. ⚠️ Caching only *engages* once the system prefix ≥ 4096 tokens (Haiku threshold) — kicks in for real once the resident brain context (file-summary index, etc.) is added; harmless no-op below that.
- **Assignment instructions capture (2026-06-08, Phase-2-contents layer a):** `shared-sync.js` now captures Canvas assignment `description` (HTML stripped, capped 4000 chars) → `background.js` stores it in `assignments.description` → `api/tutor-context.js` `assignment_detail` surfaces the instructions for keyword-matched assignments. Lets the tutor answer "what does HW2 actually ask for?". ⚠️ Populates only on the **next extension sync** (existing rows have `description=null`); reload the extension + re-sync to test. Still TODO: file/PDF *contents* (layer b).

**DB**
- `supabase-files-migration.sql` (new) + `files` table added to both schema files (per-schema id-type detection — live `public.courses.id` is `bigint`, `neuroagi` is `uuid`).

**Config**
- **`.env` fixed** — `SUPABASE_URL` was pointing at the **wrong project** (`yjiqqattsefunpbuewlk`); set to `wqgxpouhbwhwpzudrptp`; placeholder `SUPABASE_SERVICE_KEY` replaced with the real `sb_secret_…` key.

**Design docs**
- `BRAIN_MEMORY_SPEC.md` (superseded-topology note added) + `EXTENSION_V2_PLAN.md` (the canonical plan, aligned to Vincent's docs + compounding).

---

## Decisions locked
- **Agent architecture:** General Agent (Reggie) + specialist **tools** (not specialized agents). `agent-router.ts`/`*-agent.ts` → `tools/*.ts`; build `reggie-agent.ts`.
- **Memory = stored + retrieved**, never trained into weights. Brain remembers; agent recalls.
- **Retrieval = LLM-routed summary index** (not vector RAG). Embeddings only when a single corpus outgrows context, as a pre-filter.
- **Compounding = shared `public.course_content`** deduped by `content_hash`; course materials shared, submissions/feedback/signals private.
- **DB topology:** one Supabase project + separate schemas now (`neuroagi`/`brain` personal, `public` shared), backend as single writer; split into two physical projects at hardware launch.
- **Prompt caching:** cache the stable prefix (tools + frozen system + resident brain context); per-query recalled content + user turn stay uncached. Bake into the new `reggie-agent.ts`, not the about-to-be-replaced `brain-chat-session.ts`. Mechanics: `cache_control:{type:"ephemeral"}` (5-min) / `ttl:"1h"`; min cacheable 4096 tok (Opus/Haiku 4.5) / 2048 (Sonnet 4.6); reads ~0.1×; keep the tool list stable across turns or the whole cache invalidates.

---

## Open / Next (from `ARYAN_NEXT_STEPS.md`, with status)
- [x] **Step 1 — Fix wrong Supabase URL in `.env`** ✓ done this session.
- [x] **Verify Vercel env** — ⚠️ **CONFIRMED BROKEN (2026-06-08).** Black-box probe: prod `/api/tutor-context` `course_grades` returns `null` where local (correct project) returns real grades; `missing_late` succeeds but is empty → prod's Vercel `SUPABASE_URL`/`SERVICE_KEY` point at the **wrong/empty project**. **Server-side agent has been running on an empty DB in prod.** FIX: set Vercel env (`neuro-agi` project) `SUPABASE_URL=https://wqgxpouhbwhwpzudrptp.supabase.co` + real `sb_secret` key, redeploy.
- [ ] **Step 2 — Merge `fix/extension-neuroagi-schema` → `extension/dev`** (PR, tag Johan).
- [ ] **Step 4 — Phase 0 JWT auth** in extension (replace SHA-256/anon-key with Supabase Auth JWT in `chrome.storage`; drop hardcoded anon key).
- [ ] **Step 5 — Add `university_id` + `professor_name`** to extension requests (powers shared-library scoping + Professor Intelligence). ⚠️ backend `/content` must also start accepting them + dedup.
- [ ] **Step 6 — Rename manifest** `"NeuroAgi"` → `"FschoolAI"` / `"Reggie by FschoolAI"`.
- [ ] **Caching** — (a) live path (`NeuralRing`+`/api/claude`) now, (b) `reggie-agent.ts` durable.
- [ ] **Switch extension writes** from direct Supabase → backend `/api/extension/*` once Railway URL + JWT confirmed.
- [ ] **Rotate** the `sb_secret_…` key (it was pasted in chat).

**Waiting on Johan:** Gap 1 `user_id`→`person_id` bridge populated; `/content` upgraded to deduped `public.course_content` (+ `university_id`, `professor_name`, hash); `/api/extension/library/exists`; Railway backend URL.
