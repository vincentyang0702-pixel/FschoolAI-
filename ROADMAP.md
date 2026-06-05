# FschoolAI Build Roadmap

This is the ordered build plan. Work through it in sequence. Do not skip ahead — each sprint builds on the previous one.

**Current status is marked on every item. Do not rebuild things that are already done.**

---

## Architecture in One Sentence

The student talks to their personally-named AI Tutor. The Agent Manager reads the brain context window and routes the message to the right specialist agent. The brain scheduler runs in the background, continuously updating the student's intelligence snapshot. The frontend never knows which agent ran.

---

## What Is Already Done

The following are fully built and deployed. Do not touch them unless fixing a bug.

**Backend Infrastructure**
- Express server with JWT auth on all routes
- Brain scheduler (runs context window refresh, reflections, interventions on cron)
- Context window builder (pre-computes brain snapshot — chat starts in <50ms)
- Canvas sync (pulls Canvas data every 30 min, emits brain signals)
- Signal ingestion (normalizes all events into `brain.signals`)
- Agent orchestrator (routes all chat to the right agent)
- Voice TTS streaming (ElevenLabs Turbo, real-time streaming, voice customization)
- Feedback route (session ratings)
- Brain realtime (listens to DB events, triggers interventions)

**Agents Built**
- Assignment Agent — "Help me start" feature, rubric analysis
- Study Agent — flashcards, study guides, from uploaded notes
- Focus Agent — session tracking, attention monitoring, break suggestions
- Citation Agent — APA/MLA/Chicago citation generation
- Canvas Agent — Canvas-specific queries (grades, deadlines, missing work)

**Database**
- FschoolAI Production DB: `users`, `canvas_data` tables with `brain_person_id` and `canvas_user_id` columns
- NeuroAGI Brain DB: `brain.signals`, `brain.reflections`, `brain.context_windows`, `brain.hypotheses`, `brain.interventions`
- Migrations 001 and 003 applied

---

## Sprint 1 — Make the Home Page Alive (Week 1–2)

These two agents make the product feel intelligent from the first second a student opens the app.

### 1.1 Situation Synthesizer Agent `backend/dev`

**Spec:** `agents/situation-synthesizer.md`

Generates the tutor greeting on the home page. Reads the last 24h of brain signals + upcoming deadlines + social context → produces a personalized, time-aware greeting with the right tone (urgent, encouraging, or celebratory).

**What to build:**
- `backend/server/agents/situation-synthesizer.ts`
- Register in `agents/index.ts`
- The Agent Manager already routes `page: "home"` — just make sure the agent is registered

**Frontend contract:** See `FRONTEND_BACKEND_CONTRACT.md` → Page: HOME section.

### 1.2 Token Engine Agent `backend/dev`

**Spec:** `agents/token-engine.md`

Awards tokens for validated student actions (on-time submission, completed study session, early submission, helping a classmate). Manages tier progression (Standard → Enhanced → Premium → Elite). This makes every action feel consequential.

**What to build:**
- `backend/server/agents/token-engine.ts`
- DB migration: `backend/migrations/004_token_engine.sql` — add `tokens` and `tier` columns to `users` table
- Register in `agents/index.ts`

---

## Sprint 2 — Core Intelligence (Week 3–4)

### 2.1 Professor Intelligence Agent `backend/dev`

**Spec:** `agents/professor-intelligence.md`

Analyzes professor grading patterns from Canvas submission history. Generates a "professor profile card" per assignment — grading style, what they penalize, what they reward. Shows as a badge on assignment cards.

### 2.2 Exam Predictor Agent `backend/dev`

**Spec:** `agents/exam-predictor.md`

Predicts the student's grade per assignment based on current performance trajectory, submission history, and course patterns. Shows as a predicted grade badge on assignment cards. Updates in real-time as Canvas data changes.

### 2.3 Lesson Generator Agent `backend/dev`

**Spec:** `agents/lesson-generator.md`

Creates personalized micro-lessons from detected knowledge gaps in the brain. Runs on page load for the Study page. Generates 3–5 "For you today" lesson cards tailored to what the student is struggling with right now.

---

## Sprint 3 — Social Layer (Week 5–6)

### 3.1 Social Intelligence Agent `backend/dev`

