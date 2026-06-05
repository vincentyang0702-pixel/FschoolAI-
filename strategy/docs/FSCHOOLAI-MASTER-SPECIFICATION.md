# FschoolAI: Master Specification
## Complete Blueprint for Building the Personal Academic Intelligence System

**Date:** May 12, 2026  
**Status:** Final, Comprehensive, Ready to Build  
**Audience:** Engineering team, product team, investors  

---

## 📖 TABLE OF CONTENTS

1. Executive Summary
2. What Are We Building
3. The Brain Architecture (5 Layers)
4. The Agent Architecture (6 Agents)
5. The Data Architecture (4 Databases)
6. The 5-Layer Student Model
7. The 7 Data Profiles
8. Implementation Roadmap (5 Phases)
9. Technical Specifications
10. Success Metrics

---

## 🎯 EXECUTIVE SUMMARY

### What is FschoolAI?

**A personal academic intelligence system that:**
- Captures behavioral, emotional, knowledge, context, and outcome signals
- Stores them in a way that enables pattern recognition (4 databases)
- Analyzes them with specialized agents (6 agents)
- Synthesizes cross-agent insights (Situation Synthesizer)
- Personalizes responses in real-time (< 3 seconds)
- Learns from outcomes (feedback loop)
- Respects privacy (data deletion, portability)
- Creates a defensible moat (compounding intelligence)

### Why is it different?

| Feature | perf10 | Canvas | ChatGPT | FschoolAI |
|---------|--------|--------|---------|-----------|
| Understands how you think | ❌ | ❌ | ❌ | ✅ |
| Knows what each professor wants | ❌ | ❌ | ❌ | ✅ |
| Knows when you work best | ❌ | ❌ | ❌ | ✅ |
| Tracks growth over time | ⚠️ | ✅ | ❌ | ✅ |
| Synthesizes multiple sources | ❌ | ❌ | ❌ | ✅ |
| Gives personalized help | ⚠️ | ❌ | ⚠️ | ✅ |
| Learns from outcomes | ❌ | ❌ | ❌ | ✅ |
| Respects privacy | ⚠️ | ⚠️ | ❌ | ✅ |
| Defensible moat | ❌ | ❌ | ❌ | ✅ |

### The moat

**Compounding intelligence:**
- Day 1: Brain starts capturing
- Day 365: Brain has 365 days of data
- Day 1095: Brain has 3 years of data
- Competitor starts Day 1096: They can never catch up

---

## 🧠 PART 1: WHAT ARE WE BUILDING

### NOT:
- ❌ A writing tool (like perf10)
- ❌ A grade tracker (like Canvas)
- ❌ A chatbot (like ChatGPT)
- ❌ A note-taking app (like Notion)

### BUT:
- ✅ A **personal academic intelligence system** that understands the student deeply and adapts in real-time

### The Core Insight

**The moat is not the Canvas API, not the Claude wrapper, not the UI.**

**The moat is compounding intelligence — the system that knows you better after 10 sessions than any competitor starting fresh.**

---

## 🧠 PART 2: THE BRAIN ARCHITECTURE (5 LAYERS)

### Layer 1: **Behavioral Signals** (What they DO)

**Data Points:**
```json
{
  "typing_speed": 45,  // words per minute
  "typing_variance": 12,  // standard deviation
  "pause_frequency": 0.8,  // pauses per minute
  "pause_duration": 2.3,  // seconds
  "focus_duration": 18,  // minutes
  "submission_timing": "last_minute",  // early, on_time, last_minute
  "revision_cycles": 2.3,  // average
  "device_preference": "desktop",  // desktop, mobile, tablet
  "time_of_day_preference": "evening",  // morning, afternoon, evening, night
  "day_of_week_pattern": [0.8, 0.9, 1.0, 0.9, 0.8, 0.5, 0.6]  // Mon-Sun
}
```

**Why it matters:**
- Typing speed + pauses = confidence level (non-self-reported)
- Submission timing = procrastination tendency
- Device preference = optimal learning environment
- Time/day pattern = circadian rhythm for learning

---

### Layer 2: **Emotional Signals** (How they FEEL)

