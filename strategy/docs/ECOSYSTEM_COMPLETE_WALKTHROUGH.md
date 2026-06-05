# NeuroAGI + FschoolAI — Complete Ecosystem Walkthrough
*For someone with zero knowledge of either company*

---

## Start Here: The One-Sentence Version

**NeuroAGI** builds the brain. **FschoolAI** is the first app that runs on it.

That's it. Everything else is the detail of how those two things connect.

---

## Part 1: What Is NeuroAGI?

Imagine you had a personal assistant who remembered everything you ever told them — every book you read, every class you attended, every time you struggled with something, every goal you mentioned. And over time, they got to know you so well that they could predict what you needed before you asked.

That's what NeuroAGI is building — except it's not a person. It's a **persistent AI brain** that lives in the cloud (and eventually on a physical card you carry), and it grows smarter about you every single day.

### The Brain Is the Core Asset

The brain does four things:

| What It Does | Technical Name | What It Means in Plain English |
|---|---|---|
| Remembers everything about you | `brain.getContext()` | Before any AI responds to you, it reads your full profile first |
| Learns from every interaction | `brain.update()` | After every conversation, the brain gets updated with what it learned |
| Predicts what you need | `brain.suggestNext()` | The brain proactively tells Reggie which agent to send you to |
| Proves what you know | `brain.verifySkill()` | Evidence-based proof of your actual knowledge level |

### The Neural Card

The physical product is a credit-card-sized device you carry in your wallet. It holds your brain data. It's your identity in the NeuroAGI ecosystem. Think of it like an iPhone — but instead of apps, it holds your intelligence. This is what you pre-sell at $599–$1,299 on the Reggie pre-sale page.

---

## Part 2: What Is FschoolAI?

FschoolAI is the first product built on the NeuroAGI brain. It's an AI for students.

But it's not like ChatGPT or any other AI tool. The difference is this:

> Every other AI starts from zero every time you open it. FschoolAI starts knowing everything about you — your courses, your grades, your knowledge gaps, your focus patterns, your emotional state — because the brain has been learning about you since day one.

### What FschoolAI Does

FschoolAI connects to your university's Canvas system (the platform most universities use for assignments and grades). It reads your courses, deadlines, and grades. It feeds all of that into the NeuroAGI brain. Then it uses that brain context to give you a completely personalized AI experience.

### Reggie — The Agent Manager

Inside FschoolAI lives **Reggie**. Reggie is not an AI that answers questions. Reggie is an AI that reads the brain and decides which specialist agent should help you right now.

Think of Reggie like a hospital triage nurse. When you walk in, the nurse doesn't treat you — they figure out which doctor you need and send you there. Reggie does the same thing:

- You say "I can't focus" → Reggie reads your brain → sees you've been up since 2am → sends you to the **Focus Guardian** agent
- You say "I don't understand this concept" → Reggie reads your brain → sees your knowledge gap → sends you to the **Study Buddy** agent
- You say "I'm overwhelmed" → Reggie reads your brain → sees you have 3 deadlines in 48 hours → sends you to the **Motivation Coach** agent

Reggie uses **Claude Haiku** (fast, cheap) to make routing decisions. The specialist agents use **Claude 3.5 Sonnet** (best quality) to respond.

### The 10 Specialist Agents

| Agent | What It Does |
|---|---|
| Study Buddy | Explains concepts in the way that works for you specifically |
| Focus Guardian | Gets you into deep work mode using your personal focus patterns |
| Motivation Coach | Re-ignites your drive using your actual goals and history |
| Performance Tracker | Data-driven picture of where you stand and what to do next |
| Problem Solver | Guides you through problems using the Socratic method |
| Synthesis Expert | Connects this concept to everything else you've learned |
| Personalization Engine | Adapts the learning experience to your style |
| Reflection Guide | Helps you consolidate what you've learned |
| Recommendation Engine | Tells you exactly what to study next and why |
| Crisis Support | Warm support when you're overwhelmed or in distress |

---

## Part 3: How They Connect — The Full Flow

Here is exactly what happens when a student sends a message in FschoolAI:

```
Student types: "I keep failing my stats quizzes"
        │
        ▼
[FschoolAI Frontend]
        │  sends message + JWT token to API
        ▼
[server/routes/agents.ts]
        │  verifies JWT (auth middleware)
        ▼
[AgentOrchestrator.processUserInput()]
        │
        ├─ Step 1: brain.getContext(userId)
        │          ↳ Reads from Supabase: knowledge graph, mastery levels,
        │            recent activity, emotional signals, predictions
        │            Result: "Student is weak in hypothesis testing,
        │                     strong in descriptive stats, stressed,
        │                     has quiz in 2 days"
        │
        ├─ Step 2: Reggie routes semantically (Claude Haiku)
        │          ↳ Reads brain context + message
        │            Selects: "study" agent
        │            Reason: "Student has a specific knowledge gap
        │                      in hypothesis testing"
        │
        ├─ Step 3: Study Buddy responds (Claude 3.5 Sonnet)
        │          ↳ System prompt: "You know this student's full brain.
        │            They're strong in descriptive stats but weak in
        │            hypothesis testing. Quiz in 2 days. Be specific."
        │            Response: Personalized explanation connecting
        │                      hypothesis testing to what they already know
        │
        └─ Step 4: brain.update(userId, signal)
                   ↳ Writes to brain_signals table:
                     "Student engaged with hypothesis testing content,
                      asked for help, received explanation"
                   ↳ Brain gets smarter. Next interaction is better.
        │
        ▼
[Response returned to student]
```

This loop runs for every single interaction. Every message makes the brain smarter. Every day the brain knows more about the student. After 30 days, the brain can predict what the student needs before they ask.

---

## Part 4: The GitHub Structure — Where Everything Lives

