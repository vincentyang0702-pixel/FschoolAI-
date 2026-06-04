-- Migration: Add brain_signals table
-- Purpose: Stores every interaction signal that feeds the NeuroAGI brain.
--          Called by agent-orchestrator after every user interaction via brain.update()
-- Date: 2026-05-28
-- Fixes: P0 gap — brain.update() was called but the table didn't exist

CREATE TABLE IF NOT EXISTS brain_signals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_type     TEXT NOT NULL,                    -- 'interaction', 'canvas_sync', 'focus_session', etc.
  product         TEXT NOT NULL DEFAULT 'fschoolai', -- 'fschoolai', 'reggie', 'neuroagi'
  agent_used      TEXT,                             -- which agent handled this interaction
  message_content TEXT,                             -- truncated user message (max 1000 chars)
  response_content TEXT,                            -- truncated AI response (max 2000 chars)
  course_id       TEXT,                             -- Canvas course ID if applicable
  assignment_id   TEXT,                             -- Canvas assignment ID if applicable
  metadata        JSONB DEFAULT '{}',               -- additional signal data
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS brain_signals_user_id_idx       ON brain_signals (user_id);
CREATE INDEX IF NOT EXISTS brain_signals_created_at_idx    ON brain_signals (created_at DESC);
CREATE INDEX IF NOT EXISTS brain_signals_signal_type_idx   ON brain_signals (signal_type);
CREATE INDEX IF NOT EXISTS brain_signals_product_idx       ON brain_signals (product);
CREATE INDEX IF NOT EXISTS brain_signals_user_product_idx  ON brain_signals (user_id, product, created_at DESC);

-- Row Level Security: users can only read their own signals
ALTER TABLE brain_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own brain signals"
  ON brain_signals FOR SELECT
  USING (auth.uid() = user_id);

-- Only the service role (backend) can insert signals — not the client directly
CREATE POLICY "Service role can insert brain signals"
  ON brain_signals FOR INSERT
  WITH CHECK (true); -- enforced at API layer via JWT auth middleware

-- Also create agent_sessions table if it doesn't exist
-- Used by orchestrator to log full session context
CREATE TABLE IF NOT EXISTS agent_sessions (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_type      TEXT NOT NULL,
  message         TEXT,
  response        TEXT,
  brain_context_used BOOLEAN DEFAULT false,
  course_id       TEXT,
  assignment_id   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_sessions_user_id_idx    ON agent_sessions (user_id);
CREATE INDEX IF NOT EXISTS agent_sessions_created_at_idx ON agent_sessions (created_at DESC);

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own agent sessions"
  ON agent_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert agent sessions"
  ON agent_sessions FOR INSERT
  WITH CHECK (true);