**Data Points:**
```json
{
  "current_emotional_state": "anxious",
  "confidence_level_avg": 0.65,
  "confidence_level_by_subject": {
    "math": 0.45,
    "english": 0.85,
    "history": 0.70
  },
  "stress_level_avg": 0.72,
  "stress_triggers": ["deadlines", "exams", "group_projects"],
  "motivation_level_avg": 0.68,
  "motivation_drivers": ["good_grades", "professor_feedback", "peer_recognition"],
  "emotional_resilience": 0.6  // how quickly they recover from setbacks
}
```

**Why it matters:**
- Emotional state × behavioral signals = intervention timing
- Confidence by subject = personalized difficulty adjustment
- Stress triggers = proactive support
- Motivation drivers = personalized incentives

---

### Layer 3: **Knowledge Signals** (What they KNOW)

**Data Points:**
```json
{
  "concepts_understood": [
    {
      "concept_id": "quadratic_equations",
      "understanding_level": 0.75,
      "mastery_level": 0.60,
      "times_practiced": 12,
      "times_succeeded": 9,
      "confidence": 0.70
    }
  ],
  "learning_style": "visual",  // visual, auditory, kinesthetic, reading
  "learning_path": ["algebra_basics", "linear_equations", "quadratic_equations"],
  "knowledge_gaps": ["polynomial_factoring"],
  "skill_transfer_score": 0.65  // how well they apply skills to new contexts
}
```

**Why it matters:**
- Understanding × mastery = readiness for next concept
- Knowledge gaps = prerequisite identification
- Skill transfer score = ability to generalize
- Learning style = optimal presentation format

---

### Layer 4: **Context Signals** (What's AROUND them)

**Data Points:**
```json
{
  "course_context": {
    "professor_id": "uuid",
    "course_difficulty": 0.65,
    "assignment_weight": 0.35,
    "peer_performance_distribution": { "A": 0.25, "B": 0.40, "C": 0.25 }
  },
  "time_context": {
    "time_of_day": "evening",
    "day_of_week": "tuesday",
    "semester_phase": "week_8_of_16",
    "deadline_proximity": "3_days"
  },
  "device_context": {
    "device_type": "desktop",
    "browser": "chrome",
    "network_quality": "good",
    "battery_level": 0.85
  },
  "social_context": {
    "peer_performance": "above_average",
    "collaboration_opportunities": 3,
    "class_participation": "active"
  }
}
```

**Why it matters:**
- Same student performs differently in different contexts
- Context enables personalization
- Deadline proximity = urgency level
- Peer performance = motivation/competition

---

### Layer 5: **Outcome Signals** (What HAPPENED)

**Data Points:**
```json
{
  "grade_outcome": {
    "assignment_grade": 82,
    "rubric_scores": { "thesis": 8, "evidence": 7, "structure": 9 },
    "professor_feedback": "Good structure but needs more evidence",
    "peer_comparison": "above_average"
  },
  "learning_outcome": {
    "concept_mastery": 0.75,
    "skill_improvement": 0.15,
    "knowledge_retention": 0.80,
    "transfer_to_new_contexts": 0.65
  },
  "wellbeing_outcome": {
    "sleep_quality": 0.8,
    "stress_level_post": 0.6,
    "confidence_post": 0.75,
    "motivation_post": 0.80
  },
  "engagement_outcome": {
    "time_spent": 4.5,  // hours
    "resource_usage": 3,  // readings, videos, etc.
    "help_seeking": 1,  // times asked for help
    "peer_interaction": 2  // collaboration instances
  }
}
```

**Why it matters:**
- Outcomes validate predictions
- Outcomes close the feedback loop
- Outcomes enable learning
- Outcomes measure success

---

## 🤖 PART 3: THE AGENT ARCHITECTURE (6 AGENTS)

### Agent 1: **Canvas Watcher**

**What it does:**
```
Runs every 30 minutes (or on app open)
├─ Polls Canvas for changes
├─ Detects new assignments
├─ Detects grade updates
├─ Detects syllabus changes
└─ Triggers other agents when changes detected
```

**Why it matters:**
- Student opens app and Reggie already knows what changed
- No delay, no "fetching data" experience
- Enables proactive notifications

**Implementation:**
```python
@scheduler.scheduled_job('interval', minutes=30)
def canvas_watcher():
    for student in active_students():
        changes = fetch_canvas_changes(student)
        if changes:
            update_student_model(student, changes)
            trigger_situation_synthesis(student)
```

---

