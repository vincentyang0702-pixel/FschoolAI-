# NeuroOS Database Schema
## 22 Tables for Persistent Memory and Real-time Synthesis

**Date:** May 13, 2026  
**Status:** Ready for Deployment  
**Database:** Supabase (PostgreSQL)  
**Version:** 1.0

---

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [Core Tables](#core-tables)
3. [Canvas Integration Tables](#canvas-integration-tables)
4. [Behavioral Signals Tables](#behavioral-signals-tables)
5. [Emotional Intelligence Tables](#emotional-intelligence-tables)
6. [Synthesis & Predictions Tables](#synthesis--predictions-tables)
7. [System Tables](#system-tables)
8. [SQL Migrations](#sql-migrations)
9. [Indexes and Constraints](#indexes-and-constraints)
10. [Data Relationships](#data-relationships)

---

## Schema Overview

### Layer 1: Core Identity (3 tables)
- `users` - Student profiles
- `universities` - University information
- `courses` - Course information

### Layer 2: Canvas Integration (4 tables)
- `assignments` - Canvas assignments
- `grades` - Canvas grades
- `submissions` - Canvas submissions
- `canvas_sync_logs` - Sync tracking

### Layer 3: Behavioral Signals (3 tables)
- `typing_patterns` - Keystroke dynamics
- `focus_sessions` - Study sessions
- `app_usage` - iOS app tracking

### Layer 4: Emotional Intelligence (3 tables)
- `conversations` - Chat history
- `emotional_states` - Detected emotions
- `stress_indicators` - Stress detection

### Layer 5: Biometric Integration (2 tables)
- `biometric_data` - Apple Health data
- `sleep_patterns` - Sleep tracking

### Layer 6: Synthesis & Predictions (4 tables)
- `student_profiles` - Digital brain representation
- `predictions` - Grade predictions
- `recommendations` - AI recommendations
- `autonomous_actions` - Scheduled actions

### Layer 7: System Tables (0 tables)
- `audit_logs` - System audit trail
- `feature_flags` - Feature toggles

---

## Core Tables

### Table 1: users

**Purpose:** Store student profiles and authentication

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  university_id UUID NOT NULL REFERENCES universities(id),
  canvas_token VARCHAR(255) ENCRYPTED, -- Encrypted Canvas API token
  apple_health_token VARCHAR(255) ENCRYPTED, -- Encrypted Apple Health token
  ios_device_id VARCHAR(255), -- iOS device identifier
  profile_picture_url TEXT,
  bio TEXT,
  preferred_language VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'UTC',
  notification_preferences JSONB DEFAULT '{"email": true, "push": true, "sms": false}',
  privacy_settings JSONB DEFAULT '{"data_collection": true, "autonomous_actions": true}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP, -- Soft delete for GDPR
  INDEX idx_users_email (email),
  INDEX idx_users_university_id (university_id),
  INDEX idx_users_created_at (created_at)
);
```

**Columns:**
- `id` - Unique user identifier
- `email` - Student email
- `password_hash` - Hashed password
- `first_name`, `last_name` - Student name
- `university_id` - Reference to university
- `canvas_token` - Encrypted Canvas API token
- `apple_health_token` - Encrypted Apple Health token
- `ios_device_id` - iOS device identifier
- `profile_picture_url` - Profile picture
- `bio` - Student bio
- `preferred_language` - Language preference
- `timezone` - Timezone for scheduling
- `notification_preferences` - Notification settings
- `privacy_settings` - Privacy preferences
- `created_at`, `updated_at` - Timestamps
- `deleted_at` - Soft delete timestamp

---

### Table 2: universities

**Purpose:** Store university information for multi-tenancy

```sql
CREATE TABLE universities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) UNIQUE,
  canvas_instance_url VARCHAR(255), -- Canvas instance URL
  country VARCHAR(100),
  timezone VARCHAR(50),
  student_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_universities_name (name),
  INDEX idx_universities_domain (domain)
);
```

**Columns:**
- `id` - Unique university identifier
- `name` - University name
- `domain` - University domain (e.g., @stanford.edu)
- `canvas_instance_url` - Canvas LMS URL
- `country` - Country
- `timezone` - Timezone
- `student_count` - Number of students
- `created_at`, `updated_at` - Timestamps

---

### Table 3: courses

**Purpose:** Store course information

```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id UUID NOT NULL REFERENCES universities(id),
  canvas_course_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  semester VARCHAR(50), -- e.g., "Fall 2026"
  instructor_name VARCHAR(255),
  description TEXT,
  difficulty_level VARCHAR(50), -- easy, medium, hard
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_courses_university_id (university_id),
  INDEX idx_courses_canvas_course_id (canvas_course_id),
  UNIQUE(university_id, canvas_course_id)
);
```

**Columns:**
- `id` - Unique course identifier
- `university_id` - Reference to university
- `canvas_course_id` - Canvas course ID
- `name` - Course name
- `code` - Course code (e.g., CS101)
- `semester` - Semester
- `instructor_name` - Instructor name
- `description` - Course description
- `difficulty_level` - Difficulty level
- `created_at`, `updated_at` - Timestamps

---

## Canvas Integration Tables

### Table 4: assignments

**Purpose:** Store Canvas assignments

```sql
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  canvas_assignment_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date TIMESTAMP NOT NULL,
  points_possible DECIMAL(10, 2),
  submission_type VARCHAR(50), -- online_text_entry, online_upload, etc.
  grading_type VARCHAR(50), -- points, percent, letter_grade, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assignments_user_id (user_id),
  INDEX idx_assignments_course_id (course_id),
  INDEX idx_assignments_due_date (due_date),
  UNIQUE(user_id, canvas_assignment_id)
);
```

**Columns:**
- `id` - Unique assignment identifier
- `user_id` - Reference to user
- `course_id` - Reference to course
- `canvas_assignment_id` - Canvas assignment ID
- `title` - Assignment title
- `description` - Assignment description
- `due_date` - Due date
- `points_possible` - Total points
- `submission_type` - Type of submission
- `grading_type` - Grading method
- `created_at`, `updated_at` - Timestamps

---

### Table 5: grades

**Purpose:** Store Canvas grades

```sql
CREATE TABLE grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  assignment_id UUID NOT NULL REFERENCES assignments(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  score DECIMAL(10, 2),
  max_score DECIMAL(10, 2),
  percentage DECIMAL(5, 2),
  letter_grade VARCHAR(2),
  feedback TEXT,
  graded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_grades_user_id (user_id),
  INDEX idx_grades_assignment_id (assignment_id),
  INDEX idx_grades_course_id (course_id),
  INDEX idx_grades_graded_at (graded_at),
  UNIQUE(user_id, assignment_id)
);
```

**Columns:**
- `id` - Unique grade identifier
- `user_id` - Reference to user
- `assignment_id` - Reference to assignment
- `course_id` - Reference to course
- `score` - Actual score
- `max_score` - Maximum score
- `percentage` - Percentage score
- `letter_grade` - Letter grade
- `feedback` - Grader feedback
- `graded_at` - When graded
- `created_at`, `updated_at` - Timestamps

---

### Table 6: submissions

**Purpose:** Store Canvas submissions

```sql
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  assignment_id UUID NOT NULL REFERENCES assignments(id),
  canvas_submission_id VARCHAR(255) NOT NULL,
  submission_type VARCHAR(50),
  body TEXT,
  url VARCHAR(255),
  file_url VARCHAR(255),
  submitted_at TIMESTAMP,
  attempt INT DEFAULT 1,
  late BOOLEAN DEFAULT FALSE,
  missing BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_submissions_user_id (user_id),
  INDEX idx_submissions_assignment_id (assignment_id),
  INDEX idx_submissions_submitted_at (submitted_at),
  UNIQUE(user_id, canvas_submission_id)
);
```

**Columns:**
- `id` - Unique submission identifier
- `user_id` - Reference to user
- `assignment_id` - Reference to assignment
- `canvas_submission_id` - Canvas submission ID
- `submission_type` - Type of submission
- `body` - Text submission
- `url` - URL submission
- `file_url` - File submission URL
- `submitted_at` - When submitted
- `attempt` - Attempt number
- `late` - Is submission late?
- `missing` - Is submission missing?
- `created_at`, `updated_at` - Timestamps

---

### Table 7: canvas_sync_logs

**Purpose:** Track Canvas API sync operations

```sql
CREATE TABLE canvas_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  sync_type VARCHAR(50), -- assignments, grades, submissions
  status VARCHAR(50), -- success, failed, partial
  records_synced INT,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_canvas_sync_logs_user_id (user_id),
  INDEX idx_canvas_sync_logs_created_at (created_at)
);
```

**Columns:**
- `id` - Unique log identifier
- `user_id` - Reference to user
- `sync_type` - Type of sync
- `status` - Sync status
- `records_synced` - Number of records synced
- `error_message` - Error message if failed
- `started_at`, `completed_at` - Timestamps
- `duration_seconds` - Duration of sync
- `created_at` - Log creation time

---

## Behavioral Signals Tables

### Table 8: typing_patterns

**Purpose:** Store keystroke dynamics and typing behavior

```sql
CREATE TABLE typing_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  typing_speed INT, -- words per minute
  pause_frequency INT, -- pauses per 100 words
  error_rate DECIMAL(5, 2), -- percentage
  avg_keystroke_interval INT, -- milliseconds
  total_keystrokes INT,
  active_time INT, -- seconds
  focus_score DECIMAL(5, 2), -- 0-100
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_typing_patterns_user_id (user_id),
  INDEX idx_typing_patterns_date (date),
  UNIQUE(user_id, date)
);
```

**Columns:**
- `id` - Unique record identifier
- `user_id` - Reference to user
- `date` - Date of typing
- `typing_speed` - Words per minute
- `pause_frequency` - Pauses per 100 words
- `error_rate` - Error percentage
- `avg_keystroke_interval` - Average interval between keystrokes
- `total_keystrokes` - Total keystrokes
- `active_time` - Active typing time
- `focus_score` - Focus score (0-100)
- `created_at` - Record creation time

---

### Table 9: focus_sessions

**Purpose:** Store study/focus sessions

```sql
CREATE TABLE focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  course_id UUID REFERENCES courses(id),
  assignment_id UUID REFERENCES assignments(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_seconds INT,
  focus_level DECIMAL(5, 2), -- 0-100
  distractions INT, -- number of interruptions
  productivity_score DECIMAL(5, 2), -- 0-100
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_focus_sessions_user_id (user_id),
  INDEX idx_focus_sessions_course_id (course_id),
  INDEX idx_focus_sessions_start_time (start_time)
);
```

**Columns:**
- `id` - Unique session identifier
- `user_id` - Reference to user
- `course_id` - Reference to course
- `assignment_id` - Reference to assignment
- `start_time`, `end_time` - Session timestamps
- `duration_seconds` - Session duration
- `focus_level` - Focus level (0-100)
- `distractions` - Number of distractions
- `productivity_score` - Productivity score (0-100)
- `notes` - Session notes
- `created_at` - Record creation time

---

### Table 10: app_usage

**Purpose:** Track iOS app usage

```sql
CREATE TABLE app_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  app_name VARCHAR(255),
  category VARCHAR(50), -- social, productivity, education, entertainment
  usage_time INT, -- seconds
  open_count INT, -- number of times opened
  last_opened TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_app_usage_user_id (user_id),
  INDEX idx_app_usage_date (date),
  UNIQUE(user_id, date, app_name)
);
```

**Columns:**
- `id` - Unique record identifier
- `user_id` - Reference to user
- `date` - Date of usage
- `app_name` - App name
- `category` - App category
- `usage_time` - Total usage time
- `open_count` - Number of times opened
- `last_opened` - Last opened timestamp
- `created_at` - Record creation time

---

## Emotional Intelligence Tables

### Table 11: conversations

**Purpose:** Store chat history for emotional analysis

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  message_text TEXT NOT NULL,
  sender VARCHAR(50), -- user, ai
  message_type VARCHAR(50), -- text, voice, image
  sentiment VARCHAR(50), -- positive, neutral, negative
  emotion_detected VARCHAR(100), -- happy, sad, stressed, etc.
  confidence DECIMAL(5, 2), -- confidence score
  context JSONB, -- additional context
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_conversations_user_id (user_id),
  INDEX idx_conversations_created_at (created_at),
  INDEX idx_conversations_sentiment (sentiment)
);
```

