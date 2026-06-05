# FschoolAI: Complete Feature & Agent Map
## Every UI Page → Every Feature → Every Agent → Compounding Status

**Date:** June 4, 2026  
**Audience:** CTO, Tech Intern, Product Team  
**Purpose:** This is the single source of truth for what to build, in what order, and how every agent must compound — not die after one response.

---

## THE CORE PRINCIPLE: What "Compounding" Means

A **compounding agent** writes to the Brain DB after every interaction. The next time it runs, it reads what it wrote before. It gets smarter. The student gets better responses on Day 100 than Day 1 — without the student doing anything differently.

A **dead agent** responds and forgets. It reads nothing from the past. Every session starts from zero. This is what most AI tutors do. This is what we must never do.

**The rule:** Every agent must read from Brain DB before responding, and write to Brain DB after responding. No exceptions.

---

## THE AGENT MANAGER ARCHITECTURE

The AI tutor (named by each student) is not one agent. It is a **coordinator** that routes to specialized sub-agents based on what the student needs. The student always hears one voice — their tutor's name — but behind it, the right specialist is activated.

```
Student message
      │
      ▼
┌─────────────────────────────────────────────────────┐
│              TUTOR COORDINATOR                       │
│  (reads brain context window first — always)        │
│  Routes to the right sub-agent based on intent      │
└─────────────────────────────────────────────────────┘
      │
      ├──► Study Agent         (explain concepts, teach)
      ├──► Assignment Agent    (essays, drafts, outlines)
      ├──► Canvas Agent        (grades, deadlines, courses)
      ├──► Focus Agent         (procrastination, burnout)
      ├──► Citation Agent      (sources, bibliography)
      ├──► Writing Intelligence (draft analysis, grade prediction)
      ├──► Lecture Agent       (in-class recording, transcription)
      ├──► Professor Agent     (what this prof wants)
      └──► Situation Synthesizer (cross-agent insights, proactive)
```

Every sub-agent:
1. Reads `brain.context_window` (pre-computed brain state)
2. Reads relevant `brain.signals`, `neuro.patterns`, `brain.reflections`
3. Generates response
4. Writes new signal to `brain.signals`
5. Triggers reflection engine (async, background)

---

## PAGE 1: HOME / DASHBOARD

### What the student sees
The main screen after login. The Neural Ring is the centerpiece — a circular visualization showing the student's brain state. Around it: today's priorities, active assignments, and the tutor chat entry point.

### Features on this page

| Feature | Description | Compounding? | Brain DB Tables Used |
|---|---|---|---|
| **Neural Ring** | Circular visualization of 8 brain signal types (behavioral, emotional, knowledge, context, outcome, temporal, social, biometric). Each segment pulses based on real data. | ✅ YES | `brain.signals`, `brain.context_window` |
| **Tutor greeting** | When student opens app, tutor says something specific to them ("You have an essay due in 3 days. Your last draft scored 74. Want to work on it?") | ✅ YES | `brain.context_window`, `brain.reflections`, `fschool.assignments` |
| **Today's priorities** | Auto-generated list of what matters most today, ranked by deadline + grade weight + student stress level | ✅ YES | `fschool.assignments`, `brain.signals`, `brain.context_window` |
| **Brain health score** | A single 0-100 score showing how well the brain knows this student. Increases as more data is collected. | ✅ YES | `brain.signals` count + diversity |
| **Quick chat entry** | One-tap to open tutor chat | — | — |

### Agents behind this page

**Situation Synthesizer** (background, runs every 30 min via scheduler)
- Reads: all `brain.signals` from last 24h, `fschool.assignments` due soon, `brain.reflections`, `neuro.patterns`
- Produces: `brain.context_window` — the pre-computed situation brief
- Writes: `brain.context_window` row, `brain.signals` (type: `situation_synthesis`)
- Compounding: ✅ YES — each synthesis reads previous syntheses. The tutor greeting on Day 100 is built on 100 days of syntheses.

**Canvas Watcher** (background, runs every 30 min)
- Reads: Canvas API for changes (new assignments, grade updates, syllabus changes)
- Writes: `fschool.assignments`, `fschool.grades`, `brain.signals` (type: `canvas_change`)
- Compounding: ✅ YES — tracks grade trajectory over time, detects patterns (always submits late, grades improving, etc.)

