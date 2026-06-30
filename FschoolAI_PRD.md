# FschoolAI — Product Requirements Document (PRD)
**Version:** 2.0  
**Date:** June 29, 2026  
**Author:** Vincent Yang, FschoolAI  
**Audience:** Engineering team — Tencent engineer, Bytedance engineer, Aryan, Ryan, Vincent

> **v1.5 additions (§12–§17):** dual-database architecture (NeuroAGI Brain DB vs FschoolAI Production DB) + `person_id ↔ user_id` bridge; stateful-brain / stateless-agents model; the complete agent roster (main + background + sub-agents) reconciling the 15 numbered agents with `agents/*` and `FEATURE_AND_AGENT_MAP.md`; the API & frontend–backend contract; the full Chrome extension architecture; and the backend gap register with proposed resolutions. These sections are synthesized from the repo's technical docs (`ARCHITECTURE_V2_STATEFUL_STATELESS.md`, `CURRENT_ARCHITECTURE.md`, `BACKEND_GAPS.md`, `API_DOCUMENTATION.md`, `FRONTEND_BACKEND_CONTRACT.md`, `EXTENSION_ARCHITECTURE.md`, `LIBRARY_ARCHITECTURE.md`, `MEMORY_ARCHITECTURE.md`, `agents/*`); inline `(source: …)` citations point to the originating doc.

> **v1.6 addition (§18):** defines NeuroAGI as the **parent brain platform** (FschoolAI is one branch product of many) and the **merged brain architecture** — all technical decisions follow `neuroagi-core` **v2** (the minimal memory-log + bus + cortex kernel), while **v1** contributes only feature *concepts* (skill verification/credentials, learning style, brain health dashboard) re-implemented as v2 derived layers. §18 then **connects** this brain to the FschoolAI PRD via an explicit primitive-mapping table. Where §18 and §12 differ, §18 (v2 target) governs; §12 describes the current transitional Supabase deployment. The six conflicts this surfaced are reconciled **inline** at their source (look for "Merged-brain note" callouts in §3.1, §3.4, §3.5.2, §3.6, §6, §7, and §15), not only here.

> **v1.7 addition:** §18.1 now states the **topology and division of responsibility** (per engineering direction) — `neuro-agi ↔ fschool (main agent) ↔ subagents`: internal scenarios stay closed-loop inside FschoolAI, and NeuroAGI's role is narrowed to exactly three jobs (route intent, augment context, facilitate bidirectional interaction). Reinforced at Agent 1 (Reggie = the main-agent node) and in the §18.4 mapping.

> **v2.0 — architecture-review merge (§19):** folds in the four documents produced after v1.9 (June 27–28). **NeuroAGI / CTO side:** `en-final-backend-technical-architecture.md` (the target *product-backend* architecture — LangGraph **Agent Server** + DeepAgents + FastAPI + A2A, an Application Control Plane over an Agent Execution Plane) and `readthis.md` (the **built** FschoolAI_v2 acceptance — Python / LangGraph / FastAPI / sqlite on `neuroagi-core` **v2**, all 17 scenarios end-to-end, 56/56 harness checks). **FschoolAI Step-1 side:** `fschoolai_step1_scenario_plan.md` (the 17-scenario catalog + C0–C4 latency model + edge taxonomy + eval-fixture contract) and `fschoolai_step1_tools_breakdown.md` (the capability / tool surface). §19 records **build status**, the **target backend architecture and its phasing** (doc1 = target; the built v2 = Phase 1), the **scenario catalog**, the **capability surface**, and this review's **resolved decisions**. The §18 brain contract is **unchanged and still governs**; §19 only refines §3.5.2 (arbiter), §7 (stack), §9 (latency), §12.3 (retrieval boundary), and §15 (contract) where noted.

> **v1.8 — conflict resolutions:** each merged-brain conflict was decided in favour of the optimal approach and applied to the source text (not left as a side-note): **data model** → single `memory` log (§6); **Signal Arbiter** → `cortex.policy`, don't reinvent (§3.5.2); **proactive queues** → outbox memories + channel (§3.5.2/§6); **decay** → core day-one mechanism (§3.6 table); **knowledge graph** → derived layer gated on *data sufficiency*, not infrastructure (§3.6 retitled + reframed); **brain API** → canonical product contract is `/api/agent-manager`, canonical brain interface is the v2 primitives, granular `/api/brain/*` RPC deprecated as a public contract (§15.2); **person bridge** → brain uses a text `subject`, no FK into product tables (§12.4); **§18.4** Intervention/agent rows rewritten so NeuroAGI routes+arbitrates and FschoolAI runs the closed loop. The **Social / Leaderboard / Study-Rooms** scope contradiction (§11) is **resolved as in-scope** (they are already coded on `frontend/dev`); the deferral was removed, with the §14 cohort/leaderboard privacy review retained as the only gate.

---

## 1. Product Vision

FschoolAI is the **personal academic intelligence** for every student. It is not a generic AI chatbot. It is not a homework helper. It is a persistent, living brain that knows each student individually — their learning style, their knowledge gaps, their deadlines, their stress level, their history — and uses that knowledge to help them from where they are to where they need to be.

The core principle is: **the AI adapts to the student, not the student to the AI.**

Every student is unique. A student at Carleton studying engineering has different gaps, different pressures, and different ways of learning than a student at UCLA studying pre-med. FschoolAI treats each student as a unique individual, not a user type.

At signup, a **student second brain** is created for each user. This brain is theirs. It grows with every session — every question asked, every assignment completed, every lecture attended. When NeuroAGI hardware launches, the student claims their brain on the device. Until then, the brain lives in the cloud and is accessible through FschoolAI.

---

## 2. Target Users

FschoolAI is built for university and college students globally, with initial focus on North America. The product must be immediately useful to an international student who is not a native English speaker, a first-generation university student with no academic support network, and a high-achieving student who wants to go beyond what their institution provides.

The product must be so useful that students are willing to pay for it personally — not wait for their school to buy it.

---

## 3. Core Architecture

### 3.1 The Student Brain

Every student has a brain object stored in the NeuroAGI brain layer. This is a persistent, structured knowledge graph about the student. It is the foundation that every agent reads from and writes to.

> **Merged-brain note (§18):** In the target NeuroAGI **v2** brain, this `StudentBrain` object is not a set of stored fields — it is a **view assembled from `recall`** over the append-only memory log, and the knowledge graph is a **derived layer** (recomputable), not a primary store. Read the schema below as the *shape FschoolAI consumes*, not the brain's physical tables.

```
StudentBrain {
  student_id: string
  learning_style: "visual" | "auditory" | "reading" | "kinesthetic" | "mixed"
  knowledge_nodes: KnowledgeNode[]       // what the student knows and gaps
  course_context: CourseContext[]        // current courses, assignments, deadlines
  stress_level: float (0.0–1.0)         // inferred from behaviour patterns
  session_history: Session[]            // all past interactions
  performance_signals: Signal[]         // quiz scores, time-on-task, confusion events
  preferences: Preferences              // communication style, response length, language
  upcoming_deadlines: Deadline[]        // from Canvas sync
  created_at: timestamp
  last_updated: timestamp
}
```

### 3.2 Agent Architecture

There are two distinct agent patterns. Using the wrong pattern for a given agent is a design error.

**Pattern A — Request/Response (interactive agents)**
Used by: Reggie, Tutor, Canvas, Planner, Lecture, Library, Exam Mode, Audio, Office Hours, Calendar, Terminal.

```
Step 1:  context = brain.read(student_id)
Step 2:  result  = agent_logic(user_input, context)
Step 3:  brain.write(student_id, signal)
```

**Pattern B — Watch/Arbitrate/Deliver (background/proactive agents)**
Used by: Intervention Agent, Reflection Agent, Cohort Agent.
These agents do NOT wait for user input. They watch for events or run on schedule, evaluate whether an intervention is worth sending, and deliver through the Signal Arbiter.

```
Step 1:  watch  — subscribe to brain_signals via Supabase Realtime OR run on cron schedule
Step 2:  evaluate — compute whether an intervention candidate is worth creating
Step 3:  arbitrate — write candidate to proactive_signals queue (Signal Arbiter decides delivery)
```

Agents do not store state themselves. All state lives in the brain. This means any agent can be replaced or upgraded without losing the student's history.

### 3.3 Phase 1 — Mock Brain (Build Now)

During Phase 1, agents use a local mock context object instead of calling the NeuroAGI brain API. This allows all agents to be built and tested immediately without waiting for the brain layer.

```json
{
  "student_id": "mock_001",
  "learning_style": "visual",
  "knowledge_gaps": ["integration by parts", "organic mechanisms"],
  "stress_level": 0.6,
  "upcoming_deadlines": [
    { "course": "CHEM 201", "assignment": "Lab Report 3", "due": "2026-06-25" }
  ],
  "preferred_language": "en",
  "session_count": 14
}
```

### 3.4 Phase 2 — Live Brain (After Ryan's API is ready)

Replace the mock context with:

```typescript
const context = await brain.read(student_id)
// ... agent logic ...
await brain.write(student_id, signal)
```

No other change to any agent is required.

> **Merged-brain note (§18.4):** In the v2 brain, `brain.read(student_id)` resolves to `recall(subject = person_id, …)` and `brain.write(student_id, signal)` to `remember({kind:"signal", …}, subject)` (or `bus.ingest`). The `brain.read` / `brain.write` abstraction stays as written — §18 just defines what it resolves to underneath.

### 3.5 Proactivity Infrastructure

This section defines the infrastructure that allows FschoolAI to act on behalf of the student without waiting for them to open the app. It is the backbone of all background and proactive agents.

#### 3.5.1 Trigger / Event Runtime

Two mechanisms fire background agents. Both must be implemented.

**Event-driven (real-time):** Supabase Realtime listens for `INSERT` events on the `brain_signals` table via `pg_notify`. When a new signal is written (e.g., Canvas Agent writes a `stress_signal` after detecting 3 deadlines in 48 hours), the event runtime fires the relevant background agents immediately. A grade posted at 3pm cannot wait until the 2am Reflection run — it must trigger the Intervention Agent within minutes.

**Scheduler (cron):** Time-based triggers for agents that need to run on a fixed schedule regardless of events. Examples: Reflection Agent at 2am nightly, Canvas sync every 6 hours, spaced-repetition reminders at the student's preferred study time.

```typescript
// Event-driven trigger (Supabase Realtime)
supabase
  .channel('brain_signals')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'brain_signals' }, 
    (payload) => triggerRuntime.dispatch(payload))
  .subscribe()

// Cron trigger (example)
cron.schedule('0 2 * * *', () => reflectionAgent.runForAllStudents())
```

#### 3.5.2 Signal Arbiter

The Signal Arbiter is the most important missing piece in a naive proactive system. Without it, multiple background agents fire simultaneously and the student receives a flood of notifications that they immediately disable.

> **Merged-brain note (§18.4):** In the NeuroAGI v2 brain the Signal Arbiter **is** the `cortex.policy` gate (quiet hours / daily budget / cooldown / importance + urgent bypass). Build FschoolAI's arbiter **on that gate** — do not re-implement debounce, ranking, and rate-limiting from scratch. The `proactive_signals` and `notification_queue` tables described below map to `kind="outbox"` memories selected by the gate and delivered via the `channel`.

**How it works:**
1. Every background agent that wants to reach the student writes a **candidate signal** to the `proactive_signals` queue — it does NOT send a notification directly.
2. The Arbiter is **triggered by writes to `proactive_signals`**, not by a polling cron. When a new candidate is written for a student, a 2–3 minute debounce window opens. Any additional candidates for the same student written within that window are batched together. After the window closes, the Arbiter runs once for that student's batch.
3. For each student batch, it reads all pending candidates, then:
   - **Deduplicates** — removes redundant candidates (e.g., two agents both flagging the same deadline)
   - **Ranks** — scores each candidate by `urgency × value`. Urgency = time sensitivity. Value = estimated benefit to the student.
   - **Enforces rate limits** — maximum 3 proactive messages per student per day. Maximum 1 per hour.
   - **Enforces quiet hours** — no delivery between 11pm and 8am unless the student has overridden this.
   - **Selects** — approves the top-ranked candidate(s) and writes them to `notification_queue`.
4. Rejected candidates are discarded or deferred to the next cycle.
5. A **low-frequency safety sweep cron** (once per hour) scans for candidates whose `expires_at` has passed without being processed — this handles edge cases where the event trigger was missed. It does NOT process all students on every run.

The Arbiter is the confidence gate. Nothing reaches the student without passing through it.

**Implementation note:** The debounce is implemented as a short-lived lock per `student_id` in Redis or Supabase. On the first write for a student, set a lock with a 2-minute TTL and schedule the Arbiter run. Subsequent writes within the TTL extend the window by 1 minute (max 3 minutes total). This prevents the all-students sweep that a polling cron would require at scale.

#### 3.5.3 Delivery Layer

Approved notifications in `notification_queue` are delivered through one of four channels based on urgency and student preference:

| Channel | When to use | Service |
|---|---|---|
| In-app banner | Student is active in the app | Supabase Realtime push to frontend |
| Push notification | Student has app installed, not currently active | Firebase Cloud Messaging (FCM) |
| SMS | High-urgency, student not reachable by push | Twilio SMS API |
| Email | Low-urgency summaries, weekly reports | Resend or SendGrid |

**Delivery tracking:** Every notification records `delivered_at`, `opened_at`, and `action_taken` (did the student act on it?). This data feeds the effectiveness feedback loop.

**Quiet hours:** Configurable per student. Default: no delivery 11pm–8am. SMS is never sent during quiet hours regardless of urgency.

#### 3.5.4 Effectiveness Feedback Loop

The hard-coded thresholds in the Intervention Agent (stress > 0.8, 3+ sessions, etc.) are starting values only. They must be tuned per student over time.

**Mechanism:**
- Every `intervention_accepted` signal (student engaged with the notification) is a positive label.
- Every `intervention_delivered` with no action within 2 hours is a negative label.
- After 20 labelled examples per student, the system adjusts that student's thresholds: if they consistently ignore stress-level interventions but respond to deadline interventions, the stress threshold is raised and the deadline threshold is lowered.
- Per-channel tuning: if a student never opens push notifications but always responds to SMS, the delivery layer learns to prefer SMS for that student.

#### 3.5.5 Cold-Start Mode

On Day 1, the brain is empty. Behavioural triggers (stress level, confusion patterns, session history) have no data to fire on. The system must not be silent on Day 1.

**Degraded mode (Day 1 through Day 7):**
- **Deadline-based proactivity is available as soon as an LMS is connected.** On the Canvas OAuth path, data is synced at signup and the Intervention Agent can fire deadline reminders from the first hour. On the extension path (any LMS, §16.8), deadlines arrive as the student browses their LMS during onboarding (auto-crawl), so reminders begin once the first crawl completes rather than being guaranteed within the first hour. If no LMS is connected yet, deadline proactivity is inactive until one is.
- **Behavioural proactivity is gated** — stress level, confusion detection, and pattern-based triggers are disabled until a baseline exists (minimum: 5 sessions + 7 days of data).
- **Learning style proactivity is gated** — adaptive explanation format is set to a neutral default until the learning style assessment is complete.

The UI must not show empty states as errors. During cold-start, show: "I'm learning how you work. The more you use FschoolAI, the more personalised I become."

### 3.6 Graph-Dependent Behaviours — Gated on Data Sufficiency (the graph is a derived layer)

**Critical distinction:** The `StudentBrain` schema in §3.1 describes a typed knowledge graph with `knowledge_nodes`, prerequisite edges, and confidence scores. The Phase 1 mock brain (§3.3) and the `brain_context` Supabase table are flat JSON — a `knowledge_gaps` array and a `stress_level` float. These are not the same thing.

**Resolution (v1.8).** Under the merged v2 brain (§18.2) the knowledge graph is a **derived layer over the memory log** — recomputable at any time, not a separate database we wait on. So the behaviours below are **not gated on infrastructure** ("when the graph brain ships") but on **data sufficiency** — enough accumulated signals/confidence for the derived graph to be trustworthy. Build each as a derived-layer read that activates once its data threshold is met; the fallbacks below remain correct while data is thin:

| Behaviour | Why it's gated (data, not infrastructure) | Fallback while data is thin |
|---|---|---|
| Prerequisite checking ("do they understand the product rule before integration by parts?") | Requires typed prerequisite edges between knowledge nodes | Tutor Agent checks for prerequisite by asking the student directly: "Before I explain this, do you know X?" |
| "Prerequisite mastered > 0.85" positive trigger (Intervention Agent) | Needs per-node confidence, which the derived layer produces only after enough evidence | **Disable until data-sufficient.** Keep it out of the Intervention Agent's trigger table until the derived graph has enough per-concept confidence to be reliable. |
| Knowledge node decay (concepts not revisited in 30+ days lose confidence) | Derived from per-node confidence + last-reviewed, which the derived layer computes from the memory log | **Available day one** — forgetting (`salience × time`, 14-day half-life) is a *core* v2 mechanism; the derived knowledge layer inherits decay from the decaying memory log. No separate per-concept timestamp tracking needed. |
| Cross-course knowledge graph visualisation (Max tier) | Needs cross-course concept links — a derived-layer output | Activates once cross-course data exists; show a placeholder in the Max dashboard until then. |

> **Resolved (v1.8, §18.2):** the two v2 corrections — decay is core/day-one, and the graph is a derived layer gated on data sufficiency rather than infrastructure — are now applied directly to the heading, intro, and table above.

**Schedule warning:** §8 lists "Replace mock brain with live NeuroAGI API" as a Week 6 task. This is aspirational, not a firm dependency. The NeuroAGI brain is an active research stack — the graph layer, multi-hop traversal, and confidence scoring are not guaranteed to be production-ready on a fixed date. All agents must be designed to function with the flat mock indefinitely. The Phase 2 brain swap is a progressive enhancement, not a hard launch blocker.

**For Ryan:** The flat mock is the contract. Any behaviour that requires more than `learning_style`, `knowledge_gaps[]`, `stress_level`, `upcoming_deadlines[]`, `preferred_language`, and `session_count` must be explicitly flagged as graph-dependent and gated. Do not design agent logic that silently breaks when the graph is unavailable.

---

## 4. Agent Specifications

### Agent 1 — Reggie (Orchestrator)

**Owner:** Vincent  
**Environment:** All — Reggie is the entry point for every student interaction  
**Priority:** P0 — must be built first, all other agents depend on it

**What it does:** Reggie receives the student's message, reads the brain context, decides which specialist agent to call, passes the message and context to that agent, and returns the response to the student. Reggie is the router and the face of FschoolAI.

> **Topology note (§18.1):** Reggie is the **"fschool (main agent)"** node in the platform chain. NeuroAGI routes intent and augments context *to* Reggie; Reggie then orchestrates the specialist **subagents** (§14) and closes the loop inside FschoolAI. Reggie's routing is product-internal orchestration; NeuroAGI's intent-routing is the upstream "what does the user want / which direction" signal that feeds it.

**Input:** Student message (text, voice, image)  
**Output:** Response from the appropriate specialist agent

**Routing logic:**

| Student message type | Routes to |
|---|---|
| "Explain this concept" / "I don't understand X" | Tutor Agent |
| "What do I have due?" / "Show my schedule" | Canvas Agent + Planner Agent |
| "Help me study for my exam" | Exam Mode Agent |
| "Make a study plan for this week" | Planner Agent |
| "Summarise this lecture" | Lecture Agent |
| "Find me resources on X" | Library Agent |
| "I'm stressed / overwhelmed" | Intervention Agent |
| "Translate this" | Audio Agent |
| Ambiguous | Reggie asks one clarifying question, then routes |

**Brain signals written after each session:**
- `session_type`: what kind of help was requested
- `session_duration`: how long the session lasted
- `topics_discussed`: list of subjects covered

---

### Agent 2 — Canvas Agent

**Owner:** Aryan  
**Environment:** Canvas LMS integration  
**Priority:** P0 — foundational data source for all other agents

**What it does:** Connects to the student's Canvas account via OAuth. Syncs all courses, assignments, due dates, grades, and syllabus documents. Stores this data in FschoolAI's Supabase database. Alerts the student about upcoming deadlines and missing work.

