# NeuroAGI Backend Deployment Guide for CTO

## Overview

The NeuroAGI backend has been built with a complete 7-layer architecture:

1. **Event Stream** - Real-time data capture from Canvas
2. **Pattern Recognition** - Identify patterns in student behavior
3. **Causal Inference** - Understand WHY patterns exist
4. **Prediction Engine** - Forecast student needs
5. **Intervention Engine** - Decide WHEN and HOW to help
6. **Agent Orchestrator** - Execute interventions with best agent
7. **Blockchain Agent Evolution** - Track and evolve agents automatically

---

## What's Been Built

### New Services (in `/server/services/`)

| Service | Purpose | Status |
|---------|---------|--------|
| `causal-inference.ts` | Understand root causes | ✅ Built |
| `prediction-engine.ts` | Forecast student needs | ✅ Built |
| `intervention-engine.ts` | Decide when/how to help | ✅ Built |
| `agent-evolution.ts` | Track & evolve agents | ✅ Built |
| `event-stream.ts` | Real-time data capture | ✅ Built |
| `pattern-recognition.ts` | Identify patterns | ✅ Built |

### New Routes (in `/server/routes/`)

| Route | Purpose | Status |
|-------|---------|--------|
| `/api/canvas/*` | Canvas LMS integration | ✅ Built |
| `/api/agents/*` | Agent endpoints | ✅ Built |

### New Agents (in `/server/agents/`)

| Agent | Purpose | Status |
|-------|---------|--------|
| Study Agent | Explain concepts | ✅ Built |
| Focus Agent | Maintain concentration | ✅ Built |
| Motivation Agent | Provide encouragement | ✅ Built |
| Performance Agent | Track progress | ✅ Built |
| Problem Solver | Guide solutions | ✅ Built |
| Synthesis Agent | Connect concepts | ✅ Built |
| Personalization Agent | Adapt to learning style | ✅ Built |
| Reflection Agent | Consolidate learning | ✅ Built |
| Recommendation Agent | Suggest next steps | ✅ Built |
| Escalation Agent | Know when to escalate | ✅ Built |

---

## Database Schema

All 57 tables are already created in Supabase:

```
User & Profile (5 tables)
├─ students
├─ student_profiles
├─ learning_preferences
├─ academic_history
└─ student_goals

Neural Strings / Signal Capture (8 tables)
├─ behavioral_signals
├─ emotional_signals
├─ biometric_signals
├─ context_signals
├─ outcome_signals
├─ knowledge_signals
├─ facial_expression_signals
└─ voice_analysis_signals

Knowledge Graph (6 tables)
├─ concepts
├─ concept_relationships
├─ knowledge_graph_nodes
├─ knowledge_graph_edges
├─ topic_hierarchy
└─ skill_taxonomy

Learning History (8 tables)
├─ study_sessions
├─ assignments
├─ submissions
├─ quiz_attempts
├─ reading_history
├─ video_watch_history
├─ note_taking
└─ learning_activities

Performance Tracking (6 tables)
├─ grades
├─ performance_metrics
├─ topic_performance
├─ skill_mastery
├─ progress_tracking
└─ benchmark_comparisons

Brain State (5 tables)
├─ brain_state
├─ brain_snapshots
├─ brain_evolution
├─ neural_patterns
└─ brain_insights

Agent Management (6 tables)
├─ agents
├─ agent_responses
├─ agent_metrics
├─ agent_evolution
├─ agent_feedback
└─ agent_performance

Canvas Integration (3 tables)
├─ canvas_courses
├─ canvas_assignments
└─ canvas_grades

Recommendations (4 tables)
├─ recommendations
├─ personalized_paths
├─ learning_resources
└─ adaptive_content

Additional (4 tables)
├─ interventions
├─ intervention_outcomes
├─ predictions
└─ feedback_loops
```

---

## Deployment Steps

### Step 1: Environment Setup

```bash
# Clone the repository
git clone https://github.com/vincentyang0702-pixel/FschoolAI-.git
cd FschoolAI-

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Required env vars:
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key
CANVAS_API_URL=your_canvas_url
CANVAS_API_TOKEN=your_canvas_token
```

### Step 2: Database Setup

```bash
# Run migrations (already created)
npm run db:migrate

# Seed initial agents
npm run db:seed:agents

# Verify schema
npm run db:verify
```

### Step 3: Backend Server

```bash
# Start development server
npm run dev

# Or build for production
npm run build
npm start
```

