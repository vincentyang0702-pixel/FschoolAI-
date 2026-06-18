# FschoolAI — Definitive Agent Architecture
## For: Agent Builders (Tencent, Bytedance, Aryan, 李小雷)
**Version:** 1.0 — June 2026  
**Classification:** Internal — Founding Team Only  
**Author:** Vincent Yang / FschoolAI

---

## The Core Principle

> **FschoolAI is a stateless agent layer. NeuroAGI is the stateful brain. Every agent reads from the brain before acting. Every agent writes learned abstractions back to the brain after acting. No agent holds state itself.**

This is the foundational rule that governs every design decision in this document. If you are building an agent and you find yourself storing state inside the agent, you are doing it wrong. State belongs in NeuroAGI.

---

## The Two Protocols

All communication in this system uses two open protocols:

| Protocol | Direction | Purpose |
|---|---|---|
| **MCP** (Anthropic Model Context Protocol) | Agent ↔ NeuroAGI Brain | Every agent reads brain context and writes learned signals through MCP. This is the brain's API. |
| **A2A** (Google Agent-to-Agent, Linux Foundation) | Reggie ↔ Specialist Agents | Reggie orchestrates specialist agents via A2A. Agents are callable services, not modes inside a single prompt. |

**The rule:** Agents never call each other directly except through Reggie's orchestration. Agents never query the brain directly with SQL — they use the MCP interface. This keeps the brain's data model clean and every agent replaceable.

---

## The Three Infrastructure Layers

Before describing agents, understand what every agent reads from:

### Layer 1 — NeuroAGI Brain DB (stateful, personal, owned by student)
The student's persistent intelligence. Lives in NeuroAGI's infrastructure. Never deleted unless the student requests it. Contains:
- `neuro.persons` — Brain ID, identity, trust levels, goals
- `neuro.patterns` — Confirmed behavioral patterns with confidence scores (88 patterns for Vincent)
- `brain.signals` — Raw event stream (371 signals for Vincent)
- `brain.reflections` — Synthesised weekly insights (203 reflections for Vincent)
- `brain.context_window` — Pre-computed every 30 minutes: stress level, momentum state, urgent deadlines, intervention message
- `brain.person_model` — Deep psychological model: behavioral signature, silence map, what works, what to avoid
- `brain.hypotheses` — Active predictions about the student
- `brain.interventions` — Queued proactive nudges

**Key rule:** Raw domain data never enters the brain. Only learned abstractions enter. A grade of 94/100 stays in FschoolAI. The signal `music_performance: strong, consistent` enters the brain.

### Layer 2 — FschoolAI Library (stateless, institutional, owned by FschoolAI)
The shared course intelligence database. Lives in FschoolAI's infrastructure. Not personal — shared across all students in the same course. Contains:
- `course_content` — Syllabi, lecture text, rubrics, announcements, module pages
- Deduplicated by content hash — the first student who visits a page triggers a write, every subsequent student gets it free
- Professor intelligence profiles — built from aggregated graded feedback across all students in a course
- Concept index — every piece of content tagged with the academic concepts it covers

**Key rule:** The brain reads from the Library via Brain SDK. The brain never writes to the Library. The Library is FschoolAI's moat — it compounds with every student.

### Layer 3 — FschoolAI Production DB (stateless, operational)
Student accounts, enrolled courses, assignments, grades, session logs. The operational database. Agents read from here for task context. The Nightly Reflection Agent distills this into brain signals.

---

## Every Environment, Every Agent

---

### Environment 1 — The Classroom

**Why this environment exists:**  
The classroom is where the most important academic content is produced — but it has always been ephemeral. A professor speaks, students take incomplete notes, and 80% of what was said is lost within 48 hours. No AI tutor has ever had access to what actually happened in class. FschoolAI is the first system to capture it.

**What happens here:**  
The student is physically in lecture. The Chrome extension activates the microphone. The professor speaks. Slides are on the screen.

**Agent: `Lecture Agent`**

