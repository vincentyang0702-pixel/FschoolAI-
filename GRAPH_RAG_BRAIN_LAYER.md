# FschoolAI × NeuroAGI — Graph RAG Brain Layer Architecture

**Version:** 1.0  
**Author:** FschoolAI Architecture Team  
**For:** 李小雷 (Brain Model Lead) + Agent Builders  
**Date:** June 2026

---

## Overview

This document defines the Graph RAG architecture for the NeuroAGI Brain Layer — the intelligence infrastructure that powers every agent in FschoolAI. It covers the graph schema, the two-graph design, the vector DB placement, the confidence + decay model, the temporal layer, and the cross-graph multi-hop retrieval protocol.

---

## 1. The Core Architecture

```
┌─────────────────────────────────────────────────────┐
│              QUERY (from Reggie or agent)            │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│           GRAPH QUERY LAYER                         │
│  - Structured traversal (exact lookup)              │
│  - Confidence-weighted path selection               │
│  - Temporal scoping (current / historical)          │
│  - Cross-graph hop (Brain ↔ Library)                │
└──────┬──────────────────────────────┬───────────────┘
       ↓                              ↓
┌─────────────┐              ┌───────────────────┐
│ BRAIN GRAPH │              │  LIBRARY GRAPH    │
│ (NeuroAGI)  │              │  (FschoolAI)      │
│             │              │                   │
│ Nodes:      │              │ Nodes:            │
│ - Patterns  │◄─cross-hop──►│ - Concepts        │
│ - Signals   │              │ - Lectures        │
│ - Goals     │              │ - Professors      │
│ - Knowledge │              │ - Courses         │
│   gaps      │              │ - Rubrics         │
│             │              │                   │
│ Edges:      │              │ Edges:            │
│ - Causal    │              │ - Prerequisite    │
│ - Temporal  │              │ - Covers          │
│ - Confidence│              │ - Emphasises      │
└──────┬──────┘              └────────┬──────────┘
       ↓                              ↓
┌─────────────────────────────────────────────────────┐
│           VECTOR DB (leaf-level only)               │
│  - Lecture transcript chunks                        │
│  - Concept explanation text                         │
│  - Professor feedback text                          │
│  - Retrieved ONLY when graph reaches a content node │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│           RE-RANKING                                │
│  - Graph relationship strength                      │
│  - Node confidence score                            │
│  - Temporal recency                                 │
│  - Student learning style preference                │
└──────────────────────┬──────────────────────────────┘
                       ↓
              Context window for Reggie
```

---

## 2. Two Separate Graphs — Why and How

The system requires **two distinct knowledge graphs** that can be queried together via cross-graph multi-hop. They must not be merged into one graph.

### Graph 1 — The Brain Graph (NeuroAGI)

**Owner:** The student (DID-controlled, deletable)  
**Lives in:** NeuroAGI Brain DB (`qiolhlvqfzujnkwnymft.supabase.co`)  
**Purpose:** Models who the student is — their patterns, gaps, goals, emotional states, and learning trajectory

**Node Types:**

| Node Type | Example | Schema |
|---|---|---|
| `person` | Vincent Yang | `{id, name, university, brain_person_id}` |
| `pattern` | Procrastinates on written assignments | `{id, person_id, description, confidence, evidence_count}` |
| `knowledge_gap` | Weak on monetary policy | `{id, person_id, concept_id, confidence, last_tested}` |
| `signal` | Stress spike on 2026-05-14 | `{id, person_id, type, value, source_agent, timestamp}` |
| `goal` | Get into YC by 2027 | `{id, person_id, description, priority, horizon}` |
| `learning_style` | Auditory learner (detected) | `{id, person_id, modality, confidence, evidence_sessions}` |
| `momentum_state` | Currently: building | `{id, person_id, state, since, updated_at}` |

**Edge Types:**

| Edge | Meaning | Example |
|---|---|---|
| `causes` | Signal A causes Signal B | stress → procrastination |
| `reinforces` | Pattern A reinforces Pattern B | procrastination → late_submission |
| `conflicts_with` | Two patterns contradict | high_ambition ↔ avoidance_behaviour |
| `has_gap_in` | Person has knowledge gap in concept | Vincent → monetary_policy |
| `improved_on` | Person improved on concept over time | Vincent → monetary_policy (Week 5 → Week 8) |
| `prefers` | Person prefers learning modality | Vincent → audio_mode |

---

### Graph 2 — The Library Graph (FschoolAI)

**Owner:** FschoolAI (shared infrastructure, no student can delete)  
**Lives in:** FschoolAI Supabase  
**Purpose:** Models the academic world — courses, concepts, professors, lectures, and their relationships

**Node Types:**

