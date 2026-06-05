# NeuroAGI Database Architecture
**Version:** 2.0 — Phase 1 Architecture  
**Last Updated:** 2026-05-31  
**Status:** Live in production

---

## Overview

The database uses **4 PostgreSQL schemas** to enforce clear boundaries between layers. This is the single source of truth for all data architecture decisions.

```
┌─────────────────────────────────────────────────────────┐
│                    NEUROAGI DATABASE                     │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │  neuro   │  │  brain   │  │  agents  │  │fschool │ │
│  │ Identity │  │ Intel.   │  │ Manager  │  │Product │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│                                                         │
│  public schema: legacy tables (preserved, do not write) │
└─────────────────────────────────────────────────────────┘
```

---

## Schema 1: `neuro` — Identity Layer

**Purpose:** Universal identity. A "person" — not a student, not a user. Product-agnostic.

| Table | Description |
|-------|-------------|
| `neuro.persons` | Core identity: id, display_name, email, timezone, language |
| `neuro.memory` | Key-value facts about the person (extracted from conversations) |
| `neuro.patterns` | Behavioral patterns discovered from observation |

**Rule:** Every other schema references `neuro.persons(id)`. This is the root of all identity.

---

## Schema 2: `brain` — Intelligence Layer

**Purpose:** The brain. Signals in, intelligence out. Never accessed directly by products — only through the Brain SDK functions.

| Table | Description |
|-------|-------------|
| `brain.signals` | Unified signal table (replaces 9 separate signal tables) |
| `brain.knowledge` | Knowledge graph: concept → mastery level → decay |
| `brain.predictions` | What the brain predicts about the person |
| `brain.reflections` | Reggie's observations, session notes, self-reflections |
| `brain.reports` | Weekly intelligence reports |

**Brain SDK Functions (the only way to interact with the brain):**

```typescript
// Get everything the brain knows about a person
brain.get_context(person_id: uuid) → jsonb

// Send a signal to the brain (Canvas sync, conversation event, etc.)
brain.emit_signal(person_id: uuid, type: text, payload: jsonb, source: text) → uuid

// Runs nightly via pg_cron — decays stale knowledge
brain.apply_knowledge_decay() → void
```

**Rule:** FschoolAI code MUST use `brain.get_context()` and `brain.emit_signal()`. Never INSERT directly into `brain.*` tables.

---

## Schema 3: `agents` — Agent Manager Layer

**Purpose:** All agent activity. Sessions, messages, outputs, registry.

| Table | Description |
|-------|-------------|
| `agents.registry` | Which agents exist and their capabilities |
| `agents.sessions` | Conversation sessions (with feedback columns) |
| `agents.messages` | All messages (1,469 migrated from legacy) |
| `agents.outputs` | Structured outputs from agents |
| `agents.unsaid` | Things agents wanted to say but held back |

**Registered Agents:**
- `reggie` — Personal Academic Intelligence

---

## Schema 4: `fschool` — Product Layer

**Purpose:** Education-specific data. Only FschoolAI reads/writes here.

| Table | Description |
|-------|-------------|
| `fschool.students` | Canvas token, school, GPA, streak (links to neuro.persons) |
| `fschool.courses` | Canvas courses |
| `fschool.assignments` | Canvas assignments |
| `fschool.grades` | Grade data |
| `fschool.canvas_sync_log` | Sync history |

---

## Cron Jobs (pg_cron)

| Job | Schedule | What it does |
|-----|----------|-------------|
| `brain-knowledge-decay` | 2 AM daily | Applies mastery decay to knowledge not reinforced in 14/30 days |
| `brain-weekly-report` | 3 AM Sunday | Triggers weekly intelligence report generation |

---

## Current Data (as of 2026-05-31)

| Table | Rows | Notes |
|-------|------|-------|
| `neuro.persons` | 3 | Test users: Maybe (Vincent), Unknown, Aurora |
| `neuro.memory` | 11 | Key facts about Vincent |
| `neuro.patterns` | 44 | Behavioral patterns discovered from 1,469 messages |
| `agents.sessions` | 39 | 27 original + 12 recovered orphaned sessions |
| `agents.messages` | 1,469 | All messages fully migrated |
| `brain.reflections` | 89 | Mirror + self + session notes |
| `brain.reports` | 9 | Weekly reports |
| `brain.signals` | 371 | Impressions migrated as signals |

---

## How FschoolAI Connects (June Launch)

When a student signs up on FschoolAI:

```typescript
// 1. Create the person in neuro layer
const person = await supabase
  .from('neuro.persons')
  .insert({ display_name: name, email: email })
  .select().single();

// 2. Create the student profile in fschool layer
await supabase
  .from('fschool.students')
  .insert({ person_id: person.id, canvas_token: token, school: school });

// 3. Brain starts learning automatically from first conversation
// Every message → brain.emit_signal() → brain builds model
```

When Reggie needs context:
```typescript
// Get everything the brain knows — one call, no direct table access
const context = await supabase
  .rpc('get_context', { p_person_id: person.id });
// Returns: memory, patterns, knowledge, recent_signals
```

---

## Legacy Tables (public schema)

The original 112 tables in `public` are **preserved but frozen**. Do not write new data to them. They exist as backup and reference.

Tables with data that was migrated:
- `public.messages` → `agents.messages` ✅
- `public.sessions` → `agents.sessions` ✅
- `public.students` → `neuro.persons` ✅
- `public.reggie_memory` → `neuro.memory` ✅
- `public.student_patterns` → `neuro.patterns` ✅
- `public.reggie_mirror` → `brain.reflections` ✅
- `public.reggie_self` → `brain.reflections` ✅
- `public.reggie_session_notes` → `brain.reflections` ✅
- `public.reggie_reports` → `brain.reports` ✅
- `public.reggie_impressions` → `brain.signals` ✅

---

## Architecture Decision Log

**Why 4 schemas instead of 1?**  
Enforces the NeuroAGI/FschoolAI boundary at the database level. When we split into two services, we point each at its own schema. No refactoring needed.

**Why `person` not `student`?**  
The brain is product-agnostic. A future NeuroAGI product for professionals uses the same brain. `student` is an FschoolAI concept, not a brain concept.

**Why one `brain.signals` table instead of 9?**  
Nobody knew which of the 9 tables to write to. All were empty. One table with `signal_type` is unambiguous.

**Why Brain SDK functions?**  
So FschoolAI code can never accidentally corrupt the brain by writing directly to brain tables. The SDK functions are the contract. The database enforces it.
