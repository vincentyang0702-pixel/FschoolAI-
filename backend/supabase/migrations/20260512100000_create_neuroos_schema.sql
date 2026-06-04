-- NeuroOS Complete Schema Migration
-- Created: 2026-05-12
-- Description: Complete AGI-level database schema for NeuroOS

-- ============================================================================
-- Layer 1: Quantified Self (Behavioral, Emotional, Knowledge Signals)
-- ============================================================================

-- Behavioral Signals Table
CREATE TABLE IF NOT EXISTS behavioral_signals (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL,
  course_id UUID,
  signal_type VARCHAR(50) NOT NULL, -- 'typing_speed', 'focus_duration', 'submission_time', etc.
  value FLOAT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_behavioral_signals_student_id ON behavioral_signals(student_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_signals_timestamp ON behavioral_signals(timestamp DESC);

-- Emotional Signals Table
CREATE TABLE IF NOT EXISTS emotional_signals (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL,
  course_id UUID,
  emotion_type VARCHAR(50) NOT NULL, -- 'confidence', 'stress', 'motivation', 'frustration', etc.
  intensity FLOAT NOT NULL CHECK (intensity >= 0 AND intensity <= 1),
  context JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emotional_signals_student_id ON emotional_signals(student_id);
CREATE INDEX IF NOT EXISTS idx_emotional_signals_timestamp ON emotional_signals(timestamp DESC);

-- Knowledge Signals Table
CREATE TABLE IF NOT EXISTS knowledge_signals (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL,
  course_id UUID,
  concept_id UUID,
  mastery_level FLOAT NOT NULL CHECK (mastery_level >= 0 AND mastery_level <= 1),
  learning_style VARCHAR(50), -- 'visual', 'auditory', 'kinesthetic', 'reading-writing'
  confidence_score FLOAT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_signals_student_id ON knowledge_signals(student_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_signals_concept_id ON knowledge_signals(concept_id);

-- Context Signals Table
CREATE TABLE IF NOT EXISTS context_signals (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL,
  course_id UUID,
  context_type VARCHAR(50) NOT NULL, -- 'location', 'time_of_day', 'device', 'social_context', etc.
  context_value VARCHAR(255) NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_signals_student_id ON context_signals(student_id);

-- Outcome Signals Table
CREATE TABLE IF NOT EXISTS outcome_signals (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL,
  course_id UUID,
  assignment_id UUID,
  outcome_type VARCHAR(50) NOT NULL, -- 'grade', 'completion_time', 'attempt_count', 'success', etc.
  outcome_value FLOAT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcome_signals_student_id ON outcome_signals(student_id);
CREATE INDEX IF NOT EXISTS idx_outcome_signals_assignment_id ON outcome_signals(assignment_id);

-- Biometric Signals Table (from wearables)
CREATE TABLE IF NOT EXISTS biometric_signals (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL,
  signal_type VARCHAR(50) NOT NULL, -- 'heart_rate', 'sleep_duration', 'activity_level', 'stress_level', etc.
  value FLOAT NOT NULL,
  unit VARCHAR(20),
  source VARCHAR(50), -- 'apple_watch', 'fitbit', 'oura_ring', etc.
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_signals_student_id ON biometric_signals(student_id);
CREATE INDEX IF NOT EXISTS idx_biometric_signals_timestamp ON biometric_signals(timestamp DESC);

-- Facial Expression Signals Table
CREATE TABLE IF NOT EXISTS facial_expression_signals (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL,
  course_id UUID,
  expression_type VARCHAR(50) NOT NULL, -- 'confusion', 'engagement', 'frustration', 'concentration', etc.
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  video_url VARCHAR(500),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facial_expression_signals_student_id ON facial_expression_signals(student_id);

-- Voice Analysis Signals Table
CREATE TABLE IF NOT EXISTS voice_analysis_signals (
  id BIGSERIAL PRIMARY KEY,
  student_id UUID NOT NULL,
  course_id UUID,
  analysis_type VARCHAR(50) NOT NULL, -- 'tone', 'pace', 'confidence', 'clarity', etc.
  value FLOAT NOT NULL,
  audio_url VARCHAR(500),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_analysis_signals_student_id ON voice_analysis_signals(student_id);

-- ============================================================================
-- Layer 2: Second Brain (Knowledge Management & Zettelkasten)
-- ============================================================================

-- Knowledge Base Table (Zettelkasten)
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  course_id UUID,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_student_id ON knowledge_base(student_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_course_id ON knowledge_base(course_id);

-- Concept Progress Table
CREATE TABLE IF NOT EXISTS concept_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  course_id UUID,
  concept_name VARCHAR(255) NOT NULL,
  mastery_level FLOAT NOT NULL CHECK (mastery_level >= 0 AND mastery_level <= 1),
  last_reviewed TIMESTAMPTZ,
  review_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concept_progress_student_id ON concept_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_concept_progress_mastery_level ON concept_progress(mastery_level);

-- Concept Connections Table (Graph relationships)
CREATE TABLE IF NOT EXISTS concept_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_concept_id UUID NOT NULL,
  target_concept_id UUID NOT NULL,
  connection_type VARCHAR(50) NOT NULL, -- 'prerequisite', 'related', 'builds_on', etc.
  strength FLOAT NOT NULL CHECK (strength >= 0 AND strength <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concept_connections_source ON concept_connections(source_concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_connections_target ON concept_connections(target_concept_id);

-- Insights Table
CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  course_id UUID,
  insight_type VARCHAR(50) NOT NULL, -- 'pattern', 'recommendation', 'warning', 'achievement', etc.
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  actionable BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_student_id ON insights(student_id);
CREATE INDEX IF NOT EXISTS idx_insights_insight_type ON insights(insight_type);

-- ============================================================================
-- Layer 3: Emotional Intelligence (Cognitive Prosthetic)
-- ============================================================================

-- Emotional State History Table
CREATE TABLE IF NOT EXISTS emotional_state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  emotional_state VARCHAR(50) NOT NULL, -- 'anxious', 'confident', 'overwhelmed', 'engaged', etc.
  intensity FLOAT NOT NULL CHECK (intensity >= 0 AND intensity <= 1),
  triggers JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emotional_state_history_student_id ON emotional_state_history(student_id);

-- Coping Strategies Table
CREATE TABLE IF NOT EXISTS coping_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  strategy_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  effectiveness FLOAT NOT NULL CHECK (effectiveness >= 0 AND effectiveness <= 1),
  times_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coping_strategies_student_id ON coping_strategies(student_id);

-- Cognitive Support Sessions Table
CREATE TABLE IF NOT EXISTS cognitive_support_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  session_type VARCHAR(50) NOT NULL, -- 'socratic_dialogue', 'emotional_support', 'planning', etc.
  topic VARCHAR(255),
  conversation JSONB DEFAULT '{}',
  outcome VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cognitive_support_sessions_student_id ON cognitive_support_sessions(student_id);

-- ============================================================================
-- Layer 4: Synthesis & Agency
-- ============================================================================

-- Situation Synthesis Table
CREATE TABLE IF NOT EXISTS situation_synthesis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  course_id UUID,
  situation_summary TEXT NOT NULL,
  key_factors JSONB DEFAULT '{}',
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  synthesized_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_situation_synthesis_student_id ON situation_synthesis(student_id);

-- Predictions Table
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  course_id UUID,
  prediction_type VARCHAR(50) NOT NULL, -- 'grade_prediction', 'struggle_detection', 'success_probability', etc.
  prediction_value FLOAT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  predicted_at TIMESTAMPTZ DEFAULT NOW(),
  actual_value FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_student_id ON predictions(student_id);
CREATE INDEX IF NOT EXISTS idx_predictions_prediction_type ON predictions(prediction_type);

-- Recommendations Table
CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  course_id UUID,
  recommendation_type VARCHAR(50) NOT NULL, -- 'study_strategy', 'resource', 'timing', 'approach', etc.
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  priority INT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'completed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recommendations_student_id ON recommendations(student_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);

-- Autonomous Actions Table
CREATE TABLE IF NOT EXISTS autonomous_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  action_type VARCHAR(50) NOT NULL, -- 'schedule_reminder', 'send_resource', 'adjust_difficulty', etc.
  action_description TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'executed', 'failed'
  result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_autonomous_actions_student_id ON autonomous_actions(student_id);
CREATE INDEX IF NOT EXISTS idx_autonomous_actions_status ON autonomous_actions(status);

-- Feedback Loops Table
CREATE TABLE IF NOT EXISTS feedback_loops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  action_id UUID REFERENCES autonomous_actions(id),
  feedback_type VARCHAR(50) NOT NULL, -- 'effectiveness', 'relevance', 'timing', etc.
  feedback_value FLOAT NOT NULL CHECK (feedback_value >= -1 AND feedback_value <= 1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_loops_student_id ON feedback_loops(student_id);
CREATE INDEX IF NOT EXISTS idx_feedback_loops_action_id ON feedback_loops(action_id);

-- ============================================================================
-- Layer 5: Operations & Tracking
-- ============================================================================

-- Agent Outputs Table
CREATE TABLE IF NOT EXISTS agent_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR(100) NOT NULL, -- 'canvas_watcher', 'writing_intelligence', etc.
  student_id UUID NOT NULL,
  course_id UUID,
  output_type VARCHAR(50) NOT NULL,
  output_data JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'success', -- 'success', 'error', 'pending'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_name ON agent_outputs(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_student_id ON agent_outputs(student_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_created_at ON agent_outputs(created_at DESC);

-- Changelog Table (Transparency - all AI changes logged)
CREATE TABLE IF NOT EXISTS changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  change_type VARCHAR(50) NOT NULL, -- 'data_added', 'recommendation_made', 'prediction_updated', etc.
  table_name VARCHAR(100),
  record_id UUID,
  change_description TEXT NOT NULL,
  changed_by VARCHAR(100) DEFAULT 'neuroos_agent',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_changelog_student_id ON changelog(student_id);
CREATE INDEX IF NOT EXISTS idx_changelog_created_at ON changelog(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_changelog_change_type ON changelog(change_type);

-- ============================================================================
-- Enable Row Level Security (RLS) for Privacy
-- ============================================================================

ALTER TABLE behavioral_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE emotional_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE facial_expression_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_analysis_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE emotional_state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE coping_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognitive_support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE situation_synthesis ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Create Views for Common Queries
-- ============================================================================

-- Student Signal Summary View
CREATE OR REPLACE VIEW student_signal_summary AS
SELECT 
  student_id,
  COUNT(DISTINCT CASE WHEN signal_type = 'typing_speed' THEN id END) as behavioral_signal_count,
  COUNT(DISTINCT CASE WHEN signal_type IS NOT NULL THEN id END) as total_signals,
  MAX(timestamp) as last_signal_time
FROM behavioral_signals
GROUP BY student_id;

-- Student Emotional State View
CREATE OR REPLACE VIEW student_emotional_state AS
SELECT 
  student_id,
  emotion_type,
  AVG(intensity) as avg_intensity,
  MAX(timestamp) as last_recorded,
  COUNT(*) as total_records
FROM emotional_signals
GROUP BY student_id, emotion_type;

-- Student Mastery View
CREATE OR REPLACE VIEW student_mastery_overview AS
SELECT 
  student_id,
  course_id,
  COUNT(*) as concepts_tracked,
  AVG(mastery_level) as avg_mastery,
  MAX(mastery_level) as highest_mastery,
  MIN(mastery_level) as lowest_mastery
FROM knowledge_signals
GROUP BY student_id, course_id;

-- ============================================================================
-- Grant Permissions
-- ============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- This migration creates the complete NeuroOS AGI schema with:
-- ✅ Layer 1: Quantified Self (8 signal tables)
-- ✅ Layer 2: Second Brain (4 knowledge tables)
-- ✅ Layer 3: Emotional Intelligence (3 support tables)
-- ✅ Layer 4: Synthesis & Agency (5 synthesis tables)
-- ✅ Layer 5: Operations (2 tracking tables)
-- ✅ Row Level Security enabled
-- ✅ Indexes for performance
-- ✅ Views for common queries
