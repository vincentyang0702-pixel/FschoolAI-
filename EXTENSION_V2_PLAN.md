# Extension v2 — Final Design Plan (the Compounding Library)

**Status:** design plan for the team · 2026-06-08 · branch `extension-aryan` (no code yet)
**Aligns with:** Vincent's `LIBRARY_ARCHITECTURE.md`, `EXTENSION_ARCHITECTURE.md`, `BACKEND_GAPS.md` (read from `vincentyang0702-pixel/FschoolAI-` @ main).
**Supersedes:** the storage-topology section of `BRAIN_MEMORY_SPEC.md` (that draft put files per-user in `neuroagi`; the correct model is shared-vs-private across two stores, below).

---

## 0. The core idea (this is what makes it "compound")

There are **two stores with two completely different ownership rules**:

| | Shared Library | Personal Brain |
|---|---|---|
| **Lives in** | FschoolAI `public.course_content` | NeuroAGI Brain (`brain.*` / `neuro.*`) |
| **Owned by** | FschoolAI (institutional) | The student (personal) |
| **Scope** | per course (university + course) | per student |
| **Contains** | syllabi, lectures, rubrics, modules, announcements | grades, feedback, submissions, signals, knowledge gaps |
| **Shared across students?** | **YES — one copy, infinite students** | Never |

**Compounding = deduplicated shared content.** Before storing, the backend hashes the content; if that hash already exists (another student in the same course already captured it), it just bumps `seen_by_count` — **no re-store, no re-analysis, zero cost.** So:
- 1st student in PSYC 201 captures the syllabus → stored + analyzed once (~3s, fractions of a cent).
- Every later student in PSYC 201 → instant hit, inherits the analyzed item for free.
- A new student's first day → fully populated course library if classmates already use it.

This is the network-effect moat. The extension is the **eyes/ears**; all storage + intelligence is server-side.

**The split that delivers it (critical):**
- **Course materials** (lecture PDFs, syllabus, rubric, modules, readings) → **shared library** (`course_content`). These are identical for everyone in the course → dedup → compound.
- **Student's own submissions + professor feedback + grades** → **personal brain** (private). Never shared.

> This is the single most important correction vs. what we built: we currently store *every file per-user* in `neuroagi.files`. That duplicates the same lecture PDF for all 200 students in a course. The compounding model stores course materials **once** in `course_content` and derives "this student's files" from *their enrolled courses* — no duplication.

---

## 1. Architecture (canonical, per Vincent's docs)

```
Chrome Extension (sensor; student's LMS session)
  │  JWT (Authorization: Bearer)  — NEVER writes Supabase directly anymore
  ▼
Backend API  (Express server, JWT-validated; the ONLY writer)
  ├─ /api/extension/sync     → public.courses / assignments / grades  (+ brain bridge)
  ├─ /api/extension/content  → public.course_content  (dedup by hash → shared library)
  └─ /api/extension/signal   → brain.signals  (private behavioral stream)
        │
        ├── Shared Library:  public.course_content  (FschoolAI DB)
        └── Personal Brain:  brain.signals / brain.knowledge / neuro.persons (Brain DB)
                                   │
                       Reggie (AI tutor) recalls from BOTH:
                       shared course material + personal state
```

**Auth:** Supabase JWT. Extension signs in (`signInWithPassword`) → stores token in `chrome.storage.local` (`fschoolai_jwt`) → sends `Authorization: Bearer <jwt>` on every call. Backend validates with `JWT_SECRET`, attaches `req.user.userId`. (Middleware already exists: `backend/server/middleware/auth.ts`.)

**Identity bridge:** `public.users.brain_person_id` ↔ `neuro.persons.id`. Created on first login (Gap 1 — not built yet).

---

## 2. What goes where (the routing table the extension follows)