### Agent 2: **Writing Intelligence**

**What it does:**
```
Analyzes student drafts
├─ Extracts writing patterns
├─ Identifies strengths and weaknesses
├─ Generates grade signal
├─ Updates intellectual portrait
└─ Compares to professor preferences
```

**Why it matters:**
- Understands writing patterns and growth
- Identifies what needs improvement
- Predicts grade before submission
- Tracks writing evolution

**Implementation:**
```python
def writing_intelligence(draft_text, student_id, course_id):
    analysis = claude.messages.create(
        model="claude-3-5-sonnet-20241022",
        messages=[{
            "role": "user",
            "content": f"""
            Analyze this draft and provide:
            1. Writing patterns (thesis placement, evidence quality, tone)
            2. Strengths and weaknesses
            3. Grade prediction (based on professor profile)
            4. Specific recommendations
            
            Draft: {draft_text}
            Professor profile: {get_professor_profile(course_id)}
            Student writing history: {get_writing_history(student_id)}
            """
        }]
    )
    
    return analysis
```

---

### Agent 3: **Lecture Recording**

**What it does:**
```
Transcribes and analyzes audio
├─ Transcribes lecture audio (Whisper)
├─ Flags key moments
├─ Identifies professor emphasis
├─ Updates professor profile
└─ Connects to assignments
```

**Why it matters:**
- Knows what professor emphasizes
- Identifies important concepts
- Predicts what will be on exam
- Tracks professor's teaching style

**Implementation:**
```python
def lecture_recording(audio_file, student_id, course_id):
    # Transcribe with Whisper
    transcript = whisper.transcribe(audio_file)
    
    # Analyze with Claude
    analysis = claude.messages.create(
        model="claude-3-5-sonnet-20241022",
        messages=[{
            "role": "user",
            "content": f"""
            Analyze this lecture transcript and provide:
            1. Key concepts emphasized
            2. Professor's teaching style
            3. Likely exam topics
            4. Connection to assignments
            
            Transcript: {transcript}
            """
        }]
    )
    
    return analysis
```

---

### Agent 4: **Library Organizer**

**What it does:**
```
Classifies and organizes uploads
├─ Classifies uploads (PDFs, photos, voice notes)
├─ Extracts metadata
├─ Connects to courses and assignments
├─ Updates student model
└─ Enables resource discovery
```

**Why it matters:**
- Organizes student's learning resources
- Connects resources to assignments
- Enables semantic search
- Builds intellectual portrait from resources

**Implementation:**
```python
def library_organizer(file, student_id):
    # Classify file
    classification = claude.messages.create(
        model="claude-3-5-sonnet-20241022",
        messages=[{
            "role": "user",
            "content": f"""
            Classify this file and provide:
            1. File type (reading, lecture note, assignment, etc.)
            2. Relevant course
            3. Relevant concepts
            4. Relevance to assignments
            
            File: {file}
            """
        }]
    )
    
    return classification
```

---

### Agent 5: **Professor Intelligence**

**What it does:**
```
Analyzes graded feedback
├─ Extracts grading philosophy
├─ Identifies what professor rewards/penalizes
├─ Builds professor profile
├─ Learns from lecture emphasis
└─ Predicts future grades
```

**Why it matters:**
- Knows what each professor wants
- Predicts grade before submission
- Identifies professor's blind spots
- Enables targeted improvement

**Implementation:**
```python
def professor_intelligence(graded_essay, feedback, student_id, course_id):
    analysis = claude.messages.create(
        model="claude-3-5-sonnet-20241022",
        messages=[{
            "role": "user",
            "content": f"""
            Analyze this graded essay and feedback to extract:
            1. What the professor rewarded
            2. What the professor penalized
            3. Grading philosophy
            4. Marking weights (argument vs evidence vs structure)
            5. Specific language patterns in feedback
            
            Essay: {graded_essay}
            Feedback: {feedback}
            Previous essays from this professor: {get_previous_essays(course_id)}
            """
        }]
    )
    
    return analysis
```

---

### Agent 6: **Situation Synthesizer**

**What it does:**
```
Connects all agents and student model
├─ Reads full student model
├─ Reads all agent outputs
├─ Connects cross-agent insights
├─ Identifies the immediate situation
├─ Recommends specific action
└─ Generates personalized response
```

