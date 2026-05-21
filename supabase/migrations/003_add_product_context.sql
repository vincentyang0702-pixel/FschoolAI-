-- ============================================================================
-- Product Context Migration
-- Deployment: 2026-05-20
-- Purpose: Add product context to signal tables for unified brain architecture
-- Enables: Reggie and FschoolAI to share same database while tracking data source
-- ============================================================================

-- Add product column to signal tables
ALTER TABLE IF EXISTS behavioral_signals 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

ALTER TABLE IF EXISTS emotional_signals 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

ALTER TABLE IF EXISTS knowledge_signals 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

ALTER TABLE IF EXISTS context_signals 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

ALTER TABLE IF EXISTS outcome_signals 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

ALTER TABLE IF EXISTS biometric_signals 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

ALTER TABLE IF EXISTS facial_expression_signals 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

ALTER TABLE IF EXISTS voice_analysis_signals 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

-- Add product column to outcome-related tables
ALTER TABLE IF EXISTS predictions 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

ALTER TABLE IF EXISTS recommendations 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

ALTER TABLE IF EXISTS autonomous_actions 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

ALTER TABLE IF EXISTS insights 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

-- Add product column to agent tracking
ALTER TABLE IF EXISTS agent_outputs 
ADD COLUMN IF NOT EXISTS product VARCHAR(50) DEFAULT 'fschoolai';

-- Create indexes for product queries
CREATE INDEX IF NOT EXISTS idx_behavioral_signals_product ON behavioral_signals(product);
CREATE INDEX IF NOT EXISTS idx_emotional_signals_product ON emotional_signals(product);
CREATE INDEX IF NOT EXISTS idx_knowledge_signals_product ON knowledge_signals(product);
CREATE INDEX IF NOT EXISTS idx_context_signals_product ON context_signals(product);
CREATE INDEX IF NOT EXISTS idx_outcome_signals_product ON outcome_signals(product);
CREATE INDEX IF NOT EXISTS idx_biometric_signals_product ON biometric_signals(product);
CREATE INDEX IF NOT EXISTS idx_predictions_product ON predictions(product);
CREATE INDEX IF NOT EXISTS idx_recommendations_product ON recommendations(product);
CREATE INDEX IF NOT EXISTS idx_insights_product ON insights(product);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_product ON agent_outputs(product);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_behavioral_signals_user_product 
ON behavioral_signals(student_id, product);

CREATE INDEX IF NOT EXISTS idx_emotional_signals_user_product 
ON emotional_signals(student_id, product);

CREATE INDEX IF NOT EXISTS idx_knowledge_signals_user_product 
ON knowledge_signals(student_id, product);

CREATE INDEX IF NOT EXISTS idx_predictions_user_product 
ON predictions(student_id, product);

CREATE INDEX IF NOT EXISTS idx_insights_user_product 
ON insights(student_id, product);

-- Create view for unified brain (all products)
CREATE OR REPLACE VIEW unified_brain_signals AS
SELECT 
  'behavioral' as signal_category,
  student_id,
  product,
  signal_type,
  value,
  metadata,
  timestamp,
  created_at
FROM behavioral_signals
UNION ALL
SELECT 
  'emotional' as signal_category,
  student_id,
  product,
  emotion_type,
  intensity,
  context,
  timestamp,
  created_at
FROM emotional_signals
UNION ALL
SELECT 
  'knowledge' as signal_category,
  student_id,
  product,
  CAST(mastery_level AS VARCHAR),
  confidence_score,
  jsonb_build_object('learning_style', learning_style),
  timestamp,
  created_at
FROM knowledge_signals;

-- Create view for product-specific brain
CREATE OR REPLACE VIEW fschoolai_brain_signals AS
SELECT * FROM unified_brain_signals
WHERE product = 'fschoolai';

CREATE OR REPLACE VIEW reggie_brain_signals AS
SELECT * FROM unified_brain_signals
WHERE product = 'reggie';

-- Create view for cross-product insights
CREATE OR REPLACE VIEW cross_product_insights AS
SELECT 
  student_id,
  'fschoolai' as primary_product,
  'reggie' as secondary_product,
  COUNT(DISTINCT f.id) as fschoolai_signals,
  COUNT(DISTINCT r.id) as reggie_signals,
  MAX(f.timestamp) as last_fschoolai_activity,
  MAX(r.timestamp) as last_reggie_activity
FROM behavioral_signals f
FULL OUTER JOIN behavioral_signals r 
  ON f.student_id = r.student_id 
  AND f.product = 'fschoolai' 
  AND r.product = 'reggie'
GROUP BY student_id;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- This migration enables unified brain architecture:
-- ✅ Product context columns added to all signal tables
-- ✅ Indexes created for efficient product-specific queries
-- ✅ Views created for unified, product-specific, and cross-product access
-- ✅ Reggie and FschoolAI can now share the same database
-- ✅ Data from both products is tracked and queryable separately or together