---

## PAGE 2: TUTOR CHAT

### What the student sees
A chat interface with their named AI tutor. Clean, conversational. The tutor knows who they are, what they're working on, and what they've struggled with before. Not a generic chatbot — a tutor that remembers everything.

### Features on this page

| Feature | Description | Compounding? | Brain DB Tables Used |
|---|---|---|---|
| **Personalized greeting** | Tutor opens with context-aware message, not "How can I help you?" | ✅ YES | `brain.context_window`, `neuro.memory` (tutor_name) |
| **Context-aware responses** | Every response is shaped by the student's brain profile — their learning style, past struggles, what worked before | ✅ YES | `brain.context_window`, `neuro.patterns`, `brain.reflections` |
| **Agent routing** | Tutor silently routes to the right sub-agent (study, assignment, focus, citation, etc.) based on what student asks | ✅ YES | `brain.signals` (intent logged) |
| **Signal capture** | Every message captures behavioral signals (typing speed, pause frequency, message length, time of day) | ✅ YES | `brain.signals` |
| **Session memory** | Tutor remembers what was discussed in this session AND previous sessions | ✅ YES | `agents.sessions`, `agents.messages` |
| **Proactive intervention** | If student hasn't opened app in 2 days and has a deadline tomorrow, tutor sends a push notification | ✅ YES | `brain.signals`, `fschool.assignments` |

### Agents behind this page

**Tutor Coordinator** (`brain-chat-session.ts` + `agent-orchestrator.ts`)
- Status: ✅ BUILT — this is the core chat pipeline
- Reads: `brain.context_window` (pre-computed), then routes
- Writes: `agents.messages`, `brain.signals` (type: `chat_message`)
- Compounding: ✅ YES

**Study Agent** (`study-agent.ts`)
- Status: ✅ BUILT (prompt injection logic complete)
- Triggered when: student asks to explain a concept, understand something, learn
- Reads: `brain.context_window` (prior knowledge, learning style, struggles)
- Writes: `brain.signals` (type: `concept_engagement`), `neuro.patterns` (if new pattern detected)
- Compounding: ✅ YES — knows what the student already understands, never re-explains mastered concepts

**Assignment Agent** (`assignment-agent.ts`)
- Status: ✅ BUILT (prompt injection logic complete)
- Triggered when: student asks for essay help, outline, draft review, structure
- Reads: `brain.context_window`, `fschool.assignments` (rubric, due date), past grades for this course
- Writes: `brain.signals` (type: `assignment_interaction`), `brain.reflections` (writing patterns observed)
- Compounding: ✅ YES — knows the student's writing evolution, what their professor rewards/penalizes

**Focus Agent** (`focus-agent.ts`)
- Status: ✅ BUILT (prompt injection logic complete)
- Triggered when: student expresses avoidance, overwhelm, procrastination, burnout
- Reads: `brain.signals` (stress level, session length), `neuro.patterns` (avoidance behavior)
- Writes: `brain.signals` (type: `focus_session`), `neuro.patterns` (if avoidance pattern confirmed)
- Compounding: ✅ YES — learns the student's specific procrastination triggers over time

**Citation Agent** (`citation-agent.ts`)
- Status: ✅ BUILT (prompt injection logic complete)
- Triggered when: student asks for sources, citations, bibliography, fact-checking
- Reads: `brain.context_window` (current assignment topic, citation style preference)
- Writes: `brain.signals` (type: `citation_request`)
- Compounding: ⚠️ PARTIAL — logs citation requests but does not yet build a "sources used" library per student

**Canvas Agent** (`canvas-agent.ts`)
- Status: ✅ BUILT
- Triggered when: student asks about grades, deadlines, courses, what's due
- Reads: `fschool.assignments`, `fschool.grades`, `fschool.courses`
- Writes: `brain.signals` (type: `canvas_query`)
- Compounding: ✅ YES — tracks which assignments the student asks about most (anxiety signal)

---

## PAGE 3: MY COURSES

### What the student sees
A list of their Canvas courses. Each course card shows: current grade, next assignment due, professor name, and a brain insight ("You perform 23% better in this course on Tuesday mornings"). Tapping a course opens the course detail view.

