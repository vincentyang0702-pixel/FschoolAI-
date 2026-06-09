# Extension Architecture: From Data Sync to Compounding Brain Signal

**Owner:** Aryan Desai  
**Status:** v2 in progress on `extension/v2-aryan`  
**Last updated:** June 2026

---

## What This Document Is

This is the complete architecture guide for upgrading the FschoolAI Chrome extension from its current state — a hardcoded data sync tool — into a compounding intelligence system that feeds the NeuroAGI Brain. Read this before writing any new code.

---

## Current State: What's Wrong

The extension works, but it's a dead end. Here's every gap:

### Gap 1: Direct Supabase Access (Security Risk)

The extension currently talks directly to Supabase using a hardcoded anon key:

```javascript
// background.js — current (WRONG)
const SUPABASE_URL  = "https://wqgxpouhbwhwpzudrptp.supabase.co";
const SUPABASE_ANON = "sb_publishable_e-3KMudaL-iXf5GGsuiQaA_VW21ZZFA";
```

This means:
- The anon key is visible to anyone who installs the extension and inspects it
- No server-side validation — the extension can write anything to the DB
- No rate limiting, no audit trail, no ability to add business logic
- RLS (Row Level Security) is the only thing stopping abuse

### Gap 2: Claude API Calls Through Pratik's Personal Vercel

```javascript
// background.js — current (WRONG)
const res = await fetch("https://neuro-agi-topaz.vercel.app/api/claude", {
```

The extension is calling Claude through Pratik's personal Vercel project (`neuro-agi-topaz`). This is:
- Not your infrastructure — if Pratik's Vercel goes down, the extension breaks
- Not authenticated — anyone who finds this URL can call your Claude API for free
- Not the FschoolAI backend — it bypasses all your agents and brain services

### Gap 3: No Brain Signals Emitted

The extension writes to `courses`, `assignments`, and `grades` tables. That's it. The NeuroAGI Brain never hears from the extension. This means:

- When a student opens an assignment at 11pm the night before it's due — the brain doesn't know
- When a student visits the grades page 5 times in one day — the brain doesn't know
- When a student bounces off an assignment page after 30 seconds — the brain doesn't know
- All behavioral intelligence is lost

### Gap 4: No Shared Library — Every Student Fetches Everything

Every student who installs the extension fetches the same lecture slides, the same syllabus, the same rubrics — independently. There is no shared course content library. This means:

- 50 students in the same course = 50 identical Claude API calls to parse the same syllabus
- 50 copies of the same lecture text stored in the DB
- No cross-student intelligence — the brain can't learn professor patterns from multiple students' graded work
- No network effect — the 50th student gets no benefit from the first 49

### Gap 5: Auth Is Custom Email/Password, Not Supabase JWT

The popup has its own login system with SHA-256 password hashing. This is completely separate from the main app's Supabase Auth. This means:

- A student can be logged into the app and the extension with different accounts
- No single sign-on — students have to log in twice
- The extension's `userId` is a raw UUID from the `users` table, not a Supabase Auth UID
- Cannot use Supabase RLS policies that depend on `auth.uid()`

### Gap 6: Data Goes to Product DB Only — Brain Never Sees It

All synced data goes to `public.courses`, `public.assignments`, `public.grades` in the FschoolAI Production DB. The NeuroAGI Brain DB has a `fschool.assignments` table specifically for the brain's academic view — it is empty. The brain cannot reason about deadlines, course load, or grade trajectories because it has no data.

### Gap 7: No Content Capture — Only Metadata

The extension captures:
- Course name, code, score ✅
- Assignment name, due date, score ✅
- Grade value ✅

The extension does NOT capture:
- Syllabus text ❌
- Lecture slide content ❌
- Assignment rubric text ❌
- Professor feedback on graded work ❌
- Course announcements ❌

Without content, the AI Tutor cannot explain things in the context of the student's actual course. It gives generic answers instead of course-specific answers.

---

## The Target Architecture

### The Core Principle

> The extension is not a sync tool. It is a **brain signal emitter** that also happens to sync academic data.

