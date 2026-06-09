# NeuroAGI Brain — Memory Architecture Spec (v2)

**Status:** draft for the team · written 2026-06-08 · branch `extension-aryan` (uncommitted)
**Author context:** consolidates the extension file-sync work + the "brain stores memory, Reggie recalls it" discussion.

> ⚠️ **Storage topology here is SUPERSEDED by `EXTENSION_V2_PLAN.md`.** This draft put files per-user in `neuroagi`. After reading Vincent's `LIBRARY_ARCHITECTURE.md`, the correct model is **shared `public.course_content` (compounding, dedup-by-hash) + personal Brain**, written through a backend API. The *principles* below (memory = stored+retrieved, summaries not vector RAG, model-agnostic, JWT-first) still hold — read `EXTENSION_V2_PLAN.md` for the canonical design.

---

## 0. The one principle that decides everything

> **Memory = stored + retrieved. NOT trained into the model's weights.**

The brain (NeuroAGI) is a **persistent store**. Reggie (the FschoolAI agent) **recalls** the relevant slice into its context window at query time. We do **not** fine-tune Reggie on student files — LLMs don't learn at inference, and fine-tuning teaches *style*, not *facts*. The system gets smarter because **the brain remembers more over time**, not because weights change.

Two tiers, like human memory:
- **Long-term memory** = brain DB (unlimited, cheap to grow): file contents, summaries, signals, grades, trajectory.
- **Working memory** = Reggie's context window (small, temporary): what it's reasoning about now.
- **Recall** = retrieval that moves the relevant items from long-term → working memory per query.

**Non-goals (do not build):** per-student model training; fine-tuning the tutor on files; any dependency on BriLLM for the *tutor's* reasoning (Claude does that today; BriLLM is a separate research track — retrieval is model-agnostic and feeds whatever model reasons).

---

## 1. Recall strategy: LLM-routed summary index (not vector RAG)

One student's corpus is small (hundreds of files), so we don't need vector similarity. RAG ranks by cosine *similarity*, which misses *intent*; we let a reasoning model do the selection instead.

**At ingest (background, once per file):** extract text → cheap model (Haiku) produces a **1–2 sentence summary + topic keywords** → store summary + keywords + full `content_text`.

**At query (two stages, exposed to Reggie as a tool):**
1. **Route** — give the model the student's file *index* (`{file, course, summary, keywords}`, ~30 tokens/file → ~7K tokens for 200 files, fits in context). It picks relevant files **by intent**. `Assignment_01` gets picked because its *summary* says "Haskell project," even though the filename is useless.
2. **Read** — load the chosen files' full `content_text` → Reggie answers grounded in real content.

Add embeddings/`pgvector` **only later**, if a single student's corpus grows too large for the index to fit context — then vectors become a *pre-filter*, never the final decider.

---

## 2. Phasing (sequenced around what we found in the codebase)

| Phase | What | Why it's ordered here |
|------|------|----------------------|
| **0 — Security & source of truth** | JWT auth; route all writes through backend API; one project + one schema; fix Vercel env | Prerequisite. Today: open RLS + public anon key + extension writing directly to Supabase = breach surface. Storing file *contents* makes this worse. Must close first. |
| **1 — Content storage** | Extend `files` with `summary`/`keywords`/`content_text`; ingest pipeline extracts + summarizes | The memory substrate. `content_text` column already exists. |
| **2 — Recall API** | `recall_memory` tool for Reggie (replaces the classify-then-name-match in `tutor-context`) | Makes Reggie actually *use* the files; fixes the current 5–6s name-match latency. |
| **3 — Signals** | `signals` table + `/api/signals`; extension emits page/time/action events | Vincent's "brain signal emitter." Another stream into long-term memory. |
| **4 — Cross-course graph** | `concepts` + `concept_links` derived from per-file keywords | The "regression in Psych ↔ Ch.4 in Stats" insight. Reuses Phase 1 summaries — built once, powers both recall and the graph. |

> ⚠️ **Before Phase 0:** resolve the source-of-truth mess we found — `.env`/Vercel pointed at the **wrong Supabase project** (`yjiqqattsefunpbuewlk` vs the live `wqgxpouhbwhwpzudrptp`), and the app/extension have flip-flopped between `public` and `neuroagi`. Pick **one project + one schema** and make every writer/reader agree, or the brain becomes a *third* place data silently fails to show up. See `AUDIT.md`.

---

## 3. Storage schema (brain = `neuroagi` schema)

### 3.1 `files` — extend the existing table
Already has: `id, user_id, course_id, assignment_id, lms_file_id, name, file_type, size_bytes, source_url, folder, status, content_text, source, updated_at`. Add:

```sql
alter table neuroagi.files add column if not exists summary       text;        -- LLM 1–2 sentence
alter table neuroagi.files add column if not exists keywords      text[];      -- LLM topic tags
alter table neuroagi.files add column if not exists extract_status text default 'pending'; -- pending|done|failed
alter table neuroagi.files add column if not exists extracted_at  timestamptz;
-- later (only if corpus outgrows context): embedding vector(1536) via pgvector
```