| Node Type | Example | Schema |
|---|---|---|
| `course` | ECON 201 — Macroeconomics | `{id, code, name, university, professor_id}` |
| `concept` | Monetary Policy | `{id, name, subject_area, difficulty_level}` |
| `lecture` | ECON 201 Week 4 | `{id, course_id, week, title, content_node_id}` |
| `professor` | Professor Chen | `{id, name, university, teaching_style, exam_style}` |
| `assignment` | ECON 201 Essay 2 | `{id, course_id, title, due_date, weight, rubric_node_id}` |
| `exam` | ECON 201 Midterm | `{id, course_id, date, scope, past_questions_node_id}` |
| `content_node` | Lecture transcript / rubric text | `{id, type, text_chunk_ids[]}` — links to vector DB |

**Edge Types:**

| Edge | Meaning | Example |
|---|---|---|
| `covers` | Lecture covers concept | Week 4 → monetary_policy |
| `prerequisite_for` | Concept A must be understood before B | supply_demand → monetary_policy |
| `emphasises` | Professor emphasises concept | Chen → monetary_policy (weight: 0.4) |
| `assessed_in` | Concept assessed in exam/assignment | monetary_policy → midterm |
| `taught_by` | Course taught by professor | ECON 201 → Chen |
| `part_of` | Lecture is part of course | Week 4 → ECON 201 |

---

## 3. Cross-Graph Multi-Hop Retrieval

This is the core capability that makes the system genuinely personalised. Neither graph alone can answer personalised academic questions — you need to traverse both.

### Example Query: "What should Vincent review before his ECON 201 exam?"

```
Step 1 — Brain Graph
  Query: Vincent's knowledge gaps in ECON 201 topics
  Result: [monetary_policy: 0.3 confidence, fiscal_multipliers: 0.4 confidence]

Step 2 — Cross-graph hop to Library Graph
  Query: What concepts does ECON 201 exam cover?
  Result: [monetary_policy, fiscal_multipliers, IS-LM model, inflation]

Step 3 — Library Graph traversal
  Query: What does Professor Chen emphasise in ECON 201?
  Result: monetary_policy (weight: 0.4), IS-LM model (weight: 0.3)

Step 4 — Re-rank by intersection
  Vincent is weak on: monetary_policy (0.3), fiscal_multipliers (0.4)
  Chen emphasises: monetary_policy (0.4), IS-LM model (0.3)
  Priority: monetary_policy (weak + high exam weight), then fiscal_multipliers

Step 5 — Leaf-level vector retrieval
  Fetch: ECON 201 Week 4 lecture transcript chunks on monetary_policy
  Fetch: Chen's past exam questions on monetary_policy

Step 6 — Re-rank by learning style
  Vincent prefers: audio_mode (confidence: 0.9)
  Output format: Audio Agent briefing, not text summary
```

**Final answer to Reggie:** "Vincent should review monetary policy first — he is at 30% confidence and Chen weights it at 40% of the exam. Here is the Week 4 lecture in audio format."

This answer is impossible without cross-graph multi-hop. A flat vector search would return generic monetary policy content, not Chen-specific, not Vincent-specific.

---

## 4. Confidence Scores and Decay

**Every node in the Brain Graph has a confidence score between 0.0 and 1.0.**

Confidence is not static. It changes based on:

### Confidence Increase Rules

| Event | Confidence delta |
|---|---|
| New evidence reinforces existing pattern | +0.1 per session |
| Student explicitly confirms a pattern | +0.3 (one-time) |
| Pattern observed across 3+ independent sessions | +0.2 |
| Exam result confirms knowledge gap | +0.4 |

### Confidence Decay Rules

| Condition | Decay |
|---|---|
| No reinforcing evidence for 7 days | -0.05 per day |
| Contradicting evidence observed | -0.2 immediately |
| Student explicitly denies pattern | -0.5 immediately |
| Node age > 90 days with no reinforcement | Archived (not deleted) |

### Confidence Thresholds for Retrieval

| Confidence | Retrieval behaviour |
|---|---|
| 0.0 – 0.3 | Hypothesis — Reggie can mention tentatively, not assert |
| 0.3 – 0.6 | Emerging pattern — Reggie can use, must hedge |
| 0.6 – 0.8 | Confirmed pattern — Reggie uses without hedging |
| 0.8 – 1.0 | Strong confirmed — Reggie uses as fact |

**Implementation:** Every Brain Graph node schema includes:
```json
{
  "confidence": 0.73,
  "evidence_count": 12,
  "last_reinforced": "2026-06-15T14:23:00Z",
  "decay_rate": 0.05,
  "archived": false
}
```

---

## 5. Temporal Layer

**Every edge in the Brain Graph has `valid_from` and `valid_until` timestamps.**

