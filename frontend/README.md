# FschoolAI Frontend

The FschoolAI frontend is built with React 19 + Tailwind 4 + shadcn/ui.

## Structure

```
frontend/
  src/
    pages/       ← Page-level components (Landing, Onboarding, Dashboard, Chat)
    components/  ← Reusable UI components
    contexts/    ← React contexts (auth, brain, session)
    hooks/       ← Custom React hooks
    lib/         ← Utility helpers
  public/        ← Static assets
```

## Key Pages

- **Landing** — Marketing page, hero section, feature overview
- **Onboarding** — Canvas connect, brain setup, Reggie introduction
- **Dashboard** — Student brain overview, grades, upcoming deadlines
- **Chat** — Reggie AI tutor interface (main product experience)
- **Brain** — Student second brain visualization, knowledge graph
- **NeuralCard** — NeuroAGI Neural Card claim flow (post-hardware launch)

## Connection to Brain

The frontend calls the backend API which uses the NeuroAGI Brain SDK (`backend/neuroagi-sdk/`) to read and write to the student's brain. The student always talks to Reggie — routing to sub-agents is invisible.

## Development

```bash
cd frontend
pnpm install
pnpm dev
```
