# CTO Setup Guide - FschoolAI Backend

**Owned by FschoolAI Inc.**
**Complete handoff documentation for immediate takeover.**

---

## Quick Start (5 minutes)

### 1. Clone & Install
```bash
git clone https://github.com/vincentyang0702-pixel/FschoolAI-.git
cd FschoolAI-
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Fill in `.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-key
SUPABASE_SERVICE_ROLE_KEY=your-key
SUPABASE_DB_PASSWORD=your-password
CANVAS_API_URL=https://your-canvas.instructure.com
CANVAS_API_TOKEN=your-token
JWT_SECRET=generate-random-32-char-string
```

### 3. Start Server
```bash
npm run dev
```

Server runs on `http://localhost:5000`

---

## Database Access

### View Database (Supabase)

**Option 1: Supabase Dashboard**
1. Go to https://app.supabase.com
2. Select your project
3. Click "SQL Editor" to run queries
4. Click "Table Editor" to browse tables

**Option 2: Command Line**
```bash
# Connect to database
psql postgresql://postgres:$SUPABASE_DB_PASSWORD@db.vanzrpqmkmqgsbjdnfvj.supabase.co:5432/postgres

# List all tables
\dt

# View specific table
SELECT * FROM users LIMIT 10;

# View schema
\d users
```

**Option 3: View All Tables**
```sql
-- Get all tables with row counts
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Key Tables to Review

```sql
-- User data
SELECT COUNT(*) FROM users;

-- All signals collected
SELECT COUNT(*) FROM behavioral_signals;
SELECT COUNT(*) FROM emotional_signals;
SELECT COUNT(*) FROM knowledge_signals;

-- Brain state
SELECT * FROM brain_state LIMIT 5;

-- Canvas integration
SELECT COUNT(*) FROM canvas_courses;

-- Agent logs
SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 10;
```

---

## Documentation

All documentation is in the `/docs` directory and root:

| File | Purpose |
|------|---------|
| `DEPLOYMENT_GUIDE.md` | Production deployment steps |
| `ARCHITECTURE_ANALYSIS.md` | System architecture overview |
| `NEURO_AGI_DEPLOYMENT.md` | NeuroAGI platform setup |
| `docs/INDEX.md` | Master index of all docs |
| `docs/BRAIN_ARCHITECTURE.md` | 7-layer brain system |
| `docs/AGENT_SYSTEM.md` | 10 specialized agents |
| `docs/CANVAS_INTEGRATION.md` | Canvas LMS integration |

**View all docs:**
```bash
ls -la docs/
cat docs/INDEX.md
```

---

## Add Your Email

### 1. Update README
```bash
# Edit README.md
nano README.md
```

Add your email in the "Contact" section:
```markdown
## Contact

**CTO:** your.email@company.com
**Maintained by:** Your Name
```

### 2. Update package.json
```bash
nano package.json
```

Update author field:
```json
"author": "Your Name <your.email@company.com>",
```

### 3. Add to DEPLOYMENT_GUIDE.md
```bash
nano DEPLOYMENT_GUIDE.md
```

Add at the end:
```markdown
## CTO Contact

**Email:** your.email@company.com
**Slack:** @yourname
**GitHub:** @yourusername
```

### 4. Commit Changes
```bash
git add -A
git commit -m "Add CTO contact information"
git push origin main
```

---

## View All Documentation

### From GitHub
```
https://github.com/vincentyang0702-pixel/FschoolAI-
```

**Browse:**
- `/docs` - All documentation files
- `DEPLOYMENT_GUIDE.md` - Deployment instructions
- `ARCHITECTURE_ANALYSIS.md` - System design
- `README.md` - Project overview
- `package.json` - Dependencies and scripts

### From Command Line
```bash
# List all docs
find . -name "*.md" -type f | sort

# Search for specific topic
grep -r "Canvas" docs/
grep -r "Agent" docs/

