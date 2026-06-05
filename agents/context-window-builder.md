# Agent: Context Window Builder

**Priority:** Sprint 1 — Already built, needs deployment
**Status:** ✅ BUILT (`backend/server/services/brain-context-window.ts`)
**Pages:** ALL (called before every AI response)
**Existing code:** `brain-context-window.ts`

---

## Purpose

Assembles the complete brain context for a student before any AI agent responds. This is the single most important agent — without it, every other agent gives generic responses.

---

## What It Produces

A structured context object containing everything the brain knows about this student RIGHT NOW:

```json
{
  "person": { "name": "Vincent", "tutor_name": "Atlas", "tier": "enhanced" },
  "current_situation": "Wednesday 9pm, Thermo essay due Friday, hasn't started",
  "recent_signals": [...last 20 signals...],
  "active_patterns": [...top 5 patterns...],
  "upcoming_deadlines": [...next 7 days...],
  "recent_reflections": [...last 3 reflections...],
  "learning_style": "example-first, visual, short sessions",
  "knowledge_gaps": ["entropy", "integration by parts"],
  "social_context": { "friends_online": 2, "active_rooms": 1 },
  "token_balance": 1250,
  "streak": 7
}
```

---

## How Other Agents Use It

Every agent receives this context object before generating a response:

- **Situation Synthesizer:** Uses it to generate the greeting
- **Assignment Agent:** Uses `knowledge_gaps` + `learning_style` to tailor help
- **Study Agent:** Uses `learning_style` to choose flashcard format
- **Professor Intelligence:** Uses `upcoming_deadlines` to prioritize which professor to surface
- **Chat (any response):** Full context is injected into the LLM system prompt

---

## Current Implementation

The existing `brain-context-window.ts` does:
1. Queries `brain.context_window` table for pre-computed context
2. If stale (> 30 min), rebuilds from: signals, patterns, memory, sessions, reflections
3. Stores rebuilt context back to `brain.context_window`

**What needs to happen:** Start the Brain Scheduler so context is rebuilt every 30 min automatically. Without the scheduler, context is only rebuilt on-demand (slow).

---

## Action Required

1. Deploy the Brain Scheduler (it calls context window rebuild on cron)
2. Set `BRAIN_SUPABASE_URL` and `BRAIN_SUPABASE_SERVICE_KEY` env vars
3. Context window will auto-populate for every active student

No code changes needed — just deployment.