**Spec:** `agents/social-intelligence.md`

Calculates study compatibility scores between students. Powers the "Sarah is studying Thermo right now" nudges on the home page and the social layer on the leaderboard.

### 3.2 Study Room Orchestrator `backend/dev`

**Spec:** `agents/study-room-orchestrator.md`

Manages multi-student AI tutoring sessions. When two students are in the same study room, the AI Tutor adapts to both students' brain contexts simultaneously.

### 3.3 Leaderboard Agent `backend/dev`

**Spec:** `agents/remaining-agents.md` (leaderboard section)

Calculates weekly rankings based on tokens earned, study hours, and streak. Handles opt-in/opt-out privacy.

### 3.4 Motivation Engine Agent `backend/dev`

**Spec:** `agents/motivation-engine.md`

Detects motivation drops from signal patterns (late submissions, shortened study sessions, avoidance patterns). Sends personalized interventions via the brain intervention delivery system.

---

## Sprint 4 — Deep Intelligence (Week 7–8)

### 4.1 Writing Evolution Tracker `backend/dev`

Analyzes how the student's writing quality changes over time. Tracks vocabulary growth, argument structure, citation quality. Shows on the Brain page as a writing growth timeline.

### 4.2 Knowledge Graph Builder `backend/dev`

Builds a dynamic knowledge graph from all brain signals — what the student knows, what they're shaky on, how concepts connect across courses. Visualized on the Brain page.

### 4.3 Content Connector `backend/dev`

Links outside content (YouTube videos, articles, social media the student has consumed) to current coursework. Surfaces connections during study sessions ("This connects to what you watched last week").

### 4.4 UI Preference Agent `backend/dev`

Stores and applies interface customizations from chat commands. Student says "make the font bigger" or "switch to dark mode" — the agent writes the preference to the brain and the frontend applies it on next load.

### 4.5 Voice Preference Agent `backend/dev`

**Spec:** `agents/voice-preference-agent.md`

Detects voice change intent in any message ("sound more like a professor", "be more casual"). Generates a custom voice via ElevenLabs Voice Design API. Stores the voice ID in the brain. The voice pipeline in `backend/server/routes/voice.ts` is already built — this agent just needs to trigger it.

---

## Frontend Build Order `frontend/dev`

Build pages in this order. Each page has a full design spec in `design/pages/`.

| Order | Page | Design Spec | Backend Contract |
|---|---|---|---|
| 1 | Onboarding (Canvas connect + brain setup) | `design/pages/00-ONBOARDING.md` | `FRONTEND_BACKEND_CONTRACT.md` → Onboarding |
| 2 | Home (tutor greeting + priority card) | `design/pages/01-HOME.md` | `FRONTEND_BACKEND_CONTRACT.md` → HOME |
| 3 | Assignments | `design/pages/02-ASSIGNMENTS.md` | `FRONTEND_BACKEND_CONTRACT.md` → ASSIGNMENTS |
| 4 | Study (lessons + flashcards + focus timer) | `design/pages/03-STUDY.md` | `FRONTEND_BACKEND_CONTRACT.md` → STUDY |
| 5 | Canvas (grades + course overview) | `design/pages/04-CANVAS.md` | `FRONTEND_BACKEND_CONTRACT.md` → CANVAS |
| 6 | Brain (second brain visualization) | `design/pages/05-BRAIN.md` | `FRONTEND_BACKEND_CONTRACT.md` → BRAIN |
| 7 | Social + Leaderboard | `design/pages/06-SOCIAL.md` + `07-LEADERBOARD.md` | `FRONTEND_BACKEND_CONTRACT.md` → SOCIAL |
| 8 | Study Rooms | `design/pages/08-STUDY-ROOMS.md` | `FRONTEND_BACKEND_CONTRACT.md` → STUDY-ROOMS |

**Read the design spec AND the backend contract before building any page.** The design spec tells you what to render. The contract tells you what API call to make and what JSON you'll get back.

---

## The One Thing That Must Never Change

Every AI interaction goes through `POST /api/agent-manager`. The frontend sends `{ page, student_id, action?, context? }` and gets back `{ type, content, signals? }`. The frontend never calls individual agents directly. This is the contract that makes the whole system work.
