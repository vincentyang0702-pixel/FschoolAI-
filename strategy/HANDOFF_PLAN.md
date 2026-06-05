# FschoolAI — Handoff Plan for CFO & Tech Intern

**Prepared:** June 4, 2026  
**Prepared by:** Vincent Yang (Founder)  
**For:** CFO + Tech Intern  
**Goal:** Launch FschoolAI to students. NeuroAGI hardware comes later.

---

## The One Rule That Governs Everything

> **FschoolAI owns the product. NeuroAGI Brain owns the person.**

FschoolAI never stores intelligence — it reads intelligence from the Brain and writes signals back.  
The Brain never stores Canvas operational data — it only stores the brain's view of that data.  
Never mix these two. Never cross this line.

---

## What Already Exists (Do Not Rebuild)

The following is already built and working. Do not touch it unless something is broken.

| Component | Location | Status |
|---|---|---|
| Canvas OAuth login | `backend/server/services/canvas-oauth.ts` | ✅ Working |
| Canvas data sync (courses, assignments, grades) | `backend/server/services/canvas-sync.ts` | ✅ Working |
| Chat with brain | `backend/server/services/brain-chat-session.ts` | ✅ Working |
| Brain context window assembly | `backend/server/services/brain-context-window.ts` | ✅ Working |
| Post-session reflection | `backend/server/services/brain-reflection-engine.ts` | ✅ Working |
| Hypothesis engine | `backend/server/services/hypothesis-engine.ts` | ✅ Working |
| Intervention engine | `backend/server/services/intervention-engine.ts` | ✅ Working |
| Brain scheduler | `backend/server/services/brain-scheduler.ts` | ✅ Working |
| Agent routing (study, assignment, canvas, focus, citation) | `backend/server/agents/` | ✅ Working |
| Signal ingestion | `backend/server/services/signal-ingestion.ts` | ✅ Working |
| Vincent's founding brain data | NeuroAGI Brain DB | ✅ Live |
| 52 Canvas users, 84 courses, 926 assignments | FschoolAI Production DB | ✅ Live |

---

## What Is Broken (Fix Before Launch)

These are confirmed broken — they will cause errors in production if not fixed.

### Fix 1: `agent-feedback.ts` — Wrong table name
**File:** `backend/server/services/agent-feedback.ts`  
**Problem:** Writes to `.from('brain_signals')` — this table does not exist.  
**Fix:**
```typescript
// BEFORE (broken):
await supabase.from('brain_signals').insert({ user_id: ..., signal_type: ... });

// AFTER (correct):
await supabase.schema('brain').from('signals').insert({
  person_id: ...,
  signal_type: 'behavioral',
  subtype: 'agent_feedback',
  source: 'fschoolai',
  occurred_at: new Date().toISOString(),
  metadata: { agent_id: ..., rating: ..., feedback: ... }
});
```
**Time to fix:** 30 minutes.

---

### Fix 2: `canvas-sync-patch.ts` — Wrong table name
**File:** `backend/server/services/canvas-sync-patch.ts`  
**Problem:** Same issue — writes to `.from('brain_signals')`.  
**Fix:** Same pattern as Fix 1. Use `.schema('brain').from('signals')`.  
**Time to fix:** 30 minutes.

---

### Fix 3: Two env vars instead of one
**Problem:** The backend uses a single `SUPABASE_URL` env var, but some services use `VITE_SUPABASE_URL` (which is a frontend-only prefix). This is architecturally wrong — backend services should never use `VITE_` prefixed vars.

**The correct setup:**
```
# .env (backend)
BRAIN_SUPABASE_URL=https://qiolhlvqfzujnkwnymft.supabase.co
BRAIN_SUPABASE_KEY=<service_role_key>

FSCHOOL_SUPABASE_URL=https://wqgxpouhbwhwpzudrptp.supabase.co
FSCHOOL_SUPABASE_KEY=<service_role_key>
```

**Files to update:** `canvas-sync.ts`, `canvas-oauth.ts`, `brain-compounding.ts`, `causal-inference.ts`, `event-stream.ts`, `intervention-engine.ts`, `knowledge-graph.ts`, `neuro-agi.ts` — replace `VITE_SUPABASE_URL` with `FSCHOOL_SUPABASE_URL` or `BRAIN_SUPABASE_URL` as appropriate.

**Time to fix:** 2 hours.

---

### Fix 4: Canvas user ↔ Brain person mapping
**Problem:** FschoolAI Production DB uses Canvas user IDs (text strings) as primary keys. NeuroAGI Brain DB uses UUIDs. There is no verified mapping between them for the 52 existing Canvas users.

