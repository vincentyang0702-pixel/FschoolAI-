# Page ↔ Agent Map

**This is the build map. Every agent listed here must be built. Every page listed here must call these agents.**

---

## How to Read This Document

- **Global Agents** run across ALL pages (always active in background)
- **Page Agents** are triggered only when the student is on that specific page
- Each agent has its own spec file in this `/agents` folder
- The `Status` column tells you what exists vs what needs to be built

---

## Global Agents (Live Across Every Page)

These agents are always running. They do not belong to a single page — they are the nervous system.

| Agent | File | What It Does | Status |
|---|---|---|---|
| Context Window Builder | `context-window-builder.md` | Assembles the full brain context before any AI response | ✅ BUILT (`brain-context-window.ts`) |
| Reflection Engine | `reflection-engine.md` | Runs every 6 hours, finds patterns in signals, writes reflections | ✅ BUILT (`brain-reflection.ts`) |
| Brain Scheduler | `brain-scheduler.md` | Cron job that triggers context rebuild, reflection, and signal processing | ✅ BUILT (`brain-scheduler.ts`) |
| Signal Ingestion | `signal-ingestion.md` | Receives raw events from any source, normalizes into brain.signals | ✅ BUILT (`signal-ingestion.ts`) |
| Canvas Watcher | `canvas-watcher.md` | Syncs Canvas data every 30 min, emits signals for changes | ✅ BUILT (`canvas-sync.ts`) |
| Token Engine | `token-engine.md` | Awards tokens for validated actions, manages tier progression | 🔴 NOT BUILT |
| Motivation Engine | `motivation-engine.md` | Detects motivation drops, sends personalized interventions | 🔴 NOT BUILT |
| UI Preference Agent | `ui-preference-agent.md` | Stores and applies interface customizations from chat commands | 🔴 NOT BUILT |

---

## Page 1: HOME — Agents

| Agent | File | Trigger | What It Does on This Page |
|---|---|---|---|
| **Situation Synthesizer** | `situation-synthesizer.md` | On page open | Generates the tutor greeting from last 24h signals + deadlines + social |
| Context Window Builder | `context-window-builder.md` | Before greeting | Provides full context for greeting generation |
| Motivation Engine | `motivation-engine.md` | On page open | Decides greeting tone (urgent, encouraging, celebratory) |
| Token Engine | `token-engine.md` | Always visible | Shows token balance + tier in header |

**Frontend renders:** Tutor greeting bubble, Neural Ring animation, token counter, today's priority card.

---

## Page 2: ASSIGNMENTS — Agents

| Agent | File | Trigger | What It Does on This Page |
|---|---|---|---|
| **Assignment Agent** | `assignment-agent.md` | On "Help me start" tap | Reads rubric + professor profile → generates starting framework |
| **Exam Predictor** | `exam-predictor.md` | On page load | Shows predicted grade per assignment (updates in real-time) |
| **Professor Intelligence** | `professor-intelligence.md` | On page load | Shows professor insight badge per assignment |
| Canvas Watcher | `canvas-watcher.md` | Background | Keeps assignment list current |
| Token Engine | `token-engine.md` | On submission detected | Awards tokens for on-time/early submission |

**Frontend renders:** Assignment cards with: due date, predicted grade, professor badge, friend status, token preview, "Help me start" button.

---

## Page 3: STUDY — Agents

| Agent | File | Trigger | What It Does on This Page |
|---|---|---|---|
| **Lesson Generator** | `lesson-generator.md` | On page open + scheduled | Creates personalized micro-lessons from detected knowledge gaps |
| **Study Agent** | `study-agent.md` | On flashcard/guide request | Generates study material from uploaded notes |
| **Focus Agent** | `focus-agent.md` | On study session start | Tracks attention, suggests breaks, logs session duration |
| **Content Connector** | `content-connector.md` | During lesson | Links outside content to study material |
| Token Engine | `token-engine.md` | On session complete (25+ min) | Awards tokens for completed study sessions |

**Frontend renders:** Lesson cards ("For you today"), study timer, flashcard deck, focus mode toggle, session stats.

---

## Page 4: CANVAS — Agents

| Agent | File | Trigger | What It Does on This Page |
|---|---|---|---|
| **Canvas Watcher** | `canvas-watcher.md` | On refresh / every 30 min | Syncs courses, assignments, grades |
| **Professor Intelligence** | `professor-intelligence.md` | On course expand | Shows professor profile card |
| **Exam Predictor** | `exam-predictor.md` | On course expand | Shows course-level grade trajectory |
| Signal Ingestion | `signal-ingestion.md` | On new grade detected | Emits signal for grade change |

**Frontend renders:** Course list with brain health indicator, professor card, grade trend line, sync status, priority ranking.

---

## Page 5: BRAIN — Agents

| Agent | File | Trigger | What It Does on This Page |
|---|---|---|---|
| **Reflection Engine** | `reflection-engine.md` | On page open | Surfaces latest reflections and insights |
| **Writing Evolution Tracker** | `writing-evolution-tracker.md` | On page open | Shows writing growth timeline |
| **Knowledge Graph Builder** | `knowledge-graph-builder.md` | On page open | Renders dynamic knowledge graph from neuro.patterns |
| **Pattern Recognition** | `pattern-recognition.md` | Background | Identifies learning style from signal history |

**Frontend renders:** Knowledge graph (interactive), learning style profile, writing evolution timeline, cognitive strengths radar, brain age counter, export button.

---

## Page 6: SOCIAL — Agents

| Agent | File | Trigger | What It Does on This Page |
|---|---|---|---|
| **Social Intelligence** | `social-intelligence.md` | On page open | Shows compatibility scores, suggests study partners |
| **Study Room Orchestrator** | `study-room-orchestrator.md` | On room join | Manages multi-student AI tutoring in real-time |
| **Motivation Engine** | `motivation-engine.md` | On friend activity | Sends social nudges ("Sarah is studying now") |
| Token Engine | `token-engine.md` | On help given / room hosted | Awards social tokens |