Every action the student takes on their LMS is a signal. Every piece of content they encounter is a library item. The extension's job is to capture both and route them to the right place.

### Data Flow

```
Student browses their LMS
        │
        ▼
Extension content script detects page type
(courses / assignments / grades / syllabus / rubric / lecture / feedback)
        │
        ├──────────────────────────────────────────────────────────────┐
        │                                                              │
        ▼                                                              ▼
BEHAVIORAL SIGNAL                                           CONTENT CAPTURE
(what the student DID)                                    (what the page contains)
        │                                                              │
        ▼                                                              ▼
POST /api/signals                                    POST /api/extension/content
  { type: "assignment_viewed",                         { course_id, content_type,
    assignment_id, time_on_page,                         text, university_id }
    hour_of_day, days_until_due }                                      │
        │                                                              ▼
        ▼                                               Backend checks: already in library?
Brain DB: brain.signals                                 → YES: skip (dedup by content hash)
(personal — only this student)                          → NO: store + trigger brain analysis
                                                                       │
                                                               ┌───────┴───────────────────┐
                                                               │                           │
                                                               ▼                           ▼
                                                     FschoolAI DB                   Brain DB
                                                     course_content table           brain.knowledge
                                                     (shared library —              (shared course
                                                     same for all students          intelligence —
                                                     in this course)                professor style,
                                                                                    concept map)
```

---

## The Shared Library Model

### Why Shared

Course content is the same for every student in the course. The syllabus for PSYC 201 at University of Toronto is identical for all 200 students enrolled. There is no reason to fetch it 200 times or store 200 copies.

The library is **course-scoped and university-scoped**, not student-scoped.

### Deduplication by Content Hash

Before storing any content, the backend checks if it already exists:

```typescript
// Backend: /api/extension/content
const contentHash = sha256(course_id + content_type + text.slice(0, 500));

const existing = await db
  .from('course_content')
  .select('id')
  .eq('content_hash', contentHash)
  .single();

if (existing.data) {
  // Already in library — skip storage, skip Claude analysis
  // But still emit a signal that this student viewed this content
  return { status: 'exists', library_id: existing.data.id };
}

// New content — store and analyze
```

### The Network Effect

| Students Using FschoolAI at a University | Library Coverage |
|---|---|
| 10 students | Popular courses partially covered |
| 50 students | Most courses have syllabus + some lectures |
| 200 students | Complete library for all major courses |
| 1,000 students | Professor intelligence profiles built from hundreds of graded assignments |

The first student does the work. Every student after them gets the benefit instantly.

### What Goes in the Library

| Content Type | Trigger | Shared? | What Gets Stored |
|---|---|---|---|
| Syllabus | Student visits syllabus page | ✅ Yes | Full text, course_id, university_id |
| Lecture slides | Student visits lecture/module page | ✅ Yes | Full extracted text, week number |
| Assignment rubric | Student opens assignment details | ✅ Yes | Full rubric text, assignment_id |
| Course announcement | Student sees announcement | ✅ Yes | Full text, date |
| Professor feedback | Student views graded work | ❌ No — personal | Stored in personal brain signals only |
| Student's own grade | Canvas sync | ❌ No — personal | Stored in FschoolAI DB + brain signal |

### Library Database Schema

Add this table to FschoolAI Production DB:

```sql
CREATE TABLE course_content (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id   TEXT NOT NULL,         -- e.g. "uoft", "ubc", "mcmaster"
  course_id       TEXT NOT NULL,         -- e.g. "PSYC201" or Canvas course_id
  canvas_course_id TEXT,                 -- original LMS course ID
  content_type    TEXT NOT NULL,         -- "syllabus" | "lecture" | "rubric" | "announcement" | "module"
  content_hash    TEXT NOT NULL UNIQUE,  -- SHA-256 of (course_id + content_type + text[:500])
  text            TEXT NOT NULL,         -- full extracted text
  week_number     INTEGER,               -- for lectures: which week
  module_name     TEXT,                  -- for modules: module title
  source_url      TEXT,                  -- original LMS URL
  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
  seen_by_count   INTEGER DEFAULT 1      -- how many students have seen this content
);

CREATE INDEX idx_course_content_course ON course_content(university_id, course_id);
CREATE INDEX idx_course_content_hash ON course_content(content_hash);
CREATE INDEX idx_course_content_type ON course_content(university_id, course_id, content_type);
```

