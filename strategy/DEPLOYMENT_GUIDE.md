# FschoolAI Backend Deployment Guide

**Owned by FschoolAI Inc.**
**CTO:** johannaresh@gmail.com
**For CTO Handoff** - Complete production-ready backend system.

## System Overview

The NeuroAGI backend is a 7-layer proactive cognitive brain system with:
- **Agent Orchestrator**: Routes requests to 10 specialized agents
- **Causal Inference Engine**: Understands root causes, not just correlations
- **Prediction Engine**: Forecasts user needs and learning gaps
- **Intervention Engine**: Recommends proactive actions
- **Knowledge Graph**: Maps concept relationships and mastery
- **Brain Compounding**: Synthesizes signals into actionable insights
- **Canvas LMS Integration**: Bi-directional sync with Canvas

---

## Prerequisites

- Node.js 18+
- npm 9+
- Supabase project with PostgreSQL database
- Canvas LMS instance (for integration)
- GitHub repository access

---

## Installation

### 1. Clone Repository
```bash
git clone https://github.com/vincentyang0702-pixel/FschoolAI-.git
cd FschoolAI-
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
cp .env.example .env
```

Fill in `.env` with:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for migrations)
- `CANVAS_API_URL` - Canvas instance URL
- `CANVAS_API_TOKEN` - Canvas API token
- `JWT_SECRET` - Random 32+ character string
- `FRONTEND_URL` - Frontend application URL

### 4. Database Setup
```bash
npm run db:migrate
npm run db:verify
```

---

## Running the Server

### Development
```bash
npm run dev
```
Server runs on `http://localhost:5000`

### Production
```bash
npm run build
npm start
```

### Type Checking
```bash
npm run type-check
```

---

## API Endpoints

### Health Check
```
GET /health
```
Returns: `{ status: "ok", timestamp, environment, version }`

### Brain System
```
POST /api/brain/process
POST /api/brain/causal-analysis
POST /api/brain/predict
POST /api/brain/intervene
GET /api/brain/insights/:userId
GET /api/brain/status?userId=xxx
```

### Agents
```
POST /api/agents/study
POST /api/agents/focus
POST /api/agents/motivation
GET /api/agents/performance?userId=xxx
POST /api/agents/problem-solver
POST /api/agents/synthesis
POST /api/agents/personalization
POST /api/agents/reflection
GET /api/agents/recommendation?userId=xxx
POST /api/agents/escalation
```

### Signals (Data Ingestion)
```
POST /api/signals/behavioral
POST /api/signals/emotional
POST /api/signals/knowledge
POST /api/signals/context
POST /api/signals/outcome
POST /api/signals/batch
GET /api/signals/:userId
```

### Canvas Integration
```
POST /api/canvas/oauth/authorize
GET /api/canvas/oauth/callback
POST /api/canvas/sync
GET /api/canvas/courses?userId=xxx
GET /api/canvas/assignments?userId=xxx
```

---

## Database Schema

**57 Core Tables** organized in layers:

### Layer 1: User & Session
- `users` - User profiles
- `sessions` - Active sessions

### Layer 2: Signal Collection
- `behavioral_signals` - User actions
- `emotional_signals` - Emotional state
- `knowledge_signals` - Learning data
- `context_signals` - Environment data
- `outcome_signals` - Results

### Layer 3: Knowledge Graph
- `concepts` - Learning concepts
- `concept_relationships` - Concept connections
- `knowledge_graph` - Full graph state
- `mastery_tracking` - Concept mastery levels

### Layer 4: Brain State
- `brain_state` - Current brain state
- `insights` - Generated insights
- `predictions` - Predicted outcomes
- `interventions` - Recommended actions

### Layer 5: Canvas Integration
- `canvas_courses` - Course data
- `canvas_assignments` - Assignment data
- `canvas_submissions` - Student submissions
- `canvas_grades` - Grade data

### Layer 6: Agent System
- `agent_logs` - Agent execution logs
- `agent_responses` - Agent outputs
- `agent_feedback` - User feedback