**Columns:**
- `id` - Unique message identifier
- `user_id` - Reference to user
- `message_text` - Message content
- `sender` - Who sent it (user or AI)
- `message_type` - Type of message
- `sentiment` - Detected sentiment
- `emotion_detected` - Detected emotion
- `confidence` - Confidence score
- `context` - Additional context
- `created_at` - Message creation time

---

### Table 12: emotional_states

**Purpose:** Store detected emotional states

```sql
CREATE TABLE emotional_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  time_of_day VARCHAR(50), -- morning, afternoon, evening
  primary_emotion VARCHAR(50), -- happy, sad, stressed, anxious, etc.
  emotion_intensity DECIMAL(5, 2), -- 0-100
  secondary_emotions JSONB, -- array of secondary emotions
  contributing_factors JSONB, -- what caused this emotion
  recommended_action TEXT, -- what to do about it
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_emotional_states_user_id (user_id),
  INDEX idx_emotional_states_date (date),
  UNIQUE(user_id, date, time_of_day)
);
```

**Columns:**
- `id` - Unique record identifier
- `user_id` - Reference to user
- `date` - Date of emotional state
- `time_of_day` - Time of day
- `primary_emotion` - Primary emotion
- `emotion_intensity` - Intensity (0-100)
- `secondary_emotions` - Secondary emotions
- `contributing_factors` - Factors contributing to emotion
- `recommended_action` - Recommended action
- `created_at` - Record creation time

