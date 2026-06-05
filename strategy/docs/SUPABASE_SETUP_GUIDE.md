# NeuroAGI Supabase Setup Guide

## Step 1: Enable Cron Extension

In Supabase SQL Editor, run:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

Then run the full contents of `brain_cron_jobs.sql` to schedule all 4 brain jobs.

## Step 2: Deploy the Edge Function

```bash
# From your project root
supabase functions deploy brain-signal-processor
```

Copy `brain_webhook_edge_function.ts` to:
`supabase/functions/brain-signal-processor/index.ts`

## Step 3: Set Up Database Webhook

In Supabase Dashboard → **Database Webhooks** → **Create a new hook**:

- **Name:** `brain-signal-realtime`
- **Table:** `brain_signals`
- **Events:** `INSERT` only
- **Type:** Supabase Edge Functions
- **Edge Function:** `brain-signal-processor`

## Step 4: Verify Cron Jobs

```sql
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
```

You should see 4 jobs:
1. `nightly-knowledge-graph-update` — 2:00 AM UTC daily
2. `nightly-prediction-refresh` — 3:00 AM UTC daily
3. `weekly-brain-signal-decay` — 4:00 AM UTC Sundays
4. `daily-study-streak-update` — 11:59 PM UTC daily

## What These Jobs Do

| Job | When | What It Does |
|-----|------|-------------|
| Knowledge Graph Update | 2 AM nightly | Compresses brain_signals into knowledge_signals — the brain's long-term memory |
| Prediction Refresh | 3 AM nightly | Updates exam risk predictions for all students |
| Signal Decay | Sunday 4 AM | Reduces confidence of stale knowledge — the brain "forgets" unreinforced topics |
| Study Streak | 11:59 PM nightly | Updates each student's study streak counter |

## The Real-Time Loop

```
Student action
  → brain_signals INSERT
  → Database Webhook fires
  → Edge Function runs in <100ms
  → emotional_signals, behavioral_signals, knowledge_signals all updated
  → Next brain.getContext() call returns updated state
```

This is what makes the brain feel alive — it learns in real-time, not just overnight.