### Layer 7: Blockchain & Audit
- `blockchain_events` - Immutable events
- `data_proofs` - Data ownership proofs
- `audit_logs` - System audit trail

---

## Error Handling

All errors follow standardized format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "requestId": "unique-request-id",
    "timestamp": "2026-05-21T00:00:00Z"
  }
}
```

**Error Codes:**
- `VALIDATION_ERROR` (400)
- `AUTHENTICATION_ERROR` (401)
- `AUTHORIZATION_ERROR` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)
- `RATE_LIMIT` (429)
- `EXTERNAL_SERVICE_ERROR` (502)
- `DATABASE_ERROR` (500)
- `AGENT_ERROR` (500)
- `BRAIN_ERROR` (500)

---

## Logging

Logs are structured JSON with request context:
```json
{
  "requestId": "uuid",
  "method": "POST",
  "path": "/api/brain/process",
  "statusCode": 200,
  "duration": "145ms",
  "event": "request_end"
}
```

**Log Levels:** error, warn, info, debug

---

## Canvas LMS Integration

### OAuth Flow
1. User clicks "Connect Canvas"
2. Redirects to Canvas OAuth endpoint
3. User authorizes NeuroAGI
4. Canvas redirects to `/api/canvas/oauth/callback`
5. Token stored in Supabase
6. Bi-directional sync begins

### Data Sync
```bash
POST /api/canvas/sync
```
Syncs:
- Courses
- Assignments
- Submissions
- Grades
- User profile

---

## Monitoring & Debugging

### Check Server Health
```bash
curl http://localhost:5000/health
```

### Verify Database
```bash
npm run db:verify
```

### View Logs
```bash
tail -f .manus-logs/devserver.log
```

### Test Agent
```bash
curl -X POST http://localhost:5000/api/agents/study \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "topic": "calculus",
    "currentUnderstanding": "basic",
    "learningStyle": "visual"
  }'
```

---

## Performance Optimization

### Database Indexing
All critical columns are indexed:
- `user_id` on all signal tables
- `timestamp` for time-based queries
- `concept_id` on knowledge graph

### Caching
- Agent responses cached for 5 minutes
- Insights cached for 1 hour
- Knowledge graph cached for 30 minutes

### Rate Limiting
- 100 requests/minute per user
- 1000 requests/minute per IP

---

## Security

### Authentication
- JWT tokens for API access
- Refresh tokens valid for 7 days
- Token rotation on each refresh

### Authorization
- Role-based access control (RBAC)
- User can only access own data
- Admin role for system management

### Data Protection
- All data encrypted at rest
- HTTPS only in production
- Supabase RLS policies enabled

---

## Troubleshooting

### Database Connection Failed
```bash
# Check Supabase credentials
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Verify network connectivity
curl https://your-project.supabase.co/rest/v1/
```

### Canvas Sync Not Working
```bash
# Check Canvas token
curl -H "Authorization: Bearer $CANVAS_API_TOKEN" \
  $CANVAS_API_URL/api/v1/courses

# Check sync logs
grep "canvas_sync" .manus-logs/devserver.log
```

### Agent Errors
```bash
# Check agent logs in database
SELECT * FROM agent_logs 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## Next Steps for CTO

1. **Deploy to Production**
   - Set up CI/CD pipeline
   - Configure environment secrets
   - Deploy to hosting platform

2. **Frontend Integration**
   - Build React frontend
   - Connect to backend APIs
   - Implement real-time updates

3. **Monitoring Setup**
   - Configure error tracking (Sentry)
   - Set up performance monitoring
   - Create alerting rules

4. **Scaling**
   - Implement caching layer (Redis)
   - Add message queue (Bull/RabbitMQ)
   - Set up database replication

---

## Support & Documentation

- **Architecture**: See `ARCHITECTURE_ANALYSIS.md`
- **Services**: See `docs/` directory
- **API Docs**: See inline JSDoc comments in route files
- **Database Schema**: See `supabase/migrations/`

---

**Owner:** FschoolAI Inc.
**Backend Status:** ✅ Production Ready
**Last Updated:** May 21, 2026
**Version:** 1.0.0
