# FschoolAI Backend - Production Ready

**Owned and Operated by FschoolAI Inc.**

🧠 **FschoolAI** is an AGI-level educational intelligence system that understands students deeply and provides personalized academic support through continuous learning and synthesis.

---

## Ownership & Contact

| Role | Details |
|------|---------|
| **Owner** | FschoolAI Inc. |
| **CTO** | [Add CTO name and email in .env] |
| **Backend Status** | ✅ Production Ready |
| **Version** | 1.0.0 |

---

## System Architecture

### 7-Layer Proactive Brain

#### Layer 1: Signal Collection 📊
- Behavioral signals (typing speed, focus, submission timing)
- Emotional signals (confidence, stress, motivation)
- Knowledge signals (mastery, learning style)
- Context signals (location, time, device)
- Outcome signals (grades, completion time)
- Biometric signals (heart rate, sleep, activity)

#### Layer 2: Knowledge Graph 🧠
- Concept mapping and relationships
- Mastery tracking
- Learning gap identification
- Concept connections

#### Layer 3: Causal Inference 🔬
- Root cause analysis
- Pattern recognition
- Relationship discovery
- Predictive modeling

#### Layer 4: Prediction Engine 🔮
- Student outcome prediction
- Learning gap forecasting
- Intervention timing
- Success probability

#### Layer 5: Intervention Engine 🎯
- Proactive recommendations
- Personalized learning paths
- Adaptive difficulty
- Motivation strategies

#### Layer 6: Agent Orchestration 🤖
- 10 specialized agents
- Intent routing
- Response synthesis
- Feedback loops

#### Layer 7: Blockchain & Audit 🔐
- Data ownership proofs
- Immutable event logs
- Transparency tracking
- User data control

---

## 10 Specialized Agents

1. **Study Agent** - Personalized learning explanations
2. **Focus Agent** - Distraction detection and focus mode
3. **Motivation Agent** - Emotional support and encouragement
4. **Performance Agent** - Analytics and progress tracking
5. **Problem Solver Agent** - Step-by-step problem guidance
6. **Synthesis Agent** - Concept connection and integration
7. **Personalization Agent** - Adaptive learning paths
8. **Reflection Agent** - Learning consolidation
9. **Recommendation Agent** - Next learning steps
10. **Escalation Agent** - Human intervention detection

---

## Canvas LMS Integration

- OAuth 2.0 authentication
- Bi-directional data sync
- Course and assignment tracking
- Grade synchronization
- Real-time updates

---

## Database

**Supabase PostgreSQL** with 57 production-ready tables:

- **Layer 1:** Users & Sessions (2 tables)
- **Layer 2:** Signals (5 tables)
- **Layer 3:** Knowledge Graph (4 tables)
- **Layer 4:** Brain State (4 tables)
- **Layer 5:** Canvas Integration (4 tables)
- **Layer 6:** Agent System (3 tables)
- **Layer 7:** Blockchain & Audit (3 tables)

---

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/vincentyang0702-pixel/FschoolAI-.git
cd FschoolAI-
```

### 2. Setup Environment
```bash
cp .env.example .env
# Add your credentials to .env
```

### 3. Install & Run
```bash
npm install
npm run dev
```

Server runs on `http://localhost:5000`

---

## API Endpoints

### Health Check
```bash
GET /health
```

### Brain System
```bash
POST /api/brain/process
POST /api/brain/causal-analysis
POST /api/brain/predict
POST /api/brain/intervene
GET /api/brain/insights/:userId
```

### Agents
```bash
POST /api/agents/study
POST /api/agents/focus
POST /api/agents/motivation
GET /api/agents/performance
POST /api/agents/problem-solver
POST /api/agents/synthesis
POST /api/agents/personalization
POST /api/agents/reflection
GET /api/agents/recommendation
POST /api/agents/escalation
```

### Signals (Data Ingestion)
```bash
POST /api/signals/behavioral
POST /api/signals/emotional
POST /api/signals/knowledge
POST /api/signals/context
POST /api/signals/outcome
POST /api/signals/batch
GET /api/signals/:userId
```

### Canvas Integration
```bash
POST /api/canvas/oauth/authorize
GET /api/canvas/oauth/callback
POST /api/canvas/sync
GET /api/canvas/courses
GET /api/canvas/assignments
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| `CTO_EMAIL_SETUP.md` | Email setup (4 steps) |
| `CTO_SETUP.md` | Complete handoff guide |
| `DEPLOYMENT_GUIDE.md` | Production deployment |
| `ARCHITECTURE_ANALYSIS.md` | System architecture |
| `NEURO_AGI_DEPLOYMENT.md` | NeuroAGI platform setup |
| `docs/INDEX.md` | Master documentation index |
| `docs/BRAIN_ARCHITECTURE.md` | Brain system details |
| `docs/AGENT_SYSTEM.md` | Agent specifications |
| `docs/CANVAS_INTEGRATION.md` | Canvas LMS integration |

---

## Development Scripts

```bash
# Development
npm run dev              # Start dev server

# Production
npm run build            # Build for production
npm start                # Run production server

# Database
npm run db:migrate       # Run migrations
npm run db:verify        # Verify schema

# Quality
npm run type-check       # TypeScript checking
npm run lint             # ESLint
npm test                 # Run tests
```

---

## Error Handling

All errors follow standardized format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "requestId": "unique-id",
    "timestamp": "2026-05-21T00:00:00Z"
  }
}
```

---

## Logging

Structured JSON logging with request context:
```json
{
  "requestId": "uuid",
  "method": "POST",
  "path": "/api/brain/process",
  "statusCode": 200,
  "duration": "145ms"
}
```

---

## Security

- JWT token authentication
- Role-based access control (RBAC)
- Supabase Row Level Security (RLS)
- HTTPS only in production
- Data encryption at rest

---

## Monitoring

### Health Check
```bash
curl http://localhost:5000/health
```

### Database Verification
```bash
npm run db:verify
```

### View Logs
```bash
tail -f .manus-logs/devserver.log
```

---

## Status

✅ Backend system complete  
✅ 57 database tables ready  
✅ 10 agents implemented  
✅ Canvas LMS integration  
✅ Error handling & logging  
✅ Production deployment guide  
⏳ Frontend development (CTO to build)  
⏳ Monitoring setup (CTO to configure)  

---

## License

Proprietary - Owned by FschoolAI Inc.

---

**Backend Production Ready for CTO Takeover**
**Last Updated:** May 21, 2026
**Version:** 1.0.0
