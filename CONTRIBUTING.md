# Contributing to FschoolAI

Welcome to the FschoolAI codebase. This document tells you everything you need to know to start building — which branch to use, how to set up your environment, and what the rules are.

**Read this entire document before writing a single line of code.**

---

## Branch Structure

| Branch | Who uses it | Purpose |
|---|---|---|
| `main` | Protected — merge only | Stable, production-ready code. Never push directly. |
| `backend/dev` | Backend contributors | All backend work: agents, brain services, routes, migrations |
| `frontend/dev` | Frontend contributors | All frontend work: React pages, Vercel API routes, UI components |

### The Rule

You never push to `main` directly. When your feature is done, open a Pull Request from your branch into `main`. Vincent reviews and merges.

```bash
# Clone the repo
git clone https://github.com/vincentyang0702-pixel/FschoolAI-.git
cd FschoolAI-

# If working on backend
git checkout backend/dev
git pull origin backend/dev

# If working on frontend
git checkout frontend/dev
git pull origin frontend/dev
```

Always pull before you start work. Always push to your branch, not `main`.

---

## Repository Structure

```
FschoolAI-/
├── backend/                  ← Node.js + Express backend (you build here)
│   ├── server/
│   │   ├── routes/           ← API endpoints (/api/chat, /api/voice, etc.)
│   │   ├── services/         ← Brain services (scheduler, context window, etc.)
│   │   ├── agents/           ← Agent implementations (assignment, study, focus, etc.)
│   │   └── middleware/       ← Auth, request context
│   ├── neuroagi-sdk/         ← Brain SDK (reads/writes to neuroagibrain Supabase)
│   └── migrations/           ← SQL migrations for FschoolAI Production DB
├── frontend/                 ← React 19 + Vite frontend (you build here)
│   └── src/
│       ├── pages/            ← Page-level components
│       ├── components/       ← Reusable UI components
│       ├── contexts/         ← React contexts (auth, brain, session)
│       └── hooks/            ← Custom React hooks
├── agents/                   ← Agent spec files (READ THESE before building agents)
│   ├── PAGE_AI_MAP.md        ← Master map: which agent runs on which page
│   └── *.md                  ← Individual agent specs
├── design/                   ← UX specs and design system (READ before building UI)
│   ├── pages/                ← Per-page design specs (00-ONBOARDING.md through 08-STUDY-ROOMS.md)
│   ├── DESIGN_SYSTEM.md      ← Colors, typography, spacing, component rules
│   └── flows/                ← User flow diagrams
└── FRONTEND_BACKEND_CONTRACT.md  ← The API contract between frontend and backend
```

---

## Environment Setup

### Backend

Create `backend/.env` with these variables:

```env
# FschoolAI Production DB (Supabase)
SUPABASE_URL=https://wqgxpouhbwhwpzudrptp.supabase.co
SUPABASE_ANON_KEY=<get from Vincent>
SUPABASE_SERVICE_KEY=<get from Vincent>

# NeuroAGI Brain DB (Supabase — Micro tier)
BRAIN_SUPABASE_URL=https://qiolhlvqfzujnkwnymft.supabase.co
BRAIN_SUPABASE_KEY=<get from Vincent>

# AI APIs
OPENAI_API_KEY=<get from Vincent>
ANTHROPIC_API_KEY=<get from Vincent>
ELEVENLABS_API_KEY=<get from Vincent>

# Auth
JWT_SECRET=<get from Vincent>
```

```bash
cd backend
pnpm install
pnpm dev   # starts on port 5000
```

### Frontend

Create `frontend/.env` with:

```env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=https://wqgxpouhbwhwpzudrptp.supabase.co
VITE_SUPABASE_ANON_KEY=<get from Vincent>
```

```bash
cd frontend
pnpm install
pnpm dev   # starts on port 3000
```

**Do not use the intern's Supabase project (`pedhxfdhacmhrghbvsxi`). Always use the FschoolAI Production DB above.**

---

## The One API Rule (Frontend → Backend)

The frontend never calls individual agents directly. Every AI interaction goes through one endpoint:

```
POST /api/agent-manager
Body: { page, student_id, action?, context? }
Response: { type, content, signals? }
```

The Agent Manager decides which agent runs. The frontend does not need to know which agent is running. See `FRONTEND_BACKEND_CONTRACT.md` for the full per-page request/response shapes.

---

## Before You Build Anything

### Building a backend agent?

1. Read the agent spec in `agents/<agent-name>.md` — it tells you exactly what the agent reads, writes, and returns
2. Read `agents/PAGE_AI_MAP.md` to understand which page triggers this agent
3. Build the agent in `backend/server/agents/`
4. Register it in `backend/server/agents/index.ts`
5. The Agent Manager in `backend/server/services/agent-orchestrator.ts` routes to it automatically

### Building a frontend page?

1. Read the design spec in `design/pages/<page-number>-<PAGE-NAME>.md` — it tells you exactly what to render and what API calls to make
2. Read `FRONTEND_BACKEND_CONTRACT.md` for the exact request/response shape for that page
3. Build the page in `frontend/src/pages/`
4. Call `POST /api/agent-manager` with the correct `page` value — do not call individual agent endpoints

### Never build blind.

Every page has a design spec. Every agent has a spec file. Read the spec first, then build. If a spec is missing, ask Vincent before starting.

---

## Pull Request Rules

1. One feature per PR — do not bundle unrelated changes
2. PR title format: `feat: <what you built>` or `fix: <what you fixed>`
3. Include a short description of what changed and how to test it
4. Do not merge your own PR — Vincent reviews and merges

---

## What Is Already Built (Do Not Rebuild)

| Feature | Location | Notes |
|---|---|---|
| Brain scheduler | `backend/server/services/brain-scheduler.ts` | Runs context window refresh, reflections, interventions |
| Context window builder | `backend/server/services/brain-context-window.ts` | Pre-computes brain snapshot for fast chat |
| Canvas sync | `backend/server/services/canvas-sync.ts` | Syncs Canvas data every 30 min |
| Voice TTS streaming | `backend/server/routes/voice.ts` + `services/voice-service.ts` | ElevenLabs Turbo streaming, voice customization |
| Agent router | `backend/server/services/agent-orchestrator.ts` | Routes all chat to the right agent |
| Assignment agent | `backend/server/agents/assignment-agent.ts` | "Help me start" feature |
| Study agent | `backend/server/agents/study-agent.ts` | Flashcards, study guides |
| Focus agent | `backend/server/agents/focus-agent.ts` | Session tracking, break suggestions |
| Citation agent | `backend/server/agents/citation-agent.ts` | APA/MLA citation generation |
| Canvas agent | `backend/server/agents/canvas-agent.ts` | Canvas-specific queries |
| Auth middleware | `backend/server/middleware/auth.ts` | JWT verification on all `/api/*` routes |
| Feedback route | `backend/server/routes/feedback.ts` | Session ratings and feedback |

---

## Questions

Ask Vincent. Do not guess. Do not build something that already exists.