You have 4 repositories. Here is what each one is for:

### `FschoolAI-` (Private)
**The main monorepo.** This is where all active development happens. It contains:
- The full backend server (`server/`)
- All brain services (`server/services/neuro-agi.ts`, `brain-compounding.ts`, etc.)
- All agents (`server/agents/`)
- All API routes (`server/routes/`)
- Canvas integration (`server/services/canvas-*.ts`)
- All documentation (`docs/`)
- Database migrations (`supabase/migrations/`)

**Who uses it:** Both teams during active development.

---

### `neuroagi-core` (Private)
**The NeuroAGI brain, separated.** This is the clean version of just the brain layer — no FschoolAI-specific code. It contains:
- `src/brain/` — all brain services (neuro-agi, knowledge-graph, pattern-recognition, etc.)
- `src/agents/` — the 10 specialist agents
- `src/sdk/brain-sdk.ts` — the clean API contract (4 methods: getContext, update, suggestNext, verifySkill)
- `src/sdk/brain-sdk-impl.ts` — the implementation
- `docs/` — ecosystem documentation, architecture docs, pitch docs

**Who uses it:** NeuroAGI team only. Future external developers will use the SDK from here.

---

### `fschoolai-backend` (Private)
**The FschoolAI backend, separated.** This is the clean version of just the FschoolAI-specific code. It contains:
- `server/` — all backend code
- `neuroagi-sdk/` — a copy of the Brain SDK (the only NeuroAGI code FschoolAI team touches)
- `docs/` — FschoolAI-specific integration guides
- `supabase/migrations/` — database schema

**Who uses it:** FschoolAI team. They use the SDK to call the brain — they never touch the brain internals.

---

### `FschoolAI-Public` (Private — was accidentally public, now fixed)
**Strategic documents.** Contains pitch docs, architecture plans, and strategy documents. Was accidentally public — now private.

---

## Part 5: The Ecosystem Connection Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    NEUROAGI                              │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              THE BRAIN (Core Asset)               │   │
│  │                                                    │   │
│  │  knowledge-graph.ts  ←  what the user knows       │   │
│  │  pattern-recognition.ts ← how they think          │   │
│  │  prediction-engine.ts ← what they need next       │   │
│  │  brain-compounding.ts ← gets smarter over time    │   │
│  │  neuro-agi.ts ← the main brain service            │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│                    Brain SDK                             │
│              (4 methods, clean contract)                 │
│   getContext() │ update() │ suggestNext() │ verifySkill()│
└────────────────┼─────────────────────────────────────────┘
                 │
                 │  SDK calls (the only connection point)
                 │
┌────────────────┼─────────────────────────────────────────┐
│                ▼          FSCHOOLAI                       │
│                                                           │
│  ┌─────────────────────────────────────────────────┐     │
│  │                    REGGIE                         │     │
│  │         (Agent Manager — reads brain,             │     │
│  │          routes to right specialist)              │     │
│  └─────────────────────────────────────────────────┘     │
│          │           │           │           │            │
│       Study       Focus      Motivation  Performance      │
│       Buddy      Guardian     Coach       Tracker  ...    │
│                                                           │
│  ┌─────────────────────────────────────────────────┐     │
│  │              CANVAS INTEGRATION                   │     │
│  │   Reads courses, grades, deadlines from          │     │
│  │   university system → feeds into brain           │     │
│  └─────────────────────────────────────────────────┘     │
│                                                           │
│  ┌─────────────────────────────────────────────────┐     │
│  │                   STUDENTS                        │     │
│  └─────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────┘
                 │
                 │  (future)
                 ▼
┌───────────────────────────────────────────────────────────┐
│              THIRD-PARTY DEVELOPERS                        │
│   Build agents on the brain SDK.                          │
│   Their agents start knowing the user from day one.       │
└───────────────────────────────────────────────────────────┘
```

---

## Part 6: What Is Missing / What Still Needs to Be Built

This is an honest assessment of what exists vs. what needs to happen:

| Component | Status | What's Needed |
|---|---|---|
| Brain services (code) | ✅ Written | Wire to real LLM calls |
| Agent orchestrator | ✅ Fixed, Claude connected | Add `ANTHROPIC_API_KEY` to server |
| JWT authentication | ✅ Added | Deploy and test |
| Canvas integration | ✅ Written | Test with real Canvas account |
| Database schema | ✅ Migrations written | Run `supabase db push` |
| brain_signals table | ✅ Migration added | Run `supabase db push` |
| Frontend (FschoolAI app) | ✅ In `reggie-mobile-proto` | Connect to backend API |
| Neural Card pre-sale page | ✅ Live at neuro-agi.com | Connect Stripe for real payments |
| Brain SDK (for developers) | ✅ Written | Publish docs publicly when ready |
| Real user testing | ❌ Not started | **This is the most important next step** |
| LLM fine-tuning on student data | ❌ Not started | Phase 2 |
| On-device brain (Neural Card) | ❌ Not started | Phase 3 (hardware) |

---

## Part 7: The One Thing That Matters Most Right Now

All the code, all the architecture, all the repos — none of it matters until one student uses this and says *"how did it know that?"*

That moment is the proof. That moment is what gets you the next investor, the next developer, the next 1,000 students.

**The immediate priority:**
1. Get `ANTHROPIC_API_KEY` into the server `.env`
2. Run `supabase db push` to create the brain tables
3. Connect the frontend (`reggie-mobile-proto`) to the backend API
4. Get 5 real students to use it for one week
5. Find the moment where the brain surprises them

Everything else follows from that.

---

*Last updated: May 28, 2026*
*Repos: vincentyang0702-pixel/FschoolAI- | vincentyang0702-pixel/neuroagi-core | vincentyang0702-pixel/fschoolai-backend*