**Why it matters:**
- Makes insights no single agent can make
- Synthesizes complex situations
- Generates truly personalized help
- Creates the "magic" of FschoolAI

**Implementation:**
```python
def situation_synthesizer(student_id):
    # Get all data
    student_model = get_student_model(student_id)
    writing_signals = writing_intelligence_agent(student_id)
    lecture_signals = lecture_recording_agent(student_id)
    professor_signals = professor_intelligence_agent(student_id)
    behavioral_signals = behavioral_analysis_agent(student_id)
    emotional_signals = emotional_analysis_agent(student_id)
    
    # Synthesize with Claude
    situation_brief = claude.messages.create(
        model="claude-3-5-sonnet-20241022",
        messages=[{
            "role": "user",
            "content": f"""
            Given this student model and these signals, what's the situation right now?
            
            Student Model: {student_model}
            Writing Signals: {writing_signals}
            Lecture Signals: {lecture_signals}
            Professor Signals: {professor_signals}
            Behavioral Signals: {behavioral_signals}
            Emotional Signals: {emotional_signals}
            
            Generate a situation brief that:
            1. Identifies the immediate challenge
            2. Connects cross-agent insights
            3. Recommends specific action
            4. Explains the reasoning
            5. Predicts the outcome if they follow the recommendation
            """
        }]
    )
    
    return situation_brief
```

---

## 💾 PART 4: THE DATA ARCHITECTURE (4 DATABASES)

### Database 1: **PostgreSQL (Supabase)**

**Purpose:** Structured, transactional data

**Tables:**

```sql
-- Users and Identity
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  university VARCHAR(255),
  year INT,
  role VARCHAR(50),  -- student, professor, admin
  created_at TIMESTAMP
);

-- Professors
CREATE TABLE professors (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  department VARCHAR(255),
  office_location VARCHAR(255),
  office_hours TEXT,
  bio TEXT
);

-- Courses
CREATE TABLE courses (
  id UUID PRIMARY KEY,
  professor_id UUID REFERENCES professors(id),
  title VARCHAR(255),
  code VARCHAR(50),
  semester VARCHAR(50),
  enrollment_count INT
);

-- Enrollments
CREATE TABLE enrollments (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES users(id),
  course_id UUID REFERENCES courses(id),
  UNIQUE(student_id, course_id)
);

-- Assignments
CREATE TABLE assignments (
  id UUID PRIMARY KEY,
  course_id UUID REFERENCES courses(id),
  title VARCHAR(255),
  description TEXT,
  due_date TIMESTAMP,
  weight FLOAT
);

-- Submissions
CREATE TABLE submissions (
  id UUID PRIMARY KEY,
  assignment_id UUID REFERENCES assignments(id),
  student_id UUID REFERENCES users(id),
  submitted_at TIMESTAMP,
  grade FLOAT,
  feedback TEXT
);

-- Behavioral Events
CREATE TABLE behavioral_events (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES users(id),
  event_type VARCHAR(50),  -- typing, focus, submission, etc.
  event_data JSONB,
  timestamp TIMESTAMP
);

-- Emotional States
CREATE TABLE emotional_states (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES users(id),
  state VARCHAR(50),  -- confident, anxious, motivated, etc.
  level FLOAT,  -- 0-1
  context VARCHAR(255),
  timestamp TIMESTAMP
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES users(id),
  created_at TIMESTAMP
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  role VARCHAR(50),  -- user, assistant
  content TEXT,
  timestamp TIMESTAMP
);

-- 8 Neural Strings
CREATE TABLE neural_strings (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES users(id),
  string_name VARCHAR(255),  -- behavioral, emotional, etc.
  data JSONB,
  updated_at TIMESTAMP
);

-- Learning Paths
CREATE TABLE learning_paths (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES users(id),
  course_id UUID REFERENCES courses(id),
  path_data JSONB,
  updated_at TIMESTAMP
);

-- Student Concept Progress
CREATE TABLE student_concept_progress (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES users(id),
  concept_id VARCHAR(255),
  understanding_level FLOAT,
  mastery_level FLOAT,
  last_practiced TIMESTAMP
);
```

