# FschoolAI × NeuroAGI — Architecture v2.0
## Stateful Brain / Stateless Agents Design

> **Origin of this document:** Architectural review conversation with 李小雷, June 2026.
> This document captures his three technical concerns, the stateful/stateless design decision, the domain data contradiction and its resolution, the Brain SDK ecosystem model, and the v1 simplification plan.

---

## 1. The Three Risks 李小雷 Identified

After reviewing all product docs, 李小雷 raised three architectural concerns:

| # | Risk | Description |
|---|---|---|
| 1 | **High concurrency risk** | No clear design for thousands of simultaneous brain refresh cycles — nightly reflections, Canvas syncs, and proactive interventions all firing at once |
| 2 | **Adaptability risk** | Endless business scenarios to fit, and the current agent-per-scenario model has no way to be truly intelligent — it is too rigid |
| 3 | **Over-reliance on relational database** | Supabase/Postgres is the wrong foundation for a brain that needs to be stateful, evolving, and graph-structured |

His qualifier: *"不过你们现在这种场景比较固定，在 fschool 这边应该没啥问题"* — for the current fixed FschoolAI scenarios, these risks are manageable. The relational database concern becomes critical only when NeuroAGI's brain layer scales.

---

## 2. The Core Design Decision: Stateful Brain / Stateless Agents

This is the most important architectural principle to emerge from the conversation.

> **李小雷:** "我原来想的是，NeuroAGI 只做个人大脑，是有状态的。而 fschoolai 是无状态的。"
> *(My original thinking: NeuroAGI only does personal brain — it is stateful. FschoolAI is stateless.)*

### What This Means

| Layer | System | State Model | Responsibility |
|---|---|---|---|
| **Brain layer** | NeuroAGI | **Stateful** | Holds the user's personal knowledge graph, cognitive patterns, memory, learned signals, and identity. Persists across all apps and sessions. Never forgets. |
| **Agent layer** | FschoolAI | **Stateless** | Academic agents execute tasks — they read from the brain, act on behalf of the user, and return results. They do not hold state themselves. |
| **Domain data layer** | FschoolAI Library | **Stateless** | Course content, syllabi, professor intelligence, exam predictions. Domain-specific, not personal. Stored in FschoolAI, not in the brain. |

### The Apple ID Analogy (Confirmed by 李小雷)

You proposed: *"就像用一个 Apple ID 一样"* — the user registers on FschoolAI, and NeuroAGI holds their personal brain profile, just as Apple ID holds identity across all Apple apps.

李小雷 confirmed: *"这种设计没问题"* ✅

The flow is:
1. User signs up on FschoolAI → a NeuroAGI Brain ID is created simultaneously (custodial, user claims full ownership later)
2. FschoolAI agents authenticate against the Brain ID for every session
3. All learned knowledge flows back to NeuroAGI brain, not stored in FschoolAI
4. FschoolAI domain data (syllabi, professor data, Library) stays in FschoolAI

---

## 3. The Domain Data Contradiction (The Hard Problem)

李小雷 raised the most nuanced issue in the entire architecture:

> "如果不进大脑，很多深层的需求是不会被激活的。我举个例子，比如一个学生在音乐上有天赋，他在音乐课堂的表现，在 fschoolai 里。但 brain 不知道，brain 没有领域数据，那这时候有一个活动 agent 注册进来的时候，音乐相关的活动，大脑不一定会把两个 agent 的数据给串联起来。"