---

## Behavioral Signal Emission

### Every LMS Action Is a Signal

The extension must emit a signal to `/api/signals` for every meaningful student action on their LMS. These signals feed the Brain's 7-layer processing chain.

### Signal Types to Emit

| Student Action | Signal Type | Key Payload Fields | Brain Layer |
|---|---|---|---|
| Opens any assignment page | `assignment_viewed` | assignment_id, days_until_due, hour_of_day | Layer 1 |
| Spends >2 min on an assignment | `assignment_deep_read` | assignment_id, time_on_page_seconds | Layer 2 (Knowledge) |
| Bounces off assignment in <30s | `assignment_bounced` | assignment_id, days_until_due | Layer 4 (Prediction) |
| Opens grades page | `grades_checked` | hour_of_day, day_of_week | Layer 3 (Causal) |
| Opens grades page after submitting | `post_submit_grade_check` | assignment_id, time_since_submit | Layer 3 (Causal) |
| Visits same assignment 3+ times without submitting | `procrastination_loop` | assignment_id, visit_count, days_until_due | Layer 5 (Intervention) |
| Opens LMS at 11pm–4am | `late_night_session` | hour_of_day, pages_visited | Layer 5 (Intervention) |
| Opens syllabus page | `syllabus_viewed` | course_id, week_of_semester | Layer 1 |
| Views professor feedback on graded work | `feedback_viewed` | assignment_id, grade_received | Layer 2 (Knowledge) |
| Navigates to a new course page | `course_switched` | from_course_id, to_course_id | Layer 3 (Causal) |

### Signal Payload Format

```javascript
// extension/background.js — new signal emission
async function emitSignal(jwt, signalType, payload) {
  await fetch(`${BACKEND_URL}/api/signals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      type: signalType,
      source: 'chrome_extension',
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
        url: window.location?.href,
      }
    })
  });
}
```

### Time-on-Page Tracking

The content script must track how long the student spends on each page:

```javascript
// content/universal.js — add time tracking
let pageEnteredAt = Date.now();
let pageType = detectPageType(location.href);