### Features on this page

| Feature | Description | Compounding? | Brain DB Tables Used |
|---|---|---|---|
| **Course list** | Synced from Canvas, shows all enrolled courses | — | `fschool.courses` |
| **Grade display** | Current grade per course, pulled from Canvas | — | `fschool.grades` |
| **Next deadline** | Nearest upcoming assignment per course | — | `fschool.assignments` |
| **Brain insight per course** | Personalized insight based on behavioral data ("You write better on weekday mornings") | ✅ YES | `brain.signals`, `neuro.patterns` |
| **Professor profile chip** | Shows what the professor rewards/penalizes based on past feedback | ✅ YES | `brain.reflections` (professor patterns) |
| **Grade trajectory** | Sparkline showing grade trend over the semester | ✅ YES | `fschool.grades` history |

### Agents behind this page

**Canvas Watcher** (same as Dashboard — keeps course data fresh)

**Professor Intelligence Agent** (background, runs after each graded assignment)
- Status: ⚠️ NOT YET BUILT — this is a priority build
- What it does: After a grade is posted, reads the professor's feedback and updates a professor profile in `brain.reflections`
- Reads: `fschool.grades` (new grade + feedback), past `brain.reflections` for this professor
- Writes: `brain.reflections` (type: `professor_pattern`) — "Prof Oswin penalizes thesis not in paragraph 1 (confidence: 0.88)"
- Compounding: ✅ YES — the more assignments graded, the more accurate the professor profile

---

## PAGE 4: ASSIGNMENTS

### What the student sees
All assignments across all courses, sorted by due date. Each assignment shows: title, course, due date, weight, current status, and a tutor action button ("Help me start this"). Overdue assignments are flagged. Assignments with AI assistance available are highlighted.

### Features on this page

| Feature | Description | Compounding? | Brain DB Tables Used |
|---|---|---|---|
| **Assignment list** | All assignments from Canvas, sorted by due date | — | `fschool.assignments` |
| **Status tracking** | Submitted, in progress, not started, overdue | — | `fschool.assignments` |
| **Grade weight display** | Shows how much each assignment affects final grade | — | `fschool.assignments` |
| **"Help me start" button** | One tap to open tutor chat pre-loaded with this assignment's context | ✅ YES | `fschool.assignments`, `brain.context_window` |
| **Grade prediction** | "Based on your writing patterns, you're on track for a B+" | ✅ YES | `brain.reflections`, `neuro.patterns` |
| **Submission timing alert** | "You typically submit 6 hours before deadline. You have 8 hours left." | ✅ YES | `neuro.patterns` (submission behavior) |

### Agents behind this page

**Writing Intelligence Agent** (triggered when student opens an assignment or submits a draft)
- Status: ⚠️ NOT YET BUILT — priority build
- What it does: Analyzes the student's draft against the rubric and professor profile
- Reads: `brain.context_window`, `brain.reflections` (professor patterns), past grades for this course
- Writes: `brain.signals` (type: `draft_analysis`), `brain.reflections` (writing patterns observed)
- Compounding: ✅ YES — builds an "intellectual portrait" over time: thesis placement, evidence quality, argument structure evolution

---

## PAGE 5: BRAIN / MY SECOND BRAIN

### What the student sees
A visualization of their personal brain data. Not raw data — translated into human language. Shows: what the brain knows about them, their learning patterns, their writing evolution, their professor profiles, their knowledge map. This is the "wow" page. The page that makes students never want to leave.

### Features on this page

| Feature | Description | Compounding? | Brain DB Tables Used |
|---|---|---|---|
| **Intellectual portrait** | "You write best on Tuesday mornings. Your thesis placement has improved from paragraph 3 to paragraph 1 over the semester. You avoid quantitative evidence." | ✅ YES | `brain.reflections`, `neuro.patterns` |
| **Knowledge map** | Visual map of concepts the student understands (green) vs gaps (red) | ✅ YES | `brain.signals` (concept_engagement type) |
| **Writing evolution timeline** | Graph showing how their writing has changed over time | ✅ YES | `brain.reflections` |
| **Professor profiles** | What each professor rewards and penalizes, built from real feedback | ✅ YES | `brain.reflections` (professor_pattern type) |
| **Brain health timeline** | How the brain has grown since Day 1 | ✅ YES | `brain.signals` count over time |
| **"Your second brain" claim** | When NeuroAGI hardware launches, student can claim this brain on their device | — | `neuro.persons` |