| Property | Detail |
|---|---|
| **Trigger** | Student activates recording in Chrome extension at class start |
| **Input** | Live audio stream + page context (course ID, date, university) |
| **Core job** | Transcribe → structure → extract → index → write to Library |
| **Output** | Structured lecture note stored in FschoolAI Library with: full transcript, key concepts tagged, professor emphasis markers, timestamps, links to syllabus week |

**What it detects without asking the student:**
- Which concepts the professor repeated (repetition = exam signal)
- Tone shifts that indicate "this is important"
- Explicit exam signals ("this will be on the midterm")
- Gaps between what was taught and what the syllabus expected

**Connection to AI Tutor (Reggie):**  
After every lecture, Reggie's context window is enriched. When the student asks "what did Professor Chen cover today?", Reggie answers from the actual transcript — not from generic knowledge. When the student asks about a concept from the lecture, Reggie's answer is grounded in the exact language and examples the professor used.

**Connection to Library:**  
Every lecture transcript is written to `course_content` in the Library with `content_type = 'lecture'`. It is deduplicated — if 10 students in ECON 201 all recorded the same lecture, the best-quality transcript is kept and shared with all 10.

**Writes to Brain (via MCP):**  
- `lecture_captured` signal with course ID and date
- Concept confidence updates: if the professor spent 20 minutes on monetary policy, that concept gets flagged as high-priority for this course
- Professor emphasis tags: "Professor Chen always emphasises citation quality"

**Reads from Brain (via MCP):**  
- Student's existing knowledge gaps for this course (so the agent knows what to flag as new vs. review)
- Historical attendance patterns (so the brain knows if the student missed a class)

---

### Environment 2 — The School Portal (Canvas / LMS)

**Why this environment exists:**  
Every university student's academic life is managed through an LMS — Canvas, Blackboard, Moodle. This is where assignments are posted, grades are returned, syllabi are uploaded, and deadlines live. No AI tutor has ever had direct access to this data. They wait for students to copy-paste it. FschoolAI connects automatically.

**What happens here:**  
The Chrome extension runs as a background observer on Canvas pages. When the student browses their courses, the extension silently captures the structured data.

**Agent: `Canvas Agent`**

| Property | Detail |
|---|---|
| **Trigger** | Student visits any Canvas page; also runs on a scheduled sync every 6 hours |
| **Input** | Canvas page DOM, course IDs, assignment metadata, grade data, syllabus text, rubric text, professor announcements |
| **Core job** | Sync → parse → enrich → alert |
| **Output** | Updated assignment records in FschoolAI DB + enriched Library entries for syllabi, rubrics, and announcements |

**What it does:**
- Continuously syncs assignments, grades, deadlines, course materials
- Parses syllabi to extract exam dates, topic schedule, grade weightings
- Detects grade drops and submission pattern changes
- Captures rubrics and writes them to the Library (so the Assignment Agent can use them)
- Alerts Reggie when a high-stakes deadline is approaching and the student has not started

**Connection to AI Tutor (Reggie):**  
Reggie's daily briefing is powered entirely by the Canvas Agent's data. "You have a 2,000-word essay due in 3 days. Based on your current grade trajectory in PSYC 201, this assignment is high risk." Without the Canvas Agent, Reggie is blind to the student's actual academic situation.

**Connection to Library:**  
Every syllabus, rubric, and announcement the Canvas Agent captures is written to the Library. This is how the Library grows — not from manual uploads, but from passive browsing. The student never has to do anything.

**Writes to Brain (via MCP):**  
- Academic signals: grade trends per course, submission behaviour (early/late/on-time), assignment completion rate
- Course risk scores: courses where the student is below target grade
- Upcoming deadline signals: assignments due within 7 days

**Reads from Brain (via MCP):**  
- Student's historical performance patterns per subject (so the agent knows if a B- in ECON is normal or a warning sign for this specific student)
- Target GPA (to calculate whether current trajectory will hit it)

---

### Environment 3 — The Study Room (Active Study Session)

