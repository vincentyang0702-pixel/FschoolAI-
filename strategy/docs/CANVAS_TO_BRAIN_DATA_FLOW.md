# Canvas API → Brain Data Flow

## Complete Data Pipeline

```
Canvas LMS
    ↓
Canvas OAuth Token
    ↓
Canvas API Client (canvas-api.ts)
    ├─ GET /courses
    ├─ GET /assignments
    ├─ GET /submissions
    └─ GET /grades
    ↓
Canvas Sync Service (canvas-sync.ts)
    ├─ syncCourses() → courses table
    ├─ syncAssignments() → assignments table
    ├─ syncSubmissions() → submissions table
    └─ syncGrades() → grades table
    ↓
Brain Compounding Engine (brain-compounding.ts)
    ├─ processSignal() - Converts Canvas data to 8 neural strings
    │   ├─ Behavioral signals (study patterns, submission times)
    │   ├─ Emotional signals (stress from grades, motivation)
    │   ├─ Knowledge signals (topics learned, concepts mastered)
    │   ├─ Context signals (course, assignment, deadline)
    │   ├─ Outcome signals (grades, scores, performance)
    │   ├─ Temporal signals (when learning happens)
    │   ├─ Social signals (peer comparison, collaboration)
    │   └─ Biometric signals (stress levels, focus duration)
    ↓
Brain Database (57 tables in Supabase)
    ├─ neural_strings (8 signal types)
    ├─ signal_events (individual signals)
    ├─ knowledge_graph (concepts and relationships)
    ├─ learning_history (study sessions)
    ├─ performance_metrics (grades, scores)
    ├─ brain_state (current state)
    ├─ agent_responses (what agents recommended)
    └─ outcomes (results of recommendations)
    ↓
Agent Orchestrator (agent-orchestrator.ts)
    ├─ Reads brain data
    ├─ Selects best agents
    ├─ Generates recommendations
    └─ Stores feedback
    ↓
Frontend Dashboard
    ├─ Brain visualization
    ├─ Learning history
    ├─ Recommendations
    └─ Performance insights
```

---

## Step-by-Step Data Flow

### 1. Canvas OAuth Connection
```
User clicks "Connect Canvas"
    ↓
GET /api/canvas/auth
    ↓
Redirect to Canvas OAuth
    ↓
User authorizes FschoolAI
    ↓
Canvas redirects to /api/canvas/callback with code
    ↓
Exchange code for access token
    ↓
Store token in canvas_oauth_tokens table
```

### 2. Canvas Data Sync
```
POST /api/canvas/sync
    ↓
Get Canvas token from database
    ↓
Initialize Canvas API Client
    ↓
Fetch all courses from Canvas
    ↓
For each course:
    ├─ Fetch assignments
    ├─ Fetch submissions
    ├─ Fetch grades
    └─ Store in database
```

### 3. Canvas Data → Brain Signals
```
Canvas Grade: 85/100 on Assignment "Calculus Midterm"
    ↓
Brain Compounding Engine processes:
    ├─ Outcome Signal: score=85, maxScore=100, performance=0.85
    ├─ Knowledge Signal: topic="calculus", mastery=0.85
    ├─ Temporal Signal: timestamp=2026-05-21, dayOfWeek=wednesday
    ├─ Context Signal: course="MATH101", assignment="Midterm"
    ├─ Emotional Signal: confidence_boost=+0.15 (good grade)
    └─ Behavioral Signal: study_hours_before=8, submission_early=true
    ↓
All signals stored in neural_strings table
    ↓
Knowledge graph updated: calculus node confidence +0.15
    ↓
Performance metrics updated: avg_score=85
```

### 4. Brain → Agent Selection
```
Agent Orchestrator reads brain state
    ↓
Detects: "Student got 85 on Calculus Midterm"
    ↓
Selects agents:
    ├─ Performance Tracker: "Great job! You improved 5 points"
    ├─ Synthesis Expert: "Connect calculus to physics concepts"
    └─ Recommendation Engine: "Next: Study derivatives"
    ↓
Agents generate responses
    ↓
Responses stored in agent_responses table
    ↓
Send to frontend
```

---

## Database Tables Involved

### Canvas Integration Tables
```sql
-- Canvas OAuth tokens
canvas_oauth_tokens
├─ user_id
├─ canvas_instance_url
├─ access_token
├─ refresh_token
├─ expires_at
└─ updated_at

-- Canvas sync logs
canvas_sync_logs
├─ user_id
├─ product (fschoolai, reggie, etc.)
├─ status (success, error)
├─ error_message
└─ synced_at
```

### Brain Storage Tables (57 total)
```sql
-- Neural Strings (8 signal types)
neural_strings
├─ id
├─ user_id
├─ signal_type (behavioral, emotional, knowledge, context, outcome, temporal, social, biometric)
├─ value (0-1 confidence)
├─ metadata (JSON)
└─ created_at

-- Signal Events (individual signals)
signal_events
├─ id
├─ user_id
├─ neural_string_id
├─ event_type
├─ data (JSON)
└─ timestamp

-- Knowledge Graph
knowledge_graph_nodes
├─ id
├─ user_id
├─ concept_name
├─ mastery_level (0-1)
├─ last_studied
└─ connections (array of related concepts)

knowledge_graph_edges
├─ id
├─ source_node_id
├─ target_node_id
├─ relationship_type
├─ strength (0-1)
└─ created_at

-- Learning History
learning_sessions
├─ id
├─ user_id
├─ course_id
├─ start_time
├─ end_time
├─ topics_covered
├─ effectiveness_score
└─ notes

-- Performance Metrics
performance_metrics
├─ id
├─ user_id
├─ course_id
├─ assignment_id
├─ score
├─ max_score
├─ submitted_at
├─ graded_at
└─ feedback

-- Brain State
brain_state
├─ id
├─ user_id
├─ current_focus_area
├─ motivation_level (0-1)
├─ stress_level (0-1)
├─ energy_level (0-1)
├─ readiness_to_learn (0-1)
└─ last_updated

-- Agent Responses
agent_responses
├─ id
├─ user_id
├─ agent_id
├─ agent_name
├─ request
├─ response
├─ confidence (0-1)
├─ was_helpful (boolean)
└─ timestamp

-- Outcomes
outcomes
├─ id
├─ user_id
├─ agent_response_id
├─ outcome_type (grade_improvement, concept_mastery, etc.)
├─ value
├─ timestamp
└─ feedback
```

