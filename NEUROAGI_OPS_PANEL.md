# NeuroAGI Ops Panel — Team Guide

> **URL (after deploy):** `https://fschoolai.com/ops.html`
> **Password:** `neuroagi2026`

---

## What Is This?

The **NeuroAGI Ops Panel** is an internal monitoring dashboard for the FschoolAI + NeuroAGI engineering team. It gives you a live, real-time view into the entire AI agent pipeline — from data sources through the Brain DB to outputs — without needing to open Supabase, Vercel logs, or the Discord server.

Think of it as your **mission control** for the AI brain system.

---

## Why We Built It

Silicon Valley AI teams (OpenAI, Anthropic, Linear, Vercel) all ship an observability layer **before** they scale to real users. Without it, you're flying blind:

- You can't tell if an agent is firing or silently failing
- You can't see which students are in distress and whether the intervention agent reached them
- You can't test a specific student's brain pipeline without deploying a code change
- You can't debug why a student's tutor isn't personalised

This panel solves all of that.

---

## How to Connect It to Live Data

When you first open the panel, go to the **Credentials** tab and enter:

| Field | Value |
|---|---|
| Brain DB URL | `https://qiolhlvqfzujnkwnymft.supabase.co` |
| Brain DB Key | *(service-role key — Supabase → Settings → API Keys → service_role)* |
| FschoolAI DB URL | *(from Vercel env: `SUPABASE_URL`)* |
| FschoolAI DB Key | *(from Vercel env: `SUPABASE_SERVICE_KEY`)* |

Credentials are stored **only in your browser's URL hash** — they are never sent to any server. Bookmark the URL after saving and it will auto-connect next time.

---

## What Each Tab Does

### ⬡ Agent Graph

A visual map of the entire AI pipeline, grouped into four layers:

```
Data Sources
    ↓
Brain Pipeline  (NeuroAGI Brain DB)
    ↓
Tutor Agents    (FschoolAI DB)
    ↓
Outputs
```

Each agent node shows:
- **What it does** — one-line description
- **Schedule** — how often it runs (every 5 min, on login, on message, etc.)
- **Last run** — live timestamp pulled from the Brain DB (green = active <10 min, amber = stale <2 hr, red = never/error)

**Use this to:**
- Verify agents are firing on schedule after a deploy
- Debug a broken pipeline (e.g. brain-scheduler ran but brain-intervention never fired)
- Onboard new team members — shows the full system at a glance

---

### ◉ Student Monitor

A table of all 64 students with their live brain state:

| Column | What it shows |
|---|---|
| Brain Linked | Whether the student has a brain profile in the Brain DB |
| Stress Level | 0–100% bar (green/amber/red) from `context_window.stress_level` |
| Momentum | rising / stable / declining / stalled from `context_window.momentum_state` |
| Last Context | How fresh the brain's knowledge of this student is |
| Interventions | How many Discord DMs they've received and when the last one was |
| GPA | From FschoolAI DB |

**Filter buttons:**
- **No Brain Profile** — students the brain has no data on (brain-person-link hasn't fired for them yet)
- **High Stress** — students with stress > 70% who may need attention
- **Stalled / Declining** — students whose momentum is dropping

**Action buttons (per student):**
- **⚡ Brain** — manually triggers `brain-scheduler` for that student right now (useful for testing)
- **📨 DM** — manually triggers the intervention check for that student

**Use this to:**
- Monitor student wellbeing at a glance before a big deadline
- Test the brain pipeline on a specific student without waiting for the cron
- Identify students who haven't been linked to the brain yet (brain_person_id = NULL)

---

### ≡ Intervention Log

A chronological log of every Discord DM sent by the `brain-intervention` agent:

- Who it was sent to
- What triggered it (high stress / stalled momentum / stale context)
- The full message text
- Whether it was delivered successfully

**Use this to:**
- Verify the intervention agent is actually sending DMs
- Review the quality of messages being sent to students
- Debug delivery failures (status = `error`)

---

### ⚙ Credentials

Paste your Supabase credentials here. Stored in the URL hash only.

---

## The Full Agent Pipeline (for new team members)

```
Chrome Extension  ──→  extension-sync (API)  ──→  FschoolAI DB
                                                        │
Canvas LMS        ──→  canvas-sync (API)     ──→  courses / assignments
                                                        │
AI Tutor Chat     ──→  brain-signal (API)    ──→  Brain DB: signals
                   ──→  tutor-impression     ──→  FschoolAI DB: tutor_mind
                                                        │
                        brain-person-link    ──→  Brain DB: persons
                                                        │
                        brain-scheduler-fast (5m)  ──→  context_window (lightweight)
                        brain-scheduler      (1h)  ──→  context_window (full Claude)
                                                        │
                        brain-intervention   (30m) ──→  Discord DM (if stress/decline)
                                                        │
                        tutor-context        ──→  NeuralRing system prompt
                        monitor-agent        ──→  assignment nudge
                        session-close        ──→  living mind (tutor_mind)
```

---

## File Location

The ops panel is a single self-contained HTML file:

```
public/ops.html          ← deployed at fschoolai.com/ops.html
```

No build step. No dependencies. No server. It runs entirely in the browser and reads directly from Supabase REST APIs using the credentials you provide.

---

## Security Notes

- The panel is password-protected (session-only, resets on tab close)
- DB credentials are stored in the URL hash only — never in localStorage or sent to any server
- The `service_role` key gives full DB read access — only share this URL with the core team
- To change the password, edit `OPS_PASSWORD` in `public/ops.html` and redeploy

---

*Built by the NeuroAGI core team — Jun 2026*