**Why this environment exists:**  
This is the primary interaction environment — where the student sits down to learn, ask questions, review material, and prepare for exams. It is the highest-frequency touchpoint in the product. Every interaction here is a signal about how the student learns.

**What happens here:**  
Student opens FschoolAI web app or extension. Types a question, requests an explanation, asks for practice problems, or reviews their notes.

**Agent: `Tutor Agent`** (called by Reggie via A2A)

| Property | Detail |
|---|---|
| **Trigger** | Reggie receives a question that requires academic explanation or tutoring |
| **Input** | Student question + brain context (from MCP) + relevant Library content (from RAG over course materials) |
| **Core job** | Answer → adapt → detect → write |
| **Output** | Explanation grounded in the student's actual course material, adapted to their detected learning style |

**What it does:**
- Answers academic questions using RAG over the Library (lecture transcripts, syllabus, rubrics for the student's enrolled courses)
- Detects confusion signals: follow-up questions, rephrasing, long pauses, "I don't understand" patterns
- Adapts explanation format to the student's detected learning style (visual, auditory, prompt-based) — detected from behaviour, never asked
- Runs Socratic method for deep understanding; switches to direct answers for quick review based on brain context
- Generates flashcards, practice questions, and concept summaries on demand

**The critical difference from every competitor:**  
When a student asks "explain monetary policy," StudyFetch and Khanmigo answer from generic internet knowledge. The Tutor Agent answers from Professor Chen's actual lecture on monetary policy, using the exact examples and language the professor used, weighted by what the professor emphasised. This is the Library's value made concrete.

**Connection to Library:**  
The Tutor Agent's RAG layer queries the Library before every answer. It retrieves the most relevant lecture content, syllabus sections, and rubrics for the student's enrolled courses. The Library is the Tutor Agent's knowledge base.

**Connection to AI Tutor (Reggie):**  
The Tutor Agent is called by Reggie via A2A. Reggie reads the brain context, determines that the student needs academic explanation, and delegates to the Tutor Agent with the brain context pre-loaded. The Tutor Agent never starts a response without knowing who the student is.

**Writes to Brain (via MCP):**  
- Knowledge confidence updates per concept: if the student asks 3 follow-up questions about monetary policy, the brain records `monetary_policy_confidence: low`
- Confusion signals: topics where the student consistently struggles
- Engagement depth score: did the student go deep or skim?
- Learning style signals: which explanation formats the student responded well to

**Reads from Brain (via MCP):**  
- Current knowledge gaps (so the agent knows what to pre-emptively address)
- Learning style profile (so the agent knows how to explain)
- Stress level and momentum state (so the agent adjusts tone — gentle when stressed, challenging when in flow)
- What the professor emphasised in the last lecture (from brain signals written by the Lecture Agent)

---

### Environment 4 — The Planner (Time and Priority Management)

**Why this environment exists:**  
Students consistently fail not because they lack intelligence but because they lack a system. They do not know what to do today, in what order, or how much time to allocate. Every study plan they make is based on guesswork. FschoolAI's planner is based on data — the student's actual knowledge gaps, actual deadlines, actual energy patterns.

**What happens here:**  
Student opens the planner view, or Reggie proactively surfaces a study plan recommendation.

**Agent: `Planner Agent`** (called by Reggie via A2A)

| Property | Detail |
|---|---|
| **Trigger** | Student opens planner; or Reggie detects a high-risk deadline approaching; or brain's intervention queue has a planning nudge |
| **Input** | All upcoming assignments and deadlines (from Canvas Agent) + brain context (stress, momentum, energy patterns) + knowledge gap map (from Tutor Agent signals) |
| **Core job** | Generate → prioritise → adjust → deliver |
| **Output** | Personalised study schedule with specific tasks, time allocations, and rationale |

**What it does:**
- Generates personalised study schedules based on deadlines, exam dates, and current knowledge gaps
- Prioritises tasks by urgency × difficulty × student's current energy state
- Adjusts the plan dynamically when new assignments appear or grades come in
- Generates the daily briefing: "Here is what matters today, here is what Reggie recommends you do in the next 2 hours, and here is why"

**Connection to Library:**  
The Planner Agent queries the Library for exam date information from syllabi and for topic weightings (which topics are worth the most marks). This allows it to allocate study time proportionally — not just by deadline, but by academic impact.

**Connection to AI Tutor (Reggie):**  
The Planner Agent's output feeds directly into Reggie's daily briefing. When a student opens FschoolAI in the morning, Reggie's first message is the Planner Agent's recommendation for the day.

**Writes to Brain (via MCP):**  
- Planning compliance signals: did the student follow the plan?
- Deadline stress signals: brain records when a student is within 48 hours of a high-stakes deadline
- Procrastination signals: if the student consistently starts assignments the night before, the brain records this pattern

**Reads from Brain (via MCP):**  
- Momentum state (high momentum = ambitious plan; low momentum = minimal viable plan)
- Stress level (high stress = reduce cognitive load in recommendations)
- Historical procrastination patterns (so the plan accounts for the student's real behaviour, not ideal behaviour)
- Energy patterns: when does this student do their best work? (evening vs. morning, short bursts vs. long sessions)

---

### Environment 5 — The Leaderboard and Student Network

**Why this environment exists:**  
Students are inherently competitive and social. The leaderboard is not a gamification gimmick — it is the social proof layer that drives retention and word-of-mouth growth. Every campus ambassador is a power user who recruits their cohort. The network effect is the growth engine.

**What happens here:**  
Students view their ranking, compete with peers, join study groups, and share course intelligence anonymously.

**Agent: `Network Agent`**

| Property | Detail |
|---|---|
| **Trigger** | Continuous background process; also triggered when student views leaderboard or study group recommendations |
| **Input** | All students' anonymised study signals + brain context (for study group matching) + Library data (for course intelligence sharing) |
| **Core job** | Rank → match → aggregate → surface |
| **Output** | Leaderboard rankings, study group recommendations, anonymised course intelligence |

**Leaderboard categories:**
- **Nerdmaxing** — total study hours and depth score
- **Late Night Maxing** — study activity after midnight
- **Influencer Maxing** — campus ambassador activity and referrals
- Filtered by: university, city, country, global

**Study group matching:**  
The Network Agent reads each student's knowledge gap map from the brain and matches students with complementary strengths. If Vincent is weak in monetary policy but strong in microeconomics, the Network Agent matches him with a student who is the inverse.

**Course intelligence aggregation:**  
The Network Agent reads anonymised signals from the Library across all students in a course and surfaces crowd-sourced intelligence: "Students who took ECON 201 say the midterm is 80% from lecture 4." This is the Professor Intelligence layer made social.

**Connection to Library:**  
The Network Agent writes aggregated course intelligence back to the Library as professor intelligence updates. When 50 students in ECON 201 have all received graded feedback from Professor Chen, the Network Agent synthesises those 50 feedback patterns into one professor profile update.

**Connection to AI Tutor (Reggie):**  
Reggie surfaces network intelligence proactively: "3 students in your ECON 201 cohort who scored above 85% on the midterm all studied lecture 4 for more than 2 hours. You have studied it for 20 minutes."

**Writes to Brain (via MCP):**  
- Social engagement signals: is the student active in the network?
- Competitive motivation signals: does the student respond to leaderboard position changes?
- Study group participation signals

**Reads from Brain (via MCP):**  
- Student's current weak topics (for study group matching)
- Motivation state (competitive vs. collaborative preference)

---

### Environment 6 — The Dashboard / Terminal (Daily Command Centre)

**Why this environment exists:**  
Bloomberg Terminal exists because serious traders need one place that tells them everything that matters right now. FschoolAI's Terminal is the same thing for students. It is the reason a student opens FschoolAI every morning before anything else.

**What happens here:**  
Student opens FschoolAI. The Terminal is the first thing they see.

**Agent: `Terminal Agent`** (this is Reggie's surface layer — not a separate A2A call)

| Property | Detail |
|---|---|
| **Trigger** | Student opens FschoolAI; also runs a pre-computation every morning at 7am |
| **Input** | Full brain context window (pre-computed by NeuroAGI every 30 minutes) + all Canvas Agent data + Network Agent rankings |
| **Core job** | Synthesise → surface → brief |
| **Output** | Daily briefing: what is due, what is at risk, what to do in the next 2 hours, peer rank, GPA trajectory |

**Dashboard components:**
- **GPA Trajectory** — current GPA vs. target, projected end-of-semester GPA based on current performance
- **Assignment Risk Radar** — colour-coded by urgency and completion status
- **Daily Briefing** — AI-generated 3-sentence summary of what matters today
- **Peer Benchmarking** — anonymised rank in cohort
- **Brain Intervention** — if the brain has a queued intervention message (e.g., "Vincent, your stress signal has been elevated for 3 days. Reggie wants to check in."), it surfaces here

**Connection to Library:**  
The Terminal queries the Library for upcoming exam dates from syllabi to populate the risk radar.

**Connection to AI Tutor (Reggie):**  
The Terminal IS Reggie's entry point. The daily briefing is Reggie speaking. The Terminal does not replace Reggie — it is the first thing Reggie says every morning before the student asks anything.

**Writes to Brain (via MCP):**  
- Daily engagement signal: did the student open the Terminal today?
- Response to intervention: did the student act on the intervention message?

**Reads from Brain (via MCP):**  
Everything — the full `brain.context_window` pre-computed by NeuroAGI. This is the most brain-dependent agent in the system.

---

### Environment 7 — The Nightly Reflection (Background Intelligence)

**Why this environment exists:**  
The brain does not get smarter from raw data. It gets smarter from reflection. Every night, while the student sleeps, the Nightly Reflection Agent processes the day's interactions and distills what was learned into brain signals. This is the compounding mechanism — the reason FschoolAI gets smarter every day.

**What happens here:**  
No student interaction. Pure background process. Runs at 2am local time for each student.

**Agent: `Reflection Agent`**

| Property | Detail |
|---|---|
| **Trigger** | Scheduled cron job at 2am local time |
| **Input** | All of today's chat logs, study session data, Canvas sync updates, lecture captures, leaderboard activity |
| **Core job** | Distil → abstract → write |
| **Output** | New brain signals written to NeuroAGI via MCP |

**What it distils:**
- Knowledge confidence changes: which concepts did the student engage with today, and did they show understanding or confusion?
- Behavioral pattern updates: did today's behaviour confirm or contradict existing patterns?
- Emotional signals: was the student stressed, in flow, disengaged?
- Academic risk updates: are any courses now at higher risk based on today's data?
- New hypotheses: does today's data suggest something new about this student that the brain should investigate?

**The data filtering rule (李小雷's principle):**  
Raw data never enters the brain. The Reflection Agent is the filter. It reads raw FschoolAI data and writes only learned abstractions to NeuroAGI. This prevents data bloat and keeps the brain clean.

| Raw Data (stays in FschoolAI) | Learned Abstraction (enters NeuroAGI via MCP) |
|---|---|
| Chat log: 47 messages about monetary policy | `monetary_policy_confidence: improving, 3 sessions` |
| Study session: 2.5h on stats, 20 min on econ | `engagement_pattern: deep focus on stats, avoidance of econ` |
| Assignment submitted 11pm, due midnight | `submission_pattern: last-minute, consistent across 4 assignments` |
| Lecture captured: 90 min, Prof Chen | `lecture_captured: ECON201, emphasis on monetary policy` |

**Connection to Library:**  
The Reflection Agent reads from the Library to contextualise signals. If the student spent 2 hours studying a topic that the Library says is worth 5% of the final grade, the signal is weighted accordingly.

**Connection to AI Tutor (Reggie):**  
The Reflection Agent's output is what makes Reggie smarter tomorrow. Every morning, Reggie reads a brain that was updated overnight. This is why Reggie feels like it remembers — because it does.

**Writes to Brain (via MCP):**  
All learned abstractions from the day. This is the primary brain-writing agent.

**Reads from Brain (via MCP):**  
Existing patterns and hypotheses (to determine whether today's data confirms or contradicts them).

---

### Environment 8 — The Library Agent (Background Organiser)

**Why this environment exists:**  
The Library is not a passive storage layer. It is a living intelligence layer that must be constantly organised, enriched, and cross-referenced. Without the Library Agent, the Library is just a pile of text files. With the Library Agent, it is the most comprehensive database of university course intelligence ever assembled.

**What happens here:**  
No student interaction. Pure background process. Runs continuously.

**Agent: `Library Agent`**

| Property | Detail |
|---|---|
| **Trigger** | New content written to Library by Canvas Agent or Lecture Agent; also runs a daily enrichment pass |
| **Input** | New Library content + existing Library content for the same course + professor intelligence profiles |
| **Core job** | Organise → enrich → cross-reference → synthesise |
| **Output** | Enriched Library entries, updated professor intelligence profiles, concept index updates |

**What it does:**
1. **Ingest and enrich:** When a new lecture transcript arrives, the Library Agent links it to the syllabus week, extracts academic concepts, tags exam-relevant sections, and identifies which professor emphasis signals are present.
2. **Deduplicate and merge:** When multiple students in the same course have captured the same lecture, the Library Agent merges the transcripts into the highest-quality version.
3. **Professor intelligence synthesis:** When new graded feedback arrives from any student in a course, the Library Agent updates the professor's intelligence profile. After 50 students have received feedback from Professor Chen, the profile says: "Chen deducts 5% per missing citation, values concrete examples over abstract theory, gives higher scores to submissions under 800 words."
4. **Exam signal aggregation:** As exam season approaches, the Library Agent pre-computes which content is most likely to appear on exams based on professor emphasis patterns and historical signals.
5. **Cross-course concept linking:** When the same concept appears in multiple courses (e.g., regression analysis in both STATS 201 and ECON 301), the Library Agent links them so the Tutor Agent can draw on both course's explanations.

**Connection to AI Tutor (Reggie):**  
The Library Agent's output is what makes the Tutor Agent course-specific rather than generic. Every enrichment pass makes Reggie's answers more accurate and more relevant to the student's actual courses.

**Connection to Brain:**  
The Library Agent does not write to the brain directly. The brain reads from the Library via Brain SDK when it needs course-specific context. The Library Agent keeps the Library worth reading.

---

## How Everything Connects — The Complete Flow

```
STUDENT ACTION          AGENT               LIBRARY         BRAIN (NeuroAGI)
─────────────────────────────────────────────────────────────────────────────

Attends lecture ──────► Lecture Agent ─────► writes          writes signals
                                             lecture          via MCP
                                             transcript

Browses Canvas ───────► Canvas Agent ──────► writes          writes academic
                                             syllabi,         signals via MCP
                                             rubrics

Asks Reggie a ────────► Reggie ────────────► reads           reads brain
question               (Orchestrator)       (RAG)            context via MCP
                            │
                            │ A2A call
                            ▼
                        Tutor Agent ────────► reads           writes knowledge
                                             (RAG)            signals via MCP

Opens planner ────────► Reggie ────────────► reads           reads brain
                            │               exam dates       context via MCP
                            │ A2A call
                            ▼
                        Planner Agent ──────► reads           writes planning
                                             syllabi          signals via MCP

Views leaderboard ────► Network Agent ─────► writes          reads knowledge
                                             professor        gaps via MCP
                                             intelligence

Opens Terminal ───────► Terminal Agent ─────► reads          reads full
(morning)                                    exam dates      context_window
                                                             via MCP

2am (student ─────────► Reflection Agent ───► reads          writes ALL
sleeping)                                    (context)       learned
                                                             abstractions
                                                             via MCP

New content in ───────► Library Agent ──────► reads +        (no direct
Library                                      writes          brain write)
                                             (enrichment)
```

---

## The A2A Call Map (Reggie as Orchestrator)

Reggie receives every student message. Before routing, Reggie always reads the brain context via MCP. Then:

| Student Input | Reggie Routes To | Via |
|---|---|---|
| Academic question about course content | Tutor Agent | A2A |
| "What should I study today?" | Planner Agent | A2A |
| "How am I doing in ECON 201?" | Terminal Agent (internal) | Direct |
| Stressed message + academic question | Support tone (Tutor Agent) | A2A with stress flag |
| "Who is strong in stats in my cohort?" | Network Agent | A2A |
| Any question about lecture content | Tutor Agent + Library RAG | A2A |

**Reggie can call multiple agents simultaneously** and blend their outputs. A stressed student asking about an essay gets the Support tone and the Tutor Agent's content in one response. Reggie is the composer. The specialists are the instruments.

---

## The FschoolAI ↔ NeuroAGI A2A Boundary

FschoolAI and NeuroAGI communicate via A2A at the system level — not just at the agent level.

```
FschoolAI (Super Agent / Domain App)
    │
    │ A2A — "update brain with today's learned signals"
    │ A2A — "read brain context for session start"
    │ A2A — "queue intervention for student X"
    ▼
NeuroAGI Brain (Stateful Intelligence Layer)
    │
    │ MCP — exposes brain as tool-callable API
    │ MCP — brain.read(person_id, context_type)
    │ MCP — brain.write(person_id, signal_type, abstraction)
    ▼
All registered agents (FschoolAI + future third-party apps)
```

**The rule:** FschoolAI never writes directly to NeuroAGI's database. It always goes through the A2A → MCP interface. This keeps the brain's data model clean and allows NeuroAGI to evolve its internal architecture without breaking FschoolAI.

---

## What Is Built vs. What Needs to Be Built

| Agent | Status | Owner |
|---|---|---|
| Lecture Agent | ✅ Chrome extension captures audio; transcription works | Aryan |
| Canvas Agent | ✅ Syncing 926 assignments, 84 courses | Aryan |
| Tutor Agent (Reggie monolith) | ✅ Working but not yet A2A-separated | Vincent |
| Reflection Agent | ✅ Designed, partially built | 李小雷 |
| Library Agent | ⚠️ Storage works; enrichment/organisation not built | TBD |
| Planner Agent | ❌ Not built | Bytedance engineer |
| Network Agent | ❌ Not built (leaderboard UI exists, agent logic missing) | TBD |
| Terminal Agent | ⚠️ Dashboard UI exists; brain context integration incomplete | Vincent |
| A2A separation of Tutor/Planner from Reggie | ❌ Not built | Tencent engineer |
| MCP server for NeuroAGI brain | ❌ Not built (currently direct Supabase calls) | 李小雷 |
| Canvas → NeuroAGI brain sync | ❌ Broken (fschool.courses empty) | Aryan + 李小雷 |

---

## Team Responsibilities

| Engineer | Domain | Agents |
|---|---|---|
| **Vincent** | Reggie orchestrator, product, Terminal Agent | Reggie (orchestrator), Terminal Agent |
| **Aryan** | Chrome extension, Canvas sync, data pipeline | Lecture Agent, Canvas Agent |
| **李小雷** | NeuroAGI brain model, MCP server, Reflection Agent | Reflection Agent, MCP interface |
| **Tencent engineer** | Tutor Agent (A2A separation, NLP depth) | Tutor Agent |
| **Bytedance engineer** | Planner Agent (recommendation logic) | Planner Agent |
| **TBD** | Library Agent (enrichment pipeline), Network Agent | Library Agent, Network Agent |

---

## The One Rule Every Agent Builder Must Follow

> **Before every response, read the brain. After every response, write what you learned.**

Every agent that does not follow this rule is just another ChatGPT wrapper. Every agent that does follow this rule compounds the intelligence of the entire system.

The brain is the moat. The agents are the interface. The Library is the knowledge base. None of them work as well without the other two.

---

*Document maintained by Vincent Yang. Update when architecture changes. Last updated: June 2026.*
