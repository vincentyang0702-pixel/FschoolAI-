-- NeuroOS Missing Tables Migration
-- Created: 2026-05-12 (Supplementary)
-- Description: Creates the remaining 18 tables that failed in the initial migration

-- ============================================================================
-- Layer 4: Synthesis & Agency (Continued) - Feedback Loops & Agent Outputs
-- ============================================================================

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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_outputs_student_id ON agent_outputs(student_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent_name ON agent_outputs(agent_name);

-- Changelog Table
CREATE TABLE IF NOT EXISTS changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(100) NOT NULL, -- 'student', 'course', 'prediction', etc.
  entity_id UUID NOT NULL,
  change_type VARCHAR(50) NOT NULL, -- 'created', 'updated', 'deleted'
  old_values JSONB,
  new_values JSONB,
  changed_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_changelog_entity_id ON changelog(entity_id);
CREATE INDEX IF NOT EXISTS idx_changelog_entity_type ON changelog(entity_type);

-- ============================================================================
-- Layer 6: Core Identity & Context
-- ============================================================================

-- Universities Table
CREATE TABLE IF NOT EXISTS universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  domain VARCHAR(100),
  country VARCHAR(100),
  timezone VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student Profiles Table
CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  university_id UUID REFERENCES universities(id),
  major VARCHAR(100),
  year_of_study INT,
  gpa FLOAT,
  learning_preferences JSONB DEFAULT '{}',
  accessibility_needs JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_user_id ON student_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_student_profiles_university_id ON student_profiles(university_id);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(50) DEFAULT 'student', -- 'student', 'instructor', 'admin'
  status VARCHAR(50) DEFAULT 'active',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================================
-- Layer 7: Canvas Integration & Tracking
-- ============================================================================

-- Canvas Sync Logs Table
CREATE TABLE IF NOT EXISTS canvas_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  sync_type VARCHAR(50) NOT NULL, -- 'assignments', 'grades', 'submissions', 'announcements'
  status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'pending'
  records_synced INT DEFAULT 0,
  error_message TEXT,
  sync_duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_sync_logs_student_id ON canvas_sync_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_canvas_sync_logs_sync_type ON canvas_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_canvas_sync_logs_created_at ON canvas_sync_logs(created_at DESC);

-- Assignments Table
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL,
  canvas_assignment_id BIGINT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  points_possible FLOAT,
  submission_types VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_canvas_assignment_id ON assignments(canvas_assignment_id);

-- Submissions Table
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES assignments(id),
  student_id UUID NOT NULL,
  canvas_submission_id BIGINT,
  submission_type VARCHAR(50),
  submitted_at TIMESTAMPTZ,
  grade FLOAT,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_canvas_submission_id ON submissions(canvas_submission_id);

-- Grades Table
CREATE TABLE IF NOT EXISTS grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  course_id UUID NOT NULL,
  assignment_id UUID REFERENCES assignments(id),
  grade FLOAT,
  max_points FLOAT,
  percentage FLOAT,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grades_student_id ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_course_id ON grades(course_id);
CREATE INDEX IF NOT EXISTS idx_grades_assignment_id ON grades(assignment_id);

-- ============================================================================
-- Layer 8: Behavioral & Health Tracking
-- ============================================================================

-- Focus Sessions Table
CREATE TABLE IF NOT EXISTS focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  course_id UUID,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INT,
  distractions_count INT DEFAULT 0,
  focus_score FLOAT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_student_id ON focus_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_start_time ON focus_sessions(start_time DESC);

-- Sleep Patterns Table
CREATE TABLE IF NOT EXISTS sleep_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  sleep_date DATE NOT NULL,
  bedtime TIMESTAMPTZ,
  wake_time TIMESTAMPTZ,
  duration_hours FLOAT,
  quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sleep_patterns_student_id ON sleep_patterns(student_id);
CREATE INDEX IF NOT EXISTS idx_sleep_patterns_sleep_date ON sleep_patterns(sleep_date DESC);

-- Stress Indicators Table
CREATE TABLE IF NOT EXISTS stress_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  indicator_type VARCHAR(50) NOT NULL, -- 'cortisol', 'heart_rate_variability', 'sleep_disruption', etc.
  value FLOAT NOT NULL,
  severity VARCHAR(50), -- 'low', 'moderate', 'high'
  source VARCHAR(100), -- 'wearable', 'self_report', 'behavioral_analysis'
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stress_indicators_student_id ON stress_indicators(student_id);
CREATE INDEX IF NOT EXISTS idx_stress_indicators_timestamp ON stress_indicators(timestamp DESC);

-- Typing Patterns Table
CREATE TABLE IF NOT EXISTS typing_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  typing_speed FLOAT, -- words per minute
  accuracy_percentage FLOAT,
  error_rate FLOAT,
  keystroke_dynamics JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_typing_patterns_student_id ON typing_patterns(student_id);

-- Emotional States Table
CREATE TABLE IF NOT EXISTS emotional_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  emotion VARCHAR(50) NOT NULL,
  intensity FLOAT CHECK (intensity >= 0 AND intensity <= 1),
  trigger TEXT,
  context JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emotional_states_student_id ON emotional_states(student_id);
CREATE INDEX IF NOT EXISTS idx_emotional_states_timestamp ON emotional_states(timestamp DESC);

-- ============================================================================
-- Layer 9: System & Admin
-- ============================================================================

-- App Usage Table
CREATE TABLE IF NOT EXISTS app_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  feature_name VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL, -- 'view', 'click', 'submit', etc.
  duration_seconds INT,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_usage_student_id ON app_usage(student_id);
CREATE INDEX IF NOT EXISTS idx_app_usage_feature_name ON app_usage(feature_name);
CREATE INDEX IF NOT EXISTS idx_app_usage_timestamp ON app_usage(timestamp DESC);

-- Feature Flags Table
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name VARCHAR(100) NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT false,
  description TEXT,
  rollout_percentage INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification Queue Table
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  message TEXT,
  data JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_student_id ON notification_queue(student_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  changes JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);

-- ============================================================================
-- Grant Permissions
-- ============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- This supplementary migration creates the remaining 18 tables:
-- ✅ feedback_loops (Layer 4)
-- ✅ agent_outputs (Layer 5)
-- ✅ changelog (Layer 5)
-- ✅ universities (Layer 6)
-- ✅ student_profiles (Layer 6)
-- ✅ users (Layer 6)
-- ✅ canvas_sync_logs (Layer 7)
-- ✅ assignments (Layer 7)
-- ✅ submissions (Layer 7)
-- ✅ grades (Layer 7)
-- ✅ focus_sessions (Layer 8)
-- ✅ sleep_patterns (Layer 8)
-- ✅ stress_indicators (Layer 8)
-- ✅ typing_patterns (Layer 8)
-- ✅ emotional_states (Layer 8)
-- ✅ app_usage (Layer 9)
-- ✅ feature_flags (Layer 9)
-- ✅ notification_queue (Layer 9)
-- ✅ audit_logs (Layer 9)
