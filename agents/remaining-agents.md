# Remaining Agent Specs (Condensed)

These agents have shorter specs because they are either already built or are simpler in scope.

---

## Leaderboard Agent

**Priority:** Sprint 3 | **Status:** 🔴 NOT BUILT | **Pages:** LEADERBOARD

**Purpose:** Calculates rankings across 8 categories, detects gaming, awards weekly bonuses.

**Categories:** Nerdmaxing (study hours), Grindmaxing (assignments on time), Late Night Maxing (10pm-4am study), Social Maxing (friends helped + rooms hosted), Brain Maxing (knowledge graph growth), Streak Maxing (consecutive days), Token Maxing (tokens earned this week), Influencer Maxing (referrals + groups created).

**Logic:**
- Runs daily at midnight: recalculates all rankings
- Weekly Monday reset: awards bonus tokens to top 3 per category
- Filters: university, city, country, course, friend group, global
- Anti-gaming: validates all data against brain.signals (can't fake study hours)

**Writes to:** `fschool.leaderboard` (new table), `brain.signals` (ranking changes)

---

## Focus Agent

**Priority:** Sprint 4 | **Status:** 🔴 NOT BUILT | **Pages:** STUDY

**Purpose:** Tracks attention during study sessions. Detects when focus drops. Suggests optimal break timing based on the student's personal attention patterns.

**Logic:**
- Monitors: time between interactions, scroll patterns, tab switches (if detectable)
- Learns: this student's optimal session length (some are 25 min, some are 45 min)
- Intervenes: "You've been at it for 35 min and your pace is slowing. Take a 5-min break?"
- After break: "Ready? Let's do 20 more minutes on the hard section."

**Writes to:** `brain.signals` (session_duration, focus_score, break_taken)

---

## Content Connector

**Priority:** Sprint 4 | **Status:** 🔴 NOT BUILT | **Pages:** STUDY, CHAT

**Purpose:** Links content the student consumes outside of school to their coursework. Makes learning feel connected to real life.

**Logic:**
- Student shares a link/video/article (or brain detects from integrations)
- Agent analyzes content → finds connections to current courses
- Surfaces: "That SpaceX video uses the same F=ma you're studying in Physics 201"

**Writes to:** `brain.signals` (type: 'content_connection')

---

## Writing Evolution Tracker

**Priority:** Sprint 4 | **Status:** 🔴 NOT BUILT | **Pages:** BRAIN, CHAT

**Purpose:** Analyzes every piece of writing the student submits. Tracks growth over time. Shows them their intellectual evolution.

**Logic:**
- On every assignment submission: analyze writing complexity, vocabulary, clarity, citation accuracy
- Store metrics as time-series in brain.signals
- Generate monthly "writing report" as brain.reflection
- Surface on BRAIN page as timeline visualization

**Writes to:** `brain.signals` (writing_metrics), `brain.reflections` (writing_evolution_report)

---

## Knowledge Graph Builder

**Priority:** Sprint 4 | **Status:** 🔴 NOT BUILT | **Pages:** BRAIN

**Purpose:** Renders a dynamic, interactive knowledge graph from `neuro.patterns`. Shows the student what they know and how concepts connect.

**Logic:**
- Reads all patterns for this student
- Each pattern = a node (concept)
- Connections between patterns = edges
- Node size = mastery level (from signal frequency + quiz scores)
- New nodes appear after study sessions (visible growth)
- Clicking a node shows: when you learned this, how strong you are, what connects to it

**Reads from:** `neuro.patterns`, `brain.signals`

---

## UI Preference Agent

**Priority:** Sprint 4 | **Status:** 🔴 NOT BUILT | **Pages:** ALL (via CHAT)

**Purpose:** Stores and applies interface customizations requested through the chat. The student says "make it darker" and the UI changes.

**Logic:**
- Parses chat messages for UI modification intent
- Stores preferences in `neuro.memory` (key: 'ui_preferences')
- Frontend reads preferences on load and applies them
- Logs customization as signal (tells brain about personality)

**v1 capabilities:** Background color/theme, layout density, show/hide sections, font size
**v2 capabilities:** Component arrangement, custom widgets, page order, animation preferences

**Writes to:** `neuro.memory` (ui_preferences), `brain.signals` (ui_customization)

---

## Reflection Engine

**Priority:** Sprint 1 (already built) | **Status:** ✅ BUILT | **Pages:** BRAIN, CHAT

**Existing code:** `brain-reflection.ts`

**Purpose:** Runs every 6 hours. Reads recent signals. Finds patterns. Writes reflections (insights about the student that no single signal reveals).

**Already does:**
- Reads last N signals
- Groups by type and course
- Generates reflections using LLM
- Stores in brain.reflections

**Needs:** Deployment (Brain Scheduler must be running)

---

## Signal Ingestion

**Priority:** Sprint 1 (already built) | **Status:** ✅ BUILT | **Pages:** ALL (background)

**Existing code:** `signal-ingestion.ts`

**Purpose:** Receives raw events from any source (Canvas, chat, study sessions, UI interactions) and normalizes them into `brain.signals`.

**Already does:**
- Accepts events via function call
- Normalizes into signal format
- Writes to brain.signals

**Needs:** Env var fix (done) + deployment

---

## Brain Scheduler

**Priority:** Sprint 1 (already built) | **Status:** ✅ BUILT | **Pages:** ALL (background)

**Existing code:** `brain-scheduler.ts`

**Purpose:** Cron job that triggers: context window rebuild (every 30 min), reflection engine (every 6 hours), Canvas sync (every 30 min).

**Already does:**
- Scheduled task execution
- Calls context window builder
- Calls reflection engine
- Calls Canvas watcher

**Needs:** Deployment on a persistent server (not serverless)

---

## Canvas Watcher

**Priority:** Sprint 1 (already built) | **Status:** ✅ BUILT | **Pages:** CANVAS, ASSIGNMENTS

**Existing code:** `canvas-sync.ts`

**Purpose:** Syncs Canvas data every 30 min. Detects new assignments, grade changes, deadline changes. Emits signals for every change.

**Already does:**
- OAuth connection to Canvas
- Pulls courses, assignments, grades
- Stores in fschool.* tables
- Emits signals for changes

**Needs:** Env var fix (done) + deployment + OAuth token refresh

---

## Study Agent

**Priority:** Sprint 2 | **Status:** 🟡 PARTIAL | **Pages:** STUDY, CHAT

**Existing code:** `brain-study.ts` (basic)

**Purpose:** Generates study material (flashcards, study guides, practice problems) from uploaded course material, calibrated to the student's level.

**Currently does:**
- Basic flashcard generation from uploaded content

**Needs to do:**
- Calibrate difficulty to student's level (from context window)
- Generate in student's preferred format (from learning style)
- Track which cards are mastered vs need review (spaced repetition)
- Connect to Lesson Generator for integrated study flow