---

### Table 13: stress_indicators

**Purpose:** Track stress levels

```sql
CREATE TABLE stress_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  stress_level DECIMAL(5, 2), -- 0-100
  stress_sources JSONB, -- array of stress sources
  physical_indicators JSONB, -- sleep, exercise, nutrition
  academic_indicators JSONB, -- grades, deadlines, workload
  social_indicators JSONB, -- relationships, isolation, support
  overall_wellbeing DECIMAL(5, 2), -- 0-100
  intervention_recommended BOOLEAN,
  intervention_type VARCHAR(100), -- meditation, exercise, support, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_stress_indicators_user_id (user_id),
  INDEX idx_stress_indicators_date (date),
  UNIQUE(user_id, date)
);
```

**Columns:**
- `id` - Unique record identifier
- `user_id` - Reference to user
- `date` - Date of stress assessment
- `stress_level` - Stress level (0-100)
- `stress_sources` - Sources of stress
- `physical_indicators` - Physical indicators
- `academic_indicators` - Academic indicators
- `social_indicators` - Social indicators
- `overall_wellbeing` - Overall wellbeing (0-100)
- `intervention_recommended` - Is intervention needed?
- `intervention_type` - Type of intervention
- `created_at` - Record creation time

---

## Biometric Integration Tables

