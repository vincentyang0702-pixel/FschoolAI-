# FschoolAI Team Builder Guide
**Version 1.0 — For Engineers Starting to Build Environments & Agents**

---

## Read This First

You are building one piece of a larger system. This document tells you exactly:

1. What you are building
2. The one rule every agent must follow
3. How to call the brain
4. Where to find your full spec

You do **not** need to understand the full architecture. You do not need to know what A2A or MCP means. You just need to build your piece and call two functions.

---

## The Big Picture (One Paragraph)

FschoolAI is the product students use every day — the chat interface, the Canvas sync, the study planner. NeuroAGI is the brain that remembers everything about the student across all sessions. These are two separate systems. FschoolAI agents do the work. NeuroAGI stores the memory. Every agent in FschoolAI reads from the brain before acting, and writes back to the brain after acting. That is the entire system.

```
Student
  ↓
FschoolAI (the product)
  ↓  ↑
NeuroAGI (the brain — remembers everything)
```

---

## The One Rule Every Agent Must Follow

Every single agent — no exceptions — does exactly three steps:

```
Step 1:  context = brain.read(student_id)
Step 2:  result  = do_your_job(input, context)
Step 3:  brain.write(student_id, signal)
```

**Step 1 — Read the brain before acting.**
Before your agent does anything, ask the brain what it knows about this student. You will get back their learning style, knowledge gaps, stress level, recent activity, and more.

**Step 2 — Do your job.**
Use the context from Step 1 to do your agent's specific task. Tutor the student. Sync Canvas. Build a study plan. Whatever your agent does.

**Step 3 — Write back to the brain after acting.**
After your agent finishes, report what you learned. Did the student struggle with a concept? Did they complete an assignment? Did they seem stressed? Write a signal back to the brain.

That is all. If your agent does these three steps, it is built correctly.

---

## Who Builds What

### Vincent Yang — Reggie (Orchestrator Agent)
**You build:** The main agent that talks to the student and routes requests to all other agents.

**Your job:**
- Receive the student's message
- Call `brain.read(student_id)` to get full student context
- Decide which specialist agent to call (Tutor, Canvas, Planner, etc.)
- Collect the result from the specialist agent
- Call `brain.write(student_id, session_signal)` at the end of every session
- Return the final response to the student

**Your spec:** `AGENT_REGISTRY_V2.md` → Section: Reggie (Orchestrator)

**Start here:**
- [ ] Read `AGENT_REGISTRY_V2.md` — Reggie section
- [ ] Understand the routing logic (intent detection → agent selection)
- [ ] Implement `brain.read()` call at session start
- [ ] Implement `brain.write()` call at session end
- [ ] Test with a mock `brain.read()` response before 李小雷 finishes the real API

---

### Aryan — Canvas Agent + Chrome Extension
**You build:** The agent that connects to Canvas LMS and syncs the student's courses, assignments, and grades. Also the Chrome extension that captures lecture activity.

**Your job (Canvas Agent):**
- When called by Reggie, pull the student's Canvas data (courses, assignments, due dates, grades)
- Call `brain.write(student_id, canvas_signal)` with what you found — upcoming deadlines, grade changes, missing assignments
- Return a structured summary to Reggie

**Your job (Chrome Extension):**
- Detect when the student is on a Canvas page or watching a lecture
- Send activity signals to FschoolAI backend
- The backend will call `brain.write()` — you do not need to call it directly from the extension

**Your spec:** `AGENT_REGISTRY_V2.md` → Section: Canvas Agent

**Start here:**
- [ ] Read `AGENT_REGISTRY_V2.md` — Canvas Agent section
- [ ] Check the latest extension build on GitHub before starting
- [ ] Implement Canvas OAuth token flow (see `FSCHOOLAI_PRD_COMPLETE.md` → Canvas Integration)
- [ ] Implement `brain.write()` call after every Canvas sync
- [ ] Test with a real Canvas sandbox account

**What to write to the brain after Canvas sync:**
```json
{
  "type": "canvas_sync",
  "assignments_due_soon": [...],
  "grade_changes": [...],
  "missing_assignments": [...]
}
```

---

### Tencent Engineer — Tutor Agent
**You build:** The agent that tutors the student — answers questions, explains concepts, identifies knowledge gaps.