# View specific doc
cat docs/BRAIN_ARCHITECTURE.md
```

---

## Database Schema Overview

**57 Tables across 7 Layers:**

### Layer 1: Core (2 tables)
- `users` - User profiles
- `sessions` - Active sessions

### Layer 2: Signals (5 tables)
- `behavioral_signals` - User actions
- `emotional_signals` - Emotional state
- `knowledge_signals` - Learning data
- `context_signals` - Environment
- `outcome_signals` - Results

### Layer 3: Knowledge (4 tables)
- `concepts` - Learning concepts
- `concept_relationships` - Connections
- `knowledge_graph` - Full graph
- `mastery_tracking` - Mastery levels

### Layer 4: Brain (4 tables)
- `brain_state` - Current state
- `insights` - Generated insights
- `predictions` - Predictions
- `interventions` - Recommendations

### Layer 5: Canvas (4 tables)
- `canvas_courses` - Courses
- `canvas_assignments` - Assignments
- `canvas_submissions` - Submissions
- `canvas_grades` - Grades

### Layer 6: Agents (3 tables)
- `agent_logs` - Execution logs
- `agent_responses` - Outputs
- `agent_feedback` - Feedback

### Layer 7: Blockchain (3 tables)
- `blockchain_events` - Events
- `data_proofs` - Proofs
- `audit_logs` - Audit trail

**View full schema:**
```bash
# From Supabase SQL Editor
SELECT * FROM information_schema.tables WHERE table_schema = 'public';

# From command line
psql -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
```

---

## API Endpoints

**Health Check:**
```bash
curl http://localhost:5000/health
```

**Brain System:**
```bash
curl -X POST http://localhost:5000/api/brain/process \
  -H "Content-Type: application/json" \
  -d '{"userId": "user1", "input": "help me study"}'
```

**Agents:**
```bash
curl -X POST http://localhost:5000/api/agents/study \
  -H "Content-Type: application/json" \
  -d '{"userId": "user1", "topic": "calculus"}'
```

**Signals:**
```bash
curl -X POST http://localhost:5000/api/signals/behavioral \
  -H "Content-Type: application/json" \
  -d '{"userId": "user1", "action": "opened_textbook"}'
```

---

## Common Tasks

### Verify Database Connection
```bash
npm run db:verify
```

### Run Type Checking
```bash
npm run type-check
```

### Build for Production
```bash
npm run build
npm start
```

### View Logs
```bash
tail -f .manus-logs/devserver.log
```

### Test Specific Agent
```bash
curl -X POST http://localhost:5000/api/agents/focus \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "action": "detect"}'
```

---

## Troubleshooting

### Database Connection Failed
```bash
# Check credentials
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Test connection
psql postgresql://postgres:$SUPABASE_DB_PASSWORD@db.vanzrpqmkmqgsbjdnfvj.supabase.co:5432/postgres -c "SELECT 1"
```

### Server Won't Start
```bash
# Check if port 5000 is in use
lsof -i :5000

# Kill process if needed
kill -9 <PID>

# Try different port
PORT=5001 npm run dev
```

### Missing Dependencies
```bash
# Reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## Next Steps

1. **Deploy to Production**
   - Choose hosting (Railway, Render, AWS, etc.)
   - Set up environment variables
   - Configure database backups

2. **Frontend Development**
   - Build React frontend
   - Connect to backend APIs
   - Implement real-time updates

3. **Monitoring**
   - Set up error tracking (Sentry)
   - Configure performance monitoring
   - Create alerting rules

4. **Scaling**
   - Add caching layer (Redis)
   - Implement message queue
   - Set up database replication

---

## Support

- **Questions?** Check `DEPLOYMENT_GUIDE.md`
- **Architecture?** Read `ARCHITECTURE_ANALYSIS.md`
- **Agents?** See `docs/AGENT_SYSTEM.md`
- **Canvas?** See `docs/CANVAS_INTEGRATION.md`

---

**Owner:** FschoolAI Inc.
**Backend Status:** ✅ Production Ready
**Last Updated:** May 21, 2026
**Version:** 1.0.0

**Ready for CTO takeover!**
