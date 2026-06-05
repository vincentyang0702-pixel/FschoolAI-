# FschoolAI Frontend

React 19 + Vite + Tailwind 4 + shadcn/ui. Deployed to Vercel.

**Read `CONTRIBUTING.md` and `ROADMAP.md` in the repo root before starting.**

---

## Setup

```bash
cd frontend
pnpm install
pnpm dev   # starts on port 3000
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=https://wqgxpouhbwhwpzudrptp.supabase.co
VITE_SUPABASE_ANON_KEY=<get from Vincent>
```

**Do not use any other Supabase project.** The FschoolAI Production DB is `wqgxpouhbwhwpzudrptp`.

---

## Structure

```
frontend/
  src/
    pages/       ← Page-level components (one file per page)
    components/  ← Reusable UI components
    contexts/    ← React contexts (auth, brain, session)
    hooks/       ← Custom React hooks
    lib/         ← Utility helpers (API client, Supabase client)
  public/        ← Static assets only (favicon, manifest)
```

---

## Key Pages

- **Landing** — Marketing page, hero section, feature overview
- **Onboarding** — Canvas connect, brain setup, AI Tutor introduction
- **Home** — Tutor greeting, priority card, stats bar (streak/tokens/tier/GPA)
- **Assignments** — Assignment cards with predicted grades, professor badges, "Help me start"
- **Study** — Lesson cards ("For you today"), flashcard deck, focus timer
- **Canvas** — Grades, course overview, sync status
- **Brain** — Student second brain visualization, knowledge graph, writing evolution
- **Social + Leaderboard** — Study compatibility, friend activity, weekly rankings
- **Study Rooms** — Multi-student AI tutoring sessions
- **NeuralCard** — NeuroAGI Neural Card claim flow (post-hardware launch)

---

## The One API Rule

Every AI interaction goes through one endpoint. **Do not call individual agent endpoints.**

```typescript
const response = await fetch(`${import.meta.env.VITE_API_URL}/api/agent-manager`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    page: 'home',          // which page is calling
    student_id: user.id    // the student's UUID
  })
});
const data = await response.json();
// data = { type: 'greeting', content: { message, tone, priority_action, stats, ... } }
```

See `FRONTEND_BACKEND_CONTRACT.md` in the repo root for the exact request/response shape for every page.

---

## Connection to Brain

The frontend calls the backend API which uses the NeuroAGI Brain SDK (`backend/neuroagi-sdk/`) to read and write to the student's brain. The student always talks to their personally-named AI Tutor — routing to sub-agents is invisible to the frontend.

---

## Design System

See `design/DESIGN_SYSTEM.md` for colors, typography, spacing, and component rules. Each page has a full design spec in `design/pages/` — read it before building the page.

---

## Build Order

See `ROADMAP.md` → "Frontend Build Order" section for the ordered list of pages to build and which design spec + backend contract applies to each.

---

## Vercel Deployment

The frontend deploys to Vercel automatically on push to `frontend/dev`. Production deploys happen when `main` is updated.

Set these environment variables in Vercel:

```
VITE_API_URL=<production backend URL>
VITE_SUPABASE_URL=https://wqgxpouhbwhwpzudrptp.supabase.co
VITE_SUPABASE_ANON_KEY=<production anon key>
```