**Frontend renders:** Friends list with compatibility, active rooms, suggested partners, group challenges, friend brain comparison (opt-in).

---

## Page 7: LEADERBOARD — Agents

| Agent | File | Trigger | What It Does on This Page |
|---|---|---|---|
| **Leaderboard Agent** | `leaderboard-agent.md` | On page open / weekly reset | Calculates rankings across all categories |
| **Motivation Engine** | `motivation-engine.md` | On position change | Sends nudge when passed or close to passing someone |
| Token Engine | `token-engine.md` | On weekly top 3 | Awards bonus tokens to weekly winners |

**Frontend renders:** 8 leaderboard categories, filter controls, challenge button, weekly countdown, token bonus indicator.

---

## Page 8: CHAT (The Tutor — Accessible From Every Page)

The chat panel is NOT a page — it is a layer that slides up from any page. But it calls different agents depending on context.

| Context | Agents Called | Example |
|---|---|---|
| Opened from HOME | Situation Synthesizer + Context Window | "What should I work on?" |
| Opened from ASSIGNMENTS | Assignment Agent + Professor Intelligence | "Help me start this essay" |
| Opened from STUDY | Study Agent + Lesson Generator | "Make me flashcards for Chapter 7" |
| Opened from CANVAS | Canvas Watcher + Professor Intelligence | "What does Prof Chen want?" |
| Opened from BRAIN | Reflection Engine + Pattern Recognition | "What are my weaknesses?" |
| Opened from SOCIAL | Social Intelligence + Study Room Orchestrator | "Who should I study with?" |
| Opened from LEADERBOARD | Motivation Engine + Token Engine | "How do I get to #1?" |
| UI modification request | UI Preference Agent | "Make my background darker" |
| Grade question | Exam Predictor | "What will I get on the midterm?" |
| Motivation request | Motivation Engine | "I can't focus" |
| Content link | Content Connector | "How does this video relate to my class?" |

**The chat ALWAYS calls Context Window Builder first** — before any agent responds, the full brain context is assembled. This is what makes every response personalized.

---

## Visual Summary: Agent × Page Matrix

```
                    HOME  ASSIGN  STUDY  CANVAS  BRAIN  SOCIAL  LEADER  CHAT
Context Window       ●      ●       ●      ●       ●      ●       ●      ●
Reflection Engine    ○      ○       ○      ○       ●      ○       ○      ●
Brain Scheduler      ●      ●       ●      ●       ●      ●       ●      ●
Signal Ingestion     ●      ●       ●      ●       ●      ●       ●      ●
Canvas Watcher       ○      ●       ○      ●       ○      ○       ○      ●
Token Engine         ●      ●       ●      ○       ○      ●       ●      ●
Motivation Engine    ●      ○       ○      ○       ○      ●       ●      ●
UI Preference Agent  ●      ●       ●      ●       ●      ●       ●      ●
Situation Synth.     ●      ○       ○      ○       ○      ○       ○      ●
Assignment Agent     ○      ●       ○      ○       ○      ○       ○      ●
Exam Predictor       ○      ●       ○      ●       ○      ○       ○      ●
Professor Intel.     ○      ●       ○      ●       ○      ○       ○      ●
Lesson Generator     ○      ○       ●      ○       ○      ○       ○      ●
Study Agent          ○      ○       ●      ○       ○      ○       ○      ●
Focus Agent          ○      ○       ●      ○       ○      ○       ○      ○
Content Connector    ○      ○       ●      ○       ○      ○       ○      ●
Writing Evolution    ○      ○       ○      ○       ●      ○       ○      ●
Knowledge Graph      ○      ○       ○      ○       ●      ○       ○      ●
Pattern Recognition  ○      ○       ○      ○       ●      ○       ○      ●
Social Intelligence  ○      ○       ○      ○       ○      ●       ○      ●
Room Orchestrator    ○      ○       ○      ○       ○      ●       ○      ○
Leaderboard Agent    ○      ○       ○      ○       ○      ○       ●      ○

● = Active on this page    ○ = Not active on this page
```

---

## Build Order for Your Tech Guy

### Sprint 1 (Week 1-2): Make the Brain Work
1. `context-window-builder.md` — already built, just needs to be started
2. `brain-scheduler.md` — already built, just needs to be deployed
3. `signal-ingestion.md` — already built, needs env var fix (done)
4. `situation-synthesizer.md` — **BUILD THIS FIRST** (makes home page alive)
5. `token-engine.md` — **BUILD THIS SECOND** (makes everything feel consequential)

### Sprint 2 (Week 3-4): Core Intelligence
6. `assignment-agent.md` — "Help me start" feature
7. `professor-intelligence.md` — grading style analysis
8. `lesson-generator.md` — personalized micro-lessons
9. `exam-predictor.md` — grade predictions

### Sprint 3 (Week 5-6): Social Layer
10. `social-intelligence.md` — compatibility scores
11. `study-room-orchestrator.md` — multi-student AI tutoring
12. `leaderboard-agent.md` — ranking calculations
13. `motivation-engine.md` — personalized nudges

### Sprint 4 (Week 7-8): Deep Intelligence
14. `writing-evolution-tracker.md` — writing growth analysis
15. `knowledge-graph-builder.md` — dynamic knowledge graph
16. `content-connector.md` — link outside content to coursework
17. `focus-agent.md` — attention tracking
18. `ui-preference-agent.md` — AI-generated interface modifications

---

*Each agent has its own spec file in this folder. Read the spec → build the agent → test it → ship it.*