### Agents behind this page

**Reflection Engine** (`brain-reflection-engine.ts` + `autonomous-reflection-engine.ts`)
- Status: ✅ BUILT
- What it does: Background process that synthesizes signals into patterns and reflections
- Reads: `brain.signals` (last 7 days), `brain.reflections` (existing)
- Writes: `brain.reflections` (new insights), `neuro.patterns` (confirmed patterns)
- Compounding: ✅ YES — this is the core compounding engine

---

## PAGE 6: STUDY ROOMS (Aryan's Feature)

### What the student sees
A social study space. Students can create or join study rooms. Inside a room: real-time presence (who's studying), a shared focus timer, a leaderboard, and the AI tutor available in-room. Rooms can be public (anyone can join) or private (invite only).

### Features on this page

| Feature | Description | Compounding? | Brain DB Tables Used |
|---|---|---|---|
| **Room creation** | Create a study room with name, subject, public/private | — | `fschool.study_rooms` (to be created) |
| **Real-time presence** | See who is currently studying in the room (Cloudflare Durable Objects) | — | Real-time only |
| **Shared focus timer** | Pomodoro timer synced across all room members | — | Real-time only |
| **In-room AI tutor** | The AI tutor is available inside the room. Answers questions from any member. | ✅ YES | `brain.context_window` (per student) |
| **Room leaderboard** | Who studied longest today in this room | ✅ YES | `brain.signals` (study_session type) |
| **Global leaderboard** | Nerdmaxing, Late Night Maxing, Influencer Maxing — filterable by university, city, country | ✅ YES | `brain.signals` aggregated |

### Agents behind this page

**Focus Agent** (same as chat — activated in-room when student asks for focus help)

**Social Signal Capture** (new — needs to be built)
- What it does: When student studies in a room, logs a `study_session` signal to Brain DB
- Writes: `brain.signals` (type: `study_session`, duration, room_id, peers_present)
- Compounding: ✅ YES — builds social learning profile ("performs better when studying with peers")

---

## PAGE 7: LIBRARY / UPLOADS

### What the student sees
A personal library where students can upload lecture notes, PDFs, photos of handwritten notes, voice recordings. The AI tutor processes everything and connects it to their courses and assignments.

### Features on this page

| Feature | Description | Compounding? | Brain DB Tables Used |
|---|---|---|---|
| **File upload** | Upload PDF, image, audio, video | — | Storage (Supabase) |
| **Auto-classification** | Uploaded file is classified by course, topic, type | ✅ YES | `brain.signals` (library_upload type) |
| **Lecture recording** | Record audio in-class, auto-transcribed, key moments flagged | ✅ YES | `brain.signals`, `brain.reflections` |
| **Connection to assignments** | "This lecture note is relevant to your essay due Friday" | ✅ YES | `brain.context_window` |
| **Professor emphasis detection** | From lecture recordings: "Prof Oswin mentioned 'positionality' 4 times today" | ✅ YES | `brain.reflections` (professor_pattern) |

### Agents behind this page

**Lecture Recording Agent** (background, triggered on audio upload)
- Status: ⚠️ NOT YET BUILT — Phase 2 build
- What it does: Transcribes audio (Whisper), analyzes for key concepts and professor emphasis
- Reads: Past `brain.reflections` for this professor, `fschool.assignments` for this course
- Writes: `brain.signals` (type: `lecture_recording`), `brain.reflections` (professor_pattern updates)
- Compounding: ✅ YES — professor profile gets more accurate with every lecture recorded

**Library Organizer Agent** (background, triggered on any file upload)
- Status: ⚠️ NOT YET BUILT — Phase 2 build
- What it does: Classifies uploaded content, extracts concepts, updates intellectual portrait
- Reads: `brain.context_window`, `fschool.courses` (to classify by course)
- Writes: `brain.signals` (type: `library_upload`), `brain.reflections` (new concepts extracted)
- Compounding: ✅ YES

---

## PAGE 8: SETTINGS / PROFILE

### What the student sees
Account settings, tutor customization (name, personality), Canvas connection status, notification preferences, data privacy controls, and the "Your Second Brain" section showing what data the brain has collected.

### Features on this page

| Feature | Description | Compounding? |
|---|---|---|
| **Tutor name** | Set or change the name of their AI tutor | — |
| **Tutor personality** | Choose tutor communication style (direct, encouraging, Socratic, etc.) | ✅ YES — stored in `neuro.memory` |
| **Canvas connection** | Connect/reconnect Canvas account | — |
| **Notification settings** | When to receive proactive alerts from tutor | — |
| **Brain data export** | Download all brain data (GDPR compliance) | — |
| **Brain data delete** | Delete all brain data | — |
| **Second Brain claim** | When NeuroAGI hardware launches, claim this brain | — |

---

## THE COMPLETE AGENT ROSTER

### Agents That Are BUILT (code exists, needs wiring)

| Agent | File | Status | What Needs to Happen |
|---|---|---|---|
| Tutor Coordinator | `agent-orchestrator.ts` | ✅ Built | Wire to frontend chat UI |
| Brain Chat Session | `brain-chat-session.ts` | ✅ Built | Wire to frontend chat UI |
| Study Agent | `study-agent.ts` | ✅ Built | Wire to coordinator routing |
| Assignment Agent | `assignment-agent.ts` | ✅ Built | Wire to coordinator routing |
| Focus Agent | `focus-agent.ts` | ✅ Built | Wire to coordinator routing |
| Citation Agent | `citation-agent.ts` | ✅ Built | Wire to coordinator routing |
| Canvas Agent | `canvas-agent.ts` | ✅ Built | Wire to coordinator routing |
| Reflection Engine | `brain-reflection-engine.ts` | ✅ Built | Start the scheduler |
| Brain Scheduler | `brain-scheduler.ts` | ✅ Built | Start on server boot |
| Canvas Watcher | `canvas-sync.ts` | ✅ Built | Start on server boot |
| Context Window Builder | `brain-context-window.ts` | ✅ Built | Called by scheduler |
| Intervention Engine | `intervention-engine.ts` | ✅ Built | Wire to push notifications |
| Hypothesis Engine | `hypothesis-engine.ts` | ✅ Built | Wire to scheduler |

### Agents That Need to Be BUILT

| Agent | Priority | What It Does | Compounding Mechanism |
|---|---|---|---|
| **Professor Intelligence** | 🔴 HIGH | Reads graded feedback → builds professor profile | Writes `brain.reflections` (professor_pattern). Gets more accurate with every graded assignment. |
| **Writing Intelligence** | 🔴 HIGH | Analyzes drafts → grade prediction, writing evolution | Writes `brain.reflections` (writing_pattern). Tracks thesis placement, evidence quality, argument structure over time. |
| **Social Signal Capture** | 🟡 MEDIUM | Logs study room sessions to Brain DB | Writes `brain.signals` (study_session). Builds social learning profile. |
| **Lecture Recording** | 🟡 MEDIUM | Transcribes audio → professor emphasis detection | Writes `brain.reflections` (professor_pattern). Compounds with Canvas Watcher. |
| **Library Organizer** | 🟡 MEDIUM | Classifies uploads → connects to assignments | Writes `brain.signals` (library_upload). Builds concept library. |
| **Situation Synthesizer** | 🔴 HIGH | Cross-agent synthesis → proactive tutor greeting | Writes `brain.context_window`. This is the brain's "working memory". |

---

## THE COMPOUNDING CHAIN (How It All Connects)

This is the most important diagram. Every arrow represents data that compounds.

```
Student opens app
        │
        ▼
Canvas Watcher ──────────────────────────────────────────────────────┐
(every 30 min)                                                        │
Reads: Canvas API                                                     │
Writes: fschool.assignments, fschool.grades, brain.signals           │
        │                                                             │
        ▼                                                             │
Situation Synthesizer ◄──────────────────────────────────────────────┘
(every 30 min, reads everything)
Reads: brain.signals (24h), fschool.assignments, brain.reflections,
       neuro.patterns, fschool.grades
Writes: brain.context_window (the pre-computed brief)
        │
        ▼
Student sends message ──────────────────────────────────────────────┐
        │                                                            │
        ▼                                                            │
Tutor Coordinator                                                    │
Reads: brain.context_window (ALWAYS FIRST)                          │
Routes to sub-agent                                                  │
        │                                                            │
        ├──► Study Agent                                             │
        │    Reads: context_window + concept history                 │
        │    Writes: brain.signals (concept_engagement)              │
        │                                                            │
        ├──► Assignment Agent                                        │
        │    Reads: context_window + professor profile               │
        │    Writes: brain.signals (assignment_interaction)          │
        │                                                            │
        ├──► Writing Intelligence                                    │
        │    Reads: context_window + writing history                 │
        │    Writes: brain.reflections (writing_pattern)             │
        │                                                            │
        └──► [other agents...]                                       │
                                                                     │
        ▼                                                            │
Reflection Engine ◄──────────────────────────────────────────────────┘
(background, triggered after each session)
Reads: brain.signals (new ones), brain.reflections (existing)
Writes: neuro.patterns (confirmed patterns), brain.reflections (new insights)
        │
        ▼
Next session: brain.context_window is RICHER
Student gets BETTER response
Brain compounds ✅
```

---

## WHAT NOT TO BUILD YET

The following are in the master spec but should NOT be built until after launch:

| Feature | Why Not Yet |
|---|---|
| Neo4j graph database | Supabase JSONB handles the knowledge graph for now. Add Neo4j at 10,000 users. |
| Pinecone vector search | Not needed until semantic search across student content is required. |
| Redis cache | `brain.context_window` table serves as the cache. Add Redis at scale. |
| Blockchain data portability | Future NeuroAGI hardware feature. |
| Biometric signals (heart rate, etc.) | Requires NeuroAGI hardware. |
| Multi-region deployment | After 1,000 users. |
| Prediction engine | After 6 months of data. |
| Knowledge graph visualization | After Library Organizer is built. |

---

## BUILD ORDER FOR THE TEAM

### Week 1–2: Get the Existing Backend Live
1. Push Vercel frontend code into `frontend/` folder in this repo
2. Run `backend/migrations/001_add_brain_person_id.sql` on FschoolAI Production DB
3. Set env vars: `BRAIN_SUPABASE_URL`, `BRAIN_SUPABASE_SERVICE_KEY`, `FSCHOOL_SUPABASE_URL`, `FSCHOOL_SUPABASE_ANON_KEY`
4. Start the backend server
5. Start the brain scheduler (makes context window pre-computed)
6. Wire the frontend chat UI to the backend chat endpoint

### Week 3–4: Tutor Naming + Core Chat
1. Build tutor naming screen (first login onboarding)
2. Wire Study Agent, Assignment Agent, Canvas Agent to coordinator
3. Build My Courses page with brain insights
4. Build Assignments page with "Help me start" button

### Week 5–6: Professor Intelligence + Writing Intelligence
1. Build Professor Intelligence Agent (reads graded feedback → updates `brain.reflections`)
2. Build Writing Intelligence Agent (draft analysis → grade prediction)
3. Build Brain / My Second Brain page (show intellectual portrait)

### Week 7–8: Study Rooms
1. Build Cloudflare Durable Objects for real-time presence
2. Build study room UI
3. Wire Social Signal Capture to Brain DB
4. Build leaderboard (Nerdmaxing, Late Night Maxing, Influencer Maxing)

### Week 9+: Library + Lecture Recording
1. Build file upload UI
2. Build Lecture Recording Agent (Whisper transcription)
3. Build Library Organizer Agent
4. Connect uploads to assignment context

---

## THE TEST: Is This Agent Compounding?

Before shipping any agent, ask these 4 questions:

1. **Does it read `brain.context_window` before responding?** If no → fix it.
2. **Does it write to `brain.signals` after responding?** If no → fix it.
3. **Does the Reflection Engine eventually read what it wrote?** If no → fix it.
4. **Is the student's Day 100 response meaningfully better than Day 1?** If no → redesign it.

If all 4 are yes: the agent compounds. Ship it.

---

*This document should be updated every time a new agent is built or a new feature is added.*  
*Owner: CTO*  
*Last updated: June 4, 2026*