This is non-negotiable. Without temporal versioning, the graph only knows the current state and loses the trajectory — which is exactly what makes the brain valuable.

### Rules

1. **The Reflection Agent never updates existing edges.** It always writes new edges with a new `valid_from`. Old edges get a `valid_until` timestamp.
2. **Queries can be time-scoped.** "What was Vincent's knowledge state at the time of the midterm?" returns the graph state as of that date.
3. **Trajectory queries are first-class.** "How has Vincent's stress pattern changed over the semester?" traverses the temporal edge history.

### Edge Schema

```json
{
  "id": "edge_abc123",
  "from_node": "vincent_yang",
  "to_node": "monetary_policy_gap",
  "type": "has_gap_in",
  "confidence": 0.3,
  "valid_from": "2026-03-01T00:00:00Z",
  "valid_until": "2026-05-15T00:00:00Z",
  "written_by": "reflection_agent",
  "source_session_id": "session_xyz"
}
```

When Vincent's confidence in monetary policy improves after Week 5 tutoring:
- Old edge: `has_gap_in → monetary_policy` gets `valid_until: 2026-05-15`
- New edge: `has_gap_in → monetary_policy` written with `confidence: 0.6`, `valid_from: 2026-05-15`
- Both edges are preserved — the trajectory is intact

---

## 6. Vector DB Placement — Leaf Level Only

**The vector DB is not the primary retrieval mechanism. It is a leaf-level content store.**

### What goes in the vector DB

- Lecture transcript text chunks (500-token chunks with overlap)
- Concept explanation text (Tutor Agent outputs)
- Professor feedback text (graded assignment comments)
- Rubric text
- Past exam question text

### What does NOT go in the vector DB

- Student patterns (these are structured graph nodes, not text)
- Brain signals (structured data, exact lookup)
- Knowledge gap confidence scores (structured data)
- Course metadata (structured data)

### Retrieval Protocol

```
1. Graph traversal identifies relevant content nodes
   (e.g., "ECON 201 Week 4 lecture" node)

2. Content node contains chunk_ids[] pointing to vector DB

3. Vector similarity search within those specific chunks
   (NOT across the entire vector DB — scoped to the graph-identified content)

4. Return top-k chunks, re-ranked by graph relationship strength
```

This scoped vector search is 10x more precise than searching the full vector DB, because the graph has already narrowed the search space to the relevant course, lecture, and concept.

---

## 7. Who Writes to the Brain Graph

**Only three agents have write access to the Brain Graph.** All other agents route through `notify_reggie()`.

| Agent | Write permission | What it writes |
|---|---|---|
| **Reflection Agent** | Full write access | All pattern edges, knowledge gap updates, trajectory edges. Runs nightly after 11pm. |
| **Reggie (Orchestrator)** | Session-level signals | `session_opened`, `session_closed`, `topic_discussed`, `emotion_detected` |
| **Exam Mode Agent** | Post-exam recall signals | `concept_recalled_correctly`, `concept_failed_recall` — high confidence, immediate write |
| **Office Hours Agent** | Confirmed gap signals | `gap_confirmed_in_office_hours` — student asked a question = confirmed gap |
| All other agents | ❌ No direct write | Must call `notify_reggie(signal_type, payload)` |

**Why this rule exists:** Multiple agents writing to the brain simultaneously creates conflicting signals. The Reflection Agent is the single source of truth for pattern formation. Raw observations from other agents are queued and processed by the Reflection Agent at night — they are not written directly.

---

## 8. The Reflection Agent — Brain Writer

The Reflection Agent is the most important agent in the system. It is the only agent that synthesises raw observations into confirmed brain patterns.

**Trigger:** Session closed after 11pm, or manually triggered after 5+ sessions

**Input:**
- All `notify_reggie()` signals queued since last reflection
- Current Brain Graph state for this student
- Session transcripts from `agents.messages`

**Process:**
1. Read all queued signals
2. Check if signals reinforce existing patterns (confidence +0.1) or contradict them (confidence -0.2)
3. Identify new patterns not yet in the graph
4. Write new edges with `valid_from = now`
5. Archive edges with confidence < 0.1
6. Update `brain.context_window` (pre-computed summary for fast Reggie reads)

**Output written to Brain Graph:**
- Updated confidence scores on existing edges
- New pattern edges
- New knowledge gap edges
- Updated `valid_until` on superseded edges
- Updated `brain.context_window` for the student

---

## 9. The Context Window — Fast Path for Reggie

Every Brain Graph query via full graph traversal takes 200-500ms. That is too slow for real-time conversation.

**Solution:** The Reflection Agent pre-computes a `brain.context_window` for each student — a structured JSON summary of the most important brain state, updated every 30 minutes or after each session.