### Table 14: biometric_data

**Purpose:** Store Apple Health data

```sql
CREATE TABLE biometric_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  heart_rate INT, -- beats per minute
  heart_rate_variability INT, -- milliseconds
  blood_pressure_systolic INT,
  blood_pressure_diastolic INT,
  respiratory_rate INT, -- breaths per minute
  body_temperature DECIMAL(5, 2), -- Celsius
  oxygen_saturation DECIMAL(5, 2), -- percentage
  stress_level DECIMAL(5, 2), -- 0-100
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_biometric_data_user_id (user_id),
  INDEX idx_biometric_data_date (date),
  UNIQUE(user_id, date)
);
```

**Columns:**
- `id` - Unique record identifier
- `user_id` - Reference to user
- `date` - Date of measurement
- `heart_rate` - Heart rate (bpm)
- `heart_rate_variability` - HRV (ms)
- `blood_pressure_systolic`, `blood_pressure_diastolic` - Blood pressure
- `respiratory_rate` - Respiratory rate (breaths/min)
- `body_temperature` - Body temperature (°C)
- `oxygen_saturation` - O2 saturation (%)
- `stress_level` - Detected stress level (0-100)
- `created_at` - Record creation time

---

### Table 15: sleep_patterns

**Purpose:** Track sleep data

```sql
CREATE TABLE sleep_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  sleep_start TIMESTAMP,
  sleep_end TIMESTAMP,
  total_sleep_seconds INT,
  deep_sleep_seconds INT,
  rem_sleep_seconds INT,
  light_sleep_seconds INT,
  sleep_quality DECIMAL(5, 2), -- 0-100
  sleep_score DECIMAL(5, 2), -- 0-100
  interruptions INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sleep_patterns_user_id (user_id),
  INDEX idx_sleep_patterns_date (date),
  UNIQUE(user_id, date)
);
```