**Indexes:**
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_submissions_student ON submissions(student_id);
CREATE INDEX idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX idx_behavioral_events_student ON behavioral_events(student_id);
CREATE INDEX idx_emotional_states_student ON emotional_states(student_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
```

---

### Database 2: **Neo4j (Graph)**

**Purpose:** Relationships and learning paths

**Node Types:**

```
Concept
├─ title: String
├─ difficulty: Float (0-1)
├─ subject: String
└─ resources: [String]

Student
├─ id: UUID
├─ name: String
├─ learning_style: String
└─ profile: JSON

Skill
├─ name: String
├─ proficiency: Float
└─ category: String

LearningPath
├─ name: String
├─ subject: String
└─ sequence: [Concept]

Professor
├─ id: UUID
├─ name: String
├─ grading_philosophy: String
└─ teaching_style: String

Course
├─ id: UUID
├─ title: String
├─ professor_id: UUID
└─ concepts: [Concept]
```

**Relationship Types:**

```
Student -[UNDERSTANDS {level: Float}]-> Concept
Student -[STRUGGLES_WITH {frequency: Int}]-> Concept
Student -[LEARNS_FROM {style: String}]-> Professor
Concept -[PREREQUISITE_FOR]-> Concept
Concept -[RELATED_TO {similarity: Float}]-> Concept
Concept -[PART_OF]-> Course
Professor -[TEACHES]-> Course
Student -[ENROLLED_IN]-> Course
Skill -[REQUIRED_FOR]-> Concept
```

**Example Queries:**

```cypher
-- Find prerequisites for a concept
MATCH (c:Concept {title: "Quadratic Equations"})<-[:PREREQUISITE_FOR]-(prereq:Concept)
RETURN prereq

-- Find related concepts
MATCH (c:Concept {title: "Quadratic Equations"})-[:RELATED_TO {similarity: >0.7}]-(related:Concept)
RETURN related

-- Find learning path for student
MATCH (s:Student {id: $student_id})-[:UNDERSTANDS {level: >0.8}]->(c:Concept)
MATCH (c)-[:PREREQUISITE_FOR*0..3]->(next:Concept)
WHERE NOT (s)-[:UNDERSTANDS]->(next)
RETURN next ORDER BY length(path) ASC LIMIT 5

-- Find similar students
MATCH (s1:Student {id: $student_id})-[:UNDERSTANDS {level: >0.6}]->(c:Concept)
MATCH (s2:Student)-[:UNDERSTANDS {level: >0.6}]->(c)
WHERE s1 <> s2
RETURN s2, count(c) as shared_concepts ORDER BY shared_concepts DESC
```

---

### Database 3: **Pinecone (Vector)**

**Purpose:** Semantic search and similarity matching

**Index Structure:**

```
Namespace: concepts
├─ Dimension: 1536 (OpenAI embeddings)
├─ Metric: cosine
└─ Vectors:
    ├─ concept_quadratic_equations
    ├─ concept_linear_equations
    ├─ concept_polynomials
    └─ ...

Namespace: readings
├─ Dimension: 1536
├─ Metric: cosine
└─ Vectors:
    ├─ reading_florida_new_urban_crisis
    ├─ reading_massey_for_space
    └─ ...

Namespace: student_understanding
├─ Dimension: 1536
├─ Metric: cosine
└─ Vectors:
    ├─ student_123_understanding
    ├─ student_456_understanding
    └─ ...

Namespace: messages
├─ Dimension: 1536
├─ Metric: cosine
└─ Vectors:
    ├─ message_how_do_i_improve
    ├─ message_what_is_gentrification
    └─ ...
```

**Example Queries:**

```python
# Find similar concepts
results = pinecone.query(
    namespace="concepts",
    vector=embedding_for("quadratic equations"),
    top_k=5,
    include_metadata=True
)

# Find relevant readings for concept
results = pinecone.query(
    namespace="readings",
    vector=embedding_for("gentrification"),
    top_k=3,
    include_metadata=True
)

# Find similar students
results = pinecone.query(
    namespace="student_understanding",
    vector=student_understanding_vector,
    top_k=10,
    include_metadata=True
)

# Semantic search messages
results = pinecone.query(
    namespace="messages",
    vector=embedding_for("how do I improve my essay"),
    top_k=5,
    include_metadata=True
)
```

---

### Database 4: **Redis (Cache)**

**Purpose:** Real-time cache, sub-3-second response times

**Data Structure:**

```
Hot Data (1 hour TTL):
├─ student:{id}:current_state
├─ student:{id}:current_course
├─ student:{id}:recent_messages
├─ course:{id}:assignments
└─ professor:{id}:profile

Warm Data (24 hour TTL):
├─ student:{id}:behavioral_profile
├─ student:{id}:emotional_profile
├─ student:{id}:knowledge_profile
├─ course:{id}:concept_map
└─ professor:{id}:grading_philosophy

Pub/Sub Channels:
├─ student:{id}:updates
├─ course:{id}:updates
├─ professor:{id}:updates
└─ system:notifications
```

**Example Usage:**

```python
# Cache student state
redis.setex(
    f"student:{student_id}:current_state",
    3600,  # 1 hour TTL
    json.dumps(student_state)
)

# Get cached state
cached_state = redis.get(f"student:{student_id}:current_state")

# Publish update
redis.publish(
    f"student:{student_id}:updates",
    json.dumps({"type": "grade_posted", "assignment_id": assignment_id})
)

# Subscribe to updates
pubsub = redis.pubsub()
pubsub.subscribe(f"student:{student_id}:updates")
for message in pubsub.listen():
    handle_update(message)
```

---

## 👤 PART 5: THE 5-LAYER STUDENT MODEL

```json
{
  "identity": {
    "university": "University of Toronto",
    "campus": "UTSC",
    "year": 2,
    "courses": [
      {
        "id": "GGRB03",
        "name": "Writing Geography",
        "professor": "Oswin",
        "term": "Winter 2025"
      }
    ]
  },
  
  "intellectualPortrait": {
    "entryPoint": "personal experience before theory",
    "confidence": 0.91,
    "strongestFramework": "spatial analysis + power structures",
    "recurringConnections": [
      "mobility <-> identity",
      "privilege <-> geography",
      "language <-> belonging"
    ],
    "growthMoments": [
      {
        "date": "2025-02-14",
        "essay": "GGRB03 Essay 2",
        "insight": "thesis appeared in paragraph 1 for first time"
      }
    ],
    "blindSpots": [
      {
        "pattern": "avoids quantitative evidence",
        "confidence": 0.78,
        "observed": "4 of 4 essays had available data not used"
      }
    ],
    "genuineInterests": [
      {
        "topic": "postcolonial transit theory",
        "evidence": "3 unprompted voice notes, 2 unprompted questions",
        "coursework": false
      }
    ],
    "writingEvolution": [
      { "date": "2025-01-15", "metric": "thesisPosition", "value": 3 },
      { "date": "2025-02-14", "metric": "thesisPosition", "value": 1 },
      { "date": "2025-03-10", "metric": "thesisPosition", "value": 1 }
    ]
  },
  
  "professorProfiles": {
    "Oswin_GGRB03": {
      "rewards": [
        {
          "behavior": "personal anchor before theory",
          "confidence": 0.92,
          "sources": ["3 feedback sessions", "6 lecture mentions"]
        }
      ],
      "penalizes": [
        {
          "behavior": "thesis not in paragraph 1",
          "confidence": 0.88,
          "sources": ["2 feedback sessions with explicit comment"]
        }
      ],
      "style": "reflective personal essay",
      "markingWeight": { "argument": 0.4, "evidence": 0.3, "structure": 0.3 },
      "lastUpdated": "2025-03-10",
      "dataPoints": 11
    }
  },
  
  "behavioralPatterns": {
    "writing": {
      "bestDayTime": "Tuesday 9am-12pm",
      "bestLocation": "library",
      "averageWordsPerHour": {
        "library_weekday_morning": 420,
        "dorm_weekday_evening": 180,
        "dorm_weekend": 210
      }
    },
    "sleep": {
      "baselineHours": 6.8,
      "gradeCorrelation": 0.76
    },
    "canvasHabits": {
      "checkFrequency": "reactive",
      "deadlineBehavior": "last24hrs"
    }
  },
  
  "academicHistory": {
    "assignments": [
      {
        "id": "GGRB03_essay1",
        "title": "Place and Identity Essay",
        "submitted": "2025-01-30",
        "wordCount": 1247,
        "grade": "B",
        "professorFeedback": "Strong personal voice but thesis appears paragraph 3...",
        "reggieAssistedDraft": true,
        "lessonsLearned": ["thesis placement", "need more Massey"]
      }
    ],
    "gradeTrajectory": {
      "GGRB03": ["B", "B+", "A-"],
      "overall": [2.7, 3.2, 3.5, 3.74]
    },
    "submissionPatterns": {
      "averageHoursBeforeDeadline": 6.2,
      "latestSubmission": 0.5
    }
  }
}
```

---

## 📊 PART 6: THE 7 DATA PROFILES

### Profile 1: Student Behavioral Profile
```json
{
  "typing_speed_avg": 45,
  "pause_frequency": 0.8,
  "focus_duration_avg": 18,
  "device_preference": "desktop",
  "time_of_day_preference": "evening"
}
```

### Profile 2: Student Emotional Profile
```json
{
  "confidence_level_avg": 0.65,
  "stress_level_avg": 0.72,
  "motivation_drivers": ["good_grades", "feedback"]
}
```

### Profile 3: Student Knowledge Profile
```json
{
  "concepts_understood": [...],
  "learning_style": "visual",
  "knowledge_gaps": ["polynomial_factoring"]
}
```

### Profile 4: Professor Profile
```json
{
  "grading_philosophy": "Rewards clear thesis statements",
  "teaching_style": "socratic",
  "feedback_style": { "tone": "encouraging", "specificity": "high" }
}
```

### Profile 5: Course Profile
```json
{
  "title": "GGRB03: Urban Geography",
  "assignment_structure": { "participation": 0.10, "journals": 0.20 },
  "concept_map": { "nodes": [...], "edges": [...] }
}
```

### Profile 6: Student-Course Performance Profile
```json
{
  "current_grade": 78,
  "projected_grade": 82,
  "optimal_conditions": { "time_of_day": "evening", "device": "desktop" }
}
```

### Profile 7: Student Voice Profile
```json
{
  "writing_patterns": { "average_sentence_length": 18 },
  "grade_correlation": { "evidence_quality": 0.85 }
}
```

---

## 🛣️ PART 7: IMPLEMENTATION ROADMAP (5 PHASES)

### Phase 1 (Week 1-2): Brain Foundation

**Build:**
- Supabase auth + schema (all 13 tables)
- Neo4j setup (all node types and relationships)
- Pinecone setup (all namespaces)
- Redis setup (cache structure)
- Canvas Watcher agent (on-open polling)
- Student model (5 layers)

**Capture:**
- Canvas data (assignments, grades, syllabi)
- Behavioral signals (typing, focus, device, time)
- Emotional signals (self-report)
- Knowledge signals (concept understanding)
- Outcome signals (grades)

**Result:** Brain starts capturing on Day 1

---

### Phase 2 (Week 3-4): Brain Intelligence

**Build:**
- Writing Intelligence agent (real Claude API)
- Intellectual portrait layer (building from drafts)
- Professor Intelligence agent (from graded feedback)
- Behavioral analysis (patterns from signals)
- Emotional analysis (triggers, resilience)

**Analyze:**
- Every draft gets analyzed
- Every grade gets analyzed
- Every submission gets analyzed
- Every question gets analyzed

**Result:** Brain starts analyzing on Day 15

---

### Phase 3 (Week 5-6): Brain Synthesis & Learning

**Build:**
- Situation Synthesizer (real, cross-agent)
- Feedback loop (capture outcomes)
- Learning mechanism (update predictions)
- Confidence scoring (how accurate are we?)

**Synthesize:**
- Every situation gets synthesized
- Every recommendation gets tracked
- Every outcome gets recorded
- Every prediction gets validated

**Result:** Brain starts synthesizing and learning on Day 29

---

### Phase 4 (Week 7-8): Brain Optimization

**Build:**
- Lecture Recording (Whisper transcription)
- Behavioral patterns (optimal conditions)
- Real-time optimization (< 3 seconds)
- Caching strategy (Redis optimization)

**Optimize:**
- Every response < 3 seconds
- Every query optimized
- Every cache hit maximized
- Every database query minimized

**Result:** Brain is optimized on Day 43

---

### Phase 5 (Week 9+): Brain Scaling

**Build:**
- Multi-region deployment
- Privacy by architecture (GDPR)
- Data portability (export)
- Network effects (professor profiles compound)

**Scale:**
- Brain handles 1,000 users
- Brain handles 10,000 users
- Brain handles 100,000 users
- Brain is defensible moat

**Result:** Brain is unbreakable on Day 65+

---

## 🔧 PART 8: TECHNICAL SPECIFICATIONS

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      USER INTERFACE                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Reggie Ring  │  │ Orbital Dots │  │ Library      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                     AGENT LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Canvas Watcher│  │Writing Intel  │  │Lecture Record│     │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │Library Org   │  │Professor Intel│  │Situation Syn │     │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                    BRAIN LAYER                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Student Model (5 Layers, 7 Profiles)                │   │
│  │ ├─ Identity                                         │   │
│  │ ├─ Intellectual Portrait                           │   │
│  │ ├─ Professor Profiles                              │   │
│  │ ├─ Behavioral Patterns                             │   │
│  │ └─ Academic History                                │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                   DATA LAYER                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ PostgreSQL   │  │ Neo4j        │  │ Pinecone     │      │
│  │ (Supabase)   │  │ (Graph)      │  │ (Vectors)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐                                           │
│  │ Redis        │                                           │
│  │ (Cache)      │                                           │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
INPUTS                    AGENTS                   OUTPUTS

Canvas API         →  Canvas Watcher          →  change events
                                                  → Situation Synthesizer

Draft text         →  Writing Intelligence    →  grade signal
                                                  → ring state
                                                  → professor gap analysis

Lecture audio      →  Lecture Recording       →  transcript
                                                  → flagged moments
                                                  → ring pulses

Uploads            →  Library Organizer       →  classified entry
(photos, PDFs,                                    → intellectual portrait update
voice notes)                                      → professor profile update

Graded feedback    →  Professor Intelligence  →  updated professor profile
+ lecture                                         → writing intelligence context
transcripts

All agent outputs  →  Situation Synthesizer   →  situation brief
+ student model                                   → ring state recommendation
                                                  → CTA action
                                                  → ambient text beside ring
```

---

## 📈 PART 9: SUCCESS METRICS

### Engagement Metrics
- Daily active users (DAU)
- Weekly active users (WAU)
- Session duration
- Feature adoption rate

### Personalization Metrics
- Grade improvement (vs baseline)
- Concept mastery improvement
- Time to mastery (vs average)
- Recommendation acceptance rate

### Intelligence Metrics
- Prediction accuracy (grade prediction vs actual)
- Confidence score (how accurate are our predictions?)
- Cross-agent insight quality
- Feedback loop closure rate

### Retention Metrics
- 30-day retention rate
- 90-day retention rate
- Churn rate
- Lifetime value

### Moat Metrics
- Data accumulation rate (GB/month)
- Pattern discovery rate (new patterns/month)
- Intellectual portrait richness (data points/student)
- Competitor replication time (months)

---

## 🎯 CONCLUSION

### What We're Building

A **personal academic intelligence system** that:
- Captures behavioral, emotional, knowledge, context, and outcome signals
- Stores them in 4 databases optimized for different query patterns
- Analyzes them with 6 specialized agents
- Synthesizes cross-agent insights with Situation Synthesizer
- Personalizes responses in real-time (< 3 seconds)
- Learns from outcomes (feedback loop)
- Respects privacy (data deletion, portability)
- Creates a defensible moat (compounding intelligence)

### Why It's Different

**The moat is not the Canvas API, not the Claude wrapper, not the UI.**

**The moat is compounding intelligence — the system that knows you better after 10 sessions than any competitor starting fresh.**

### The Timeline

- **Day 1:** Brain starts capturing
- **Day 15:** Brain starts analyzing
- **Day 29:** Brain starts synthesizing and learning
- **Day 43:** Brain is optimized (< 3 seconds)
- **Day 65+:** Brain is unbreakable (defensible moat)

### The Cost

- PostgreSQL (Supabase): $25/month
- Neo4j: $100/month
- Pinecone: $100/month
- Redis: $50/month
- **Total: $275/month**

This is not expensive for a defensible moat. The cost of NOT having it is losing the moat.

### The Team

- **Aurora** (Technical co-founder) - Backend infrastructure
- **You** (Business founder) - Product vision, strategy
- **CTO candidate** - System architecture
- **PhD** - Situation Synthesizer spec, academic intelligence

### Ready to Build

Everything in this document is actionable. The architecture is sound. The timeline is realistic. The team can execute.

**Build the Brain. Build the moat. Build the defensible advantage.**