**Fix:** When a student logs in via Canvas OAuth, the backend must:
1. Look up their Brain person by `canvas_user_id`
2. If not found, create a new `neuro.persons` record and link it
3. Store the Brain UUID in the session for all subsequent brain operations

```typescript
// In canvas-oauth.ts, after successful Canvas login:
const { data: brainPerson } = await brainSupabase
  .schema('neuro')
  .from('persons')
  .select('id')
  .eq('canvas_user_id', canvasUser.id)
  .single();

if (!brainPerson) {
  // First-time user — create their brain
  const { data: newPerson } = await brainSupabase
    .schema('neuro')
    .from('persons')
    .insert({
      name: canvasUser.name,
      email: canvasUser.email,
      canvas_user_id: canvasUser.id,
      subscription_tier: 'free'
    })
    .select('id')
    .single();
  session.brainPersonId = newPerson.id;
} else {
  session.brainPersonId = brainPerson.id;
}
```

**Time to fix:** 3 hours.

---

## What to Build (In Order)

### Phase 1 — Fix the foundation (Week 1)
These must be done before anything else. Nothing works correctly until these are fixed.

| Task | File | Priority |
|---|---|---|
| Fix `brain_signals` → `brain.signals` | `agent-feedback.ts`, `canvas-sync-patch.ts` | P0 |
| Add two env vars (`BRAIN_SUPABASE_URL`, `FSCHOOL_SUPABASE_URL`) | All backend services | P0 |
| Implement Canvas user ↔ Brain person mapping | `canvas-oauth.ts` | P0 |
| Add database indexes to Brain DB | SQL migration | P0 |

**SQL to run in NeuroAGI Brain DB (Supabase SQL editor):**
```sql
CREATE INDEX IF NOT EXISTS idx_signals_person_type_time 
  ON brain.signals (person_id, signal_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_person_session 
  ON agents.messages (person_id, session_id);

CREATE INDEX IF NOT EXISTS idx_reflections_person_time 
  ON brain.reflections (person_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patterns_person_confidence 
  ON neuro.patterns (person_id, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_person_time 
  ON agents.sessions (person_id, started_at DESC);
```

---

### Phase 2 — Connect Canvas data to the Brain (Week 2)

The brain currently cannot reason about academic deadlines because `fschool.assignments` in the Brain DB is empty. Canvas data lives only in FschoolAI Production DB.

**Task:** After every Canvas sync, also write to Brain DB's `fschool` schema.

```typescript
// In canvas-sync.ts, after writing to FschoolAI Production DB:
// Also write to Brain DB
await brainSupabase
  .schema('fschool')
  .from('assignments')
  .upsert({
    id: assignment.id,
    person_id: brainPersonId,
    course_id: course.id,
    title: assignment.name,
    due_at: assignment.due_at,
    points_possible: assignment.points_possible,
    submission_types: assignment.submission_types,
    canvas_assignment_id: assignment.id
  }, { onConflict: 'canvas_assignment_id' });
```

**Why this matters:** Once `fschool.assignments` has data, `brain-context-window.ts` will automatically include upcoming deadlines in every chat context. The brain will know "you have a chemistry lab due in 3 days" without being told.

---

### Phase 3 — Start the brain engines (Week 2-3)

The brain has scheduled thinking, hypothesis generation, and intervention engines built — but they need to be running continuously.

**Task:** Ensure `brain-scheduler-init.ts` runs on every server start and the following jobs are active:

| Job | Frequency | Purpose |
|---|---|---|
| Context window refresh | Every 30 min per active user | Pre-computes brain context so chat is fast |
| Autonomous reflection | Daily at 2am | Synthesizes patterns from the day's signals |
| Hypothesis generation | Weekly | Generates new hypotheses about each student |
| Intervention check | Every hour | Checks if any interventions should be delivered |

**Verify by checking:** After 24 hours of running, `brain.context_window`, `brain.hypotheses`, and `brain.interventions` should have rows.

---

### Phase 4 — Performance optimization (Week 3)

Before onboarding more than 100 students, add a context window cache.

**Problem:** `brain-chat-session.ts` reads the context window from the database on every message. At 1,000 students × 10 messages/day = 10,000 DB reads/day just for context.

**Fix:** Add in-memory cache (Node.js `Map` with TTL):
```typescript
const contextCache = new Map<string, { data: ContextWindow; expiresAt: number }>();

async function getContextWindow(personId: string): Promise<ContextWindow> {
  const cached = contextCache.get(personId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const fresh = await fetchContextFromDB(personId);
  contextCache.set(personId, { data: fresh, expiresAt: Date.now() + 30 * 60 * 1000 });
  return fresh;
}
```