| Captured item | Route | Store | Shared? | Dedup |
|---|---|---|---|---|
| Courses / assignments / grades | `/api/extension/sync` | `public.*` (+ mirror to brain for deadlines) | metadata per-user | by canvas id |
| Syllabus / lecture / module / reading / rubric | `/api/extension/content` | `public.course_content` | **YES** | **content_hash** |
| Announcements | `/api/extension/content` | `public.course_content` | YES | content_hash |
| Professor feedback on graded work | `/api/extension/signal` | `brain.signals` | **NO** | n/a |
| Student's own submission files | `/api/extension/signal` (+ personal store) | brain / personal | **NO** | n/a |
| Page views / time-on-page / procrastination loops | `/api/extension/signal` | `brain.signals` | NO | n/a |

`content_hash = SHA-256(university_id : course_id : content_type : text[:500])`.
`university_id` is derived in the extension from the LMS hostname (`canvas.utoronto.ca → uoft`), with a slugify fallback.

> **Dedup correctness note (my recommendation):** the `course_id` in the hash must be a **cross-student-stable** identifier (the LMS course id, or a normalized code like `PSYC201`) — otherwise two students' captures won't collide and compounding breaks. Prefer normalized course code when reliably parseable, fall back to LMS course id.

---

## 3. Ingest pipeline

```
Extension captures a course-material page/file (has the session)
  └─ extract raw text (PDF/doc/page; shadow-DOM-pierce as today)
  └─ POST /api/extension/content  { university_id, course_id, content_type, text, week?, module?, professor?, source_url }

Backend:
  1. content_hash = sha256(...)
  2. SELECT id, seen_by_count FROM course_content WHERE content_hash = ?
  3a. EXISTS → seen_by_count++, last_seen_at=now()  → return {action:'existing'}   ← compounding, zero cost
  3b. NEW   → INSERT row → return {action:'created'} → enqueue Library Organizer Agent
  4. Library Organizer (Haiku, background): summary + concepts[] → UPDATE course_content
                                            (concepts later feed the cross-course graph)
```

Heavy work (extract + summarize + concept-extract) is **background, server-side** — never on Reggie's chat path. Private feedback/submissions skip the library entirely and go to `brain.signals`.

**Bandwidth optimization:** extension can `GET /api/extension/library/exists?hash=...` before sending full text, so the 2nd+ student doesn't even upload duplicate content.

---

## 4. Recall — how Reggie uses it (no vector RAG)

Reggie's context builder (`backend/server/services/brain-context-window.ts`, Gap 3) joins the student's enrolled courses → the shared library, using **summaries + concepts**, not embeddings:

```
courseIds = student's enrolled course_ids
library   = SELECT content_type, summary, concepts, text
            FROM course_content
            WHERE (university_id, course_id) IN (student's courses)
recall:   model routes over {summary, concepts} by INTENT → load full `text` for the chosen items
```

- This is the LLM-routed summary index from the prior discussion — but sourced from the **shared** library, so it compounds.
- **Improvement over the current spec stub:** the draft `getRubricForAssignment` uses `text ilike '%name%'` (filename/word matching — the exact thing that misses `Assignment_01`). Replace with concept/summary routing.
- Add vectors/`pgvector` **only** if one course's library outgrows the context window — then as a pre-filter, never the decider.
- **Model-agnostic:** recall returns a structured slice; Claude reasons today (Haiku for organize/route, Sonnet/Opus for tutoring). BriLLM is GPT-1-level/research — kept out of the tutor path; it would consume the same recall output if it ever matures.

---

## 5. "Click once, lives in your system, auto-updates" (the UX requirement)

- **Click once:** student installs + logs in (JWT issued, stored). Done.
- **Lives in your system:** the `chrome.alarms` background sync we already built — periodic wake, re-sync deltas whenever a portal tab is open. No OS daemon.
- **Auto-updates the agent:** every sync pushes through the backend → library + brain update → Reggie's next answer is current. Re-login refreshes the JWT and resyncs.

---

## 6. Reconciling with what we already built (migration path)