window.addEventListener('beforeunload', () => {
  const timeOnPage = Math.round((Date.now() - pageEnteredAt) / 1000);
  if (pageType && timeOnPage > 5) {
    chrome.runtime.sendMessage({
      type: 'EMIT_SIGNAL',
      signalType: `${pageType}_time_spent`,
      payload: { time_on_page_seconds: timeOnPage, page_type: pageType }
    });
  }
});
```

---

## Authentication: Switch to Supabase JWT

### Current Problem

The extension has its own login system. Students log in separately from the main app. The extension uses a raw `user_id` UUID, not a Supabase Auth JWT.

### Target: Single Sign-On via Supabase Auth

The extension should use the same Supabase Auth session as the main app. When a student is logged into `fschool-ai.vercel.app`, the extension should automatically be authenticated.

### How Supabase Auth Works in a Chrome Extension

Supabase stores the session in `localStorage` on the web app's domain. The extension cannot read `localStorage` from another domain. The solution is:

**Option A (Recommended): Extension reads session from the app via a message**

The main app (`fschool-ai.vercel.app`) has a content script injected into it. When the extension needs a JWT, it asks the app's page for the current session token.

```javascript
// content/app-bridge.js — injected into fschool-ai.vercel.app only
// Listens for JWT requests from the extension background
window.addEventListener('message', (event) => {
  if (event.data?.type === 'FSCHOOLAI_GET_JWT') {
    const session = JSON.parse(localStorage.getItem('sb-wqgxpouhbwhwpzudrptp-auth-token') || '{}');
    window.postMessage({ type: 'FSCHOOLAI_JWT_RESPONSE', jwt: session?.access_token }, '*');
  }
});
```

**Option B: Extension has its own Supabase Auth login**

The popup uses `supabase.auth.signInWithPassword()` instead of the custom SHA-256 hash login. The session is stored in `chrome.storage.local`. This is fully independent of the web app but uses the same Supabase Auth system.

```javascript
// popup/popup.js — replace custom login with Supabase Auth
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // Store the JWT for use in background.js
  await chrome.storage.local.set({ 
    fschoolai_jwt: data.session.access_token,
    fschoolai_user: data.user 
  });
  return data.user;
}
```

**Recommendation:** Use Option B for v2. It's simpler, fully self-contained, and uses the same Supabase Auth as the main app. Option A can be added later for seamless SSO.

---

## Backend API Routes (What Aryan Needs from Johan)

All extension calls must go through the FschoolAI backend, not directly to Supabase. These routes already exist on `backend/dev`:

| Route | Method | Auth | What It Does |
|---|---|---|---|
| `/api/extension/sync` | POST | JWT | Receive structured LMS data (courses, assignments, grades) |
| `/api/extension/signal` | POST | JWT | Receive a behavioral signal, write to brain |
| `/api/extension/content` | POST | JWT | Receive page content, check library, store if new, trigger analysis |
| `/api/extension/status` | GET | JWT | Get sync status and library coverage for current user |

**New route needed:**

| Route | Method | Auth | What It Does |
|---|---|---|---|
| `/api/library/exists` | GET | JWT | Check if content hash already exists in library |

---

## Cross-Course Intelligence

### The Problem This Solves

Right now every course is a silo. The brain knows the student has PSYC 201 and STATS 101 but it does not know that the regression analysis in PSYC 201 is the same concept as Chapter 4 in STATS 101.

### How It Works

When a new library item is added (e.g., a PSYC 201 lecture on regression), the backend runs a cross-course connection job:

```typescript
// backend/server/services/cross-course-connector.ts (new service)
async function findCrossCoursConnections(newLibraryItem: CourseContent, studentId: string) {
  // 1. Get all courses this student is enrolled in
  const courses = await getStudentCourses(studentId);
  
  // 2. Get the concepts in the new library item
  const concepts = await extractConcepts(newLibraryItem.text);
  // e.g. ["regression analysis", "correlation", "p-value", "hypothesis testing"]
  
  // 3. Search the library for these concepts in other courses
  for (const concept of concepts) {
    const matches = await searchLibrary(concept, courses.map(c => c.course_id));
    
    for (const match of matches) {
      if (match.course_id === newLibraryItem.course_id) continue; // same course, skip
      
      // 4. Store the connection in the brain
      await brain.emit_signal(studentId, 'cross_course_connection', {
        concept,
        course_a: newLibraryItem.course_id,
        course_b: match.course_id,
        confidence: match.similarity_score,
      });
    }
  }
}
```

### What the AI Tutor Does With This

When the student asks "explain regression analysis" in PSYC 201:

1. Brain context window includes: `cross_course_connections: [{ concept: "regression", also_in: "STATS 101", chapter: 4 }]`
2. AI Tutor responds: "Regression analysis in PSYC 201 is the same concept you covered in Chapter 4 of STATS 101. Here's how it applies in a psychology context..."
3. Student gets a course-specific, personally-connected explanation — not a generic Wikipedia answer

---

## Compounding Student Performance

### What "Compounding" Means

Every assignment the student completes adds to a performance trajectory. The brain tracks not just the grade but the pattern:

| Data Point | What the Brain Learns |
|---|---|
| Assignment submitted 3 days early, got A | This student performs better with lead time |
| Assignment submitted 2 hours before deadline, got B- | Last-minute work correlates with lower grades for this student |
| Grade improved from 65% to 82% over 4 assignments in same course | Learning trajectory is positive — intervention not needed |
| Grade dropped from 88% to 71% over 3 assignments | Decline detected — trigger intervention |
| Student views grades page within 1 hour of every submission | High grade anxiety — factor into motivation approach |

### The Performance Signal

Every Canvas sync should emit a performance signal, not just write to the DB:

```javascript
// background.js — after ingestApiData completes
for (const assignment of assignments) {
  if (assignment.score !== null) {
    await emitSignal(jwt, 'assignment_graded', {
      assignment_id: assignment.canvas_assignment_id,
      course_id: assignment.course_id,
      score: assignment.score,
      max_score: assignment.max_score,
      percentage: assignment.score / assignment.max_score,
      submitted_at: assignment.submitted_at,
      due_at: assignment.due_at,
      days_early: daysBetween(assignment.submitted_at, assignment.due_at),
    });
  }
}
```

The brain's prediction engine reads these signals and builds a grade trajectory per course per student. After 5 data points, it can predict the student's final grade with reasonable accuracy.

---

## Build Plan for Aryan

### Phase 1: Fix the Foundation (Week 1)

These are blocking issues. Do these first.

1. **Replace direct Supabase calls with backend API calls.** Every `fetch` to `supabase.co` in `background.js` and `popup.js` must be replaced with a call to `${BACKEND_URL}/api/extension/*`.

2. **Replace the Claude proxy URL.** Change `https://neuro-agi-topaz.vercel.app/api/claude` to `${BACKEND_URL}/api/extension/content`. The backend handles Claude — the extension should not call Claude directly.

3. **Switch auth to Supabase Auth (Option B).** Replace the SHA-256 custom login in `popup.js` with `supabase.auth.signInWithPassword()`. Store the JWT in `chrome.storage.local`. Pass it as `Authorization: Bearer ${jwt}` on every backend call.

4. **Add `BACKEND_URL` as a config constant.** Never hardcode URLs. Use:
   ```javascript
   const BACKEND_URL = "https://fschoolai-backend.railway.app"; // or env-injected
   ```

### Phase 2: Add Behavioral Signals (Week 2)

5. **Add time-on-page tracking** in `content/universal.js`. Emit `*_time_spent` signal on page unload.

6. **Add visit counting** in `background.js`. Track how many times a student visits each assignment page. Emit `procrastination_loop` signal when count ≥ 3 with days_until_due ≤ 3.

7. **Add late-night detection.** When a sync or page visit happens between 10pm and 4am, emit `late_night_session` signal.

8. **Emit `assignment_graded` signal** after every Canvas sync that returns new grade data.

### Phase 3: Shared Library (Week 3)

9. **Add content type detection** in `content/universal.js`. Detect: syllabus, rubric, lecture/module, announcement, feedback.

10. **Add content hash check** before sending to backend. `GET /api/library/exists?hash=X` — if exists, skip the content POST but still emit a behavioral signal.

11. **Send content to `/api/extension/content`** for new library items. Include `university_id`, `course_id`, `content_type`, `text`, `source_url`.

12. **Backend: add `course_content` table** (schema above) and the `/api/library/exists` route.

13. **Backend: trigger brain analysis** on new library items. After storing, call Claude to extract concepts and write to `brain.knowledge` as shared course intelligence.

### Phase 4: Cross-Course Intelligence (Week 4)

14. **Backend: build `cross-course-connector.ts` service.** Runs after every new library item. Searches for concept overlaps across the student's enrolled courses.

15. **Brain context window: include cross-course connections.** When `brain-context-window.ts` builds the context snapshot, include the top 3 cross-course connections for the student's current courses.

16. **AI Tutor: surface connections in responses.** When the agent detects a concept that has a cross-course connection, include it in the response.

---

## What NOT to Change

- `content/universal.js` — the page detection and deep text extraction logic is solid. Keep it. Just add signal emission and content type detection on top.
- The Canvas API integration in `background.js` (`ingestApiData`) — it works correctly. Just rewire it to call the backend instead of Supabase directly.
- The auto-crawl logic — keep it. It's the right approach for D2L and Moodle.
- The shadow DOM piercing in `extractPageContentFn` — this is the right way to handle D2L's web components. Keep it exactly as is.

---

## Architecture Rule

> The extension is the brain's eyes and ears on the LMS. It sees what the student sees. It reports what the student does. It never makes decisions — it only observes and reports. All intelligence lives in the brain, not in the extension.

The extension should be dumb and fast. The backend and brain should be smart and persistent.

---

## Summary: Current vs Target

| Capability | Current (v1) | Target (v2) |
|---|---|---|
| Data destination | Direct Supabase (anon key) | Backend API (JWT auth) |
| Claude calls | Pratik's personal Vercel | FschoolAI backend |
| Auth | Custom SHA-256 email/password | Supabase Auth JWT |
| Brain signals | None | 10+ signal types on every LMS action |
| Course content | Not captured | Syllabus, lectures, rubrics, announcements |
| Library | None — every student fetches everything | Shared, deduped by content hash |
| Cross-course intelligence | None | Concept connections across all enrolled courses |
| Performance compounding | Snapshot only | Trajectory tracked per assignment over time |
| Professor intelligence | None | Built from shared rubric analysis + graded feedback |
| Network effect | None | Library grows with every student |


---

## The Agent Pipeline: How the Extension Connects to Every Agent

The extension is not just a data pipe. Every piece of content it captures and every signal it emits flows into a specific agent. This section maps the full pipeline so Aryan understands what happens downstream of every extension action.

### The Full Pipeline

```
EXTENSION
  │
  ├── Behavioral signals ──────────────────────────────────────────────────────►  BRAIN SIGNAL INGESTION
  │   (assignment_viewed, procrastination_loop,                                    brain.signals table
  │    late_night_session, grade_anxiety_check)                                    │
  │                                                                                ▼
  │                                                                         PATTERN RECOGNITION SERVICE
  │                                                                         (detects behavioral patterns)
  │                                                                                │
  │                                                                                ▼
  │                                                                         INTERVENTION ENGINE
  │                                                                         (decides when to nudge)
  │
  ├── Assignment/grade sync ───────────────────────────────────────────────►  CANVAS AGENT
  │   (courses, assignments, grades, due dates)                               (reads fschool.assignments,
  │                                                                            answers deadline questions)
  │                                                                                │
  │                                                                                ▼
  │                                                                         ASSIGNMENT AGENT
  │                                                                         (uses rubric from library
  │                                                                          to scaffold student work)
  │
  └── Course content ──────────────────────────────────────────────────────►  LIBRARY ORGANIZER AGENT (new)
      (syllabus, lecture slides, rubrics,                                     (extracts concepts,
       announcements, professor feedback)                                      tags content, writes
                                                                               to brain.knowledge)
                                                                                    │
                                                                    ┌───────────────┼───────────────────┐
                                                                    │               │                   │
                                                                    ▼               ▼                   ▼
                                                           PROFESSOR          LESSON              CROSS-COURSE
                                                           INTELLIGENCE       GENERATOR           CONNECTOR
                                                           (builds prof       (turns library      (links concepts
                                                            profile from       content into        across enrolled
                                                            rubrics +          personalized        courses)
                                                            feedback)          lessons)
```

### Agent Responsibilities: What Each Agent Does With Extension Data

#### Library Organizer Agent (New — Must Be Built)

**Trigger:** New item added to `course_content` table.

**What it does:**
1. Reads the raw text from the new library item
2. Calls Claude to extract: concepts covered, difficulty level, topic tags, week number
3. Writes structured knowledge to `brain.knowledge` as shared course intelligence
4. If `content_type = 'rubric'` or `content_type = 'feedback'` → triggers Professor Intelligence Agent
5. Triggers Cross-Course Connector to find concept overlaps with other courses

**File to create:** `backend/server/services/library-organizer.ts`

**Writes to:** `brain.knowledge` (shared, course-scoped), `brain.signals` (type: `library_item_processed`)

---

#### Professor Intelligence Agent (Specced, Not Yet Built)

**Trigger:** Library Organizer detects `content_type = 'rubric'` or `content_type = 'feedback'`.

**What it does:**
1. Reads the rubric or feedback text from the library
2. Extracts: grading criteria, what the professor penalizes, what they reward, format preferences
3. Aggregates patterns across multiple students in the same course (with consent)
4. Builds/updates a professor profile in `brain.reflections` (type: `professor_insight`)

**Key insight:** This agent gets smarter with every student. The first student who submits an assignment and gets feedback contributes one data point. The 50th student contributes the 50th data point — and by then the professor profile is highly accurate.

**File to create:** `backend/server/agents/professor-intelligence-agent.ts`

**Reads from:** `course_content` (rubrics, feedback), `brain.reflections` (existing professor profiles)

**Writes to:** `brain.reflections` (type: `professor_insight`), `brain.knowledge` (professor grading patterns)

---

#### Canvas Agent (Exists — Needs Expansion)

**Current state:** Passive — only answers questions about data already synced. Reads from `fschool.assignments`.

**What it needs to become:** Active fetcher that:
- Detects when a new assignment has been posted (compare Canvas API response vs stored data)
- Proactively notifies the student via the intervention engine
- Runs nightly to catch anything the extension missed
- Fills the gap between what the extension captured and what Canvas API knows exists

**File to update:** `backend/server/agents/canvas-agent.ts`

**New capability:** `detectNewAssignments(personId)` — compares `fschool.assignments` vs Canvas API, emits `new_assignment_posted` signal for anything not yet in the DB.

---

#### Assignment Agent (Exists — Needs Library Connection)

**Current state:** Has a `rubric` field in its context but no code to populate it. The rubric is always `undefined`.

**What it needs:** When triggered for a specific assignment, query the library:
```typescript
const rubric = await supabase
  .from('course_content')
  .select('text')
  .eq('course_id', assignment.course_id)
  .eq('content_type', 'rubric')
  .ilike('text', `%${assignment.title}%`)
  .single();
```

Then pass `rubric.text` into the agent context. Now the agent can actually tie feedback to rubric criteria.

**File to update:** `backend/server/agents/assignment-agent.ts`

---

#### Lesson Generator Agent (Specced, Not Yet Built)

**Trigger:** Brain detects a knowledge gap (pattern confidence < 0.5 for a concept that appears in an upcoming assignment).

**What it does:**
1. Reads the relevant library items for the concept (lecture slides, module text)
2. Reads the student's learning style from `neuro.patterns`
3. Generates a personalized lesson using the actual course content — not generic explanations
4. Calibrates difficulty based on the student's current mastery level

**Why the library is essential here:** Without the library, the Lesson Generator gives generic explanations. With the library, it says "In your PSYC 201 Week 3 lecture, Professor Chen explained regression this way..." — using the student's actual course language.

**File to create:** `backend/server/agents/lesson-generator-agent.ts`

**Reads from:** `course_content` (lectures, modules), `neuro.patterns` (knowledge gaps, learning style), `brain.knowledge` (concept map)

**Writes to:** `brain.signals` (lesson_generated, lesson_completed, lesson_score)

---

#### Cross-Course Connector (New — Must Be Built)

**Trigger:** Library Organizer adds a new lecture or module to the library.

**What it does:**
1. Extracts concepts from the new content
2. Searches the library for the same concepts in other courses this student is enrolled in
3. Stores the connection in `brain.knowledge`

**Example output:** `{ concept: "regression analysis", course_a: "PSYC201", course_b: "STATS101", chapter_b: 4, confidence: 0.87 }`

**File to create:** `backend/server/services/cross-course-connector.ts`

**Reads from:** `course_content` (all courses for this student), `brain.knowledge` (existing concept map)

**Writes to:** `brain.knowledge` (type: `cross_course_connection`)

---

### The Rule for Every Agent

> Every agent either reads from the library, writes to the brain, or both. No agent reads directly from the extension. No agent writes directly to the extension. The extension → library → brain → agent pipeline is one-way and non-negotiable.

---

## What Aryan Does Not Need to Build

The agents above are backend (Johan's responsibility). Aryan's job is to make sure the extension sends the right data to the right endpoints so the agents have something to work with. Specifically:

- Send content to `/api/extension/content` with correct `content_type` tags (`syllabus`, `rubric`, `lecture`, `feedback`, `announcement`)
- Include `university_id` derived from the LMS URL on every request
- Include `professor_name` when capturing rubrics or graded feedback (extract from page)
- Emit behavioral signals to `/api/extension/signal` for every meaningful LMS action

The rest is Johan's pipeline.