**Your job:**
- When called by Reggie with a student question, first call `brain.read(student_id)`
- Use the brain context to personalise your explanation (their learning style, what they already know, what they struggle with)
- Answer the question
- Call `brain.write(student_id, tutor_signal)` with what you observed — did they understand? did they ask follow-up questions? what concept were they struggling with?

**Your spec:** `AGENT_REGISTRY_V2.md` → Section: Tutor Agent

**Start here:**
- [ ] Read `AGENT_REGISTRY_V2.md` — Tutor Agent section
- [ ] Implement `brain.read()` at the start of every tutoring session
- [ ] Use `learning_style` and `knowledge_gaps` fields from brain context to personalise responses
- [ ] Implement `brain.write()` after every tutoring exchange
- [ ] Do NOT store conversation history yourself — the brain handles memory

**What to write to the brain after tutoring:**
```json
{
  "type": "tutor_session",
  "concept_addressed": "Newton's Second Law",
  "understood": true,
  "follow_up_questions": 3,
  "struggle_signals": ["confused about units", "needed second explanation"]
}
```

---

### Bytedance Engineer — Planner Agent + Recommendation Layer
**You build:** The agent that creates personalised study plans and recommends what the student should work on next.

**Your job:**
- When called by Reggie, call `brain.read(student_id)` to get the student's current workload, stress level, upcoming deadlines, and knowledge gaps
- Generate a study plan that fits their available time and prioritises their weakest areas
- Call `brain.write(student_id, plan_signal)` after the plan is created
- Also build the recommendation layer — given brain context, surface the most relevant next action for the student

**Your spec:** `AGENT_REGISTRY_V2.md` → Section: Planner Agent

**Start here:**
- [ ] Read `AGENT_REGISTRY_V2.md` — Planner Agent section
- [ ] Read `ENVIRONMENTS_AND_CAPABILITIES.md` — Study Planner environment section
- [ ] Implement `brain.read()` at the start of every planning session
- [ ] Use `stress_level`, `available_time`, `upcoming_deadlines`, `knowledge_gaps` from brain context
- [ ] Implement `brain.write()` after plan is created
- [ ] Build recommendation logic: rank next actions by urgency × importance × brain gap score

**What to write to the brain after planning:**
```json
{
  "type": "study_plan",
  "plan_created": "2024-01-15",
  "sessions_scheduled": 4,
  "priority_topics": ["Organic Chemistry Ch.5", "Calculus integration"],
  "estimated_hours": 8
}
```

---

### 李小雷 (CTO) — NeuroAGI Brain API
**You build:** The two functions that everyone else calls. This is the most critical piece of the entire system.

**Your job:**
- Build `brain.read(student_id)` — returns a structured JSON object with everything FschoolAI agents need to know about the student
- Build `brain.write(student_id, signal)` — accepts a signal from any FschoolAI agent and stores it in the brain
- Build the Graph RAG layer that makes the brain smarter over time
- Build the Reflection Agent that runs nightly and synthesises raw signals into confirmed knowledge patterns

**Your spec:**
- `GRAPH_RAG_BRAIN_LAYER.md` — full brain architecture, two-graph design, SQL schema
- `AGENT_REGISTRY_V2.md` → Section: Reflection Agent
- `vincent-brain-data-guide.md` — SQL queries for the existing NeuroAGI Supabase data

**Start here:**
- [ ] Read `GRAPH_RAG_BRAIN_LAYER.md` — full document
- [ ] Set up `brain.nodes` and `brain.edges` tables (SQL schema in that document)
- [ ] Build `brain.read(student_id)` — returns the context JSON below
- [ ] Build `brain.write(student_id, signal)` — accepts signal JSON from any agent
- [ ] Build `brain.context_window` table for fast pre-computed reads (< 5ms)
- [ ] Build the Reflection Agent (nightly job that synthesises signals into patterns)

**What `brain.read()` must return:**
```json
{
  "student_id": "uuid",
  "learning_style": "visual | verbal | practice-first",
  "knowledge_gaps": ["topic_a", "topic_b"],
  "stress_level": 0.0,
  "available_time_today": 120,
  "upcoming_deadlines": [...],
  "recent_struggles": [...],
  "strengths": [...],
  "last_updated": "ISO timestamp"
}
```