| Built now (`extension-aryan`) | Becomes |
|---|---|
| `lmsApiSync()` harvests Canvas/D2L/Moodle files | **Keep.** It's the capture layer. Split outputs: materials → `/content`, submissions/feedback → `/signal`. |
| Direct Supabase writes (anon key) from extension | **Replace** with backend API + JWT (Gap 2). Closes the open-RLS/anon-key breach. |
| `neuroagi.files` (per-user file rows + `content_text`) | **Re-home:** course materials → shared `public.course_content`; private submissions → brain. Drop per-user duplication of shared content. |
| `tutor-context` `file_lookup` (name/keyword ilike) | **Replace** with library recall (summary/concept routing) in `brain-context-window`. |
| Files page in app | **Keep,** but source it from `course_content` joined to enrolled courses. |
| `chrome.alarms` background sync | **Keep.** |

---

## 7. Where the current reality diverges from the spec — and what I recommend

These are real, and they block the clean design until resolved:

1. **Backend API doesn't exist yet** (`/api/extension/*` = Gap 2), and the extension currently talks straight to Supabase. → **Phase 0 builds the routes + JWT.** This is also the security fix (open RLS + public anon key today).
2. **Two-DB vs one-project.** Vincent's design assumes **two Supabase projects** (FschoolAI prod + Brain, via `FSCHOOL_*` / `BRAIN_*` env). Current production is **one project** (`wqgxpouhbwhwpzudrptp`) with `public` + `neuroagi` schemas, and our `.env`/Vercel were pointing at a **dead project** with a placeholder key.
   - **My recommendation:** for now, run **one Supabase project, separate schemas** — `public.course_content` (shared) + `brain.*`/`neuro.*` (personal) — with the backend API as the single writer bridging them. Split into two physical projects later, when the "personal brain travels on-device" hardware story actually needs it. One project removes a whole class of cross-DB sync bugs while preserving the logical boundary. (If the team wants two DBs now, fine — but fix the env/source-of-truth first; see #3.)
3. **Source-of-truth mess (must fix before anything stores content).** App/extension have flip-flopped `public` ↔ `neuroagi`; `.env`/Vercel pointed at the wrong project. **Pick one project + one schema per store and make every reader/writer agree.** See `AUDIT.md` and the env findings.
4. **`university_id` doesn't exist** on users/courses (Gap 8) and is required to scope the shared library. Add the column + extension hostname detection.
5. **Identity bridge** (`user_id`↔`person_id`, Gap 1) is unbuilt and blocks all brain writes. Build the bridge utility first.
6. **No Library Organizer** (Gap 6) — without it, content lands as raw text with no summary/concepts, so recall stays weak. It's small (one Haiku call per new item) and high-leverage.

---

## 8. Build phases (sequenced)

- **Phase 0 — Foundation & security:** backend `/api/extension/*` routes + JWT in the extension; identity bridge; pick one project + one schema per store; fix env/Vercel. *Closes the breach and unblocks everything.*
- **Phase 1 — Shared library:** `public.course_content` table + `university_id` detection + dedup-by-hash ingest + Library Organizer (summary/concepts). *Delivers compounding.*
- **Phase 2 — Recall:** library reads in `brain-context-window`; replace `file_lookup` ilike with summary/concept routing; wire as a tool. *Reggie actually uses course material.*
- **Phase 3 — Signals:** behavioral stream (`/api/extension/signal` → `brain.signals`); page/time/procrastination events. *The "brain signal emitter."*
- **Phase 4 — Intelligence:** cross-course `concepts`/`concept_links`; Professor Intelligence (`professor_id = sha256(university_id+professor_name)`). *The compounding insight layer.*

---

## 9. Open decisions for the team
1. **One Supabase project (schemas) now, or two physical DBs now?** (I recommend one now; split at hardware launch.)
2. **Where is the backend deployed** (Railway URL) so the extension can target it?
3. **Submissions:** store the student's own submitted files at all, or only signal that they submitted? (Privacy + storage cost.)
4. **Dedup course key:** normalized code (`PSYC201`, shares across sections) vs LMS course id (section-specific). Affects how broadly the library compounds.
```