### 3.2 `signals` — behavioral stream (Phase 3)
```sql
create table if not exists neuroagi.signals (
  id          bigint generated always as identity primary key,
  user_id     text references neuroagi.users(id) on delete cascade,
  course_id   uuid references neuroagi.courses(id) on delete set null,
  type        text,            -- page_view | time_on_page | action | submission | struggle
  payload     jsonb,           -- { url, seconds, target, ... }
  occurred_at timestamptz,
  created_at  timestamptz default now()
);
create index if not exists signals_user_time_idx on neuroagi.signals (user_id, occurred_at desc);
```

### 3.3 `concepts` + `concept_links` — cross-course graph (Phase 4)
```sql
create table if not exists neuroagi.concepts (
  id        uuid primary key default gen_random_uuid(),
  user_id   text references neuroagi.users(id) on delete cascade,
  name      text,                -- "linear regression"
  course_id uuid references neuroagi.courses(id) on delete set null,
  file_id   uuid references neuroagi.files(id) on delete set null
);
create table if not exists neuroagi.concept_links (
  id        bigint generated always as identity primary key,
  user_id   text references neuroagi.users(id) on delete cascade,
  from_id   uuid references neuroagi.concepts(id) on delete cascade,
  to_id     uuid references neuroagi.concepts(id) on delete cascade,
  relation  text,                -- "same_as" | "prereq_of" | "applied_in"
  weight    float
);
```

Performance trajectory can derive from `courses`/`assignments` history first; add a `performance_snapshots(user_id, course_id, score, captured_at)` table only if you need a true time series.

---

## 4. Ingest pipeline (Phase 1)

Replaces the extension's **direct** Supabase writes (the security problem) with a backend route.

```
Extension (has the LMS session)
  └─ downloads file bytes / page text
  └─ POST /api/brain/ingest   (JWT in Authorization)
        { lms_file_id, course_ref, name, file_type, source_url, text? }

Backend /api/brain/ingest  (validates JWT → uses SERVICE key server-side)
  1. if no text provided, fetch via source_url
  2. extract plain text (pdf→text, docx→text)
  3. Haiku → { summary, keywords }   (one cheap call per file, background)
  4. upsert neuroagi.files (content_text, summary, keywords, extract_status='done')
```

Notes:
- Heavy work (extract + summarize) is **background, at sync** — never on Reggie's chat path.
- Idempotent on `(user_id, lms_file_id)`; prune stale rows like the current `ingestApiData` does.
- Raw bytes: store in a **private** Supabase Storage bucket with signed URLs *only if* needed; the `content_text` + summary usually suffice and avoid hoarding binaries.

---

## 5. Recall API (Phase 2) — the tool Reggie calls

Replace the current `api/tutor-context.js` classify-then-`name ilike` flow with a recall tool. Expose it via **tool-use** so it fires only when a question needs memory (kills the per-message classify tax).

```
Tool: recall_memory(query: string) → {
  files:   [{ name, course, summary, status, source_url, content_text? }],  // top picks, content loaded
  grades:  [...], assignments: [...], signals: [...]                          // structured context
}

Server logic:
  1. load student file INDEX (id, name, course, summary, keywords)   ← small, cacheable
  2. route: model picks relevant file_ids by intent over the index
  3. read: SELECT content_text for those ids
  4. return structured memory slice
```

This is intent-aware (a model selects, not cosine similarity), fast (summaries precomputed; only chosen files' text is loaded), and replaces brittle filename matching.

---

## 6. Caching — make it *feel* like "it's all in memory"

- **Resident, prompt-cached each session:** student profile + course list + **file summary index** + recent signals. Small, and Claude **prompt caching** means you don't re-pay to reload it every turn. This is Reggie's "always-on awareness."
- **On-demand:** full `content_text` of only the files a question actually needs (via `recall_memory`).

Result: Reggie is *aware* of everything (resident index) and can *read* anything (recall) — functionally "it has it all in memory," done scalably.

---

## 7. Security (Phase 0 — gates everything that stores contents)

- **JWT auth:** extension authenticates → token; **all writes go through the backend API** which validates the JWT and uses the service key server-side. No anon key writing directly from the client.
- **RLS:** move off `open_all using(true)` to user-scoped policies once identity is JWT-based (today identity is a client UUID and `auth.uid()` is null — see `security-and-identity-posture`).
- **Private storage** for any raw bytes; signed URLs only.
- **One project, one schema, correct Vercel env** (see §2 warning).
- **Rotate** any service key that's been shared in chat/docs.

---

## 8. Model-agnostic boundary

Recall returns a **structured memory slice**; whatever model reasons over it is swappable. Claude (Haiku for ingest summaries + routing, Sonnet/Opus for tutoring) today. BriLLM is GPT-1-level / research-stage — keep it out of the tutor path; if it ever matures, it consumes the same recall output. **Build the memory layer once; swap the model later.**

---

## 9. What exists today vs. to build

**Done (on `extension-aryan`, uncommitted):**
- `files` table (+ `content_text` seam) in both schemas + migration.
- Extension harvests files (Canvas/D2L/Moodle) → structured `files` table.
- Files page in app; `recall`-lite via `tutor-context` `file_lookup` (name/keyword match) working locally.

**To build (this spec):**
- Phase 0 security (JWT + backend writes + env/schema source-of-truth).
- `summary`/`keywords` columns + ingest summarization.
- `recall_memory` tool (replaces name-match) + tool-use wiring in `NeuralRing.jsx`.
- `signals`, then `concepts`/`concept_links`.
