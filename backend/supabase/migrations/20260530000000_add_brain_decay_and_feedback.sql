-- ============================================================
-- Migration: Brain Signal Decay + Feedback Columns
-- 20260530000000_add_brain_decay_and_feedback.sql
--
-- Adds:
-- 1. feedback_rating column to agent_sessions (for quick lookups)
-- 2. decay_factor column to knowledge_signals (for forgetting mechanism)
-- 3. last_reinforced_at index for efficient decay queries
-- 4. Canvas signal types to brain_signals check constraint
-- ============================================================

-- 1. Add feedback_rating to agent_sessions
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS feedback_rating TEXT CHECK (feedback_rating IN ('helpful', 'not_helpful', 'partially_helpful')),
  ADD COLUMN IF NOT EXISTS feedback_comment TEXT,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ;

-- 2. Add decay support to knowledge_signals
ALTER TABLE knowledge_signals
  ADD COLUMN IF NOT EXISTS decay_factor FLOAT DEFAULT 1.0 CHECK (decay_factor >= 0.0 AND decay_factor <= 1.0),
  ADD COLUMN IF NOT EXISTS reinforcement_count INTEGER DEFAULT 1;

-- 3. Index for efficient decay queries (find stale knowledge)
CREATE INDEX IF NOT EXISTS knowledge_signals_last_reinforced_idx
  ON knowledge_signals (user_id, last_reinforced_at ASC)
  WHERE decay_factor > 0.1;

-- 4. Index for feedback performance queries
CREATE INDEX IF NOT EXISTS brain_signals_feedback_idx
  ON brain_signals (user_id, agent_used, created_at DESC)
  WHERE signal_type = 'agent_feedback';

-- 5. Index for Canvas signals
CREATE INDEX IF NOT EXISTS brain_signals_canvas_idx
  ON brain_signals (user_id, created_at DESC)
  WHERE signal_type LIKE 'canvas_%';

-- ============================================================
-- Cron Function: Nightly Knowledge Decay
-- Run by pg_cron every Sunday at 4 AM UTC
-- Reduces confidence of knowledge not reinforced in 14+ days
-- ============================================================
CREATE OR REPLACE FUNCTION apply_knowledge_decay()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Apply 10% decay to knowledge not reinforced in 14 days
  UPDATE knowledge_signals
  SET
    decay_factor = GREATEST(0.1, decay_factor * 0.90),
    mastery_level = GREATEST(0.05, mastery_level * 0.95),
    updated_at = NOW()
  WHERE
    last_reinforced_at < NOW() - INTERVAL '14 days'
    AND decay_factor > 0.1;

  -- Apply 20% decay to knowledge not reinforced in 30 days
  UPDATE knowledge_signals
  SET
    decay_factor = GREATEST(0.1, decay_factor * 0.80),
    mastery_level = GREATEST(0.05, mastery_level * 0.85),
    updated_at = NOW()
  WHERE
    last_reinforced_at < NOW() - INTERVAL '30 days'
    AND decay_factor > 0.1;

  RAISE NOTICE 'Knowledge decay applied at %', NOW();
END;
$$;

-- ============================================================
-- Cron Function: Update Agent Session Feedback from brain_signals
-- Keeps agent_sessions.feedback_rating in sync with brain_signals
-- ============================================================
CREATE OR REPLACE FUNCTION sync_feedback_to_sessions()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE agent_sessions AS s
  SET
    feedback_rating = (b.metadata->>'rating')::TEXT,
    feedback_comment = (b.metadata->>'comment')::TEXT,
    feedback_at = b.created_at
  FROM brain_signals b
  WHERE
    b.signal_type = 'agent_feedback'
    AND (b.metadata->>'session_id')::TEXT = s.id::TEXT
    AND s.feedback_rating IS NULL;

  RAISE NOTICE 'Feedback synced to agent_sessions at %', NOW();
END;
$$;