---

## Code Flow: Canvas → Brain

### 1. Canvas Sync Triggers Brain Processing

**File: server/services/canvas-sync.ts**
```typescript
async syncCanvasData(userId: string, product: string = 'fschoolai'): Promise<void> {
  // 1. Get Canvas token
  const token = await this.getCanvasToken(userId);
  
  // 2. Initialize Canvas client
  const canvasClient = new CanvasAPIClient({
    instanceUrl: token.canvas_instance_url,
    accessToken: token.access_token,
  });
  
  // 3. Fetch Canvas data
  const courses = await canvasClient.getCourses();
  const assignments = await canvasClient.getAssignments(courseId);
  const grades = await canvasClient.getGrades(courseId);
  
  // 4. For each grade, process as brain signal
  for (const grade of grades) {
    await this.brainEngine.processSignal({
      type: 'outcome',  // ← This is a neural string type
      userId,
      data: {
        assignmentId: grade.assignment_id,
        score: grade.score,
        maxScore: 100,
        submittedAt: grade.submitted_at,
      },
    });
  }
}
```

### 2. Brain Compounding Processes Signals

**File: server/services/brain-compounding.ts**
```typescript
async processSignal(signal: Signal): Promise<void> {
  // 1. Store raw signal
  const { data: storedSignal } = await this.supabase
    .from('signal_events')
    .insert({
      user_id: signal.userId,
      signal_type: signal.type,
      data: signal.data,
      timestamp: new Date(),
    });
  
  // 2. Update neural string
  const neuralString = await this.updateNeuralString(
    signal.userId,
    signal.type,
    signal.data
  );
  
  // 3. Update knowledge graph
  await this.updateKnowledgeGraph(signal.userId, signal.data);
  
  // 4. Update brain state
  await this.updateBrainState(signal.userId);
  
  // 5. Trigger agent selection
  await this.triggerAgentSelection(signal.userId);
}
```

### 3. Agent Orchestrator Uses Brain Data

**File: server/services/agent-orchestrator.ts**
```typescript
async orchestrate(request: AgentRequest): Promise<OrchestratorResult> {
  // 1. Read brain state
  const brainState = await this.supabase
    .from('brain_state')
    .select('*')
    .eq('user_id', request.userId)
    .single();
  
  // 2. Read recent signals
  const recentSignals = await this.supabase
    .from('signal_events')
    .select('*')
    .eq('user_id', request.userId)
    .order('timestamp', { ascending: false })
    .limit(100);
  
  // 3. Detect intent
  const intent = this.detectIntent(request.message, brainState, recentSignals);
  
  // 4. Select agents based on brain state
  const selectedAgents = this.selectAgents(intent, brainState);
  
  // 5. Execute agents
  const responses = await Promise.all(
    selectedAgents.map(agent => this.executeAgent(agent, brainState))
  );
  
  // 6. Store responses in brain
  for (const response of responses) {
    await this.supabase.from('agent_responses').insert({
      user_id: request.userId,
      agent_id: response.agentId,
      response: response.content,
      confidence: response.confidence,
      timestamp: new Date(),
    });
  }
  
  return { responses, synthesizedResponse };
}
```

---

## Real Example: Student Gets Grade

### Canvas Event
```
Student submits Calculus assignment
Instructor grades it: 85/100
Canvas notifies FschoolAI
```

### Data Flow
```
1. Canvas Sync Service fetches grade
   → grades table: { assignment_id: 123, score: 85, max_score: 100 }

2. Brain Compounding processes grade
   → signal_events: { signal_type: 'outcome', data: { score: 85 } }
   → neural_strings: { type: 'outcome', value: 0.85 }
   → knowledge_graph_nodes: { concept: 'calculus', mastery: 0.85 }
   → brain_state: { motivation_level: 0.9, stress_level: 0.2 }

3. Agent Orchestrator detects opportunity
   → Reads brain_state: motivation is high, stress is low
   → Selects agents: Performance Tracker, Synthesis Expert, Recommendation Engine
   
4. Agents generate responses
   → Performance Tracker: "Great job! 85 is a solid score. You improved from last time."
   → Synthesis Expert: "This calculus concept connects to physics. Want to explore?"
   → Recommendation Engine: "Next: Study derivatives for the final exam"
   
5. Responses stored in brain
   → agent_responses: { agent_id: 'perf-1', response: '...', confidence: 0.92 }
   → outcomes: { outcome_type: 'grade_improvement', value: 85 }

6. Frontend displays
   → Brain visualization updates
   → Recommendations shown to student
   → Learning path adjusted
```

---

## Summary

The complete data pipeline is:

**Canvas LMS** 
  → **Canvas API** 
    → **Canvas Sync Service** 
      → **Brain Compounding Engine** 
        → **Brain Database (57 tables)** 
          → **Agent Orchestrator** 
            → **Frontend Dashboard**

Every piece of Canvas data becomes a neural string in the brain, which then informs agent selection and response generation.