> **Scope note (per §16.8):** the Canvas Agent is the *fast path* for Canvas specifically, not the only ingestion route. In the universal ingestion model it is one **accelerator**: it pulls clean structured data via the Canvas API, while the browser extension (§16.8) is the universal substrate that covers other LMS, behavioral signals, and attached-file capture. Where both are present, the API supplies structured deadlines/grades and the extension supplies behavior, content, and files.

**Canvas data pulled:**
- All enrolled courses (current semester)
- All assignments per course (title, due date, points, submission status)
- All grades (current score, letter grade, course average)
- Syllabus documents (PDF/HTML)
- Announcement feed
- Professor contact information

**Sync schedule:** Every 6 hours automatically. On-demand when student opens FschoolAI.

**Alerts generated:**
- Assignment due in less than 24 hours — push notification
- Assignment due in less than 72 hours — in-app banner
- Grade posted — in-app notification
- Missing assignment — weekly summary

**Brain signals written:**
- `course_list`: current courses
- `upcoming_deadlines`: next 14 days of assignments
- `grade_summary`: current standing per course
- `stress_signal`: if 3+ assignments due within 48 hours → stress_level += 0.2

**Syllabus lookahead (required):** After syncing the syllabus, the Canvas Agent must extract the weekly topic schedule from the syllabus document and store it as structured data in `course_content`. This enables the Planner Agent and Tutor Agent to know what topics are coming up in the next 1–2 weeks — not just what is due, but what will be taught. The Intervention Agent can then fire a proactive trigger: "You have stereochemistry coming up in CHEM 201 next week and your brain shows a gap there. Want to review it now?" Without syllabus lookahead, proactive preparation is impossible.

**Bring-your-own past material:** Students who transfer from another institution or who have past course materials (notes, old exams, textbooks) can upload them to FschoolAI. The Canvas Agent is not responsible for this — it is a separate upload flow in the UI. Uploaded materials are stored in `course_content` with `source = 'student_upload'` and are available to the Tutor Agent and Lesson Generator as grounding context. This is a Phase 1 feature — do not defer it to Phase 2.

**Note for Aryan:** Canvas uses OAuth 2.0. The student authorises FschoolAI to read their Canvas data. FschoolAI never stores the Canvas password. The Canvas API token is stored encrypted in Supabase.

---

### Agent 3 — Tutor Agent

**Owner:** Tencent engineer  
**Environment:** Chat / Study Session  
**Priority:** P0 — core product, primary reason students pay

**What it does:** This is the heart of FschoolAI. The Tutor Agent answers academic questions, explains concepts, identifies what the student does not understand, and adapts its explanation style to the student's learning profile. It does not just answer — it teaches.

**Key behaviours:**

**Adaptive explanation:** The Tutor Agent reads the student's learning style from the brain and adjusts its response format accordingly.

| Learning style | Response format |
|---|---|
| Visual | Diagrams described in text, tables, step-by-step with visual structure |
| Auditory | Conversational, narrative, "imagine you are explaining to a friend" |
| Reading | Dense text, definitions, citations, structured paragraphs |
| Kinesthetic | Examples first, then theory, "try this yourself" prompts |

**Knowledge gap detection:** When the student asks a question, the Tutor Agent identifies whether the question reveals a deeper gap. If the student asks "why does integration by parts work?", the agent checks whether they understand the product rule first. If not, it teaches the prerequisite before answering the original question.

**Socratic mode:** For questions that are clearly graded homework or exam questions, the Tutor Agent does not give the answer directly. It asks guiding questions that lead the student to the answer themselves. **This is NOT configurable for graded assignments** — the student cannot turn off Socratic mode for questions that are identifiable as graded work (i.e., the question matches an open assignment in Canvas with a future due date). Socratic mode can be turned off only for practice problems, past assignments, and conceptual questions that are not tied to a graded deliverable. This is an academic integrity guardrail, not a preference setting.

**Simplification levels:** Content must be adjustable to the student's level. International students and students who are not native English speakers need simpler language. The agent detects this from the student's communication style and adjusts automatically.

**Input:** Student question (text or image of problem)  
**Output:** Explanation, worked example, follow-up question, or resource recommendation

**Brain signals written:**
- `topic_studied`: subject and concept
- `confusion_detected`: boolean — did the student express confusion?
- `gap_identified`: specific knowledge gap found
- `session_quality`: inferred from follow-up questions and engagement
- `explanation_format_used`: which format was used, for future optimisation

---

### Agent 4 — Planner Agent

**Owner:** Bytedance engineer  
**Environment:** Study Planner / Dashboard  
**Priority:** P1

**What it does:** Builds personalised weekly study schedules based on the student's deadlines, available time, subject difficulty, and current stress level. The plan is not generic — it is specific to this student's brain context.

**Planning inputs (all from brain context):**
- Upcoming deadlines (from Canvas Agent)
- Current stress level
- Knowledge gaps (which subjects need more time)
- Historical study patterns (when does this student actually study?)
- Student's stated available hours

**Plan output format:**

```
Monday June 23:
  9:00–10:30  CHEM 201 — Stereochemistry review (gap identified)
  14:00–15:00 MATH 204 — Practice integration by parts (gap identified)
  19:00–20:00 Essay outline for ENGL 301 (due June 26)

Tuesday June 24:
  ...
```

**Adaptive replanning:** If the student misses a study block, the Planner Agent detects this (no activity during scheduled time) and automatically reschedules the missed work into the next available slot. It does not nag — it silently adjusts.

**Brain signals written:**
- `study_plan_created`: date and week covered
- `plan_adherence`: percentage of planned blocks completed
- `reschedule_count`: how many times the plan was adjusted

---

### Agent 5 — Lecture Agent

**Owner:** Aryan  
**Environment:** Chrome Extension / In-class  
**Priority:** P1

**What it does:** Captures lecture audio through the Chrome extension, transcribes it in real time, generates a structured summary, identifies key concepts, and creates flashcards and quiz questions from the lecture content. The student gets a complete lecture package within minutes of the lecture ending.

**Lecture package output:**
- Full transcript (searchable)
- Summary (3–5 key points)
- Concept list (terms defined)
- Flashcard set (auto-generated)
- 5 quiz questions (multiple choice + short answer)
- Connections to existing brain knowledge ("This concept relates to what you studied last week in CHEM 201")

**Note for Aryan:** The Chrome extension captures audio from the student's microphone (in-class) or from a browser tab (online lecture). The recorded lecture is transcribed post-session with **self-hosted Whisper large-v3** (handles English, Spanish, French, and Mandarin; fine-tunable on an academic corpus). The transcript and summary are stored in Supabase and linked to the student's brain; the agent's existing LLM pass produces the summary, concept list, flashcards, and quiz, so a provider's built-in chaptering is not required.

**Brain signals written:**
- `lecture_attended`: course, date, duration
- `concepts_introduced`: list of new concepts from this lecture
- `lecture_summary_generated`: boolean

---

### Agent 6 — Library Agent

**Owner:** Bytedance engineer  
**Environment:** Resource Library  
**Priority:** P2

**What it does:** When the student needs resources — textbook chapters, academic papers, YouTube explanations, practice problems — the Library Agent finds and curates them. It does not return a generic Google search. It returns resources matched to the student's learning style, current knowledge level, and specific gap.

**Search behaviour:**
- Reads the student's learning style from brain context
- Reads the specific knowledge gap being addressed
- Returns 3–5 resources ranked by relevance and quality
- Includes a one-sentence explanation of why each resource was chosen

**Resource types:**
- Khan Academy videos (visual learners)
- Academic papers (reading learners)
- Practice problem sets (kinesthetic learners)
- Podcast episodes / audio explanations (auditory learners)
- YouTube explanations (all types)

**Brain signals written:**
- `resource_recommended`: resource type and topic
- `resource_clicked`: whether the student opened the resource

---

### Agent 6b — Lesson Generator (Brain-Grounded Video)

**Owner:** Aryan (pipeline) + Tencent engineer (script generation)  
**Environment:** Max tier only — gated at $20/month  
**Priority:** P2 (Phase 1 Max tier launch feature)

**What it does:** Generates a short personalised video lesson (2–4 minutes) for a specific concept the student is struggling with. This is not a generic explainer video. The script is built entirely from the student's brain context — their specific knowledge gap, their lecture transcript for the relevant course, their syllabus, and the professor's terminology. "A video built from your CHEM 201 lecture and the exact step you got wrong twice" is the product. A generic explainer is a commodity.

**Brain-grounded script generation (required, not optional):**
The script generator must use all of the following as input context:
- The student's specific knowledge gap (from `brain_context.knowledge_gaps`)
- The lecture transcript for the relevant course (from Lecture Agent output)
- The course syllabus (from Canvas Agent)
- The professor's terminology and examples (extracted from lecture transcript)
- The student's learning style (from `brain_context.learning_style`)
- The specific question or problem the student got wrong (from `session_history`)

A script generated without this context is not acceptable. If the lecture transcript is not available, the Lesson Generator must prompt the student to record a lecture first before generating the video.

**Pipeline (async):**
```
Step 1:  Script generation — GPT-4o/Claude Sonnet, brain-grounded (30–60 seconds)
Step 2:  Animation/visual generation — Manim or similar (60–120 seconds)
Step 3:  TTS voiceover — ElevenLabs (10–20 seconds)
Step 4:  Render and stitch (30–60 seconds)
Step 5:  Deliver via notification_queue: "Your CHEM 201 stereochemistry video is ready"
```

**Async delivery (required):** Video generation takes 2–5 minutes end-to-end. This breaks the 3-second NFR in §9. Video generation is explicitly exempt from the 3-second NFR. The student triggers generation and receives a notification when the video is ready. The UI shows a progress indicator. Latency budget: < 5 minutes from trigger to delivery notification.

**Segment-level regeneration:** The pipeline must be chunked so a single segment can be re-run without rebuilding the whole video. The decision for Phase 1 is: **pre-generated branching** (cheaper, faster to build). The script is divided into 3–5 segments. Each segment is rendered independently. When the student requests a change ("explain this part differently"), only the relevant segment is re-generated and re-rendered. True segment regeneration (re-running the full pipeline for one segment) is the Phase 2 upgrade.