**Translation:** If domain data (e.g., a student's music class performance) stays in FschoolAI and never enters the brain, then when a third-party music activity agent registers into the NeuroAGI ecosystem, the brain cannot cross-reference the two agents' data. Deep needs are never activated.

> "但一旦领域数据要进大脑，哪些要进，哪些不要，怎么进行管理，避免数据膨胀，怎么迭代，就是个问题。"

**Translation:** But once domain data goes into the brain, you face: which data enters, which doesn't, how to manage it, how to prevent data bloat, how to iterate. This is a hard problem.

### The Resolution: "Only What the Second Brain Has Learned Goes Into the Brain"

Your proposed resolution: *"只有第二大脑学习到的东西才进大脑"*

This is the correct principle. The implementation is:

**Raw domain data stays in FschoolAI.** Syllabi, grades, professor notes, assignment text — these are domain artifacts. They live in FschoolAI's Library and agent memory.

**Learned abstractions go into NeuroAGI brain.** After the Nightly Reflection agent processes a day's interactions, it distills *what the brain learned* — not the raw data. Examples of what enters the brain:

| Raw Domain Data (stays in FschoolAI) | Learned Abstraction (enters NeuroAGI brain) |
|---|---|
| Music 201 assignment score: 94/100 | `music_performance_signal: strong, consistent across 3 assignments` |
| PSYC 201 lecture transcript | `psyc201_knowledge_gap: classical conditioning vs operant conditioning` |
| Study session: 2.5 hours on stats | `stats_engagement_pattern: deep focus, evening sessions, visual learner` |
| Professor Chen's syllabus | `professor_chen_style: heavy on case studies, midterm = 40% of grade` |

The brain holds **signals, patterns, gaps, and traits** — not documents. This solves the data bloat problem while enabling cross-agent intelligence.

### Why This Resolves the Music Example

When the music activity agent registers into NeuroAGI:
- It queries the brain for `music_performance_signal`
- The brain returns: *strong musical aptitude, consistent high performance in Music 201*
- The agent can now make a contextually intelligent recommendation
- The raw Music 201 data never left FschoolAI — only the learned signal was in the brain

---

## 4. Data Architecture: Where Everything Lives

```
┌─────────────────────────────────────────────────────────────┐
│                        NeuroAGI Brain                        │
│                         (Stateful)                           │
│                                                              │
│  • Personal knowledge graph (learned signals only)           │
│  • Cognitive patterns (focus, engagement, learning style)    │
│  • Knowledge gaps (distilled from agent interactions)        │
│  • Identity + Brain ID (Apple ID equivalent)                 │
│  • Cross-agent intelligence layer                            │
│  • Brain SDK registry (which agents are connected)           │
│                                                              │
│  Database: Graph DB (Neo4j or similar) — NOT Postgres        │
└─────────────────────────────────────────────────────────────┘
                              ↑
                   Nightly Reflection writes
                   learned abstractions only
                              ↑
┌─────────────────────────────────────────────────────────────┐
│                         FschoolAI                            │
│                        (Stateless)                           │
│                                                              │
│  Agents (stateless, read brain + act):                       │
│  • Reggie (chat orchestrator)                                │
│  • Canvas Sync, Library Analysis, Exam Predictor             │
│  • Professor Intelligence, Motivation Engine                 │
│  • Lesson Generator, Study Room Orchestrator                 │
│  • Nightly Reflection (writes to brain after distillation)   │
│                                                              │
│  Domain Data (stays here, never enters brain raw):           │
│  • Course Library (syllabi, materials)                       │
│  • Professor Intelligence database                           │
│  • Assignment + grade history                                │
│  • Study session logs                                        │
│                                                              │
│  Database: Supabase/Postgres (fine for v1 fixed scenarios)   │
└─────────────────────────────────────────────────────────────┘
                              ↑
                   Third-party agents register
                   via Brain SDK
                              ↑
┌─────────────────────────────────────────────────────────────┐
│                      Brain SDK Ecosystem                     │
│                                                              │
│  Any company or developer can:                               │
│  1. Register an agent into NeuroAGI via Brain SDK            │
│  2. Query the brain for learned signals (with user consent)  │
│  3. Write learned abstractions back to the brain             │
│  4. Never access raw domain data from other agents           │
│                                                              │
│  Examples: music activity agent, career counseling agent,    │
│  fitness agent, financial literacy agent                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. The Brain SDK — Ecosystem Model

You articulated this vision: *"然后我们之后其他公司也是这样搞，开发者来我们生态也这么搞，brain sdk，fschoolai 数据放图书馆，但是用户跟 AI 大脑想的 knowledge 回 neuro 大脑"*

The Brain SDK is the platform play. It works as follows:

**For third-party companies:**
- Register their app/agent with NeuroAGI via Brain SDK
- Their agent can read the user's brain signals (with explicit permission)
- Their agent writes learned abstractions back to the brain after interactions
- They never see raw data from other agents — only the brain's learned layer

**For developers:**
- Build agents that are "alive" (brain-connected) vs "dead" (stateless wrappers like current market agents)
- You framed this perfectly: *"你可以想像 agent 还是死 agent 跟现在市面上 agent 一样"*
- A Brain SDK agent has context, memory, and cross-agent intelligence. A dead agent has none.

**The asset:** *"资产就是 neuro 大脑"* — the user's brain is the asset. Every agent interaction makes it more valuable. This is the compounding moat.

---

## 6. The High Concurrency Solution

李小雷's first concern was concurrency. The stateless agent design directly addresses this:

Because FschoolAI agents are stateless, they can be horizontally scaled without coordination. Each agent request is independent — it reads from the brain, executes, and writes back a distilled signal. There is no shared mutable state between agent instances.

The concurrency risk is concentrated at the **brain write layer** (Nightly Reflection). The mitigation:

| Risk | Mitigation |
|---|---|
| Thousands of nightly reflections firing simultaneously | Staggered scheduling — reflections distributed across a 4-hour window (10 PM–2 AM local time), not all at midnight |
| Brain write contention | Write queue with optimistic locking — reflection writes are low-frequency (once per day per user) |
| Graph DB write throughput | Neo4j Enterprise supports 100K+ writes/second; not a bottleneck at FschoolAI scale |

---

## 7. The Adaptability Solution

李小雷's second concern: *"适配性的风险，你们后面有无穷无尽的业务需要适配，且没办法真正智能化"*

The current architecture has one agent per scenario — rigid, not intelligent. The brain-centric design resolves this:

**Instead of:** Agent reads scenario → executes fixed logic → returns result

**New model:** Agent reads brain signals → reasons about context → executes adaptive logic → writes learned abstraction back

The brain provides the intelligence layer. Agents become thin execution wrappers that leverage the brain's accumulated context. A new scenario does not require a new agent — it requires the existing agents to read different brain signals.

This is why 李小雷 said *"我说的 brain 就是 neuroagi"* — the brain IS the intelligence. Agents are just tools.

---

## 8. V1 Simplification Plan

李小雷's verdict: *"现在的问题是设计的太复杂了，至少对于你第一个版本"*

He is right. The v1 build should not attempt to implement the full stateful/stateless split. That requires NeuroAGI infrastructure that does not exist yet.

**V1 (FschoolAI launch — now):**

| Component | V1 Implementation | Future State |
|---|---|---|
| Brain storage | Supabase tables (brain_signals, knowledge_gaps, cognitive_patterns) | Neo4j graph database |
| Brain ID | UUID in Supabase users table | NeuroAGI DID on ION |
| Agent state | Session context in Supabase | Fully stateless, reads from brain only |
| Nightly reflection | Cron job writes to Supabase brain tables | Async queue writes to NeuroAGI brain |
| Cross-agent intelligence | Single-app (FschoolAI only) | Multi-app via Brain SDK |
| Domain data separation | Logical separation (different tables) | Physical separation (different databases) |

**The v1 principle:** Build FschoolAI as if the brain is a separate service — even if it is the same Supabase instance. Use an abstraction layer (`brain_client.ts`) so that when NeuroAGI launches, swapping the backend is a config change, not a rewrite.

---

## 9. Open Questions (李小雷 Said He Needs to Think)

李小雷 closed with: *"跟我想的还不太一样，得再想想"* and *"我要思考一些边缘场景"*

The open questions he is thinking through:

1. **Edge cases for domain data entering the brain** — what happens when a learned abstraction conflicts with a previous signal? How does the brain resolve contradictions?
2. **领域数据到底进不进大脑** — the domain data question is not fully resolved. His concern about deep needs not being activated is valid. The "learned abstractions only" rule may need refinement.
3. **How hardware changes the equation** — you said *"后面有硬件不就改善了"* (hardware will fix it). He agreed but has not yet mapped out how on-device processing changes the stateful/stateless boundary.
4. **The most efficient way to connect FschoolAI + NeuroAGI + hardware** — *"这些全部怎么连接，最高效"* — this is the systems design question he is still working on.

---

## 10. Summary: What Changed From V1 Architecture

| Dimension | Before (V1 Architecture) | After (李小雷 Review) |
|---|---|---|
| Brain location | FschoolAI Supabase | NeuroAGI (separate, stateful) |
| Agent model | Stateful (session memory in FschoolAI) | Stateless (read brain, act, return) |
| Domain data | Mixed with brain data | Stays in FschoolAI Library, never enters brain raw |
| What enters brain | Everything | Only learned abstractions (signals, patterns, gaps) |
| Database | Postgres only | Postgres (FschoolAI) + Graph DB (NeuroAGI brain) |
| Third-party integration | Not designed | Brain SDK — any agent can register and read/write brain signals |
| Intelligence layer | Per-agent logic | Brain provides cross-agent intelligence |
| V1 scope | Full architecture | Logical separation with abstraction layer; physical split at NeuroAGI launch |

---

*Document authored from architectural review with 李小雷, June 2026. Next review scheduled after he thinks through edge cases.*