```json
{
  "student_id": "vincent_yang",
  "computed_at": "2026-06-20T08:00:00Z",
  "momentum_state": "building",
  "stress_level": 0.4,
  "top_knowledge_gaps": [
    {"concept": "monetary_policy", "course": "ECON 201", "confidence": 0.3},
    {"concept": "fiscal_multipliers", "course": "ECON 201", "confidence": 0.4}
  ],
  "upcoming_deadlines_at_risk": [
    {"assignment": "ECON 201 Essay 2", "due": "2026-06-23", "submission_status": "not_started"}
  ],
  "confirmed_patterns": [
    "procrastinates_on_written_assignments",
    "learns_best_via_audio",
    "responds_badly_to_direct_correction"
  ],
  "intervention_message": null,
  "recommended_action": "Start ECON 201 Essay 2 today — 3 days remaining, not started."
}
```

**Reggie reads this context window first** (< 5ms, single DB row). Only if the query requires deeper reasoning does Reggie trigger a full graph traversal.

---

## 10. Implementation Priorities for 李小雷

| Priority | Task | Complexity |
|---|---|---|
| P0 | Define Brain Graph schema in NeuroAGI DB (nodes + edges tables with confidence + temporal fields) | Medium |
| P0 | Build `brain.context_window` table and Reflection Agent writer | High |
| P0 | Implement confidence decay cron job (runs every 24h) | Low |
| P1 | Build cross-graph query protocol (Brain ↔ Library) | High |
| P1 | Scope vector search to graph-identified content nodes | Medium |
| P1 | Implement temporal edge versioning (valid_from / valid_until) | Medium |
| P2 | Build graph traversal API (MCP server endpoint) | Medium |
| P2 | Build trajectory query API ("how has X changed over time") | High |
| P3 | Graph visualisation for debugging | Low |

---

## 11. What Was Wrong in the Original Approach — Summary

| Original assumption | Problem | Fix |
|---|---|---|
| Brain nodes → vector DB → multi-hop | Vector DB was primary retrieval | Graph traversal first, vector DB at leaf level only |
| One graph for everything | Brain data and course data have different ownership and governance | Two separate graphs with cross-graph hop |
| All nodes treated equally | Stale hypotheses mixed with confirmed facts | Confidence scores + decay on every node |
| No time dimension | Graph only knows current state, loses trajectory | `valid_from` / `valid_until` on all edges, Reflection Agent writes new edges not updates |
| Any agent can write brain | Conflicting signals, no synthesis | Only Reflection Agent + Reggie + high-confidence agents can write |

---

## Appendix: Graph Schema SQL (NeuroAGI Brain DB)

```sql
-- Brain Graph Nodes
CREATE TABLE brain.nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID REFERENCES neuro.persons(id),
  node_type TEXT NOT NULL, -- pattern, knowledge_gap, signal, goal, learning_style, momentum_state
  label TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_count INT DEFAULT 1,
  last_reinforced TIMESTAMPTZ DEFAULT NOW(),
  decay_rate FLOAT DEFAULT 0.05,
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brain Graph Edges
CREATE TABLE brain.edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id UUID REFERENCES brain.nodes(id),
  to_node_id UUID REFERENCES brain.nodes(id),
  edge_type TEXT NOT NULL, -- causes, reinforces, has_gap_in, improved_on, prefers, conflicts_with
  confidence FLOAT DEFAULT 0.5,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ, -- NULL means currently active
  written_by TEXT NOT NULL, -- agent name that wrote this edge
  source_session_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Context Window (pre-computed, fast read)
CREATE TABLE brain.context_window (
  person_id UUID PRIMARY KEY REFERENCES neuro.persons(id),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  momentum_state TEXT,
  stress_level FLOAT,
  top_knowledge_gaps JSONB DEFAULT '[]',
  upcoming_deadlines_at_risk JSONB DEFAULT '[]',
  confirmed_patterns JSONB DEFAULT '[]',
  intervention_message TEXT,
  recommended_action TEXT
);

-- Indexes for performance
CREATE INDEX idx_brain_nodes_person ON brain.nodes(person_id);
CREATE INDEX idx_brain_nodes_type ON brain.nodes(node_type);
CREATE INDEX idx_brain_edges_from ON brain.edges(from_node_id);
CREATE INDEX idx_brain_edges_to ON brain.edges(to_node_id);
CREATE INDEX idx_brain_edges_active ON brain.edges(valid_until) WHERE valid_until IS NULL;
CREATE INDEX idx_brain_edges_temporal ON brain.edges(valid_from, valid_until);
```

---

*This document is the authoritative specification for the NeuroAGI Graph RAG Brain Layer. All agent builders must read this before implementing any brain read/write operations.*