**Columns:**
- `id` - Unique record identifier
- `user_id` - Reference to user
- `date` - Date of sleep
- `sleep_start`, `sleep_end` - Sleep timestamps
- `total_sleep_seconds` - Total sleep time
- `deep_sleep_seconds`, `rem_sleep_seconds`, `light_sleep_seconds` - Sleep stages
- `sleep_quality` - Sleep quality (0-100)
- `sleep_score` - Sleep score (0-100)
- `interruptions` - Number of interruptions
- `notes` - Sleep notes
- `created_at` - Record creation time

---

## Synthesis & Predictions Tables

### Table 16: student_profiles

**Purpose:** Store digital brain representation

```sql
CREATE TABLE student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
  learning_style VARCHAR(50), -- visual, auditory, kinesthetic
  strengths JSONB, -- array of strengths
  weaknesses JSONB, -- array of weaknesses
  learning_pace VARCHAR(50), -- slow, normal, fast
  motivation_level DECIMAL(5, 2), -- 0-100
  risk_factors JSONB, -- factors indicating risk
  resilience_score DECIMAL(5, 2), -- 0-100
  support_needs JSONB, -- types of support needed
  preferences JSONB, -- study preferences, schedule, etc.
  last_updated TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student_profiles_user_id (user_id)
);
```

**Columns:**
- `id` - Unique profile identifier
- `user_id` - Reference to user
- `learning_style` - Learning style
- `strengths` - Identified strengths
- `weaknesses` - Identified weaknesses
- `learning_pace` - Learning pace
- `motivation_level` - Motivation level (0-100)
- `risk_factors` - Risk factors
- `resilience_score` - Resilience score (0-100)
- `support_needs` - Support needs
- `preferences` - Preferences
- `last_updated` - Last update time
- `created_at`, `updated_at` - Timestamps

---

### Table 17: predictions

**Purpose:** Store grade predictions

```sql
CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  assignment_id UUID REFERENCES assignments(id),
  predicted_grade DECIMAL(5, 2),
  predicted_letter_grade VARCHAR(2),
  confidence DECIMAL(5, 2), -- 0-100
  prediction_factors JSONB, -- factors influencing prediction
  risk_level VARCHAR(50), -- low, medium, high
  intervention_needed BOOLEAN,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_predictions_user_id (user_id),
  INDEX idx_predictions_course_id (course_id),
  INDEX idx_predictions_created_at (created_at)
);
```

**Columns:**
- `id` - Unique prediction identifier
- `user_id` - Reference to user
- `course_id` - Reference to course
- `assignment_id` - Reference to assignment
- `predicted_grade` - Predicted grade
- `predicted_letter_grade` - Predicted letter grade
- `confidence` - Confidence score (0-100)
- `prediction_factors` - Factors influencing prediction
- `risk_level` - Risk level
- `intervention_needed` - Is intervention needed?
- `created_at`, `updated_at` - Timestamps

---

### Table 18: recommendations

**Purpose:** Store AI recommendations

```sql
CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  course_id UUID REFERENCES courses(id),
  assignment_id UUID REFERENCES assignments(id),
  recommendation_type VARCHAR(50), -- study, schedule, support, etc.
  title VARCHAR(255),
  description TEXT,
  action_items JSONB, -- array of action items
  priority VARCHAR(50), -- low, medium, high
  urgency VARCHAR(50), -- low, medium, high
  estimated_impact DECIMAL(5, 2), -- expected impact on grade
  status VARCHAR(50), -- pending, accepted, rejected, completed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP,
  completed_at TIMESTAMP,
  INDEX idx_recommendations_user_id (user_id),
  INDEX idx_recommendations_course_id (course_id),
  INDEX idx_recommendations_status (status),
  INDEX idx_recommendations_created_at (created_at)
);
```

**Columns:**
- `id` - Unique recommendation identifier
- `user_id` - Reference to user
- `course_id` - Reference to course
- `assignment_id` - Reference to assignment
- `recommendation_type` - Type of recommendation
- `title` - Recommendation title
- `description` - Recommendation description
- `action_items` - Action items
- `priority` - Priority level
- `urgency` - Urgency level
- `estimated_impact` - Expected impact
- `status` - Status
- `created_at`, `accepted_at`, `completed_at` - Timestamps

---

### Table 19: autonomous_actions

**Purpose:** Store autonomous actions taken by system