**Cohort amortisation (cost control):** When the Cohort Agent detects that 10+ students in the same course section are confused about the same concept, it triggers a shared video generation job. The core asset (script + animation + voiceover) is generated once. The personalisation layer (intro referencing the student's specific mistake, outro referencing their next deadline) is generated per-student. This reduces the per-video cost from ~$1.00 to ~$0.15 for cohort-triggered videos. The Lesson Generator must support a `cohort_mode: true` flag that separates the core asset generation from the personalisation layer.

**Brain signals written:**
- `video_generated`: concept, course, duration
- `video_watched`: boolean, percentage watched
- `video_segment_regenerated`: which segment was re-run

---

### Agent 7 — Exam Mode Agent

**Owner:** Vincent  
**Environment:** Exam Preparation  
**Priority:** P1

**What it does:** When the student has an exam coming up, Exam Mode Agent creates a personalised exam preparation plan. It identifies the highest-priority topics based on the student's knowledge gaps, generates practice questions, simulates exam conditions, and tracks progress toward exam readiness.

**Exam prep flow:**
1. Student says "I have an exam in CHEM 201 in 3 days"
2. Agent reads brain context: knowledge gaps, past quiz performance, time available
3. Agent generates a 3-day prep plan prioritising the student's weakest areas
4. Agent generates 20 practice questions (mix of difficulty levels)
5. Student completes practice questions — agent evaluates answers
6. Agent updates the plan based on performance: if student struggles with topic X, add more practice on X
7. Day before exam: final review summary — "You are strong on A and B. Focus your last hour on C."

**Brain signals written:**
- `exam_prep_started`: course and exam date
- `practice_questions_completed`: count and score
- `exam_readiness_score`: 0–100 estimated readiness
- `weak_areas_at_exam_time`: final gap list before exam

---

### Agent 7b — Exam Predictor + Grade What-If Calculator

**Owner:** Vincent  
**Environment:** Grade analytics — reads from Canvas Agent data  
**Priority:** P1  
**Tier:** Pro and Max

**What it does:** Two related capabilities surfaced as a single panel in the student dashboard.

#### Exam Predictor

Given the student's current course grade, assignment weights from the syllabus, and their `exam_readiness_score` from Agent 7, the Exam Predictor estimates the grade range the student is likely to achieve on an upcoming exam and the resulting final course grade. It is not a guarantee — it is a probability-weighted estimate designed to answer the question: "If I keep studying at this pace, what grade am I likely to get?"

**Inputs (all pulled automatically from Canvas Agent + Exam Mode Agent):**
- Current weighted grade in the course
- Assignment weights from the syllabus (Canvas sync)
- Upcoming exam weight
- Student's `exam_readiness_score` (0–100) from Agent 7
- Historical performance on similar assessments (from `brain_signals`)

**Output:** A predicted exam score range (e.g., "Based on your readiness score and past performance, you are likely to score 68–78% on this exam") and the resulting final grade range (e.g., "This puts your final grade at B– to B+").

**Model:** GPT-4o-mini with structured output. The prediction is a heuristic estimate, not a statistical model. It must be clearly labelled as an estimate in the UI — never presented as a certainty.

**Important constraint:** The Exam Predictor must not be shown until the student has at least one graded assignment in the course (cold-start guard). With zero grade data, the prediction is meaningless and must not be displayed.

#### Grade What-If Calculator

A student-facing interactive tool. The student inputs hypothetical scores on upcoming assignments and exams, and the calculator shows in real time how each scenario affects their final course grade. This is the "what do I need to get on the final to pass?" feature every student wants.

**Inputs (student-controlled):**
- Hypothetical score on any upcoming graded item (slider or text input)
- The calculator pre-fills with the Exam Predictor's estimated score as a starting point

**Output:** Updated final grade projection, recalculated live as the student adjusts inputs.

**Implementation:** Client-side calculation using the assignment weight schema from Canvas Agent. No LLM call required — this is pure arithmetic over the Canvas grade data. The Canvas Agent must expose a `grade_weights` object per course for this to work.

**Brain signals written:**
- `exam_predicted`: `{ course_id, predicted_score_range, predicted_final_grade_range, readiness_score_at_prediction }`
- `what_if_used`: `{ course_id, scenarios_run: int }` — counts how many what-if scenarios the student explored

---

### Agent 8 — Intervention Agent

**Owner:** Vincent  
**Environment:** Background monitor  
**Priority:** P1

**Agent pattern:** Pattern B (Watch/Arbitrate/Deliver). This agent does not respond to user input — it watches `brain_signals` and writes candidates to the Signal Arbiter.

**What it does:** Runs silently in the background. Monitors the student's stress signals, deadline proximity, and engagement patterns. When it detects a student who is overwhelmed, falling behind, or disengaged, it intervenes proactively. It also fires on positive opportunity triggers — not just problems.

**Negative intervention triggers (problems):**

| Signal | Threshold | Intervention |
|---|---|---|
| Stress level | > 0.8 | "You have 3 assignments due in 48 hours. Want me to build a plan?" |
| No study activity | 3+ days before deadline | "Your essay is due in 3 days and I haven't seen you work on it. Want to start now?" |
| Repeated confusion on same topic | 3+ sessions | "You've asked about integration by parts 3 times. Let me try a different explanation." |
| Grade drop | > 10% below course average | "Your CHEM 201 grade dropped this week. Want to review what was covered?" |
| Late night pattern | Study sessions after 1am for 3+ nights | "You've been studying late. A 20-minute review now is more effective than 2 hours at midnight." |

**Positive opportunity triggers (advancement):**

| Signal | Condition | Intervention |
|---|---|---|
| Free study block + quiz tomorrow | Calendar gap detected + assignment due < 24h | "You have 90 free minutes at 3pm and a quiz tomorrow. Want to do a quick review now?" |
| Prerequisite mastered | Brain confidence score on prerequisite > 0.85 | "You've got the product rule down. Ready to tackle integration by parts?" |
| Spaced-repetition due | Concept last reviewed > 7 days ago + exam within 14 days | "It's been 8 days since you reviewed stereochemistry. A 10-minute refresher now will stick better than cramming." |
| Streak opportunity | Student studied 4 days in a row | "4-day streak. One more session today and you'll have your best week this semester." |

**Stress level cap and escalation path (required):**
The Intervention Agent must not escalate indefinitely. If a student's stress level exceeds 0.9 for 3+ consecutive days and the student has not engaged with any intervention, the agent must:
1. Stop sending stress-related notifications (the student is clearly not responding — more notifications make it worse)
2. Show a single in-app message on next open: "It looks like you're going through a tough week. FschoolAI is here when you're ready. Here are some campus mental health resources."
3. Write `stress_escalated: true` to the brain and suppress all stress-triggered notifications for 48 hours
4. After 48 hours, reset to normal monitoring

The agent must never imply a clinical diagnosis, never use the word "anxiety" or "depression", and never suggest the student is failing. Language must be supportive and non-judgmental. The campus mental health resource link is configurable per institution.

**Important:** All triggers — positive and negative — write to the `proactive_signals` queue. The Signal Arbiter (§3.5.2) decides what actually reaches the student. This agent does not send notifications directly.

**Brain signals written:**
- `intervention_triggered`: type and trigger (positive or negative)
- `intervention_accepted`: boolean — did the student engage with the intervention?

---

### Agent 9 — Audio Agent

**Owner:** Aryan  
**Environment:** Audio / Multilingual  
**Priority:** P2

**What it does:** Handles all audio-related tasks. Transcribes lecture recordings, translates content into the student's preferred language, converts text explanations to audio for auditory learners, and processes voice input from the student.

**Capabilities:**
- Speech-to-text — transcribe any audio file or live recording. Real-time is language-routed per §7 (ElevenLabs Scribe for English, Deepgram Nova-3 for Spanish/French, Tencent Cloud ASR for Mandarin); post-processing/batch transcription uses self-hosted Whisper large-v3
- Text-to-speech — read explanations aloud
- Translation — translate lecture content, study materials, or AI responses into the student's language
- Language detection — automatically detects the student's preferred language from their messages

**Supported languages (Phase 1):** English (default), Mandarin Chinese (Simplified, zh-CN — a Phase-1 requirement), Spanish (es-419), French (fr-FR). Hindi and Arabic follow in Phase 2. STT and TTS providers are routed per language (§7).

**Brain signals written:**
- `preferred_language`: detected from student's messages
- `audio_sessions`: count of audio-mode interactions

---

### Agent 10 — Office Hours Agent

**Owner:** Tencent engineer  
**Environment:** Office Hours Preparation  
**Priority:** P2

**Academic integrity guardrail — writing feedback only:**
When a student asks for help with a written assignment (essay, report, lab write-up), this agent and the Tutor Agent must provide **feedback and suggestions only — not rewritten text**. Specifically:
- The agent may identify structural weaknesses: "Your thesis statement is unclear — it does not state a position."
- The agent may suggest what to improve: "Your second paragraph lacks a topic sentence."
- The agent may NOT rewrite sentences, paragraphs, or sections for the student.
- The agent may NOT generate a full outline and then write content for each section.
- The agent may generate a **blank structural scaffold** (section headings only, no content) to help the student organise their own writing.

This guardrail applies to all written assignments tied to an open Canvas assignment with a future due date. For past assignments or practice writing, the restriction is lifted.

**What it does:** Helps the student prepare for and follow up on professor office hours. Before office hours, it generates a list of specific questions based on the student's knowledge gaps. After office hours, it helps the student record what was discussed and updates the brain with new knowledge.

**Pre-office hours flow:**
1. Student says "I have office hours with Professor Chen in 30 minutes"
2. Agent reads brain context: current gaps in the relevant course
3. Agent generates 3–5 specific, well-formed questions to ask the professor
4. Agent briefs the student: "Here is what you should ask and why"

**Post-office hours flow:**
1. Student says "Office hours just ended"
2. Agent asks: "What did you learn? What was clarified?"
3. Student describes what happened
4. Agent updates the brain: gaps closed, new concepts added

**Brain signals written:**
- `office_hours_attended`: course and professor
- `questions_prepared`: list of questions generated
- `gaps_closed`: knowledge gaps resolved in the session

---

### Agent 11 — Calendar Agent

**Owner:** Bytedance engineer  
**Environment:** Calendar Integration  
**Priority:** P2

**What it does:** Integrates with Google Calendar and Apple Calendar. Reads the student's existing schedule (classes, work, commitments) and uses this to make the Planner Agent's study plans realistic. It also writes study blocks back to the student's calendar.

**Calendar reads:**
- Class schedule (recurring events)
- Work shifts
- Social commitments
- Existing study blocks

**Calendar writes:**
- Study blocks generated by Planner Agent
- Exam dates (from Canvas)
- Assignment deadlines (from Canvas)

**Brain signals written:**
- `available_hours_per_day`: calculated from calendar gaps
- `calendar_connected`: boolean

---

### Agent 12 — Reflection Agent

**Owner:** Ryan (NeuroAGI)  
**Environment:** Background — runs nightly  
**Priority:** P1

**What it does:** This agent runs every night at 2am for each student. It reviews the day's interactions, synthesises patterns, updates the brain graph, decays stale knowledge nodes, and prepares the brain for the next day. This is the agent that makes the brain smarter over time.

**Nightly tasks:**
- Review all signals written by other agents during the day
- Update knowledge gap confidence scores (did the student show improvement?)
- Decay old knowledge nodes (concepts not revisited in 30+ days lose confidence)
- Identify new patterns (e.g., "student consistently struggles on Mondays after weekend")
- Update stress level based on weekly trajectory
- Generate a "brain health summary" for the student (optional, shown in dashboard)

**Note:** This agent lives inside NeuroAGI, not FschoolAI. Ryan owns it. FschoolAI agents do not call it directly — it runs automatically on the NeuroAGI brain layer.

---

### Agent 13 — Terminal Agent

**Owner:** Vincent  
**Environment:** Developer / Power User Mode  
**Priority:** P3

**What it does:** For advanced students who want to query their own brain directly, run custom workflows, or inspect their data. Think of it as a command-line interface to the student's brain.

**Example commands:**
```
> show my knowledge gaps in CHEM 201
> what topics have I studied this week?
> export my study history as CSV
> set my learning style to visual
> show my stress level trend this month
```

**Brain signals written:**
- `terminal_commands_used`: list of commands executed

---

### Agent 14 — Cohort / Collective Intelligence Agent

**Owner:** Ryan (NeuroAGI) + Vincent (FschoolAI integration)  
**Environment:** Background — runs on event trigger (new confusion signals) and nightly  
**Priority:** P2 — requires canonical entity layer and k-anonymity minimum before activation

**Agent pattern:** Pattern B (Watch/Arbitrate/Deliver). This agent is a **producer into the Signal Arbiter** — its outputs fan out to each cohort member's Intervention Agent and Planner Agent. It does not communicate with students directly.

**What it does:** Aggregates anonymised, de-identified learning signals across students in the same course section. Identifies concept gaps that are widespread in the cohort. Surfaces targeted review recommendations to each individual student based on what their cohort is struggling with collectively.

**The core insight:** If 15 students in one section hit confusion on the same concept this week, that is a *leading* signal available immediately — grades are lagging, sparse, and privacy-sensitive. Confusion clustering is the right signal to build on first.

**What it does NOT do:**
- It does not aggregate grades or grade distributions (privacy-hot, consent-gated, Phase 3 only)
- It does not make claims about professor performance — never "your prof's test was unfair"
- It does not show individual student data to other students — ever
- It does not operate on cohorts smaller than 10 students (k-anonymity minimum)

**Canonical entity layer (required prerequisite):**
Today the `courses` table is keyed by `student_id`, so the same Canvas course is N separate rows with no way to aggregate across them. Before this agent can function, a canonical entity layer must be built:

```sql
-- Canonical course — shared across all students in the same Canvas instance
canonical_courses (
  id                uuid PRIMARY KEY,
  institution_id    text,              -- e.g., "carleton.ca"
  canvas_course_id  text,              -- Canvas's own course ID (shared across students)
  course_name       text,
  semester          text,
  UNIQUE(institution_id, canvas_course_id)
)

-- Canonical assignment — shared across all students in the same course
canonical_assignments (
  id                    uuid PRIMARY KEY,
  canonical_course_id   uuid REFERENCES canonical_courses(id),
  canvas_assignment_id  text,
  title                 text,
  due_date              timestamp,
  UNIQUE(canonical_course_id, canvas_assignment_id)
)
```

Cohorts are grouped by `(institution_id, canvas_course_id)`. These IDs are shared across students in the same Canvas instance.

**Concept taxonomy (required prerequisite — harder than the canonical course layer):**
The confusion clustering algorithm joins on `concept_tag`. If tags are free-text strings written by the Tutor Agent at inference time, the same concept will appear as "stereochem", "stereochemistry", "chirality", "R/S configuration", and "chiral centres" — none of which will reach the k=10 threshold individually. The same fragmentation happens **across languages** — a Mandarin learner's `导数` and an English learner's `derivative` are one concept and must cluster together. So concept tags must resolve to a **language-agnostic canonical concept ID with localised labels**, never free-text in whatever language the Tutor Agent used (this is also what lets the course/university brain share understanding across English- and Mandarin-speaking students — §9 Language).

Two approaches are acceptable. Choose one before building the Cohort Agent:

**Option A — Canonical concept ontology per subject:** A curated taxonomy of concept tags per subject domain (e.g., Organic Chemistry: `[stereochemistry, reaction_mechanisms, functional_groups, ...]`). The Tutor Agent maps its free-text gap identification to the nearest canonical tag at write time. Requires upfront curation per subject. Recommended for Phase 1 subjects (STEM, economics).

**Option B — Embedding-based tag normalisation:** The Tutor Agent writes a free-text concept description. At aggregation time, the Cohort Agent embeds all concept tags and clusters them by cosine similarity (threshold: 0.85). Concepts within the same cluster are merged into a representative tag. No upfront curation, but requires an embedding model call per aggregation run.

Both options must be decided and built before the Cohort Agent is activated. Add the chosen approach to the build order in §8 under Week 7+.

**Confusion clustering algorithm:**
1. Every time the Tutor Agent writes a `confusion_detected` signal, it includes `canonical_course_id` and `concept_tag`.
2. The Cohort Agent aggregates these signals per `(canonical_course_id, concept_tag)` over a rolling 7-day window.
3. If 10+ students in the same cohort show confusion on the same concept within 7 days, a cohort insight is generated.
4. The insight is written to the `proactive_signals` queue for each cohort member: "15 students in your CHEM 201 section are struggling with stereochemistry this week. Here is a targeted 10-minute review."

**Privacy architecture (non-negotiable):**
- All cohort aggregation runs against a **de-identified aggregation store** — a separate table with RLS policies that prevent any per-student data from being exposed.
- **k-anonymity minimum: 10 students.** If a cohort has fewer than 10 students, no insight is computed or shown. If a concept has fewer than 10 confused students, no insight is generated.
- **Per-student consent flag:** Students must opt in to cohort intelligence. Default is opt-out. The consent flag is stored in `students.cohort_consent boolean DEFAULT false`.
- **Legal review required:** This feature requires reconciling §9 (data belongs to student, never aggregated without consent) and §11 (social features deferred). Legal review for PIPEDA and FERPA compliance is required before this agent goes live. Do not ship without legal sign-off.

**Framing rule:** Insights are always framed as concept-gap recommendations for the individual student, never as commentary on the professor or course quality.

| Correct framing | Prohibited framing |
|---|---|
| "Many students in your section are finding stereochemistry difficult. Here's a targeted review." | "Your professor didn't explain this well." |
| "This concept is commonly misunderstood in CHEM 201. Let me break it down differently." | "Your class average on this topic is low." |

**Brain signals written (to de-identified aggregation store only):**
- `cohort_insight_generated`: concept tag, cohort size, confusion count
- `cohort_insight_delivered`: how many students received the insight

---

### Agent 15 — Podcast / Audio Overview Agent

**Owner:** Aryan (pipeline) + Tencent engineer (dialogue script)  
**Environment:** Async background pipeline — delivers via `notification_queue`  
**Priority:** P2  
**Tier:** Pro (10 episodes/month cap) + Max (unlimited)

**What it does:** Generates a 5–15 minute, two-host conversational audio episode from a student-selected source set. The episode is brain-grounded — the script uses the student's knowledge gaps, their lecture transcript, and the professor's terminology, exactly as the Lesson Generator does. A podcast generated only from raw uploaded text without brain context is not acceptable.

**Source set (student selects one or more):**
- Lecture transcript (from Lecture Agent)
- Uploaded notes or PDF
- Syllabus document (from Canvas Agent)
- A concept the student is weak on (pulled from `knowledge_gaps` in brain context)

**Episode formats:**

| Format | Description |
|---|---|
| `deep-dive` | Extended exploration of one concept or topic |
| `brief` | 5-minute high-density summary |
| `debate` | Two hosts argue opposing interpretations or approaches |
| `exam-cram` | Fast-paced review of high-yield exam topics based on the student's gaps |

**Pipeline (Pattern B — async, reuses Lesson Generator plumbing):**

```
Step 1:  context = brain.read(student_id)          // knowledge_gaps, professor terminology, lecture transcript
Step 2:  script  = dialogue_script_agent(source_set, context, format)
             — Two distinct host personas (Host A: explainer, Host B: questioner/challenger)
             — Turn-taking structure with natural transitions
             — Brain-grounded: gaps and professor terms woven into the dialogue
Step 3:  audio_a = elevenlabs.tts(host_a_lines, voice_id="host_a")
         audio_b = elevenlabs.tts(host_b_lines, voice_id="host_b")
Step 4:  episode = stitch(audio_a, audio_b)         // interleave turns in order
Step 5:  store episode at audio_url (Supabase Storage)
Step 6:  write to audio_overviews table
Step 7:  write to notification_queue: "Your CHEM 201 podcast is ready"
```

**LLM for script generation:** GPT-4o or Claude Sonnet (same routing as Lesson Generator — quality is the moat, do not downgrade to mini for the script).

**TTS:** ElevenLabs multi-voice. Two distinct voice IDs — one per host persona. Voice IDs are configurable per deployment.

**Latency budget:** < 3 minutes end-to-end for a 10-minute episode. This agent is **exempt from the 3-second NFR** (§9). The student is notified when the episode is ready — they do not wait at a loading screen.

**Brain signals written:**
- `podcast_generated`: `{ source_set: string[], format: string, duration_seconds: int }`
- `podcast_listened`: `{ episode_id: uuid, completed: boolean, percent_completed: float }`

**Academic integrity:** Podcast scripts are explanatory and review-oriented. They do not write assignments, generate essay content, or produce any output that could be submitted as academic work.

---

## 4.1 Studio Surface

**Owner:** Vincent  
**Priority:** P2  
**Tier:** Pro and Max (source selection and generation are Pro+ features)

**What it is:** A single consolidated panel where the student selects a source set once and generates any supported learning format on demand — NotebookLM-style, but grounded in the student's brain context. The Studio is primarily a **UI router over existing agents** — it does not introduce new generation logic.

**Source set selection (shared across all formats):**
The student picks one or more sources:
- A lecture transcript (from Lecture Agent)
- Uploaded notes or PDF
- A Canvas assignment or syllabus
- A concept from their knowledge gap list

**Formats available from the Studio:**

| Format | Powered by | Tier |
|---|---|---|
| Podcast (Audio Overview) | Agent 15 | Pro (10/month), Max (unlimited) |
| Summary | Lecture Agent | Pro+ |
| Flashcards | Lecture Agent | Pro+ |
| Quiz | Lecture Agent | Pro+ |
| Mind Map | §3.6 Graph Visualisation | Max |
| Brain-grounded Video | Lesson Generator (Agent 6b) | Max |

**Design principle:** One source selection → many on-demand formats. The student does not need to re-upload or re-describe their material for each format. The Studio passes the same source set and brain context to each agent.

**What the Studio is NOT:**
- It is not a new generation engine — it routes to existing agents.
- It does not generate slide decks, infographics, or data tables (see §11 — out of scope).
- It is not a real-time interactive experience — all heavy formats (podcast, video) are async with notification delivery.

**UI requirements:**
- Source set picker (multi-select, shows available sources from Canvas + Lecture Agent)
- Format selector (cards, one per format, greyed out if not available on current tier)
- "Generate" button — triggers the appropriate agent pipeline
- Status tracker — shows in-progress generations with estimated completion time
- History panel — past generated items, playable/viewable inline

---

## 5. User Flows

### 5.1 Onboarding Flow

The onboarding is the "identity card" session — a one-on-one setup with FschoolAI that builds the student's initial brain profile.

**Step 1 — Account creation**
Student signs up with email or Google. A blank brain object is created with their student_id.

**Step 2 — Connect your LMS**
The student connects their LMS. Two mechanisms, generalized in §16.8. Installing the **browser extension** is the universal path: it works on any LMS (Canvas, D2L, Moodle, Blackboard, Schoology) and also captures content and attached files. **Canvas OAuth** (the §4 Canvas Agent) is the fast path that pulls structured courses, assignments, and grades instantly where Canvas is available. Either way the brain is populated with course context and upcoming deadlines. **No-LMS branch:** if the student connects nothing yet, onboarding still completes on the learning-style profile alone, and the daily brief degrades to a generic prompt until an LMS is connected (eval edge X2).

**Step 3 — Learning style assessment**
Reggie asks 5 quick questions to determine the student's learning style. These are conversational, not a formal test. Example: "When you are trying to understand something new, do you prefer to see a diagram, hear an explanation, read about it, or try it yourself?"

**Step 4 — First brain summary**
FschoolAI shows the student their initial brain: "Here is what I know about you so far. You are taking 4 courses. Your next deadline is in 2 days. I think you learn best visually. Is this right?"

**Step 5 — First interaction**
Reggie asks: "What do you want to work on today?" The student is now in the product.

---

### 5.2 Daily Use Flow

```
Student opens FschoolAI
  → Reggie shows a personalised daily brief:
    "Good morning. You have 2 assignments due this week.
     You have a study block for CHEM 201 at 2pm.
     Your exam readiness for MATH 204 is 62% — want to practice?"

Student asks a question or picks a task
  → Reggie routes to the appropriate agent
  → Agent reads brain context
  → Agent responds
  → Agent writes signal to brain

End of session
  → Reflection Agent (nightly) synthesises the day
  → Brain is updated
  → Tomorrow's brief is prepared
```

---

### 5.3 Exam Preparation Flow

```
Student: "I have a CHEM 201 exam on Friday"
  → Reggie routes to Exam Mode Agent
  → Exam Mode Agent reads brain: gaps in stereochemistry and reaction mechanisms
  → Agent creates 3-day prep plan
  → Day 1: stereochemistry practice (student's weakest area)
  → Day 2: reaction mechanisms + mixed practice
  → Day 3: full mock exam + review
  → Each day: agent evaluates student's answers, updates readiness score
  → Thursday night: "You are at 78% readiness. Focus on reaction mechanisms tonight."
```

---

## 6. Data Model

### 6.1 Core Tables (Supabase)

**students**
```sql
id              uuid PRIMARY KEY
email           text UNIQUE NOT NULL
name            text
canvas_token    text (encrypted)
created_at      timestamp
last_active     timestamp
```

> **Merged-brain note (§18.2):** The brain tables in this section (`brain_context`, `brain_signals`, `proactive_signals`, `notification_queue`, `cohort_confusion_signals`, …) describe the *current/transitional* Supabase representation. In the **v2 target** they collapse into the single append-only **`memory`** log — each becomes a `kind` (`signal`, `outbox`, `trait`, `schedule`, …) with a JSONB `body`, scoped by `subject`. The FschoolAI **product** tables (`students`, `courses`, `assignments`, `sessions`) stay as raw operational data (the §12.3 boundary). Model new *brain* writes as memory `kind`s, not new tables.

**brain_context** (Phase 1 mock — later replaced by NeuroAGI API)
```sql
id              uuid PRIMARY KEY
student_id      uuid REFERENCES students(id)
learning_style  text
stress_level    float
knowledge_gaps  jsonb
preferences     jsonb
updated_at      timestamp
```

**courses**
```sql
id              uuid PRIMARY KEY
student_id      uuid REFERENCES students(id)
canvas_course_id text
name            text
professor       text
semester        text
```

**assignments**
```sql
id              uuid PRIMARY KEY
course_id       uuid REFERENCES courses(id)
canvas_assignment_id text
title           text
due_date        timestamp
points_possible float
points_earned   float
submitted       boolean
```

**sessions**
```sql
id              uuid PRIMARY KEY
student_id      uuid REFERENCES students(id)
agent_used      text
input_text      text
output_text     text
topics          text[]
duration_seconds int
created_at      timestamp
```

**brain_signals**
```sql
id              uuid PRIMARY KEY
student_id      uuid REFERENCES students(id)
signal_type     text
signal_data     jsonb
created_at      timestamp
```

**proactive_signals** (candidate interventions awaiting Signal Arbiter decision)
```sql
id              uuid PRIMARY KEY
student_id      uuid REFERENCES students(id)
agent_source    text              -- which agent wrote this candidate
urgency_score   float             -- 0.0–1.0, time sensitivity
value_score     float             -- 0.0–1.0, estimated benefit
message_text    text              -- the message to deliver if approved
channel_hint    text              -- preferred channel (push, sms, email, in_app)
status          text DEFAULT 'pending'  -- pending | approved | rejected | delivered
created_at      timestamp
expires_at      timestamp         -- candidate is discarded after this time
```

**notification_queue** (approved interventions ready for delivery)
```sql
id                  uuid PRIMARY KEY
student_id          uuid REFERENCES students(id)
proactive_signal_id uuid REFERENCES proactive_signals(id)
channel             text              -- actual delivery channel chosen by Arbiter
message_text        text
scheduled_for       timestamp         -- when to deliver (respects quiet hours)
delivered_at        timestamp
opened_at           timestamp
action_taken        boolean           -- did the student act on it?
created_at          timestamp
```

**canonical_courses** (shared across students in the same Canvas instance)
```sql
id                  uuid PRIMARY KEY
institution_id      text              -- e.g., "carleton.ca"
canvas_course_id    text              -- Canvas's own course ID
course_name         text
semester            text
UNIQUE(institution_id, canvas_course_id)
```

**canonical_assignments** (shared across students in the same course)
```sql
id                      uuid PRIMARY KEY
canonical_course_id     uuid REFERENCES canonical_courses(id)
canvas_assignment_id    text
title                   text
due_date                timestamp
UNIQUE(canonical_course_id, canvas_assignment_id)
```

**cohort_confusion_signals** (de-identified aggregation store — separate RLS, no per-student data)
```sql
id                      uuid PRIMARY KEY
canonical_course_id     uuid REFERENCES canonical_courses(id)
concept_tag             text
confusion_count         int               -- number of students confused (never < 10 when shown)
week_start              date
updated_at              timestamp
```

**flashcard_reviews** (SRS state — required for spaced-repetition trigger)
```sql
id                  uuid PRIMARY KEY
student_id          uuid REFERENCES students(id)
flashcard_id        uuid              -- references the flashcard generated by Lecture Agent
concept_tag         text
ease_factor         float DEFAULT 2.5 -- FSRS ease factor
interval_days       int DEFAULT 1     -- current review interval in days
repetitions         int DEFAULT 0     -- number of times reviewed
next_review_at      timestamp         -- when this card is next due
last_reviewed_at    timestamp
rating              int               -- last review rating: 1 (again) 2 (hard) 3 (good) 4 (easy)
created_at          timestamp
```

**SRS engine:** The spaced-repetition scheduling uses the **FSRS algorithm** (Free Spaced Repetition Scheduler — open-source, more accurate than SM-2). It runs client-side in the browser/app. On each flashcard review, the student rates their recall (1–4). The FSRS algorithm updates `ease_factor`, `interval_days`, and `next_review_at`. The "spaced-repetition due" trigger in the Intervention Agent reads `next_review_at` to determine when to send a reminder. **This table and scheduling engine must be built before the spaced-repetition trigger is activated.** Remove the trigger from the Intervention Agent's positive trigger table until `flashcard_reviews` is populated with real data.

**audio_overviews** (generated podcast episodes)
```sql
id                  uuid PRIMARY KEY
student_id          uuid REFERENCES students(id)
source_refs         jsonb             -- array of source identifiers (transcript IDs, note IDs, concept tags)
format              text              -- 'deep-dive' | 'brief' | 'debate' | 'exam-cram'
duration_seconds    int
audio_url           text              -- Supabase Storage URL
created_at          timestamp
```

---

## 7. Technical Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui |
| Mobile | React Native (Phase 2) |
| Backend | Supabase (database + auth + storage) |
| Brain layer | **NeuroAGI v2 kernel** — memory-log + decay + bus + cortex, reached via REST / `WS /channel` / **MCP** (§18.2). Phase 1: local mock JSON; transitional: direct Supabase brain schemas (§12). v1's TypeScript engines are deprecated and not used. |
| LLM | GPT-4o via OpenAI API (Phase 1) |
| Speech-to-text (real-time) | Language-routed: ElevenLabs Scribe v2 RT (English) · Deepgram Nova-3 (Spanish es-419 / French fr-FR, with academic keyterms) · **Tencent Cloud ASR** (Mandarin zh-CN), with Krisp on-device noise cancellation upstream |
| Speech-to-text (post-processing) | **Self-hosted Whisper large-v3** — all languages (EN/ES/FR/ZH); fine-tunable on an academic corpus, runs on-prem |
| Voice rooms (study, ≤8) | LiveKit (Cloud → self-hosted at scale); native WebRTC P2P + Cloudflare TURN for 2–3 person rooms; Agora fallback for Latin-American edge — replaces Daily.co |
| Math notation | LLM post-processing step — converts spoken math to symbols/LaTeX ("x squared" → x²) |
| Canvas integration | Canvas LMS REST API + OAuth 2.0 |
| Calendar integration | Google Calendar API + Apple CalDAV |
| Chrome extension | Manifest V3, React |
| Hosting | Manus (FschoolAI frontend) |
| Notification delivery | Firebase Cloud Messaging (push), Twilio (SMS), Resend (email) |
| SRS engine | FSRS algorithm (open-source, client-side) |
| Text-to-speech | ElevenLabs (multilingual multi-voice — Audio Agent §9 + Podcast Agent §15; includes zh-CN voices) |
| Stripe | Payment processing (Phase 1 launch requirement) |

---

### 7.1 Cost Envelope and Model Routing

This section is a launch blocker. With 14 agents, nightly Reflection, cohort aggregation, an arbiter, and video generation, the default "use GPT-4o for everything" approach is not economically viable. The following routing rules are required before launch.

**Per-active-user cost target:** < $1.50/month for a Free user, < $3.00/month for a Pro user, < $5.00/month for a Max user. Gross margin targets: Free (0% — acquisition cost), Pro (~75%), Max (~70% including video).

**Model routing rules:**

| Task | Model | Rationale |
|---|---|---|
| Intent classification (Reggie routing) | GPT-4o-mini or Claude Haiku | Sub-100ms, < $0.001/call, runs on every message |
| Signal evaluation (Intervention Agent, Arbiter scoring) | GPT-4o-mini | Structured JSON output, no long context needed |
| Summarisation (Lecture Agent summary, Planner output) | GPT-4o-mini | High volume, quality threshold is moderate |
| Flashcard and quiz generation | GPT-4o-mini | Template-driven, low creativity requirement |
| **Tutoring (Tutor Agent, Exam Mode)** | **GPT-4o or Claude Sonnet** | Core product, quality is the moat — do not downgrade |
| **Video script generation (Lesson Generator)** | **GPT-4o or Claude Sonnet** | Max-tier feature, brain-grounded, quality matters |
| **Podcast dialogue script (Agent 15)** | **GPT-4o or Claude Sonnet** | Pro/Max feature, brain-grounded two-host script — same quality bar as Lesson Generator |
| Reflection synthesis (Reflection Agent) | GPT-4o-mini | Runs nightly, structured signal processing |
| Cohort insight generation | GPT-4o-mini | Templated output, low creativity |

**Prompt caching:** The brain context object (`learning_style`, `knowledge_gaps`, `stress_level`, `upcoming_deadlines`) is stable within a session. Cache it as a system prompt prefix using OpenAI's prompt caching feature. Estimated saving: 40–60% of token cost for multi-turn sessions.

**Cost per active user per day (estimated at launch):**

| User type | Sessions/day | Est. LLM cost/day | Est. LLM cost/month |
|---|---|---|---|
| Free (casual, 20 msg cap) | 1 session, ~15 messages | $0.02 | $0.60 |
| Pro (regular, unlimited) | 2–3 sessions, ~40 messages | $0.06 | $1.80 |
| Max (power user, video) | 3+ sessions + 1 video/week | $0.12 | $3.60 |

These are estimates based on GPT-4o-mini for routing/evaluation and GPT-4o for tutoring at current API pricing. Validate against actual usage in the first 30 days and adjust routing rules accordingly.

**Video cost note (Max tier):** A single brain-grounded video (script + ElevenLabs TTS + animation render) costs approximately $0.80–1.20 per video. At 4 videos/month per Max user, this is $3.20–4.80/month in video costs alone. Cohort amortisation (see Agent 14) reduces this when the same core video is reused across cohort members with only the framing layer personalised.

**Podcast cost note (Agent 15):** ElevenLabs multi-voice TTS for a 10-minute two-host episode costs approximately $0.15–0.40 per episode (dependent on character count and voice tier). At 10 episodes/month for a Pro user, this is $1.50–4.00/month in TTS costs alone before LLM script generation. **This cost must be validated against actual ElevenLabs pricing and usage before the Pro tier cap is finalised.** The 10/month cap is a conservative starting point — adjust based on observed cost per episode in the first 30 days. Max tier (unlimited) requires cohort amortisation or a per-episode cost ceiling to remain within the $5.00/month gross margin target.

---

## 8. Build Order and Ownership

The build order is designed so no engineer blocks another. Ryan's brain mock is available from Day 1 so all agents can develop against it.

| Week | What gets built | Owner |
|---|---|---|
| Week 1 | Brain mock JSON + `brain.read()` / `brain.write()` stub | Ryan |
| Week 1 | Canvas Agent — OAuth + sync | Aryan |
| Week 1 | Reggie — basic routing | Vincent |
| Week 1 | Supabase schema — all tables including `proactive_signals`, `notification_queue`, `canonical_courses` | Ryan |
| Week 2 | Tutor Agent — core explanation logic | Tencent engineer |
| Week 2 | Planner Agent — study schedule generation | Bytedance engineer |
| Week 2 | Lecture Agent — transcription + summary | Aryan |
| Week 2 | Trigger / Event Runtime — Supabase Realtime + cron scaffold | Ryan |
| Week 3 | Exam Mode Agent | Vincent |
| Week 3 | Intervention Agent (Pattern B, writes to Arbiter) | Vincent |
| Week 3 | Library Agent | Bytedance engineer |
| Week 3 | **Signal Arbiter** — dedup, rank, rate-limit, quiet hours | Ryan |
| Week 3 | **Delivery Layer** — FCM push + Twilio SMS + email (Resend) + in-app | Aryan |
| Week 4 | Audio Agent | Aryan |
| Week 4 | Office Hours Agent | Tencent engineer |
| Week 4 | Calendar Agent | Bytedance engineer |
| Week 4 | Effectiveness feedback loop — per-student threshold tuning | Ryan |
| Week 4 | **Lesson Generator async plumbing** — job queue, Supabase Storage, notification delivery | Aryan |
| Week 5 | Reflection Agent (NeuroAGI) | Ryan |
| Week 5 | Terminal Agent | Vincent |
| Week 5 | Cold-start mode — deadline-only proactivity until baseline exists | Vincent |
| Week 5 | **Agent 15 — Podcast / Audio Overview Agent** — dialogue script (GPT-4o/Sonnet) + ElevenLabs multi-voice TTS + stitch + notify | Aryan (pipeline) + Tencent engineer (script) |
| Week 5 | **Studio UI surface** — source set picker, format cards, async status tracker, history panel | Vincent |
| Week 5 | **Exam Predictor + Grade What-If Calculator (Agent 7b)** — grade analytics panel, client-side what-if calculator | Vincent |
| Week 5 | **SRS engine — `flashcard_reviews` table + FSRS client-side scheduler** — prerequisite for spaced-repetition trigger in Intervention Agent | Aryan |
| Week 5 | **Stripe integration** — Free/Pro/Max tier enforcement, subscription management, webhook handlers; required before public launch | Vincent + Aryan |
| Week 6 | Replace mock brain with live NeuroAGI API | Ryan + all |
| Week 7+ | **Cohort Agent** — requires canonical layer + 10+ students + legal sign-off | Ryan + Vincent |
| Week 7+ | Canonical entity layer (`canonical_courses`, `canonical_assignments`) | Ryan |
| Week 7+ | **Concept taxonomy decision + implementation** — choose Option A (canonical ontology) or Option B (embedding-based normalisation); prerequisite for Cohort Agent activation | Ryan + Vincent |

---

## 9. Non-Functional Requirements

**Response time:** Every agent must respond within 3 seconds for standard queries. Lecture transcription and exam prep plan generation may take up to 10 seconds with a loading indicator.

**Privacy:** Student data is never used to train models. Canvas tokens are stored encrypted. Brain data belongs to the student — they can export or delete it at any time.

**Language:** All agents must support English by default. **Mandarin Chinese (Simplified, zh-CN) is required for Phase 1** (Chinese student market) — scoped to Chinese *international* students in North America, not a mainland-China deployment (which would require China-region infrastructure, an ICP licence, and data residency, and is out of scope here). Spanish (es-419) and French (fr-FR) are the secondary languages. Speech is **language-routed** to the best engine per language (§7) behind a language-detection step. The UI must localise to zh-CN and ship a **CJK font fallback** (e.g. Noto Sans SC) — the display typefaces do not cover Chinese. Concept tags written to the cohort/course brain must use **language-agnostic canonical IDs with localised labels** (§14), so `导数` and "derivative" map to the same concept node. Hindi, Arabic, and other languages follow in Phase 2 via the Audio Agent.

**Offline mode:** Core brain context is cached locally. Students can view their study plan and upcoming deadlines without internet. Active agent sessions require internet.

**Accessibility:** All UI must meet WCAG 2.1 AA. Voice input must be available for all agent interactions.

---

## 10. Success Metrics

| Metric | Target (Month 3) |
|---|---|
| Daily active users | 500+ |
| Session length | > 8 minutes average |
| LMS connections | > 70% of users connect an LMS (Canvas OAuth or the extension, §16.8) |
| Agent interactions per session | > 2 agents used per session |
| Student-reported grade improvement | > 40% of users report improvement |
| Retention (Day 30) | > 45% |
| NPS | > 50 |
| Free → Pro conversion rate | > 8% within 30 days of signup |
| Pro → Max upgrade rate | > 15% of Pro users within 60 days |
| **LLM cost per active Pro user/month** | **< $3.00** |
| **LLM cost per active Max user/month** | **< $5.00** |
| Proactive notification open rate | > 35% |
| Proactive notification disable rate | < 5% (measures Arbiter quality) |
| Video completion rate (Lesson Generator) | > 60% of generated videos watched to completion |

---

## 11. Out of Scope (Phase 1)

The following are explicitly out of scope for Phase 1 and should not be built until Phase 2:

- NeuroAGI hardware integration (Neural Card)
- School/institution-facing dashboard
- Professor tools
- Native mobile app (iOS/Android)
- EducAI integration

> **Resolved (v1.8) — Social, Leaderboard, and Study Rooms ARE in Phase-1 scope.** They are specced (`design/pages/06-SOCIAL`, `07-LEADERBOARD`, `08-STUDY-ROOMS`), have dedicated agents (§14: Social Intelligence, Study Room Orchestrator, Leaderboard), and are already implemented on `frontend/dev` (`StudyRooms.tsx`, `VoiceRoom.tsx`, `Whiteboard.tsx`, friends migration) — so the earlier deferral is removed from the list above. **One constraint remains:** the cohort/leaderboard aggregation surfaces must still pass the PIPEDA/FERPA review and k-anonymity gate in §14 before they expose any cross-student data.

**Payment processing is IN scope for Phase 1.** FschoolAI launches with a Free tier and two paid tiers:

| Tier | Price | Key Phase 1 features |
|---|---|---|
| Free | $0 | 20 messages/day, basic brain, Canvas sync |
| Pro | $12/month | Unlimited chat, nightly reflection, proactive interventions, Lesson Generator (10/month), **Exam Predictor + Grade What-If Calculator (Agent 7b)**, **Podcast / Audio Overview (10 episodes/month)**, **Studio panel** |
| Max | $20/month | Everything in Pro + unlimited Lesson Generator, **unlimited Podcast / Audio Overview**, Brain export, Brain API access, cross-course knowledge graph |

Stripe integration is required before public launch. The Lesson Generator (video generation feature) is a **Max-tier feature** — it is gated behind $20/month and must not be accessible to Free or Pro users. See §7.1 for cost envelope and model routing. See TOKEN_ECONOMY.md for full tier feature breakdown.

**Video generation (Lesson Generator) is Phase 1 Max-tier only.** It is not a generic explainer — see Agent 6b (Lesson Generator) for the brain-grounded video pipeline. Agent 6 is the Library Agent — a separate agent.

**Podcast / Audio Overview (Agent 15) is Pro+ only.** Free users do not have access to podcast generation. Pro users are capped at 10 episodes/month. Max users have unlimited episodes. See §7.1 for ElevenLabs cost validation requirements before the cap is finalised.

**Studio panel is a Pro+ feature.** Free users do not see the Studio surface. The Studio is the single entry point for all on-demand format generation (podcast, summary, flashcards, quiz, mind map, video).

---

### Explicitly Out of Scope — Do Not Build in Phase 1

The following output formats are **explicitly out of scope for Phase 1** and must not be added to the Studio or any agent pipeline. They are document-productivity formats, not learning formats. FschoolAI is a learning intelligence product, not a document generator.

| Out-of-scope format | Reason | Phase |
|---|---|---|
| **Slide Deck generation** | Document-productivity format. NotebookLM has this. Not a learning format. | Phase 2 at earliest |
| **Infographic generation** | Document-productivity format. Requires design tooling outside the learning pipeline. | Phase 2 at earliest |
| **Data Table generation** | Document-productivity format. Not a learning format. | Phase 2 at earliest |
| **Real-time interactive podcast** (conversing with hosts live) | Technically complex, high latency, requires streaming TTS + dialogue management. Ship one-way podcast first and validate demand. | Phase 2 flag |

Any engineer who receives a request to add slide deck, infographic, or data table generation should escalate to Vincent before building. These are not scope creep — they are a different product category.

---

## 12. Dual-Database Architecture

FschoolAI runs on **two physically separate Supabase projects**. This is not a logical convenience — it is the enforcement boundary for the stateful-brain / stateless-agent model described in §13. The rule is absolute: FschoolAI owns the product; NeuroAGI Brain owns the person (source: CURRENT_ARCHITECTURE.md).

> **Architecture note (see §18):** This section describes the *current/transitional* deployment — FschoolAI reading the NeuroAGI brain's Supabase schemas directly. The *target* brain is the NeuroAGI **v2 kernel** (§18), which products reach through a REST/WS/MCP API rather than direct schema access. The raw-data-vs-abstraction boundary (§12.3) and the person/product ownership rule hold in both; only the access mechanism changes.

### 12.1 The Two Physical Projects

| Project | Supabase ref | Role | What lives here |
|---|---|---|---|
| **FschoolAI Production DB** | `wqgxpouhbwhwpzudrptp` | Raw operational store (stateless domain layer) | User accounts, Canvas OAuth tokens, raw Canvas payloads, course/assignment/grade records |
| **NeuroAGI Brain DB** | `qiolhlvqfzujnkwnymft` | Stateful intelligence layer | Identity, signals, patterns, knowledge gaps, hypotheses, interventions, chat sessions/messages |

**Why two projects, not two schemas in one project.** The Brain is a separate entity that long-term serves many apps via the Brain SDK, not just FschoolAI (source: ARCHITECTURE_V2_STATEFUL_STATELESS.md §5). Keeping it in its own Supabase project means the Brain can be addressed, scaled, secured, and eventually swapped for a graph DB independently of any single product. FschoolAI is "an app that runs on the OS"; the Brain is "the OS" (source: CURRENT_ARCHITECTURE.md). Physical separation also prevents the common failure mode of agents reaching into raw operational tables and treating the product DB as memory.

### 12.2 The Four Brain DB Schemas

The Brain DB is partitioned into four schemas. Every schema ultimately references `neuro.persons(id)` as the root of identity (source: strategy/docs/DATABASE_ARCHITECTURE.md).

| Schema | Purpose | Key tables (real names from the docs) |
|---|---|---|
| `neuro` | Core identity + long-term memory | `neuro.persons` (id, display_name, email, timezone, language; carries `canvas_user_id`), `neuro.memory` (key-value facts), `neuro.patterns` (behavioral patterns) |
| `brain` | The learned/evolving intelligence | `brain.signals`, `brain.reflections`, `brain.context_window`, `brain.knowledge` / `brain.knowledge_graph` |
| `agents` | Conversation state | `agents.sessions`, `agents.messages` |
| `fschool` | The brain's *view* of academic domain data (not the source of truth) | `fschool.students` (links to `neuro.persons`), `fschool.courses`, `fschool.assignments`, `fschool.grades` |

(source: CURRENT_ARCHITECTURE.md; strategy/docs/DATABASE_ARCHITECTURE.md)

> Note: several services still reference non-existent flat tables (`brain_signals`, `behavioral_signals`, `concept_progress`). The canonical write path is `supabase.schema('brain').from('signals')`, keyed on `person_id` (source: CURRENT_ARCHITECTURE.md, Problems 1–2). Code must use the schema-qualified tables above; flat-table names are wrong.

### 12.3 The Raw-Data vs Learned-Abstraction Boundary

The hard architectural rule: **raw domain data stays in FschoolAI; only learned abstractions enter the Brain** (source: ARCHITECTURE_V2_STATEFUL_STATELESS.md §3).

| Raw domain data (stays in FschoolAI Production DB) | Learned abstraction (enters NeuroAGI Brain DB) |
|---|---|
| Music 201 assignment score: 94/100 | `music_performance_signal: strong, consistent across 3 assignments` |
| PSYC 201 lecture transcript | `psyc201_knowledge_gap: classical vs operant conditioning` |
| 2.5h study session on stats | `stats_engagement_pattern: deep focus, evening, visual learner` |
| Professor Chen's syllabus | `professor_chen_style: case-study heavy, midterm = 40%` |

The Brain holds **signals, patterns, gaps, and traits — not documents** (source: ARCHITECTURE_V2_STATEFUL_STATELESS.md §3). This both prevents data bloat and enables cross-agent intelligence: a third-party agent can read `music_performance_signal` without ever touching the raw Music 201 records. The `fschool.*` schema is the one nuance — it is the brain's *read-view* of academic data so the brain can reason about deadlines (e.g. `brain-context-window.ts` reads upcoming deadlines from `fschool.assignments`), but the source of truth remains `public.*` in the Production DB (source: CURRENT_ARCHITECTURE.md, Problem 8).

### 12.4 The `person_id ↔ user_id` Bridge

The two databases use **different identifiers for the same student**, and reconciling them is a critical blocker (source: BACKEND_GAPS.md, Gap 1).

- FschoolAI Production DB: `public.users.id` is **`text`** — the Canvas user ID (e.g. `"12345"`) (source: CURRENT_ARCHITECTURE.md, Problem 4).
- NeuroAGI Brain DB: `neuro.persons.id` is a **`uuid`** (source: CURRENT_ARCHITECTURE.md; DATABASE_ARCHITECTURE.md).

There must be an explicit mapping. The docs reference two mechanisms, which the implementation must reconcile:

1. A `canvas_user_id` column on `neuro.persons`, looked up on Canvas OAuth login (source: CURRENT_ARCHITECTURE.md, Problem 4).
2. A `person-bridge` utility (`backend/server/utils/person-bridge.ts`) exposing `getPersonId(userId)` that finds-or-creates the `neuro.persons` record, plus a `fschool_user_id UUID` column on `neuro.persons` (source: BACKEND_GAPS.md, Gap 1).

> **Decision (v1.8):** Resolved via the v2 model. The brain identifies a person by a **text `subject`** (v2's `memory.subject` is `text`), and the brain **holds no foreign key into product tables** (the §18.1 hard rule forbids it) — so the UUID-vs-text FK question dissolves. The person-bridge maps the FschoolAI user id → a stable text `subject` (one per person, reused across products, §18.5). The transitional Supabase deployment may keep a `canvas_user_id` lookup column on `neuro.persons` typed to match the actual `public.users.id`; it is a lookup aid, not the identity mechanism.

The required pattern: every route that receives a FschoolAI identifier must resolve it to `person_id` **before any brain operation** — chat (`agents.sessions`/`agents.messages`), signals (`brain.signals`), context (`brain.context_window`), reflections (`brain.reflections`) all key on the Brain `person_id` UUID (source: CURRENT_ARCHITECTURE.md; BACKEND_GAPS.md). A new student is provisioned by creating `neuro.persons` first, then the `fschool.students` profile referencing `person_id` (source: DATABASE_ARCHITECTURE.md).

### 12.5 Environment Variables and the Connection Rule

A single `SUPABASE_URL` for two databases is a known architectural-confusion hazard (source: CURRENT_ARCHITECTURE.md, Problem 3). The required configuration is two explicit clients:

```
BRAIN_SUPABASE_URL=https://qiolhlvqfzujnkwnymft.supabase.co
BRAIN_SUPABASE_KEY=...

FSCHOOL_SUPABASE_URL=https://wqgxpouhbwhwpzudrptp.supabase.co
FSCHOOL_SUPABASE_KEY=...
```

(source: CURRENT_ARCHITECTURE.md, Problem 3)

**Rules:**
- Backend services that read/write intelligence (chat, signals, reflections, sessions) **must** point at the Brain DB via `BRAIN_SUPABASE_*`.
- Services that read/write operational Canvas data (`canvas-sync.ts`) **must** use `FSCHOOL_SUPABASE_*`. The `VITE_`-prefixed vars are frontend-only and **must not** be used in backend services (source: CURRENT_ARCHITECTURE.md, Problem 3).
- Canvas sync writes to **both** databases: `public.assignments` (operational source of truth) and `fschool.assignments` (brain's academic view) (source: CURRENT_ARCHITECTURE.md, Problem 8).

---

## 13. Stateful Brain, Stateless Agents

### 13.1 The Inversion

The foundational principle, from the v2 architecture review: **NeuroAGI is stateful; FschoolAI is stateless** (source: ARCHITECTURE_V2_STATEFUL_STATELESS.md §2).

| Layer | System | State | Responsibility |
|---|---|---|---|
| Brain | NeuroAGI | **Stateful** | Holds knowledge graph, cognitive patterns, memory, learned signals, identity. Persists across all apps and sessions. Never forgets. |
| Agents | FschoolAI | **Stateless** | Read from the brain, act, return results. Hold no state themselves. |
| Domain data | FschoolAI Library | **Stateless** | Course content, syllabi, professor intelligence — domain-specific, not personal. |

(source: ARCHITECTURE_V2_STATEFUL_STATELESS.md §2)

### 13.2 Why This Makes Agents Replaceable

Because all durable state lives in the Brain, an agent is a thin execution wrapper over accumulated brain context. Any agent can be rewritten, replaced, or retired **without losing history** — the signals, patterns, gaps, sessions, and reflections it produced remain in the Brain DB, owned by the person, not the agent. A new scenario does not require a new stateful agent; it requires existing agents to read *different* brain signals (source: ARCHITECTURE_V2_STATEFUL_STATELESS.md §7).

### 13.3 Where Chat State Lives

Chat sessions and messages are **brain state, not product state**. They live in `agents.sessions` and `agents.messages` in the **Brain DB** (source: CURRENT_ARCHITECTURE.md, Problem 5; DATABASE_ARCHITECTURE.md). The Production DB's `public.sessions` and `public.messages` are **dead legacy tables (0 rows)** retained only from the pre-brain schema and must not be used (source: CURRENT_ARCHITECTURE.md, Problem 5).

### 13.4 The read → act → write Loop

Every agent invocation follows one loop (source: CURRENT_ARCHITECTURE.md; ARCHITECTURE_V2_STATEFUL_STATELESS.md §7):

1. **Read** brain context for the resolved `person_id` (the pre-computed `brain.context_window` snapshot — memory, patterns, knowledge, recent signals, upcoming deadlines).
2. **Act** — the agent reasons over that context and executes its task (e.g. `brain-chat-session.ts` calls Claude, see §7.1 model-routing).
3. **Write** a distilled signal back via `signal-ingestion.ts` → `brain.signals`, keyed on `person_id` with `source: 'fschoolai'` and `occurred_at`. Raw conversation is processed by reflection (`brain-reflection-engine.ts`) into signals/patterns — only abstractions persist (source: CURRENT_ARCHITECTURE.md, Problems 1–2 fix; §3 of v2 doc).

### 13.5 Concurrency at Scale

Stateless agents scale horizontally with no inter-instance coordination — each request is independent (source: ARCHITECTURE_V2_STATEFUL_STATELESS.md §6). Concurrency risk concentrates at the **brain write layer** (nightly reflection):

| Risk | Mitigation |
|---|---|
| Thousands of nightly reflections firing at once | **Staggered scheduling** across a 4-hour window (10 PM–2 AM local), not all at midnight |
| Brain write contention | **Write queue with optimistic locking**; reflection writes are low-frequency (once/day/person) |
| Graph DB write throughput (future state) | Target graph DB supports 100K+ writes/sec — not a bottleneck at FschoolAI scale |

(source: ARCHITECTURE_V2_STATEFUL_STATELESS.md §6)

### 13.6 The Context-Window Latency Reality

The read step has a latency cost that conflicts with the §9 NFR. When `brain.context_window` is empty, `brain-chat-session.ts` falls back to `refresh()`, which runs **~10 parallel DB queries plus a Claude call — roughly 3–8 seconds** before the student gets any response (source: CURRENT_ARCHITECTURE.md, Problem 7). This violates the §9 3-second response NFR.

**Resolution — the pre-computed `brain.context_window` cache:**

1. The scheduler (`brain-scheduler.ts`) pre-computes and refreshes `brain.context_window` per person (e.g. every 30 min), so chat reads a ready snapshot instead of recomputing (source: CURRENT_ARCHITECTURE.md, Problem 7).
2. Add an in-memory/Redis cache layer over `brain.context_window` to avoid a DB read on every message.
3. Return a fast fallback response while context loads in the background on a cold miss.

The cache is what reconciles the read→act→write loop with the 3-second NFR: steady-state reads hit a warm snapshot, and the expensive 10-query refresh runs **off the request path** on the scheduler.

---

## 14. Complete Agent Roster — Main Agents & Sub-Agents

This section reconciles the PRD's 15 numbered agents (plus §4.1 Studio) with the fuller agent map maintained in `strategy/FEATURE_AND_AGENT_MAP.md` and `agents/PAGE_AI_MAP.md`. Those documents assume a layered architecture — a **Tutor Coordinator / Agent Manager** that routes one student-facing voice to many specialist sub-agents, backed by a **proactivity infrastructure** that runs on a scheduler — that the numbered list only partially captures.

### 14.1 Main (interactive) agents — recap

These are the 15 already specced. They are surfaced to the student through the named tutor (one voice, many specialists — see `agents/PAGE_AI_MAP.md`).

| # | Agent | Primary page(s) | Trigger (one line) |
|---|---|---|---|
| 1 | Reggie (Tutor Coordinator / Agent Manager) | CHAT (all pages) | Every student message; reads context window first, then routes to a sub-agent. |
| 2 | Canvas Agent | CANVAS, ASSIGNMENTS | Student asks about grades/deadlines/courses. |
| 3 | Tutor / Study Agent | STUDY, CHAT | Flashcard / study-guide / explain request. |
| 4 | Planner | HOME, ASSIGNMENTS | Today's-priorities / scheduling request. |
| 5 | Lecture (Recording) Agent | LIBRARY | Audio upload → transcription + professor-emphasis detection. |
| 6 | Library Agent | LIBRARY | Resource request / file upload. |
| 6b | Lesson Generator (video) | STUDY, CHAT | Gap + deadline detected, or "teach me about [topic]". |
| 7 | Exam Mode | STUDY, CHAT | Exam-prep request. |
| 7b | Exam Predictor (static) | ASSIGNMENTS, CANVAS | Grade-prediction request. |
| 8 | Intervention Engine | HOME, CHAT (push) | Absence / deadline-at-risk detected. |
| 9 | Audio Agent | ALL (voice layer) | STT / TTS / translate. |
| 10 | Office Hours | CANVAS, CHAT | Professor / scheduling query. |
| 11 | Calendar | HOME, ASSIGNMENTS | Deadline / event sync. |
| 12 | Reflection Engine | BRAIN, CHAT | Scheduler tick (nightly + 6h). |
| 13 | Terminal | (dev/admin) | Operator command. |
| 14 | Cohort Agent | SOCIAL, LEADERBOARD | Cohort-level aggregation. |
| 15 | Podcast Agent | STUDIO | Audio Overview request. |

### 14.2 Background / infrastructure agents (the proactivity backbone)

These never address the student directly. They keep the brain warm so interactive agents always read a pre-computed context window rather than rebuilding from raw signals (source: `agents/context-window-builder.md`; `agents/PAGE_AI_MAP.md`). **These are assumed by the proactivity model but are not in the numbered list — they should be added.**

| Agent | Cadence | Reads | Writes |
|---|---|---|---|
| **Brain Scheduler** | Cron; context rebuild + Canvas sync every 30 min, Reflection every 6h | n/a (orchestrator) | Triggers the agents below; no direct DB write |
| **Signal Ingestion** | Continuous (on any event) | Raw events from Canvas, chat, study sessions, UI | `brain.signals` (normalized) |
| **Context Window Builder** | Every 30 min (scheduler) + on-demand if stale >30 min | `brain.signals`, `neuro.patterns`, `neuro.memory`, `agents.sessions`, `brain.reflections`, `fschool.assignments` | `brain.context_window` |
| Reflection Engine (Agent 12) | Every 6h / nightly | `brain.signals` (last N), `brain.reflections` | `brain.reflections`, `neuro.patterns` |
| Intervention Engine (Agent 8) | Event-driven (absence / deadline) | `brain.signals`, `fschool.assignments` | Push notifications; `brain.signals` |
| Cohort Agent (Agent 14) | Periodic aggregate | Cross-student `brain.signals` (consented) | `brain.signals`, cohort tables |

### 14.3 Sub-agents / specialist agents missing from the numbered list

Each below has a spec in `/agents` but no slot in the 15. Owner is **TBD** unless a spec names one.

#### Situation Synthesizer
- **Status:** NOT BUILT, Sprint 1, build first (source: `agents/situation-synthesizer.md`).
- **Purpose:** Generates the tutor's situation-aware opening greeting on every app open.
- **Trigger:** HOME page load, chat open from HOME, or when Motivation Engine sends a nudge.
- **Inputs:** `brain.signals` (24h), `fschool.assignments` (7d), `neuro.patterns`, `neuro.memory` (tutor name), `agents.sessions`, `agents.messages` (last).
- **Outputs:** `brain.signals` (type `situation_synthesis`), updates `brain.context_window.current_situation`.

#### Motivation Engine
- **Status:** NOT BUILT, Sprint 3 (source: `agents/motivation-engine.md`).
- **Purpose:** Detects motivation drops and fires the right nudge *type* (competitive/achievement/social/fear/curiosity/reward) for this student.
- **Trigger:** Every 2h for active students; also absence, engagement decline, streak-at-risk, leaderboard drop, friend-online.
- **Inputs:** `brain.signals` (48h), `neuro.patterns` (`motivation_response_history`).
- **Outputs:** `brain.signals` (`motivation_nudge_sent`, success/ignored), `neuro.patterns` (nudge-type effectiveness).

#### Professor Intelligence
- **Status:** NOT BUILT, Sprint 2, HIGH priority (source: `agents/professor-intelligence.md`).
- **Purpose:** Builds a per-professor grading-style profile from the student's own graded work.
- **Trigger:** New grade posted, course-page open, "what does Prof [x] want?", or call from Assignment Agent.
- **Inputs:** graded submissions + feedback + rubrics from Canvas, prior `brain.reflections` (`professor_insight`).
- **Outputs:** `brain.reflections` (`professor_insight`), `brain.signals` (`professor_profile_updated`).

#### Voice Preference Agent
- **Status:** PARTIAL (`detectVoiceChangeIntent` exists; ElevenLabs Voice-Design generation not finished — see §19.11). **Lives inside the Agent Manager**, not standalone (source: `agents/voice-preference-agent.md`).
- **Purpose:** Detects voice-change intent in any message and generates a custom voice via ElevenLabs Voice Design.
- **Trigger:** `detectVoiceChangeIntent()` runs on every message before routing.
- **Inputs:** `neuro.voice` (current voice_id), `neuro.memory` (tutor name).
- **Outputs:** `neuro.voice` (new voice_id + description), `brain.signals` (`preference` / `voice_changed`).

#### Assignment Agent
- **Status:** PARTIAL (`brain-assignment.ts` exists, basic), Sprint 2 (source: `agents/assignment-agent.md`).
- **Purpose:** On "Help me start," generates a personalized starting framework from rubric + professor profile + gaps; outputs time estimates + predicted grade.
- **Trigger:** "Help me start" tap, chat request, or proactively 48h pre-deadline if not started.
- **Inputs:** `fschool.assignments`, `brain.reflections` (`professor_insight`, `writing_analysis`), context window (gaps), `neuro.patterns`.
- **Outputs:** `brain.signals` (`assignment_help_requested`), `agents.messages` (the framework).

#### Study Room Orchestrator
- **Owner:** Aryan (Cloudflare Durable Objects infra). **Status:** NOT BUILT, Sprint 3 (source: `agents/study-room-orchestrator.md`).
- **Purpose:** Runs the in-room AI tutor across multiple students simultaneously without leaking any individual's gaps. 6 modes (facilitator, peer-teaching, clarifier, challenger, timekeeper, silent).
- **Trigger:** Student joins room, room question asked, 10-min silence, topic change.
- **Inputs:** each participant's private context window, room topic, conversation history.
- **Outputs:** `brain.signals` (per-student room interactions, peer-teaching events), `neuro.patterns` (group-config effectiveness).

#### Social Intelligence
- **Status:** NOT BUILT, Sprint 3 (source: `agents/social-intelligence.md`).
- **Purpose:** Models who the student studies best with; scores friend compatibility and suggests partners.
- **Trigger:** SOCIAL page open, room-session end, "who should I study with?", or detection of solo study where social would help.
- **Inputs:** study-room history, post-room performance, friend interactions, schedule/course overlap (opt-in).
- **Outputs:** `brain.signals`, `brain.reflections` (social insights), `neuro.patterns` (social effectiveness).

#### Content Connector
- **Status:** BUILT — `feat/content-connector` (PR open). *(Originally NOT BUILT, Sprint 4; source: `agents/remaining-agents.md`.)*
- **Purpose:** Links outside content (videos/articles/links) to current coursework.
- **Trigger:** Student shares a link, or brain detects from integrations.
- **Inputs:** shared content + `fschool.courses` / current-course context. **Outputs:** `brain.signals` (`content_connection`).

#### Writing Evolution Tracker
- **Status:** BUILT — `feat/writing-tracker` (PR open). *(Originally NOT BUILT, Sprint 4; = the "Writing Intelligence Agent" flagged HIGH in FEATURE_AND_AGENT_MAP Page 4.)*
- **Purpose:** Analyzes every submission for complexity, vocabulary, clarity, citation accuracy; tracks growth over time.
- **Trigger:** Every assignment submission; monthly report.
- **Inputs:** submitted writing, prior `brain.signals` (`writing_metrics`). **Outputs:** `brain.signals` (`writing_metrics`), `brain.reflections` (`writing_evolution_report`).

#### Knowledge Graph Builder
- **Status:** NOT BUILT, Sprint 4 (source: `agents/remaining-agents.md`).
- **Purpose:** Renders an interactive concept graph (node = concept, edge = relation, size = mastery).
- **Trigger:** BRAIN page open. **Inputs:** `neuro.patterns`, `brain.signals`. **Outputs:** read-mostly.

#### Focus Agent
- **Status:** NOT BUILT, Sprint 4 (source: `agents/remaining-agents.md`).
- **Purpose:** Tracks attention during study; learns optimal session length; suggests breaks.
- **Trigger:** Study session start. **Inputs:** interaction timing, scroll/tab patterns, `neuro.patterns`. **Outputs:** `brain.signals` (`session_duration`, `focus_score`, `break_taken`).

#### Library Organizer
- **Status:** NOT BUILT, Phase 2 / Sprint 4 (source: FEATURE_AND_AGENT_MAP Page 7).
- **Purpose:** Classifies uploads by course/topic/type, extracts concepts, connects to assignments.
- **Trigger:** Any file upload. **Inputs:** `brain.context_window`, `fschool.courses`. **Outputs:** `brain.signals` (`library_upload`), `brain.reflections` (extracted concepts).

#### UI Preference Agent
- **Status:** NOT BUILT, Sprint 4 (source: `agents/remaining-agents.md`).
- **Purpose:** Applies interface customizations requested in chat ("make it darker").
- **Trigger:** UI-modification intent in any message. **Inputs:** chat message, `neuro.memory` (`ui_preferences`). **Outputs:** `neuro.memory`, `brain.signals` (`ui_customization`).

#### Pattern Recognition
- **Status:** NOT BUILT (source: `agents/PAGE_AI_MAP.md`; logic overlaps Reflection Engine).
- **Purpose:** Identifies learning style and behavioral patterns from signal history.
- **Trigger:** Background. **Inputs:** `brain.signals` history. **Outputs:** `neuro.patterns`.

> Also referenced but folded elsewhere: **Token Engine** (in-app gamification, surfaced on every page — source: `agents/PAGE_AI_MAP.md`, `agents/token-engine.md`) and **Leaderboard Agent** (source: `agents/remaining-agents.md`). These are infrastructure/gamification rather than tutoring sub-agents. **Both are now in Phase-1 scope** (§11, resolved v1.8 — the old Social/Leaderboard deferral was removed), and the **Leaderboard Agent is built** (G4.3, server-side ranking, merged). The cohort/leaderboard aggregation surfaces still owe the PIPEDA/FERPA + k-anonymity gate in §14 before exposing any cross-student data.

### 14.4 Which agent owns what — and overlaps to resolve

| Capability | Owning agent | Folded into a numbered agent? |
|---|---|---|
| Opening greeting / working memory | Situation Synthesizer | Partially overlaps Agent 4 (Planner) for "today's priorities"; should feed it, not duplicate. |
| Pre-computed brain context | Context Window Builder | Infrastructure (§14.2); no numbered slot — recommend adding. |
| Voice synthesis vs voice *preference* | Audio Agent (#9) plays TTS; **Voice Preference Agent** chooses/generates the voice | Voice Preference Agent should be a sub-capability of the Agent Manager that configures Agent 9, not a second audio agent. |
| Grade prediction (static vs live) | **Exam Predictor (#7b)** is static; `agents/exam-predictor.md` specs a **dynamic** predictor that updates in real time | §7b should be extended to the dynamic model, not kept as a separate static agent. |
| Lesson creation (video vs multi-format) | **Lesson Generator (#6b)** is video-only; `agents/lesson-generator.md` specs **multi-format** micro-lessons | §6b should generalize beyond video to the full lesson-type matrix. |
| Draft analysis / writing growth | Writing Evolution Tracker | Not numbered; FEATURE_AND_AGENT_MAP calls it "Writing Intelligence." Same agent, two names — consolidate. |
| Professor grading profiles | Professor Intelligence | Not numbered; feeds Assignment Agent and Exam Predictor. Recommend numbering. |
| Assignment frameworks | Assignment Agent | Not numbered; partial code exists (`brain-assignment.ts`). |
| In-room multi-student tutoring | Study Room Orchestrator | Not numbered; depends on Aryan's Durable Objects infra. |
| Social compatibility / partner suggestion | Social Intelligence | Distinct from Agent 14 (Cohort) — Social Intelligence is per-student, Cohort is aggregate. |
| Knowledge map / pattern surfacing | Knowledge Graph Builder + Pattern Recognition | Pattern Recognition overlaps Reflection Engine (#12); recommend it be a read-side view of Reflection output, not a separate writer. |
| Attention / focus | Focus Agent | Not numbered. |
| Upload classification | Library Organizer | Partially overlaps Agent 6 (Library); Organizer is the background classifier behind the Library page. |
| UI / content / motivation | UI Preference Agent, Content Connector, Motivation Engine | None numbered; Motivation Engine partially overlaps Agent 8 (Intervention). Keep distinct but coordinate via one delivery layer to avoid double-nudging. |

**Net gap:** the numbered list (1–15) is interactive-agent-centric and omits the entire §14.2 infrastructure tier and most §14.3 specialists. Recommended action: (a) add Context Window Builder, Signal Ingestion, and Brain Scheduler as explicitly numbered infrastructure agents; (b) extend §6b, §7b, and §9 per the overlaps above rather than create duplicates; (c) number Professor Intelligence, Assignment Agent, Writing Evolution Tracker, Social Intelligence, and Study Room Orchestrator as first-class sub-agents under the Agent Manager.

---

## 15. API & Frontend–Backend Contract

### 15.1 Contract principles

FschoolAI exposes two complementary API surfaces, and the distinction is foundational.

**The single-endpoint model.** The frontend never calls individual agents directly. Every AI interaction — greetings, assignment enrichment, study prep, chat — flows through exactly one route:

```
POST /api/agent-manager
Body: { page, student_id, action?, context? }
Response: { type, content, signals? }
```

The Agent Manager decides which agent runs. The UI team designs to this contract; the backend team builds to it. This is what makes connecting a new page "a one-hour job per page" — the UI never learns which agent ran, how brain context is assembled, or which tables are read (source: FRONTEND_BACKEND_CONTRACT.md).

**The broader endpoint surface.** Beneath the Agent Manager, the backend also exposes a granular REST surface (~50 routes across brain, agent, signals, and Canvas domains) documented in API_DOCUMENTATION.md. These are used by the Agent Manager itself, by background jobs, by the browser extension, and for direct integration/testing.

**Auth.** All requests except `GET /health` require a JWT in the Authorization header (source: API_DOCUMENTATION.md): `Authorization: Bearer <jwt_token>`.

**Base URL & versioning.** Dev base URL `http://localhost:5000`; API version `1.0.0`; all timestamps ISO 8601 (source: API_DOCUMENTATION.md).

### 15.2 Endpoint catalog

Key endpoints grouped by domain. **Full list in API_DOCUMENTATION.md.**

| Group | Method & Path | Purpose |
|-------|---------------|---------|
| **agent-manager** | `POST /api/agent-manager` | Single entry point; routes a page+action to the right agent |
| **health** | `GET /health` | Server status; only route not requiring auth |
| **brain/** | `POST /api/brain/process` | Process user input through the brain |
| **brain/** | `POST /api/brain/causal-analysis` | Analyze causal relationships in user data |
| **brain/** | `POST /api/brain/predict` | Generate predictions about user outcomes |
| **brain/** | `POST /api/brain/intervene` | Get intervention recommendations |
| **brain/** | `GET /api/brain/insights/:userId` | AI-generated insights about a user |
| **brain/** | `GET /api/brain/status?userId=` | Current brain status (focus, emotional state, velocity) |
| **brain/** | `POST /api/brain/feedback` | Submit feedback to improve the brain |
| **agent/** | `GET /api/agents` | List all available agents |
| **agent/** | `POST /api/agents/study` | Personalized study explanation |
| **agent/** | `POST /api/agents/focus` | Detect/enable focus mode |
| **agent/** | `POST /api/agents/motivation` | Motivation boost |
| **agent/** | `GET /api/agents/performance?userId=` | Performance analysis |
| **agent/** | `POST /api/agents/problem-solver` | Step-by-step problem help |
| **agent/** | `POST /api/agents/synthesis` | Connect concepts |
| **agent/** | `POST /api/agents/personalization` | Personalized learning path |
| **agent/** | `POST /api/agents/reflection` | Consolidate learning after a session |
| **agent/** | `GET /api/agents/recommendation?userId=` | Next learning recommendation |
| **agent/** | `POST /api/agents/escalation` | Check if escalation to instructor is needed |
| **signals/** | `POST /api/signals/behavioral` | Log behavioral signal |
| **signals/** | `POST /api/signals/emotional` | Log emotional signal |
| **signals/** | `POST /api/signals/knowledge` | Log knowledge/mastery signal |
| **signals/** | `POST /api/signals/context` | Log context signal (location/device/environment) |
| **signals/** | `POST /api/signals/outcome` | Log outcome signal (result/score) |
| **signals/** | `POST /api/signals/batch` | Batch insert mixed signals |
| **signals/** | `GET /api/signals/:userId?limit=&offset=` | Get all signals for a user, paginated |
| **canvas/** | `POST /api/canvas/oauth/authorize` | Start Canvas OAuth flow |
| **canvas/** | `GET /api/canvas/oauth/callback` | Canvas OAuth callback, handled automatically |
| **canvas/** | `POST /api/canvas/sync` | Sync Canvas courses/assignments/grades |
| **canvas/** | `GET /api/canvas/courses?userId=` | Get synced Canvas courses |
| **canvas/** | `GET /api/canvas/assignments?userId=` | Get Canvas assignments |

> **`auth/` and `extension/`:** API_DOCUMENTATION.md (v1.0.0) does not yet enumerate dedicated `auth/*` routes (auth is a JWT requirement on all routes) or `extension/*` routes (the extension currently reuses brain/signals/agent routes). `extension/*` routes are required per §16/§17 (Gap 2) and are reserved here.

> **Resolved (v1.8, §18.2):** The `brain/*` RPC routes above (`/process`, `/causal-analysis`, `/predict`, `/intervene`) are **FschoolAI's product-side API**, not the brain's own interface. The NeuroAGI v2 brain is reached through `remember` / `recall` / `forget` / `reinforce` + the capability bus (`invoke` / `ingest` / `tick`), exposed over REST + `WS /channel/{device}` + MCP. **Decision:** the canonical *product* contract is the single `POST /api/agent-manager` (+ SSE, §15.1/§15.4); the canonical *brain* interface is the v2 primitive set. The granular `/api/brain/*` RPC routes are **deprecated as a public contract** — retained only as internal compositions the agent-manager may call, never something the frontend or another product targets directly.

### 15.3 Request/response envelope

**Success envelope** (granular API):

```json
{
  "success": true,
  "data": { "agentUsed": "study", "response": "...", "insights": [], "recommendations": [] },
  "requestId": "req-123",
  "timestamp": "2026-05-21T00:00:00Z"
}
```

Agent Manager responses use the lighter contract envelope (`type` + `content`, optional `signals`).

**Error envelope:**

```json
{
  "success": false,
  "error": { "code": "ERROR_CODE", "message": "Human readable message", "details": {} },
  "requestId": "req-123",
  "timestamp": "2026-05-21T00:00:00Z"
}
```

**Error codes** (source: API_DOCUMENTATION.md):

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `AUTHENTICATION_ERROR` | 401 | Missing/invalid token |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMIT` | 429 | Rate limit exceeded |
| `EXTERNAL_SERVICE_ERROR` | 502 | External service failed |
| `DATABASE_ERROR` | 500 | Database error |
| `AGENT_ERROR` | 500 | Agent processing error |
| `BRAIN_ERROR` | 500 | Brain system error |
| `INTERNAL_ERROR` | 500 | Internal server error |

At the contract layer, errors are also surfaced inline as an `error`-typed agent-manager response (`{ "type": "error", "content": { "code", "message", "fallback" } }`) so the UI renders a graceful fallback instead of a blank screen (source: FRONTEND_BACKEND_CONTRACT.md).

### 15.4 Streaming — chat SSE contract

Chat is the one action that streams (Server-Sent Events). Frontend sends `action: "chat"` with `context.message`; backend streams `stream_chunk` events terminated by a single `stream_done` carrying earned tokens (source: FRONTEND_BACKEND_CONTRACT.md):

```json
{ "type": "stream_chunk", "content": "Entropy is..." }
{ "type": "stream_chunk", "content": " the measure of..." }
{ "type": "stream_done", "tokens_earned": 5 }
```

Separately, a `tokens_earned` event (WebSocket or polling) pushes `{ amount, reason, new_balance, tier_progress }` so counters/tier progress update live.

### 15.5 Per-page contracts

Every page calls the same `POST /api/agent-manager`; the `page` + `action` fields select behavior and the response `type` tells the UI what to render (source: FRONTEND_BACKEND_CONTRACT.md):

| Page | Action(s) sent | Response `type` |
|------|----------------|-----------------|
| HOME | (load on page load; cache 15 min) | `greeting` |
| ASSIGNMENTS | `load`, `help_start` | `assignments_enriched`, `assignment_framework` |
| STUDY | `load`, `generate_flashcards` | `study_ready` |
| CANVAS | `load` | `canvas_enriched` |
| BRAIN | `load` | `brain_state` |
| SOCIAL | `load` | `social_state` |
| LEADERBOARD | `load` (with `context.category`, `context.scope`) | `leaderboard` |
| All pages (Chat) | `chat` | `stream_chunk` … `stream_done` (SSE, §15.4) |

### 15.6 Rate limiting & Canvas OAuth callback

**Rate limiting** (source: API_DOCUMENTATION.md): per user 100 req/min; per IP 1000 req/min. Remaining quota on `X-RateLimit-Remaining`; exceeding either returns `RATE_LIMIT` (429). List endpoints paginate via `limit`/`offset`.

**Canvas OAuth callback** is a two-step flow: `POST /api/canvas/oauth/authorize` returns an `authUrl`; after the user authorizes, Canvas redirects to `GET /api/canvas/oauth/callback`, which the backend handles automatically (code exchange + token persistence). The app then calls `POST /api/canvas/sync`. No frontend handling of the callback is required.

---

## 16. Chrome Extension Architecture

The Chrome extension is the only surface that sees what a student actually does inside their LMS. The PRD previously reduced it to "captures lecture audio"; that is a fraction of its role. It is the brain's eyes and ears on the LMS — a behavioral-signal emitter and content capturer that feeds both the FschoolAI Library and the NeuroAGI Brain. Built on Manifest V3 (content script + background service worker).

### 16.1 Core Principle — Signal Emitter + Content Capturer, Not an Audio Recorder

> The extension is not a sync tool. It is a **brain signal emitter** that also happens to sync academic data. (source: EXTENSION_ARCHITECTURE.md)

Every action is a signal; every piece of content is a library item. The extension is "dumb and fast"; the backend and brain are "smart and persistent." It makes no decisions and holds no intelligence (source: EXTENSION_ARCHITECTURE.md).

| Component | File | Role |
|---|---|---|
| Background service worker | `background.js` | Sync, backend API calls, signal emission, auto-crawl, Canvas API ingest |
| Content script | `content/universal.js` | Page-type detection, deep text extraction (incl. shadow DOM piercing), time-on-page |
| Popup UI | `popup/popup.html` + `popup/popup.js` | Login, capture button, sync status |

Data flow forks at the content script: each detected page produces **(a)** a behavioral signal → `/api/extension/signal`, and **(b)** content capture → `/api/extension/content` (source: EXTENSION_ARCHITECTURE.md).

### 16.2 Multi-LMS Support

Targets Canvas, D2L, Moodle, and Blackboard (source: LIBRARY_ARCHITECTURE.md). The existing page-detection + deep-text-extraction logic in `content/universal.js` is solid and must be preserved — in particular **shadow DOM piercing** (for D2L web components) and **auto-crawl** (for D2L/Moodle) (source: EXTENSION_ARCHITECTURE.md).

**Content-type detection.** Each page is classified as `courses`, `assignments`, `grades`, `syllabus`, `rubric`, `lecture`/`module`, `announcement`, or `feedback` (source: EXTENSION_ARCHITECTURE.md).

**`university_id` derivation.** Derived from the LMS URL host — canonical example `canvas.utoronto.ca → "uoft"` (others: `"ubc"`, `"mcmaster"`, `"mit"`, `"stanford"`) (source: LIBRARY_ARCHITECTURE.md). Every backend request includes the derived `university_id`. The exact host→ID mapping table is **TBD**.

### 16.3 Content Capture

The extension captures full page **content**, not just metadata (v1 captured only names/dates/scores, forcing generic AI answers) (source: EXTENSION_ARCHITECTURE.md).

| Content Type | Trigger | Shared? | Stored In |
|---|---|---|---|
| `syllabus` | Visits syllabus page | Yes | `public.course_content` (Library) |
| `lecture` | Visits lecture/module page | Yes | `public.course_content` (full text, week number) |
| `rubric` | Opens assignment details | Yes | `public.course_content` (+ `professor_name` if extractable) |
| `announcement` | Views announcements | Yes | `public.course_content` |
| `feedback` | Views graded work | **No — personal** | NeuroAGI Brain signals only, never the shared Library |

Shared content lands in `course_content` (Production DB) via `POST /api/extension/content`; the backend dedups and stores only new items. Key columns: `university_id`, `course_id`, `canvas_course_id`, `content_type`, `content_hash`, `text` (≤~50,000 chars), `summary`/`concepts` (populated by Library Organizer), `week_number`, `module_name`, `professor_name`, `source_url`, `first_seen_at`/`last_seen_at`, `seen_by_count` (source: LIBRARY_ARCHITECTURE.md).

**PDFs/PPTs rendered on-page:** the extension extracts on-page *rendered text* of slides/module pages (shadow-DOM-piercing handles component renderers). **Natively-downloaded binary PDF/PPT/DOCX files are handled by the Layer 2–3 session-fetch plus backend-extraction pipeline in §16.8** (this resolves the earlier on-page-text-only limitation) (source: EXTENSION_ARCHITECTURE.md, §16.8).

### 16.4 Behavioral Signal Emission

The extension emits a personal signal for every meaningful LMS action; these feed `brain.signals` (source: EXTENSION_ARCHITECTURE.md). Signals POST with `source: 'chrome_extension'`, timestamp, and URL.

| Student Action | Signal Type | Key Payload |
|---|---|---|
| Opens any assignment page | `assignment_viewed` | `assignment_id`, `days_until_due`, `hour_of_day` |
| Spends >2 min on an assignment | `assignment_deep_read` | `assignment_id`, `time_on_page_seconds` |
| Bounces off assignment <30s | `assignment_bounced` | `assignment_id`, `days_until_due` |
| Opens grades page | `grades_checked` | `hour_of_day`, `day_of_week` |
| Opens grades after submitting | `post_submit_grade_check` | `assignment_id`, `time_since_submit` |
| Visits same assignment 3+× without submitting | `procrastination_loop` | `assignment_id`, `visit_count`, `days_until_due` |
| Opens LMS 11pm–4am | `late_night_session` | `hour_of_day`, `pages_visited` |
| Opens syllabus | `syllabus_viewed` | `course_id`, `week_of_semester` |
| Views professor feedback | `feedback_viewed` | `assignment_id`, `grade_received` |
| Navigates to a new course | `course_switched` | `from_course_id`, `to_course_id` |
| Canvas sync returns a graded assignment | `assignment_graded` | `score`, `max_score`, `percentage`, `submitted_at`, `due_at`, `days_early` |

Time-on-page is tracked (entry diffed on `beforeunload`); a `*_time_spent` signal fires when dwell exceeds 5s. These power pattern recognition, the intervention engine, and grade-trajectory prediction (reasonable accuracy after ~5 `assignment_graded` points) (source: EXTENSION_ARCHITECTURE.md).

### 16.5 The Shared-Library Moat

Course content is identical for every student in a course, so it is stored once and shared — **course-scoped and university-scoped, not student-scoped** (source: EXTENSION_ARCHITECTURE.md).

**Dedup by content hash.** `content_hash = SHA-256(university_id + course_id + content_type + text[:500])`, a `UNIQUE` column. The first student to visit triggers a full write + Claude analysis (~3s, fraction of a cent); the second student's matching hash → **no write, no Claude call** — they inherit the analyzed item at zero cost while still emitting their own view signal. `seen_by_count` records reach (source: LIBRARY_ARCHITECTURE.md).

**Network-effect rationale** (source: LIBRARY_ARCHITECTURE.md):

| Students at a University | Library Coverage |
|---|---|
| 10 | Syllabi + some lectures for popular courses |
| 50 | Complete library for all enrolled courses |
| 200 | Complete library for all major courses |
| 1,000 | Professor intelligence profiles from hundreds of graded assignments |
| 100,000 globally | Every major course at every major university, indexed and connected |

A competitor starting today has zero library and must accumulate it student-by-student; FschoolAI's library widens the gap every day — positioned as "the most important asset FschoolAI will ever build."

### 16.6 Cross-Course Intelligence

Without cross-course linking, every course is a silo. When the Library Organizer adds a new lecture/module, a **Cross-Course Connector** extracts its concepts, searches the Library for those concepts across the student's other enrolled courses, and stores each match in `brain.knowledge` (type `cross_course_connection`), e.g. `{ concept: "regression analysis", course_a: "PSYC201", course_b: "STATS101", chapter_b: 4, confidence: 0.87 }`. The context-window builder includes the top connections, so Reggie links new concepts to where the student already saw them (source: EXTENSION_ARCHITECTURE.md).

### 16.7 Security & Auth

All extension traffic must route through the FschoolAI backend (never directly to Supabase): authenticate with a Supabase Auth JWT, send `Authorization: Bearer <jwt>` on every call; the backend holds the service key and applies owner-scoped logic. The v2 recommendation replaces the custom SHA-256 login with `supabase.auth.signInWithPassword()`, JWT in `chrome.storage.local`. Anon-key-in-the-client is rejected (source: EXTENSION_ARCHITECTURE.md, extension/README.md).

**Must fix** (RLS/token/auth gaps from extension/AUDIT.md):

| ID | Severity | Gap | Required Fix |
|---|---|---|---|
| C2 | Critical | Open RLS (`for all using(true)`) + `grant all … to anon` + shipped anon key → anyone can dump every user row (email, password_hash, live canvas_token, gpa) and bulk PATCH/DELETE | Adopt Supabase Auth (`auth.uid()`); owner-scoped policies (`using (user_id = auth.uid()::text)`); `revoke all on neuroagi.users from anon`; never select `password_hash`/`canvas_token` client-side |
| C3 | Critical | Password auth = client-side unsalted SHA-256 vs a world-readable table; "session" = `localStorage.fschool_uid` (set any id = be that user) | Server-side auth with salted slow KDF (bcrypt/argon2); real session tokens; never expose `password_hash` |
| C4 | Critical | `canvas_token` stored plaintext + client-readable | Move tokens to a service_role-only table / Supabase Vault; rotate all existing tokens after C2 |
| H1 | High | Extension and web app mint divergent IDs for the same person | Make extension login-only (web app owns account creation), or adopt the existing row id on email match |
| H3 | High | Auto-capture stale-user race; `background.js` trusts `msg.userId` blindly → cross-user attribution | Re-read `neuroagi_user` immediately before send; stamp + verify user id before persisting |
| M1 | Medium | Auto-capture matches `<all_urls>` with broad keywords → scrapes non-LMS sites | Scope `content_scripts.matches`/auto-capture to detected LMS domains |
| M2 | Medium | Up to 600 chars of scraped PII logged to console | Remove or gate behind a debug flag |
| M4 | Medium | Missing indexes + nullable ownership FKs | Add indexes; `NOT NULL` on ownership FKs during the auth migration |

The audit places the **Auth + RLS overhaul (C2/C3/C4)** as #1 priority and says to "treat all current data (esp. every `canvas_token`) as exposed" until it lands (source: extension/AUDIT.md).

### 16.8 Universal File & Multi-LMS Ingestion

> Supersedes the §16.3 "binary PDF/PPT handling is TBD" note and generalizes ingestion from Canvas-only to any LMS. This is the ratified ingestion architecture; §5.1 onboarding and §3.5.5 cold-start are written against it.

**Core principle: the authenticated browser session is the only universal substrate.** Every LMS renders an authenticated web session in the student's browser, and that session already carries the exact permissions the student has. APIs differ per LMS and most students cannot obtain institutional keys; the rendered session does not differ and is always permission-correct. So the universal ingestion path is the extension acting *as the student*, with LMS APIs, LTI, and Drive/OneDrive OAuth layered on as optional accelerators. The "owned by someone" attached-file problem is resolved by inheritance: the extension can fetch anything the logged-in student can open, and nothing they cannot. That permission ceiling is intentional and is the FERPA/PIPEDA line, so no accelerator is allowed to exceed it.

**Five-layer model:**

| Layer | Job | Coverage |
|---|---|---|
| 0. Identity & routing | LMS-type detection (DOM/URL fingerprint) + `university_id` from host | All LMS |
| 1. HTML capture | Universal content script: page-type detection, deep text extraction, shadow-DOM piercing, auto-crawl (existing §16.1–16.3) | All rendered pages |
| 2. File discovery & session-fetch | Find every file/embed URL on the page; fetch bytes with the student's session | Attached PDF/PPT/DOCX, viewer embeds, Drive/OneDrive links, external files |
| 3. Backend extraction | Bytes + MIME → normalized text, format-based and LMS-agnostic | Every file format |
| 4. Accelerators | LMS API, LTI 1.3, Drive/OneDrive OAuth, email | Structured metadata, institutional installs, cloud-hosted docs |

Universality lives in Layers 1 to 3; Layer 4 buys extra quality for specific sources.

**Layer 2, file discovery & session-fetch.** Files arrive in four flavors, all handled by one path: (a) LMS-native binaries served from LMS/blob storage, often via signed/expiring URLs (Canvas uses temporary download tokens); (b) files inside an LMS viewer (Canvadocs/DocViewer, Office Online, Google viewer), which usually still expose a download endpoint, with render-capture plus OCR as the fallback; (c) Drive/OneDrive/SharePoint-hosted files; (d) external public links. Mechanism: the **content script discovers** URLs in the DOM (links, download buttons, iframe/embed `src`, viewer payloads) and the **MV3 background service worker fetches** the bytes. With declared `host_permissions`, the background worker can make cross-origin requests and read the response body without CORS blocking it (a page content script alone is CORS-limited; the background worker is not). Signed URLs authorize themselves, so a cross-origin fetch of the underlying object succeeds while the token is live. Per file: discover URL, send a fingerprint (URL + size) to the backend for a hash pre-check, and only download plus ship bytes when the hash is new. This reuses the §16.5 content-hash dedup, so the first student to open a file pays the cost and everyone after inherits it, and it is the idempotency guard that prevents the storage-overfill failure mode.

**Layer 3, format-based extraction (LMS-agnostic).** Once you hold bytes plus MIME, the source is irrelevant:

| Format | Tool |
|---|---|
| PDF (text) | pdf-parse / pdf.js |
| PDF (scanned) | OCR (Tesseract or cloud OCR) |
| DOCX | mammoth |
| PPTX | pptx text/notes extractor |
| XLSX/CSV | SheetJS |
| Legacy .doc/.ppt | LibreOffice headless, then extract |
| Images | OCR |
| HTML/text | direct |

Output normalizes into the existing `course_content` shape (content_type, week, hashes) and dedups by `content_hash`.

**Layer 4, accelerators ranked by value.**
- **LTI 1.3** is the best institutional path and is standards-based across Canvas, D2L, Moodle, Blackboard, and Schoology. With AGS (grades), NRPS (roster), and Deep Linking (content) it gives official server-to-server data with no scraping and covers the mobile/app usage the extension cannot reach. It requires the institution to install the tool, so it is the enterprise track, not the base layer; where adopted it strictly dominates scraping for that institution.
- **LMS REST API where self-serve** (Canvas PAT) gives clean structured deadlines/grades without scraping; per-LMS and admins can disable it, so it stays an accelerator. This is the existing §4 Canvas Agent path.
- **Drive/OneDrive OAuth** is a supplement for the student's own documents and for Workspace/365 schools that share materials to the student account (Microsoft Graph `sharedWithMe`, Google Drive `files.list`). Use a **file-picker scope**, not full-drive read. It does not reach LMS-native files, so it is additive, never primary.
- **Email ingestion** (Gmail/Outlook), optional, backfills deadlines/feedback that arrive by mail.

All sources normalize through one **provider interface** (`authorize`, `listCourses`, `listAssignments`, `listGrades`, `getContent`) emitting the same internal Course/Assignment/Grade/ContentItem records, so adding a source is additive. Build the interface from day one even with a single provider.

**Coverage matrix:**

| Source type | Extension session-fetch | LMS API | LTI 1.3 | Drive/OneDrive OAuth |
|---|---|---|---|---|
| LMS-native files (Canvas/D2L/Moodle/Bb) | ✅ primary | partial (metadata) | ✅ if installed | ✗ |
| Behavioral signals | ✅ only source | ✗ | ✗ | ✗ |
| Structured deadlines/grades | ✅ | ✅ | ✅ | ✗ |
| Drive/OneDrive file shared to student | ✅ if signed in | ✗ | ✗ | ✅ |
| Student's own docs | ✗ | ✗ | ✗ | ✅ |
| Mobile / native-app usage | ✗ | ✅ | ✅ | n/a |

**Hard limits (by design):** the permission ceiling is permanent and correct (nothing reads what the student cannot see); viewer-only content needs render-capture plus OCR; scanned-PDF OCR is real latency and cost, amortized by hash dedup; scraper selectors rot (mitigate with a generic fallback, thin per-LMS adapters, and per-LMS extraction-success telemetry); mobile/native-app usage bypasses the extension (the strongest argument for the LTI track); ToS and institutional policy may restrict automated access (LTI is the clean answer there); and anything pulled from a student's Drive or from feedback pages is personal by default and must pass course-vs-personal classification (§16.5) before it can enter the shared `course_content` table.

**Phasing:**
1. Extension session-fetch + backend extractor for PDF/DOCX/PPTX + hash dedup (closes the §16.3 gap for LMS-native files on any LMS).
2. Viewer-specific handlers + OCR for embedded/scanned content.
3. Drive/OneDrive OAuth via file picker.
4. LTI 1.3 (AGS/NRPS/Deep Linking) for institutional installs; also fixes the mobile gap.
5. Cross-cutting from day one: the provider/normalization interface and content-hash dedup.

---

## 17. Known Backend Gaps & Resolutions

These are the concrete engineering gaps between this spec and the current build; each must be closed before/around launch. Gaps 1–5 are launch blockers; 6–11 may proceed in parallel (source: BACKEND_GAPS.md).

### 17.1 Gap register

| # | Gap | Severity | Impact | Resolution |
|---|-----|----------|--------|------------|
| 1 | No `user_id` → `person_id` bridge | 🔴 Critical | Every chat loads the wrong brain context or fails; extension signals can't link to the right brain record | `backend/server/utils/person-bridge.ts` with `getPersonId(userId)` (find-or-create `neuro.persons`); add bridge column (type TBD, see §12.4); resolve to `person_id` before any brain op. (source: BACKEND_GAPS.md Gap 1) |
| 2 | No extension backend routes | 🔴 Critical | Extension v2 has nothing to call; sync/signals/content all fail | Create `routes/extension.ts`: `POST /api/extension/sync`, `/signal`, `/content`, `GET /api/extension/library/exists`; register in `index.ts`; all JWT-protected. (source: BACKEND_GAPS.md Gap 2) |
| 3 | Context window never reads the library | 🔴 Critical | Reggie has no rubric/lecture context for assignment/lecture questions | Add `getRelevantLibraryItems(personId, courseIds)` to `brain-context-window.ts`; inject `syllabus`/`rubric` rows under "Course Materials." (source: BACKEND_GAPS.md Gap 3) |
| 4 | Assignment Agent has no rubric source (`rubric` always `undefined`) | 🔴 Critical | Agent advises against an empty rubric | `getRubricForAssignment(courseId, title)` querying `course_content` (`content_type='rubric'`); pass into `assignmentCtx`. (source: BACKEND_GAPS.md Gap 4) |
| 5 | `fschool.assignments` never populated | 🔴 Critical | Brain has no deadline awareness → no proactive nudges | In `/api/extension/sync`, after writing `public.assignments`, also upsert into `fschool.assignments` (keyed `id,person_id`). (source: BACKEND_GAPS.md Gap 5) |
| 6 | No Library Organizer agent | 🟡 High | Library fills with raw text no agent reads | `services/library-organizer.ts` `processLibraryItem(itemId)`: Haiku extracts summary+concepts+difficulty → updates `course_content`, upserts `brain.knowledge`; called at end of `/content`. (source: BACKEND_GAPS.md Gap 6) |
| 7 | No prompt caching | 🟡 High | Chat ~5× more expensive than needed | `cache_control: { type: 'ephemeral' }` on the brain-context system block in `brain-chat-session.ts`. See §17.3. (source: BACKEND_GAPS.md Gap 7) |
| 8 | No `university_id` on any data | 🟡 High | Shared library can't scope correctly — content collides/leaks across schools | Add `public.users.university_id TEXT`; extension `detectUniversityId(url)`; include `university_id` in every `/sync` and `/content`. (source: BACKEND_GAPS.md Gap 8) |
| 9 | No professor identity across students | 🟡 High | Professor Intelligence can't link two students' feedback to one profile | Add `course_content.professor_name`/`professor_id`; extension extracts name; backend computes `professor_id = sha256(university_id + professor_name)[:16]`. (source: BACKEND_GAPS.md Gap 9) |
| 10 | Extension manifest name is `"NeuroAgi"` | 🟢 Low | Off-brand label in Chrome | Change `extension/manifest.json` name to `"FschoolAI"`/`"Reggie by FschoolAI"`. (source: BACKEND_GAPS.md Gap 10) |
| 11 | Plaintext Canvas tokens | 🟡 High | LMS tokens at rest in plaintext + open RLS = high-value breach | Encrypt tokens at rest (envelope encryption, server-held key, decrypt server-side behind JWT routes); route all writes through the backend service key. See §17.4. **(proposed)** |

### 17.2 Memory & recall architecture

Resolution to "how do agents read student files" (underlies Gaps 3/4/6). Principle: **memory is stored and retrieved, not trained into weights** (source: MEMORY_ARCHITECTURE.md). Two-tier model: long-term = brain DB (`neuroagi.*`); working = Reggie's context window; recall moves relevant items long-term → working per query.

**LLM-routed summary index (not vector RAG).** A single student's corpus is small (hundreds of files), so we let a reasoning model select by intent rather than rank by cosine similarity (source: MEMORY_ARCHITECTURE.md):

- **At ingest (background, per file):** extract text → Haiku 1–2 sentence summary + keywords → store `summary`, `keywords`, `content_text`.
- **At query:** (1) **Route** — model picks files from the index (`{file, course, summary, keywords}`, ~30 tokens/file → ~7K for 200 files); (2) **Read** — load only chosen `content_text`.
- `pgvector` added later only as a pre-filter if a corpus outgrows the context window — never the final decider.

**Schema — extend `neuroagi.files`:**

```sql
ALTER TABLE neuroagi.files ADD COLUMN IF NOT EXISTS summary        TEXT;
ALTER TABLE neuroagi.files ADD COLUMN IF NOT EXISTS keywords       TEXT[];
ALTER TABLE neuroagi.files ADD COLUMN IF NOT EXISTS extract_status TEXT DEFAULT 'pending';
ALTER TABLE neuroagi.files ADD COLUMN IF NOT EXISTS extracted_at   TIMESTAMPTZ;
```

Heavy extract+summarize runs at sync, in the background — never on Reggie's chat path — idempotent on `(user_id, lms_file_id)`. Note `neuroagi.files` (personal) is distinct from `public.course_content` (shared library, Gaps 3/6); they are not merged (source: MEMORY_ARCHITECTURE.md).

**The `recall_memory` tool.** Reggie's recall is a Claude tool (replacing the ~5–6s classify-then-`name ilike` flow), firing only when a question needs memory:

```
recall_memory(query) → { files, grades, assignments, signals }
  1. Load file INDEX (id, name, course, summary, keywords)
  2. Route: model picks relevant file_ids by intent
  3. Read:  SELECT content_text for those ids
  4. Return structured memory slice  (model-agnostic; swappable)
```

### 17.3 Prompt caching

Resolves Gap 7. The brain context (profile, course list, file summary index, recent signals) is carried as a cached system-prompt prefix:

```typescript
content: [
  { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }, // brain context — cached
  { type: 'text', text: userMessage }                                          // per-turn — not cached
]
```

The cached block (2,000–4,000 tokens) is reused across all turns; cache hits cost 10% of normal input price → **70–80% token/cost reduction per multi-turn session** (source: BACKEND_GAPS.md Gap 7; MEMORY_ARCHITECTURE.md). This is the same context block §7.1 assembles — caching is a property of the existing path. The on-demand `content_text` fetched via `recall_memory` stays uncached.

### 17.4 Security hardening checklist

Security is **Phase 0** — it gates everything that stores file contents (source: MEMORY_ARCHITECTURE.md). Close before Phase 1 is testable end-to-end:

- [ ] **RLS** — close the open `for all using(true)` policies; move to user-scoped once identity is JWT-based.
- [ ] **JWT auth on all routes** — extension authenticates, every write goes through the backend API which validates `Authorization: Bearer <jwt>`.
- [ ] **Anon-vs-service-key discipline** — no anon key writing from the client; backend uses the service key server-side only, behind JWT validation.
- [ ] **Canvas/LMS token encryption** — encrypt at rest, decrypt only server-side; raw file bytes in a private Storage bucket with signed URLs.
- [ ] **One project, correct env** — resolve any Supabase ref/env mismatch so every reader/writer agrees (else the brain becomes a silent third silo).
- [ ] **Rotate** any service key shared in chat or docs.
- [ ] **Rate limiting** on `/api/extension/*` and chat routes to bound abuse/cost from a leaked JWT. **(proposed)**

---

## 18. NeuroAGI — The Parent Brain Platform (and How FschoolAI Connects)

NeuroAGI is not a feature of FschoolAI. It is the **parent platform**: a persistent, compounding, person-owned brain that sits *underneath* a family of products. **FschoolAI is one branch — the first/flagship (education) product — of many.** This section defines the *merged* NeuroAGI brain that all products (FschoolAI included) build against, and maps every brain touchpoint elsewhere in this PRD onto it. Where this section and §12 differ, **this section (the v2 target) governs**; §12 documents the current transitional deployment.

### 18.1 NeuroAGI is the platform; FschoolAI is one branch

- **One person = one brain, across every product.** The brain owns the person; products borrow them temporarily. FschoolAI is the education vertical; future verticals (TBD) connect to the *same* brain for the *same* person.
- **A product is thin.** To the brain, a product is just (a) a `source` label on the signals it writes and (b) a set of capabilities it registers on the bus. Products are replaceable and disposable; the brain and its accumulated history are not.
- **Compounding across products is the moat.** A trait learned in FschoolAI (e.g. "visual learner", "avoids starting early") is immediately available to the next product via `recall` — no re-learning, no re-onboarding.
- **Hard rule — no product-specific concepts in the brain.** Education objects (`knowledge_gaps`, `courses`, `assignments`) are *product data*, not brain schema. The brain stores person-level abstractions only (signals, patterns, traits). This is what keeps it reusable across products.

**Topology and division of responsibility (engineering direction).** The relationship is a three-tier chain:

```
neuro-agi  <----->  fschool (main agent)  <->  other agent (subagent)
```

- **FschoolAI is the *main agent*.** It owns and orchestrates the product experience and calls its specialist agents (§14) as **subagents**.
- **Internal scenarios stay closed-loop inside FschoolAI.** Any flow that is internal to the product — a study session, an assignment walkthrough, a subagent-to-subagent handoff — runs to completion *within FschoolAI*. It does **not** round-trip through NeuroAGI on every step.
- **NeuroAGI's role is deliberately narrow — exactly three jobs:**
  1. **Route intent** — accurately interpret what the user wants and point FschoolAI at the right direction / subagent.
  2. **Augment context** — enrich the request with the person's history, behavioral modeling, and learned traits (the derived layers in §18.3).
  3. **Facilitate bidirectional interaction** — provide the two-way channel/bus (`invoke` / `ingest`, `WS /channel`) so brain and product can talk *during* an interaction, including proactive outreach.

NeuroAGI does **not** run the product's internal logic. It routes, it personalizes, and it carries the conversation both ways; FschoolAI (as main agent) does the work and closes the loop with its subagents. This sharpens §13: *orchestration of subagents* is the main agent's job; *state, intent-routing, and context augmentation* are the brain's.

### 18.2 The merged brain — technical foundation is NeuroAGI **v2**

All technical and architectural decisions for the brain follow **`neuroagi-core` v2** (the minimal kernel), not v1. v1's TypeScript engines are deprecated dead code (they reference flat tables that no longer exist) and are **not** a technical reference.

**Kernel (the unchanging core):**
- **`memory`** — a single append-only log. Every fact is one row: `kind` + JSONB `body` + `subject` (whose brain) + `tags`/`audience`/`source`/`salience`/timestamps. New information types require **zero schema change** — just a new `kind`.
- **Forgetting is default** — deterministic decay `effective = salience × exp(-λ·days)` (14-day half-life); `recall` reinforces (use-it-or-lose-it); sub-threshold memories soft-forgotten (kept for audit). Data bloat is an intrinsic property, not a cleanup chore.
- **`bus`** — a bidirectional capability registry. `invoke` (brain → agent) and `ingest` (agent → brain), over three transports: `local` / `http` / `mcp`. The brain is itself a standard MCP server and can call external MCP agents.
- **`watch` / `tick`** — a heartbeat that lets the brain act unprompted (proactivity).

**Cortex (the recomputable derived layer — pure functions over `recall`):** `ingress` (multimodal envelope → per-modality perceivers), `reflex` (millisecond fast-path for urgent signals), `channel` (outbox / `WS say`), `hypothesis` (cluster repeated signals → promote to a need/focus), **`policy`** (quiet hours / daily budget / cooldown / importance + urgent bypass), `scheduler` (`kind="schedule"` → fire on time), `semantic` (pluggable embedder). If a derived layer crashes it does not corrupt the memory log.

**Deployment surface (how products connect):** REST + `WS /channel/{device}` + MCP (`uvicorn brain.server:app`). Storage is any Postgres via one `Store` interface (Supabase is merely one option); `pgvector` optional. Multi-tenant by `subject`; sharing via `audience` / `memory_grant` / `space_member`.

> **Reconciliation with §12.** §12's two-Supabase-project model (schemas `neuro`/`brain`/`agents`/`fschool`, read directly by FschoolAI) is the **current transitional state**. The **target** is the v2 kernel fronted by the REST/WS/MCP surface above; FschoolAI migrates from direct schema reads to brain API calls. The raw-data-vs-abstraction boundary (§12.3) and the person-ownership rule are unchanged — only the access mechanism changes.

### 18.3 v1 capabilities, re-implemented the v2 way

v1's contribution is its **product-feature concepts**, not its implementation. Each becomes a v2 **derived layer or bus capability** — a pure function over the memory log, recomputable, and available to *every* product, not just FschoolAI. None of these is a bespoke stateful service.

| v1 feature concept (from `brain-sdk.ts`) | v2 realization |
|---|---|
| **Skill verification / credentials** (`verifySkill` → `masteryLevel`, `evidenceCount`) | A recall-derived layer: aggregate `kind="signal"` memories tagged with a skill, score mastery from evidence count + outcome signals; expose as a `verify_skill` bus capability / MCP tool. Output is a pure function of the log — recomputable, tamper-evident. |
| **Learning style** (`learningStyle: visual/auditory/…`) | A trait mined by the `hypothesis` engine from behavioral signals, promoted to a low-decay `kind="trait"` memory; read at `recall` and injected into context. Not a column — a derived, evolving trait. |
| **Brain health dashboard** (`getHealthMetrics` → signals, concepts tracked, brain age) | A `recall` aggregate over the memory log (counts, time-span, decay state, recent reinforcement); exposed as a `brain_health` capability/endpoint. No new tables. |
| **Export / delete (portability + right-to-be-forgotten)** | Native to v2: the memory log *is* the data — export = dump memories by `subject`; delete = `forget` (soft, audited). RTBF is structural, not a bolt-on. |

### 18.4 Connecting the FschoolAI PRD to the brain (the mapping)

This is the **connection**. Every brain touchpoint defined elsewhere in this PRD maps 1:1 onto a v2 primitive — implement against the right-hand column.

Read the table through the topology in §18.1: NeuroAGI supplies **intent routing, context augmentation, and the bidirectional channel**; FschoolAI (main agent) consumes those and runs the actual scenario with its subagents. The brain-side rows (Signal Arbiter → `cortex.policy`, context assembly, intent routing) are NeuroAGI's three jobs; the agent-orchestration rows are FschoolAI's closed loop.

| FschoolAI PRD concept | NeuroAGI v2 primitive |
|---|---|
| `brain.read(student_id)` (§3.4) | `recall(subject = person_id, …)` |
| `brain.write(signal)` (§3.2) | `remember({kind:"signal", body, source:"fschoolai"}, subject)` — or `bus.ingest` from a product agent |
| StudentBrain context object (§3.1) / pre-computed `context_window` (§13) | A `recall`-derived context assembled on `tick` and cached (the cortex equivalent of Context Window Builder, §14.2) |
| **Signal Arbiter** (§3.5.2) — dedup, rank, rate-limit, quiet hours | **`cortex.policy` gate** — 1:1 (quiet hours / daily budget / cooldown / importance + urgent bypass). Build on it; do not reinvent. |
| `proactive_signals` queue + `notification_queue` (§6) | `kind="outbox"` memories selected by the policy gate, delivered via `channel.say` |
| **Intervention Agent** (§8, Pattern B) | NeuroAGI side: a `watch` watcher on `tick` detects the trigger and the `cortex.policy` gate arbitrates *whether/when* to reach out (route-intent + facilitate-interaction). It hands the intervention intent + context to FschoolAI (main agent), which **composes and delivers** the message via its subagents — the scenario runs closed-loop in FS (§18.1). |
| **Reflection Agent** (Agent 12, nightly) | `scheduler` (`kind="schedule"`) firing a `sleep_consolidate` derived pass (digest + decay sweep) |
| **Cohort Agent** (§14) | A shared space (`subject = "cohort:<canonical_course_id>"`) + `audience`; k-anonymity enforced in the aggregation layer before any `recall` is exposed |
| FschoolAI agents (§4, §14) | The `bus` is the bidirectional channel between NeuroAGI and FschoolAI (the **main agent**): the brain routes intent + augmented context to FS and `ingest`s results back. FS then orchestrates its **subagents** internally (§18.1) — the brain does not invoke each subagent directly. |
| `person_id ↔ user_id` bridge (§12.4) | The product maps its user id to the brain `subject`; one `subject` per person, shared across all products |
| Two-DB env wiring (§12.5) | In the v2 target the product calls the **brain API** (REST/WS/MCP) instead of holding two Supabase clients; the FschoolAI production DB remains the raw-data store (§12.3 boundary unchanged) |
| Effectiveness feedback loop (§3.5.4) | Delivery outcomes written back as signals; the policy gate's thresholds tune per `subject` from those signals |

### 18.5 How the next product connects (the platform contract)

Because many products are coming, the onboarding contract for any new product is fixed and minimal:

1. **Authenticate** its users onto a brain `subject` (reusing the existing subject if the person already has a brain from another product).
2. **Register** its agents as bus capabilities (`local`/`http`/`mcp`).
3. **Write** signals via `remember` / `ingest` (always stamped with its own `source`).
4. **Read** via `recall` — and inherit everything other products have already taught the brain about that person.
5. **Optionally subscribe** a `channel` for proactive delivery, gated by `cortex.policy`.

Governance constants across all products: per-`source` attribution on every memory, consent/trust gating, `subject` isolation by default, and cross-product/cross-person sharing **only** via explicit `audience` / `memory_grant` / `space_member`. The brain never imports a product's domain concepts — that boundary is what lets product N+1 benefit, on day one, from everything products 1…N have learned.

---

## 19. Architecture Review Merge (v2.0)

This section folds the **four** documents produced after v1.9 into the PRD. Two are NeuroAGI/CTO-side, two are the FschoolAI Step-1 work. The §18 brain contract is unchanged and governs; §19 records build status, the target product-backend, the formalized scenario/latency/tool surfaces, and the decisions this review settled. Where §19 refines an earlier section the pointer says so.

### 19.1 Provenance — the four merged documents

| Doc | What it is | Owner | Role |
|---|---|---|---|
| `readthis.md` | FschoolAI_v2 × NeuroAGI technical + acceptance doc | NeuroAGI/CTO (Pony) | **What's built** (Phase 1) |
| `en-final-backend-technical-architecture.md` | Next-gen product-backend technical architecture | NeuroAGI/CTO (Pony) | **Target** architecture |
| `fschoolai_step1_scenario_plan.md` | Scenario catalog: 17 scenarios + latency model + edges + eval contract | FschoolAI (Step 1, Pt 1) | **Contract** (what the system must do) |
| `fschoolai_step1_tools_breakdown.md` | Tool / API / MCP capability surface | FschoolAI (Step 1, Pt 2) | **Capability inventory** |

### 19.2 Build status — FschoolAI_v2 is built and accepted (Phase 1)

Per `readthis.md`, the v2 product is **built and passing**, not just specced. The stack actually used: **Python · LangGraph graphs · FastAPI (`POST /api/agent-manager`) · sqlite (product) · `neuroagi-core` v2 brain over HTTP/token**. All **17 scenarios** (G1.1–G4.3 + S1–S3 + Terminal) run end-to-end; **4 self-contained harnesses, 56/56 checks pass** (NL→front-door→product→brain, all-agents coverage, the four collaboration patterns A/B/C/D, and the product API smoke).

Two caveats this PRD records honestly:
- **The 56/56 are mostly stub/deterministic (CI) mode.** Real-model runs are opt-in (`FSCHOOL_LLM=claude`); real-LLM quality and load are **not yet validated** (see §19.10).
- **Two-track reality.** The current **TS / Vercel** app (this PRD's §7 stack) remains the **funding version**; the **Python v2** is the rebuild. §19.4 defines how they phase. The brain (`neuroagi-core` v2) is shared by both and is still §18.

### 19.3 Target product-backend architecture (FschoolAI side, not the brain)

From `en-final-backend-technical-architecture.md`. This governs the **FschoolAI product backend runtime**; it does **not** change §18 (the brain is `neuroagi-core` v2). The product's single external contract stays **`POST /api/agent-manager`** (§15).

- **Two planes.** An **Application Control Plane** (decides *what/whether/how*: business orchestration, security governance, context engineering, observability + eval) over an **Agent Execution Plane** (the runtime: assistants, threads, runs, state, checkpoints, streaming, queue, cron, store).
- **Runtime = LangGraph Agent Server**; orchestrated agents = **LangGraph graphs**; autonomous agents = **DeepAgents** (bounded by goal / max-steps / token + time budget / tool allow-list / approval policy); product APIs + the NeuroAGI facade + A2A = **FastAPI/Starlette Custom Routes**.
- **Boundaries (Protocols), not direct calls:** `AgentExecutionGateway` (Control Plane → runtime), `PolicyGuard` (auth, data/tool/memory-report permission, token/time budgets, approval), `ToolGateway` (all external tool calls), `NeuronContextProvider` / `NeuronMemoryReporter` (the brain seam). Graph nodes never touch SQLAlchemy / external APIs / the brain directly.
- **Data:** PostgreSQL for both business data **and** Agent Server persistence, **logically isolated** (separate DB/schema + repositories); Redis for queue / pub-sub. (`Fschool business DB ≠ Agent Server persistence`.)
- **Observability / eval:** OpenTelemetry (system trace) · Langfuse (LLM trace/dataset/score) · LangSmith (LangGraph native) · DeepEval (CI regression). Trace spans the full chain `route → recall → tool → LLM → write → deliver` and doubles as the eval-fixture source.

### 19.4 Phasing — target vs what's built (these are phases, not conflicts)

`readthis.md` itself frames `en-final` as the target and the built v2 as its Phase 1 ("Phase 1 allows mocks"). The apparent disagreements are a roadmap:

| Concern | Target (doc1) | Built v2 / Phase 1 (readthis) |
|---|---|---|
| Runtime | LangGraph **Agent Server** (+ Redis) | **plain LangGraph** + `POST /api/agent-manager` |
| Transport (brain ↔ product) | **A2A** | **HTTP** (front-door / agent-manager) |
| Autonomous agents | **DeepAgents** | plain graphs |
| Observability/eval | OTel + Langfuse + LangSmith + DeepEval | 4 lightweight harnesses (56 checks) |
| Product store | PostgreSQL | sqlite |

**Deferred to later phases (not dropped):** Agent Server runtime, A2A, DeepAgents, Redis, the full observability stack, Postgres. **Open confirmation owed by the CTO side:** that doc1 is the committed target with the built v2 as Phase 1 (one sentence settles the table above).

### 19.5 The scenario catalog (formalizes §5 flows + §4/§14 agents)

The 17 scenarios as one graded catalog. `lat` = latency class (§19.6); `v2` = end-to-end status in the built v2.

| id | scenario | pattern | lat | key gate | v2 | action |
|---|---|---|---|---|---|---|
| G1.1 | Daily Briefing | reactive | C1/C0 | cold-start | ✅ | `daily_briefing` |
| G1.2 | Ask on the fly | reactive | C1/C2 | integrity (Socratic) | ✅ | `ask` |
| G1.3 | Grades + What-if | reactive | C0/C1 | cold-start (≥1 graded) | ✅ | `what_if` |
| G2.1 | Negative / risk nudge | proactive | C4 | arbiter + quiet hours | ✅ | `intervene` |
| G2.2 | Positive / opportunity nudge | proactive | C4 | same arbiter | ✅ | `review_opportunity` |
| G3.1 | Exam prep | reactive | C2 | cold-start | ✅ | `exam_prep` |
| G3.2 | Start assignment / essay | reactive | C1/C2 | integrity (feedback only) | ✅ | `start_assignment` |
| G3.3 | Weekly plan | reactive | C1/C2 | silent reschedule | ✅ | `weekly_plan` |
| G3.4 | Digest lecture | reactive/async | C2/C3 | — | ✅ | `digest_lecture` |
| G3.5 | Office Hours | reactive | C1 | feedback framing | ✅ | `office_hours` |
| G3.6 | Find resources / Studio | reactive/async | C3 | tier + media non-submittable | ✅ (gates) | `find_resources` |
| G4.1 | Study room | reactive | C1 | no individual leak | ✅ | `study_room` |
| G4.2 | Class status (cohort) | reactive | C1 | **k-anon ≥10** | ✅ | `class_status` |
| G4.3 | Leaderboard | reactive | C0/C1 | healthy comparison | ✅ | `leaderboard` |
| S1 | Onboarding / first login | system | C1/C3 | cold-start; no-LMS branch | ◐ design | (connect-LMS + 5-Q pending) |
| S2 | Nightly consolidation | nightly | C4 | — | ✅ | `scheduler` consolidate |
| S3 | Canvas sync | system | C4 | idempotent upsert | ◐ partial | (raw data wired; real OAuth/syllabus later) |
| — | Terminal | reactive | C1 | — | ✅ | `terminal` |

### 19.6 Latency model — C0–C4 (makes §9's "3s" precise)

§9 states a 3s NFR with a 10s exception; this is its formalization. **Default is C1 = 3s** unless a scenario is explicitly exempted.

| Class | Bound | UX | Applies to |
|---|---|---|---|
| **C0** | ≤300ms, no server LLM | no spinner | what-if calc, leaderboard render, offline-cached briefing |
| **C1** | **≤3s** (default) | inline | briefing / ask / grades / routing / tutor / office-hours / cohort |
| **C2** | **≤10s + loading** | loading | the only sync exception: lecture transcription, exam-plan gen |
| **C3** | video<5min / podcast<3min | progress → notify-when-ready | Studio generation, full lecture pack |
| **C4** | delivery SLA (not response) | none | proactive nudges, nightly consolidation, Canvas sync, context pre-compute |

**C1 per-stage budget:** `route ≤200ms + recall ≤800ms (warm snapshot) + LLM ≤1.8s (streaming) + write 0 (fire-and-forget) + deliver ≤200ms = 3000ms`. The budget only closes if `recall` hits a **warm `context_window`** (the cortex pre-compute, §13/§18.4) and the LLM **streams** — the two audit landmines (cold-context rebuild 3–8s; a fixed RAG race) are exactly what blow it.

### 19.7 Capability / tool surface (formalizes the agents into callable tools)

From `fschoolai_step1_tools_breakdown.md`. Three load-bearing invariants (these are the §13 stateful-brain/stateless-agents rule, made operational):

1. **State lives in the brain, never in a tool.** Every tool is a near-pure function of `(args, brain-context)`; if it needs memory it `recall`s and `remember`s.
2. **Gates are pre-steps in code, not optional tools the model may skip** — integrity (Socratic / feedback-only / non-submittable), tier, k-anon, cold-start fire *before* the tool body. On Canvas-match uncertainty for graded work → **fail closed to Socratic**.
3. **Anything slower than its ceiling becomes async** (C3 notify-when-ready), never a synchronous hang.

**Transport classes:** `brain-bus` (recall/remember/propose — ~600ms cross-project hop, degrade to flat-mock if the brain is unreachable) · `MCP` (the brain tool set, for cross-product reuse) · `http` (the product's own `api/*`) · `provider-SDK` (Anthropic/Groq/OpenAI/ElevenLabs/Daily — server-only keys, 429-backoff) · `client-pure` (what-if, deterministic, offline, **no LLM**).

**Statefulness ledger:** *pure* (what_if, sanitize, embed) · *stateless-read* (recall, rag.query, canvas.reads, tutor_llm, summarize, extract) · *brain-write* (remember, session-summary, context_window.warm — **append-only/merge, never overwrite**) · *product-write* (canvas.sync, flashcards, token.award, arbiter, deliver_* — **idempotent**) · *external-send* (discord/sms/email/nudge — rate-limited, arbiter-gated). **Do the LLM gateway first** (LiteLLM-style): centralizes model routing, prompt-cache of the brain-context prefix (40–60% multi-turn saving), provider fallback, cost accounting, and the trace/eval span emitter.

### 19.8 Cross-cutting edges & the eval contract

The catalog ships with an exhaustive edge taxonomy used as the eval-fixture source: **X1–X15** (scenario edges: cold-start, no-LMS (any LMS, §16.8; formerly no-Canvas), stale context, brain-down, quiet-hours, integrity, k-anon, multilingual routing, offline, unbuilt-capability, double-delivery, partial-failure, tier denial, multimodal, oversized) and **T1–T18** (tool-layer edges: tool-loop hygiene, gates-as-presteps, idempotency, timeouts, 429, secrets/ESM, cross-project hop, schema cache, cold-start tools, streaming, append-only, modality routing, privacy/redaction, provider drift, MCP, tier/quota, partial-chain, observability). Each catalog row → `{input, expected_output_assertions, expected_tool_sequence, latency_budget}`. **The 3 integrity red lines + k-anonymity are HARD pass/fail trajectory assertions** (each with a positive and a negative fixture, to catch both fail-open and fail-closed) — not rubric-scored.

### 19.9 Resolved decisions & boundary clarifications (this review)

- **Proactive arbitration → the brain, and domain-agnostic.** Confirms §3.5.2/§18.4: arbitration (dedup / rank / rate-limit / quiet-hours / cooldown / effectiveness-learning) is `cortex.policy` because the budget is **per-person across all products** and only the brain has that view. Guardrail added: the brain extension that carries it (`integrations/fschool_notify_ext.py`) must hold **no education semantics** — the split is **detect = product → propose → brain arbitrates whether/when → product composes & delivers → brain learns the effect**.
- **Retrieval boundary clarified (refines §12.3).** **Course-material RAG = product** (`rag.*` over the student's uploads); **global / profile retrieval = brain** (`recall`). Raw course content **never** enters the brain — only derived signals (gaps, mastery). doc1's "retrieval belongs to NeuronAGI" means *global* retrieval, not course RAG.
- **Naming.** **NeuroAGI / `neuroagi-core` v2** is canonical (matches the code); the backend doc's "NeuronAGI" is a typo to correct.
- **Brain-side changes are minimal & generic:** `/tick` optional `t`; `integrations/fschool_notify_ext.py` (`notify` + `consolidate`) loaded via `BRAIN_EXTENSIONS`. These two brain commits are **awaiting go-ahead to push**.

### 19.10 Open items (tracked, not blocking)

- **CTO-side validation (doc1 §14):** Agent Server fit / license / cost / ops; A2A semantics for capability/task/error/trace identity; Postgres-vs-Agent-Server isolation; LangSmith↔Langfuse↔OTel trace correlation; PolicyGuard injection points.
- **doc1 under-specifies the proactive / background (C4) plane** — Group 2, S2, S3 are ~⅓ of the catalog; the target architecture owes a section for the detect→propose→arbiter→deliver→track pipeline.
- **SLO measurement spike:** the C1 per-stage budget, the ~600ms cross-project brain hop, and RAG latency are **not yet load-tested** — measure before treating §19.6 as final; `recall` has the least margin.
- **Unbuilt product-side capabilities:** voice / multilingual STT routing (X8/X14), async media generation (G3.6 video/podcast), Canvas **OAuth** + syllabus ingest (S1/S3), and the long-tail not-built agents (`agents/remaining-agents.md`).

### 19.11 Implementation status — `frontend/dev` vs this PRD (what's left)

`frontend/dev` is the **TS / Vercel funding version**; the full PRD scenario set is **built in the Python v2** (§19.2). This table lists only what's **actionable on `frontend/dev`** now; the heavier gaps owned by the Python v2 rebuild are summarized in a single note below, not tracked as rows here. **Track:** **FS** = build on `frontend/dev`; **X** = cross-cutting / structural (needed regardless of track). **Status on `frontend/dev`:** ✅ shipped · ◑ partial (exists, doesn't meet the contract) · ○ spec (not built).

**Recently shipped (closed since the docs were written):** Leaderboard Agent (server-side ranking, merged), Content Connector and Writing Evolution Tracker (§14.3 Sprint-4 agents, PRs open), and the **Weekly Plan agent (G3.3)** — deadline + difficulty planner with Google Calendar free/busy and `.ics` export (`feat/weekly-planner`, PR open).

**Scenario catalog — outstanding `frontend/dev` items (the live ones G1.2 / G4.3 omitted):**

| Scenario | FS | Track | What's missing |
|---|---|---|---|
| G1.1 Daily Briefing | ○ | **FS** | "what to do today" aggregator over existing Canvas/brain data |
| G1.3 Grades + **What-if** | ○ | **FS** | deterministic required-score calculator (client-pure, no LLM, offline) |
| G2.1 Negative nudge | ◑ | X | broaden triggers beyond stress/momentum |
| G2.2 Positive nudge | ○ | **FS** | opportunity-nudge path (absent in `brain-intervention`) |
| G3.2 Start assignment | ○ | X | blank scaffold + **hard** integrity gate (feedback-only) |
| G3.4 Digest lecture | ◑ | FS | professor-emphasis detection; async long-audio path |
| G3.5 Office Hours | ◑ | FS | gap-targeted question-gen (`monitor-agent` is a page nudge) |
| S1 Onboarding | ◑ | X | connect-LMS (extension = universal path §16.8, Canvas **OAuth** = fast path) + 5-Q → brain-create (PAT today) |
| S3 LMS sync | ◑ | X | real OAuth + syllabus ingest (client-side PAT today); multi-LMS + attached-file capture via the §16.8 extension pipeline |

**Cross-cutting structural gaps (not scenario-specific):**

| Gap | Track | What's missing |
|---|---|---|
| Hard integrity guards | X | the 3 red lines + k-anon are **prompt-only**, no code-level gate |
| `person_id ↔ user_id` bridge + extension routes | X | the brain reads empty without it (§17 BACKEND_GAPS, gaps 1–2) |
| Multilingual / voice STT routing | FS | zh-CN is a Phase-1 requirement (§9); no language-detect→STT routing |

**Owned by the Python v2 rebuild / brain layer (real gaps, but *not* `frontend/dev`'s to build — tracked on the v2 side):** G3.1 exam-prep multi-day planning, G3.6 Studio video/podcast generation, G4.1 in-room Study Room AI orchestrator, G4.2 cohort / k-anon aggregation, S2 nightly reflection + decay (Agent 12, runs in the brain layer), and the **Agent Manager / tool-use-loop** refactor (the single `POST /api/agent-manager` contract — `frontend/dev` calls ~40 endpoints directly).

**Specialist sub-agents not built (§14.3):** Situation Synthesizer, Motivation Engine, Professor Intelligence, Social Intelligence, Knowledge Graph Builder, Focus Agent, Library Organizer, UI Preference Agent, Pattern Recognition. **Partial:** Assignment Agent, Voice Preference (close).

**Highest-leverage `frontend/dev` next steps (cheap, no v2 dependency):** What-if calculator (G1.3) → Daily Briefing (G1.1) → Positive nudges (G2.2) → finish Voice Preference + the Assignment scaffold. The **X** items (LMS connect: the §16.8 extension pipeline + Canvas OAuth, brain pipeline, integrity guards) gate downstream work and apply regardless of track.

---

*This document is the source of truth for FschoolAI Phase 1 engineering. Any questions, contact Vincent Yang.*
