# CTO Setup Guide - FschoolAI Backend

**Owned by FschoolAI Inc.**
**CTO:** johannaresh@gmail.com
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

Fill in `.env` — **TWO databases required:**
```
# NeuroAGI Brain DB (intelligence layer)
BRAIN_SUPABASE_URL=https://qiolhlvqfzujnkwnymft.supabase.co
BRAIN_SUPABASE_SERVICE_KEY=<service_role key from NeuroAGI Brain project>

# FschoolAI Production DB (Canvas data)
FSCHOOL_SUPABASE_URL=https://wqgxpouhbwhwpzudrptp.supabase.co
FSCHOOL_SUPABASE_ANON_KEY=<anon key from FschoolAI Production project>

# Canvas OAuth
CANVAS_CLIENT_ID=<from Canvas developer keys>
CANVAS_CLIENT_SECRET=<from Canvas developer keys>
CANVAS_REDIRECT_URI=https://your-domain.com/api/canvas/callback

# AI
ANTHROPIC_API_KEY=<your Anthropic key>

# Server
JWT_SECRET=<run: openssl rand -hex 32>
PORT=5000
```

See `ENVIRONMENT_SETUP.md` for full details.

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
# Brain DB (intelligence)
psql postgresql://postgres:neuro-agi533@db.qiolhlvqfzujnkwnymft.supabase.co:5432/postgres

# FschoolAI Production DB (Canvas data)
# Connect via Supabase dashboard — FschoolAI Production project

# List all schemas and tables
\dn
\dt brain.*
\dt neuro.*
\dt agents.*
\dt fschool.*
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

### Key Tables to Review (run in NeuroAGI Brain DB)

```sql
-- Students (Brain persons)
SELECT COUNT(*) FROM neuro.persons;

-- All signals collected
SELECT COUNT(*) FROM brain.signals;

-- Chat sessions
SELECT COUNT(*) FROM agents.sessions;
SELECT COUNT(*) FROM agents.messages;

-- Patterns learned
SELECT COUNT(*) FROM neuro.patterns;

-- Context windows (pre-computed)
SELECT COUNT(*) FROM brain.context_window;
```

```sql
-- Run in FschoolAI Production DB
SELECT COUNT(*) FROM public.users;
SELECT COUNT(*) FROM fschool.courses;
SELECT COUNT(*) FROM fschool.assignments;
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

> ⚠️ **Updated June 4, 2026:** The old flat-table schema (behavioral_signals, brain_state, etc.) no longer exists. The actual schema uses 4 namespaced schemas. See `CURRENT_ARCHITECTURE.md` for the full table list.

**NeuroAGI Brain DB — 4 Schemas:**

| Schema | Purpose | Key Tables |
|---|---|---|
| `neuro.*` | Person identity & memory | `persons`, `memory`, `patterns`, `preferences` |
| `brain.*` | Intelligence & learning | `signals`, `reflections`, `reports`, `context_window` |
| `agents.*` | Chat & sessions | `sessions`, `messages`, `agent_registry` |
| `fschool.*` | Academic data mirror | `courses`, `assignments` |

**FschoolAI Production DB — 1 Schema:**

| Schema | Purpose | Key Tables |
|---|---|---|
| `public.*` | Canvas accounts | `users`, `canvas_oauth_tokens` |

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