### Step 4: API Endpoints

The backend exposes these endpoints:

```
# Canvas Integration
GET  /api/canvas/auth              - Generate OAuth URL
GET  /api/canvas/callback          - Handle OAuth callback
POST /api/canvas/sync              - Manual sync trigger
GET  /api/canvas/courses           - Fetch all courses
GET  /api/canvas/assignments/:id   - Fetch assignments
GET  /api/canvas/grades/:id        - Fetch grades
GET  /api/canvas/status            - Check connection status

# Agents
GET  /api/agents                   - List all agents
POST /api/agents/study             - Request study help
POST /api/agents/focus             - Get focus assistance
POST /api/agents/motivation        - Get motivation boost
GET  /api/agents/performance       - Get performance analysis
POST /api/agents/problem-solver    - Get problem-solving help
POST /api/agents/synthesis         - Connect concepts
POST /api/agents/personalization   - Get personalized path
POST /api/agents/reflection        - Consolidate learning
GET  /api/agents/recommendation    - Get recommendations
POST /api/agents/escalation        - Check escalation need

# Predictions
POST /api/predictions/student      - Predict student outcome
GET  /api/predictions/risk         - Get risk profile

# Interventions
POST /api/interventions/decide     - Decide intervention
POST /api/interventions/send       - Send intervention
POST /api/interventions/outcome    - Track outcome

# Agent Evolution
GET  /api/evolution/metrics        - Get agent metrics
POST /api/evolution/run            - Run evolution cycle
```

---

## Key Features

### 1. Causal Inference
- Understands WHY patterns exist
- Identifies root causes (not just correlation)
- Detects confounding variables
- Maps causality chains

### 2. Prediction Engine
- Forecasts failures before they happen
- Calculates risk profiles
- Predicts procrastination
- Identifies knowledge gaps
- Predicts motivation drops

### 3. Intervention Engine
- Agent Race: Multiple agents compete
- Best agent selected based on student profile
- Proactive interventions sent
- Outcomes tracked for learning

### 4. Agent Evolution
- Tracks agent performance metrics
- Automatically cuts underperforming agents
- Upgrades high-performing agents
- Merges similar agents
- Kills dead agents
- Records all on blockchain

---

## Monitoring & Maintenance

### Agent Performance Dashboard

Monitor agent metrics:
- Success rate
- Selection rate
- User satisfaction
- Response time
- Cost
- Trend

### Blockchain Records

All decisions are recorded immutably:
- Agent selections
- Intervention outcomes
- Evolution actions
- Performance metrics

### Logs

Check logs for:
- `/logs/server.log` - Server events
- `/logs/agents.log` - Agent activity
- `/logs/predictions.log` - Prediction results
- `/logs/interventions.log` - Intervention tracking

---

## Next Steps for CTO

1. **Deploy to production** (AWS, GCP, Azure, or Vercel)
2. **Set up monitoring** (Sentry, DataDog, or similar)
3. **Configure Canvas OAuth** (get Canvas API credentials)
4. **Test with real students** (start with pilot group)
5. **Monitor agent performance** (weekly reviews)
6. **Iterate on agents** (based on performance data)
7. **Scale to all students** (once validated)

---

## Support

For questions or issues:
- Check GitHub issues: https://github.com/vincentyang0702-pixel/FschoolAI-/issues
- Review code comments in each service
- Check Supabase logs for database issues

---

## Architecture Diagram

```
Canvas LMS
    ↓
Event Stream (real-time capture)
    ↓
Pattern Recognition (identify patterns)
    ↓
Causal Inference (understand WHY)
    ↓
Prediction Engine (forecast future)
    ↓
Intervention Engine (decide WHEN & HOW)
    ├─ Agent Race (multiple agents compete)
    └─ Best Agent Selected
    ↓
Agent Orchestrator (execute intervention)
    ↓
Proactive Message to Student
    ↓
Student Response
    ↓
Outcome Tracking
    ↓
Blockchain Recording (immutable)
    ↓
Agent Evolution (improve agents)
```

---

## Success Metrics

Track these metrics to measure success:

- **Student Engagement**: % of students using system
- **Intervention Success**: % of interventions that help
- **Grade Improvement**: Average grade increase
- **Retention**: % of students continuing to use
- **Agent Performance**: Success rate by agent
- **Prediction Accuracy**: % of predictions correct

---

Good luck with the deployment! 🚀