```sql
CREATE TABLE autonomous_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  action_type VARCHAR(50), -- schedule, notify, breakdown, etc.
  title VARCHAR(255),
  description TEXT,
  action_details JSONB, -- detailed action information
  scheduled_for TIMESTAMP,
  executed_at TIMESTAMP,
  status VARCHAR(50), -- pending, scheduled, executed, failed
  success BOOLEAN,
  result JSONB, -- result of action
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_autonomous_actions_user_id (user_id),
  INDEX idx_autonomous_actions_scheduled_for (scheduled_for),
  INDEX idx_autonomous_actions_status (status)
);
```

**Columns:**
- `id` - Unique action identifier
- `user_id` - Reference to user
- `action_type` - Type of action
- `title` - Action title
- `description` - Action description
- `action_details` - Detailed information
- `scheduled_for` - When scheduled
- `executed_at` - When executed
- `status` - Action status
- `success` - Was it successful?
- `result` - Result of action
- `created_at` - Record creation time

---

## System Tables

### Table 20: audit_logs

**Purpose:** Track system audit trail

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(255),
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  changes JSONB, -- what changed
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_logs_user_id (user_id),
  INDEX idx_audit_logs_created_at (created_at),
  INDEX idx_audit_logs_entity_type (entity_type)
);
```

**Columns:**
- `id` - Unique log identifier
- `user_id` - Reference to user
- `action` - Action performed
- `entity_type` - Type of entity
- `entity_id` - ID of entity
- `changes` - Changes made
- `ip_address` - IP address
- `user_agent` - User agent
- `created_at` - Log creation time

---

### Table 21: feature_flags

**Purpose:** Feature toggle management

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT FALSE,
  rollout_percentage INT DEFAULT 0, -- 0-100
  target_users JSONB, -- specific users to target
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_feature_flags_name (name),
  INDEX idx_feature_flags_enabled (enabled)
);
```

**Columns:**
- `id` - Unique flag identifier
- `name` - Flag name
- `description` - Flag description
- `enabled` - Is flag enabled?
- `rollout_percentage` - Rollout percentage (0-100)
- `target_users` - Target users
- `created_at`, `updated_at` - Timestamps

---

### Table 22: notification_queue

**Purpose:** Queue for notifications

```sql
CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  notification_type VARCHAR(50), -- email, push, sms
  title VARCHAR(255),
  body TEXT,
  data JSONB, -- additional data
  scheduled_for TIMESTAMP,
  sent_at TIMESTAMP,
  status VARCHAR(50), -- pending, sent, failed
  retry_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notification_queue_user_id (user_id),
  INDEX idx_notification_queue_status (status),
  INDEX idx_notification_queue_scheduled_for (scheduled_for)
);
```

**Columns:**
- `id` - Unique notification identifier
- `user_id` - Reference to user
- `notification_type` - Type of notification
- `title` - Notification title
- `body` - Notification body
- `data` - Additional data
- `scheduled_for` - When to send
- `sent_at` - When sent
- `status` - Notification status
- `retry_count` - Number of retries
- `error_message` - Error message if failed
- `created_at` - Record creation time

---

## SQL Migrations

### Migration 1: Create All Tables

```sql
-- Run all CREATE TABLE statements above

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_university_id ON users(university_id);
CREATE INDEX idx_users_created_at ON users(created_at);

-- ... (all other indexes as defined above)

-- Create foreign key constraints
ALTER TABLE users ADD CONSTRAINT fk_users_university_id 
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE;

ALTER TABLE courses ADD CONSTRAINT fk_courses_university_id 
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE;

-- ... (all other foreign keys)
```

### Migration 2: Enable Row-Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
-- ... (enable RLS on all tables)

-- Create policies for users table
CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth.uid() = id);

-- ... (create policies for all tables)
```

### Migration 3: Create Materialized Views

```sql
-- Student Dashboard View
CREATE MATERIALIZED VIEW student_dashboard AS
SELECT 
  u.id,
  u.first_name,
  u.last_name,
  COUNT(DISTINCT c.id) as total_courses,
  COUNT(DISTINCT a.id) as total_assignments,
  AVG(g.percentage) as average_grade,
  COUNT(DISTINCT CASE WHEN g.percentage < 70 THEN a.id END) as at_risk_count
FROM users u
LEFT JOIN courses c ON u.university_id = c.university_id
LEFT JOIN assignments a ON c.id = a.course_id
LEFT JOIN grades g ON a.id = g.assignment_id AND u.id = g.user_id
GROUP BY u.id, u.first_name, u.last_name;