**What `brain.write()` must accept:**
```json
{
  "student_id": "uuid",
  "agent": "tutor_agent | canvas_agent | planner_agent | reggie",
  "type": "signal type string",
  "payload": { ... },
  "timestamp": "ISO timestamp"
}
```

**NeuroAGI Supabase connection:**
- Project ID: `qiolhlvqfzujnkwnymft`
- Existing data: 1,467 messages, 203 reflections, 371 signals, 88 patterns
- See `vincent-brain-data-guide.md` for all SQL queries to access this data

---

## How FschoolAI and NeuroAGI Connect

You do not need to understand the protocol. Here is all you need to know:

When your agent calls `brain.read()` or `brain.write()`, it is making a call to the NeuroAGI API. That API is built by 李小雷. Until 李小雷's API is ready, use the mock responses below for development.

**Mock `brain.read()` response for development:**
```json
{
  "student_id": "test-student-001",
  "learning_style": "visual",
  "knowledge_gaps": ["integration by parts", "organic chemistry mechanisms"],
  "stress_level": 0.6,
  "available_time_today": 90,
  "upcoming_deadlines": [
    { "course": "MATH 201", "assignment": "Problem Set 4", "due": "2024-01-18" }
  ],
  "recent_struggles": ["spent 45min on one calculus problem yesterday"],
  "strengths": ["strong in biology", "consistent daily study habit"],
  "last_updated": "2024-01-15T08:00:00Z"
}
```

---

## What You Do NOT Need to Know

The following are implementation details for 李小雷 only. You do not need to understand them to build your agent:

- How A2A protocol works internally
- What MCP (Model Context Protocol) is
- How the Graph RAG system stores data
- How the Reflection Agent synthesises signals
- The difference between Brain Graph and Library Graph
- Confidence decay algorithms
- Temporal edge logic

If someone mentions these terms in a meeting, it is fine to say "I just call `brain.read()` and `brain.write()` — 李小雷 handles the rest."

---

## Key Documents by Role

| Role | Must Read | Optional |
|---|---|---|
| Vincent (Reggie) | `AGENT_REGISTRY_V2.md` | `AGENT_ARCHITECTURE_FINAL.md` |
| Aryan (Canvas + Extension) | `AGENT_REGISTRY_V2.md`, `FSCHOOLAI_PRD_COMPLETE.md` | `ENVIRONMENTS_AND_CAPABILITIES.md` |
| Tencent (Tutor Agent) | `AGENT_REGISTRY_V2.md` | `FSCHOOLAI_PRD_COMPLETE.md` |
| Bytedance (Planner Agent) | `AGENT_REGISTRY_V2.md`, `ENVIRONMENTS_AND_CAPABILITIES.md` | `FSCHOOLAI_PRD_COMPLETE.md` |
| 李小雷 (Brain API) | `GRAPH_RAG_BRAIN_LAYER.md`, `vincent-brain-data-guide.md` | `AGENT_REGISTRY_V2.md` |

All documents are in the GitHub repo: `vincentyang0702-pixel/FschoolAI-` → branch `frontend/dev`

---

## Build Order

Build in this order to avoid blocking each other:

```
Week 1:
  李小雷  → brain.read() mock API (returns hardcoded JSON)
  Aryan   → Canvas OAuth + data sync (no brain calls yet)

Week 2:
  李小雷  → brain.write() API (accepts and stores signals)
  Tencent → Tutor Agent (calls mock brain.read())
  Bytedance → Planner Agent (calls mock brain.read())

Week 3:
  Vincent → Reggie orchestrator (routes to all agents)
  All     → Switch from mock brain to real brain.read() / brain.write()

Week 4:
  李小雷  → Reflection Agent (nightly synthesis)
  All     → Integration testing end-to-end
```

---

## Questions?

- **Architecture questions** → Ask Vincent
- **Brain API questions** → Ask 李小雷
- **Canvas / extension questions** → Ask Aryan
- **Spec document questions** → Read `AGENT_REGISTRY_V2.md` first, then ask Vincent

---

*FschoolAI Engineering Team — Internal Document*
*All documents: github.com/vincentyang0702-pixel/FschoolAI- → branch: frontend/dev*