---

### Phase 5 — Student onboarding flow (Week 3-4)

The current system has no onboarding flow for new students. When a student signs up, they need:

1. Canvas OAuth connection (already works)
2. Brain person creation (Fix 4 above)
3. Initial Canvas sync (already works)
4. First brain reflection (already works — triggers after first chat)
5. Welcome message from the brain

**Build:** A simple onboarding page that:
- Explains what FschoolAI is (30 seconds)
- Connects Canvas (one click)
- Shows "Your brain is being built..." while Canvas syncs
- Redirects to chat when ready

---

## What NOT to Build (Yet)

These are real features in the roadmap but should not be built during the FschoolAI launch phase. They are for NeuroAGI hardware or a later FschoolAI version.

| Feature | Why Not Now |
|---|---|
| Biometric signals (heart rate, sleep) | Requires hardware |
| Voice signals | Requires hardware |
| Blockchain audit trail | Requires significant infrastructure |
| Peer intelligence / social graph | Requires critical mass of users first |
| Knowledge graph (concept nodes/edges) | Brain DB tables exist but are empty — build after launch |
| `neuro-agi.ts` full rewrite | Complex, not needed for launch |
| Prediction engine | Needs 6+ months of signal data first |

---

## The Two Databases — Quick Reference

| | FschoolAI Production DB | NeuroAGI Brain DB |
|---|---|---|
| **Supabase project** | FschoolAI Production | NeuroAGI Brain |
| **URL** | `wqgxpouhbwhwpzudrptp.supabase.co` | `qiolhlvqfzujnkwnymft.supabase.co` |
| **Env var** | `FSCHOOL_SUPABASE_URL` | `BRAIN_SUPABASE_URL` |
| **What lives here** | Users, Canvas data, courses, assignments | Intelligence, signals, reflections, sessions, patterns, goals |
| **Who owns it** | FschoolAI Inc. | NeuroAGI (shared with all future products) |
| **Can FschoolAI write here?** | Yes, it owns this | Yes, via brain services only |
| **Can other products read here?** | No | Yes, via Brain SDK |

---

## Architecture Diagram

```
Student (browser/mobile)
        │
        ▼
FschoolAI Frontend (React)
        │ HTTPS
        ▼
FschoolAI Backend (Node.js, port 5000)
        │
        ├──► FschoolAI Production DB (FSCHOOL_SUPABASE_URL)
        │    ├── public.users (Canvas accounts)
        │    ├── public.courses (Canvas courses)
        │    ├── public.assignments (Canvas assignments)
        │    └── public.canvas_data (raw Canvas payloads)
        │
        └──► NeuroAGI Brain DB (BRAIN_SUPABASE_URL)
             ├── neuro.persons (who the student is)
             ├── neuro.trust / neuro.consent / neuro.patterns
             ├── brain.signals (everything the brain observed)
             ├── brain.reflections (what the brain synthesized)
             ├── brain.context_window (pre-computed context for fast chat)
             ├── brain.hypotheses (what the brain thinks about the student)
             ├── brain.interventions (what the brain plans to do)
             ├── agents.sessions / agents.messages (all conversations)
             └── fschool.assignments (brain's view of academic deadlines)
```

---

## Questions to Ask Vincent Before Starting

1. **Deployment:** Where is the FschoolAI backend deployed? (Railway, Render, Vercel, etc.) The brain scheduler needs a persistent server — it cannot run on serverless.

2. **Canvas API access:** The 52 existing users connected via Canvas OAuth. Are their Canvas tokens still valid? If they expire, Canvas sync will fail.

3. **Brain DB service role key:** The backend needs the `service_role` key (not the `anon` key) to write to `brain.*` and `neuro.*` schemas. Confirm the correct key is in the env vars.

4. **Student launch scope:** Are you launching to all 52 existing Canvas users, or a smaller beta group first?

5. **Reggie branding:** The brain still has some "Reggie" references in the founding data (`public.reggie_founding_record`, `public.reggie_config`). Should the student-facing product be called "Reggie" or "FschoolAI AI Tutor" or something else?

---

## Files to Read First (In This Order)

1. `FschoolAI-/CURRENT_ARCHITECTURE.md` — this document's companion, full technical detail
2. `neuroagi-core/docs/CURRENT_ARCHITECTURE.md` — Brain DB schema and what's broken in neuroagi-core
3. `FschoolAI-/backend/server/services/brain-chat-session.ts` — the main chat handler, understand this first
4. `FschoolAI-/backend/server/services/brain-context-window.ts` — how context is assembled
5. `FschoolAI-/backend/server/services/canvas-sync.ts` — how Canvas data flows in