-- Refresh materialized view
REFRESH MATERIALIZED VIEW student_dashboard;
```

### Migration 4: Create Triggers

```sql
-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ... (create triggers for all tables with updated_at)
```

---

## Indexes and Constraints

### Indexes for Performance

```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_university_id ON users(university_id);

-- Assignment lookups
CREATE INDEX idx_assignments_user_id ON assignments(user_id);
CREATE INDEX idx_assignments_due_date ON assignments(due_date);

-- Grade lookups
CREATE INDEX idx_grades_user_id ON grades(user_id);
CREATE INDEX idx_grades_graded_at ON grades(graded_at);

-- Behavioral data lookups
CREATE INDEX idx_typing_patterns_user_id_date ON typing_patterns(user_id, date);
CREATE INDEX idx_focus_sessions_user_id_start_time ON focus_sessions(user_id, start_time);

-- Emotional data lookups
CREATE INDEX idx_conversations_user_id_created_at ON conversations(user_id, created_at);
CREATE INDEX idx_emotional_states_user_id_date ON emotional_states(user_id, date);

-- Prediction lookups
CREATE INDEX idx_predictions_user_id_course_id ON predictions(user_id, course_id);

-- Recommendation lookups
CREATE INDEX idx_recommendations_user_id_status ON recommendations(user_id, status);
```

### Constraints for Data Integrity

```sql
-- Unique constraints
ALTER TABLE users ADD CONSTRAINT unique_user_email UNIQUE(email);
ALTER TABLE universities ADD CONSTRAINT unique_university_domain UNIQUE(domain);
ALTER TABLE courses ADD CONSTRAINT unique_course_canvas_id UNIQUE(university_id, canvas_course_id);

-- Check constraints
ALTER TABLE grades ADD CONSTRAINT check_percentage_range CHECK (percentage >= 0 AND percentage <= 100);
ALTER TABLE typing_patterns ADD CONSTRAINT check_focus_score CHECK (focus_score >= 0 AND focus_score <= 100);
ALTER TABLE emotional_states ADD CONSTRAINT check_emotion_intensity CHECK (emotion_intensity >= 0 AND emotion_intensity <= 100);

-- Foreign key constraints with cascading deletes
ALTER TABLE assignments ADD CONSTRAINT fk_assignments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE grades ADD CONSTRAINT fk_grades_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

---

## Data Relationships

### Entity Relationship Diagram

```
users
├── university_id → universities
├── canvas_token (encrypted)
├── apple_health_token (encrypted)
└── ios_device_id

universities
├── name
├── domain
└── canvas_instance_url

courses
├── university_id → universities
└── canvas_course_id

assignments
├── user_id → users
├── course_id → courses
└── canvas_assignment_id

grades
├── user_id → users
├── assignment_id → assignments
└── course_id → courses

submissions
├── user_id → users
└── assignment_id → assignments

canvas_sync_logs
└── user_id → users

typing_patterns
└── user_id → users

focus_sessions
├── user_id → users
├── course_id → courses
└── assignment_id → assignments

app_usage
└── user_id → users

conversations
└── user_id → users

emotional_states
└── user_id → users

stress_indicators
└── user_id → users

biometric_data
└── user_id → users

sleep_patterns
└── user_id → users

student_profiles
└── user_id → users (1:1)

predictions
├── user_id → users
└── course_id → courses

recommendations
├── user_id → users
├── course_id → courses
└── assignment_id → assignments

autonomous_actions
└── user_id → users

audit_logs
└── user_id → users

feature_flags
(no relationships)

notification_queue
└── user_id → users
```

---

## Deployment Checklist

- [ ] Create all 22 tables
- [ ] Create all indexes
- [ ] Create all constraints
- [ ] Enable Row-Level Security
- [ ] Create RLS policies
- [ ] Create materialized views
- [ ] Create triggers
- [ ] Test data integrity
- [ ] Test performance
- [ ] Backup database
- [ ] Monitor database size
- [ ] Set up monitoring alerts

---

## Next Steps

1. **Deploy to Supabase** - Run all migrations
2. **Set up replication** - For backup and disaster recovery
3. **Configure backups** - Daily backups to S3
4. **Set up monitoring** - Monitor database performance
5. **Test Canvas integration** - Verify Canvas API connection
6. **Test data encryption** - Verify token encryption
7. **Load test** - Test with 1000+ records

**Database is ready for Phase 3: Canvas Integration**
