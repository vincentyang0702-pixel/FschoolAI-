-- ============================================================
-- NeuroAGI Brain: Nightly Cron Jobs
-- Run these in Supabase SQL Editor after enabling the Cron extension
-- ============================================================

-- Enable the pg_cron extension (must be done first)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- JOB 1: Nightly Knowledge Graph Compaction (2:00 AM UTC)
-- Summarizes recent brain_signals into the knowledge_signals table
-- so the brain has a compressed, up-to-date view of each student
-- ============================================================
SELECT cron.schedule(
  'nightly-knowledge-graph-update',
  '0 2 * * *',  -- Every day at 2:00 AM UTC
  $$
  INSERT INTO knowledge_signals (
    user_id,
    subject,
    topic,
    mastery_level,
    confidence_score,
    last_reinforced_at,
    signal_count,
    updated_at
  )
  SELECT
    bs.user_id,
    bs.metadata->>'subject' AS subject,
    bs.metadata->>'topic' AS topic,
    -- Calculate mastery from recent signals (higher = more mastery)
    LEAST(1.0, COUNT(*)::float / 10.0) AS mastery_level,
    -- Confidence decays if not reinforced recently
    CASE
      WHEN MAX(bs.created_at) > NOW() - INTERVAL '7 days' THEN 0.9
      WHEN MAX(bs.created_at) > NOW() - INTERVAL '30 days' THEN 0.6
      ELSE 0.3
    END AS confidence_score,
    MAX(bs.created_at) AS last_reinforced_at,
    COUNT(*) AS signal_count,
    NOW() AS updated_at
  FROM brain_signals bs
  WHERE
    bs.created_at > NOW() - INTERVAL '90 days'
    AND bs.metadata->>'subject' IS NOT NULL
    AND bs.metadata->>'topic' IS NOT NULL
  GROUP BY bs.user_id, bs.metadata->>'subject', bs.metadata->>'topic'
  ON CONFLICT (user_id, subject, topic)
  DO UPDATE SET
    mastery_level = EXCLUDED.mastery_level,
    confidence_score = EXCLUDED.confidence_score,
    last_reinforced_at = EXCLUDED.last_reinforced_at,
    signal_count = EXCLUDED.signal_count,
    updated_at = NOW();
  $$
);

-- ============================================================
-- JOB 2: Nightly Prediction Refresh (3:00 AM UTC)
-- Updates the predictions table based on recent behavioral patterns
-- ============================================================
SELECT cron.schedule(
  'nightly-prediction-refresh',
  '0 3 * * *',  -- Every day at 3:00 AM UTC
  $$
  INSERT INTO predictions (
    user_id,
    prediction_type,
    prediction_value,
    confidence,
    reasoning,
    valid_until,
    created_at
  )
  SELECT
    sp.user_id,
    'exam_risk' AS prediction_type,
    CASE
      WHEN sp.stress_level > 0.7 AND sp.focus_score < 0.4 THEN 'high_risk'
      WHEN sp.stress_level > 0.5 OR sp.focus_score < 0.6 THEN 'medium_risk'
      ELSE 'low_risk'
    END AS prediction_value,
    0.75 AS confidence,
    'Based on stress level ' || sp.stress_level::text || ' and focus score ' || sp.focus_score::text AS reasoning,
    NOW() + INTERVAL '7 days' AS valid_until,
    NOW() AS created_at
  FROM student_profiles sp
  WHERE sp.updated_at > NOW() - INTERVAL '7 days'
  ON CONFLICT (user_id, prediction_type)
  DO UPDATE SET
    prediction_value = EXCLUDED.prediction_value,
    confidence = EXCLUDED.confidence,
    reasoning = EXCLUDED.reasoning,
    valid_until = EXCLUDED.valid_until,
    created_at = NOW();
  $$
);

-- ============================================================
-- JOB 3: Weekly Brain Signal Decay (Sunday 4:00 AM UTC)
-- Reduces confidence of signals that haven't been reinforced
-- This is the "forgetting" mechanism — prevents stale data
-- ============================================================
SELECT cron.schedule(
  'weekly-brain-signal-decay',
  '0 4 * * 0',  -- Every Sunday at 4:00 AM UTC
  $$
  UPDATE knowledge_signals
  SET
    confidence_score = GREATEST(0.1, confidence_score * 0.85),
    updated_at = NOW()
  WHERE
    last_reinforced_at < NOW() - INTERVAL '14 days'
    AND confidence_score > 0.1;
  $$
);

-- ============================================================
-- JOB 4: Daily Study Streak Update (11:59 PM UTC)
-- Updates each student's study streak based on today's activity
-- ============================================================
SELECT cron.schedule(
  'daily-study-streak-update',
  '59 23 * * *',  -- Every day at 11:59 PM UTC
  $$
  UPDATE student_profiles sp
  SET
    -- Increment streak if student had activity today, reset if not
    study_streak = CASE
      WHEN EXISTS (
        SELECT 1 FROM brain_signals bs
        WHERE bs.user_id = sp.user_id
        AND bs.created_at > NOW() - INTERVAL '24 hours'
      ) THEN COALESCE(sp.study_streak, 0) + 1
      ELSE 0
    END,
    updated_at = NOW()
  WHERE sp.updated_at IS NOT NULL;
  $$
);

-- ============================================================
-- View all scheduled cron jobs
-- ============================================================
SELECT
  jobid,
  jobname,
  schedule,
  active
FROM cron.job
ORDER BY jobid;
