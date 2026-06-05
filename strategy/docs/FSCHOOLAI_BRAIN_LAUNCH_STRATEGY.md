# FschoolAI → NeuroAGI: Student Second Brain Launch Strategy

> **The sequencing plan for launching FschoolAI before NeuroAGI hardware, while building the brain from day one so students can claim it when hardware ships.**

---

## The Core Insight

FschoolAI launches first. NeuroAGI hardware ships later. But the brain starts building on day one of FschoolAI — automatically, from academic data that requires no hardware to capture. When NeuroAGI launches, the student does not start fresh. They **claim a brain that has been growing for months.**

This is not a workaround. It is the correct product strategy. The brain's value compounds over time. The earlier it starts, the more valuable it is at claim. A student who signs up in September and claims their brain in March has six months of academic identity already built. **That accumulated data — not the app, not the hardware — is the moat.**

---

## What the FschoolAI Brain Contains

The student second brain inside FschoolAI is built entirely from software-accessible data sources. No hardware required.

| Data Source | Capture Method | What It Builds in the Brain | Consent Tier |
|---|---|---|---|
| **Canvas LMS** | OAuth token sync | Grades, assignments, courses, deadlines, performance trends | Tier 1 |
| **AI tutor conversations** | Native to FschoolAI | Concept mastery, what confuses them, learning velocity, communication style | Tier 1 |
| **Assignment submissions** | Canvas API | Writing style, effort signals, deadline behavior, improvement trajectory | Tier 1 |
| **Class recordings** | Upload or LMS integration | Comprehension signals, vocabulary gaps, note-taking patterns | Tier 1 (user-initiated) |
| **App behavioral signals** | FschoolAI session data | Focus patterns, session length, avoidance behaviors, time-of-day performance | **Tier 2 (opt-in)** |
| **Session synthesis** | AI tutor synthesis | Weekly brain updates: what was learned, what gaps remain, what to address next | Derived from above |

Every source is captured through software — none requires the Neural Card. The brain begins building the moment the student connects Canvas.

> **Important distinction:** Tier 1 is data the student *actively provides* to get help (Canvas, tutor chats, uploads). Tier 2 is *inferred behavioral profiling* (focus, avoidance, timing). These are treated differently for consent — see below.

---

## The Student Journey

### Stage 1 — FschoolAI Signup (Day 0)

Student signs up and connects Canvas. A `person_id` is created in the NeuroAGI brain schema and academic ingestion begins.

> **Decision: how consent works at signup.**
>
> We split it by data type, because the two are not the same legally or ethically:
>
> - **Tier 1 — academic data (Canvas, tutor sessions, uploads):** captured from day one, disclosed clearly at signup ("FschoolAI learns from your coursework and tutoring sessions to personalize help"). This is the same data the student is actively sharing to get the product's value. Silent-but-disclosed is appropriate.
> - **Tier 2 — behavioral/cognitive inference (focus, avoidance, time-of-day patterns):** **explicit, plain-language opt-in.** Off by default. Not buried in terms of service.
>
> **Why the split:** Our users are students, often minors. GDPR requires behavioral-profiling consent to be informed and specific (a ToS line doesn't qualify), and FERPA raises the bar for student data. Silent behavioral profiling of students is both a legal risk and a trust bomb if discovered. Academic data they hand us is defensible; inferred behavioral data is not — so we ask for it directly.

### Stage 2 — Brain Grows (Months 1–N)

Every interaction feeds the brain (within the consent tiers the student enabled):

- Every AI tutor conversation → knowledge signals (what they know, what they don't, how they ask)
- Every Canvas sync → academic record (grades, deadlines, trends)
- Every session → behavioral signals **(only if Tier 2 is enabled)**
- Weekly synthesis: Claude reads the week's signals and writes a structured update to `brain.reports`

The student can see their brain anytime through a **"Your Second Brain"** dashboard — what the AI knows, what gaps it found, what it predicts they need next. Transparency is the trust mechanism: nothing about the brain is hidden from the person it models.

### Stage 3 — NeuroAGI Launch (Hardware Ships)

Every FschoolAI student sees:

> **"Claim Your Brain"**
> Your second brain has been building since [signup date]. It contains [X] learning sessions, [Y] knowledge insights, and [Z] weeks of academic history. Claim it to make it permanently yours — encrypted with your key, portable to any device.

Claim flow:
Student taps "Claim Your Brain"
↓
Privy creates their wallet keypair (email login → embedded wallet, no MetaMask)
↓
Brain data is encrypted with their public key
↓
Blockchain anchor written on Polygon:
"Brain ID: [uuid], Owner: [wallet], Built since: [signup date]"   (provenance receipt)
↓
Neural Card ships — student activates card
↓
Brain migrates to card: encrypted local snapshot + private key in secure element
↓
Full self-sovereignty: brain lives on card, cloud is backup



**The real advantage is the longitudinal data**, not the anchor. A student who signed up six months before hardware has six months of timestamped academic history — a richer brain a competitor can't replicate because they don't have the data. The blockchain anchor adds a tamper-proof *provenance receipt* on top; it proves *when* the brain was built, but the value is the accumulated history itself.

---

## What the Brain Is — and Is Not — at FschoolAI Launch

Being precise about this matters for trust.

| What it is | What it is not |
|---|---|
| A growing model of the student's academic identity | A surveillance tool |
| Built from data the student shares (Tier 1) + behavior they opt into (Tier 2) | Built from screen capture, private messages, or silent behavioral tracking |
| Visible and controllable by the student at any time | Hidden or inaccessible |
| On by default, but the student can disable it (stateless mode) | Mandatory or impossible to turn off |
| Encrypted at rest (Phase 1) | Encrypted during processing (that's Phase 3 — TEE) |
| Held by NeuroAGI as custodian until claim | Owned by NeuroAGI permanently — at claim, ownership transfers to the student |

**The honest Phase 1 privacy statement:**

> "Your brain data is encrypted before it touches our servers, and only you hold the decryption key for stored data. When the brain processes new information — when it reads your Canvas data or analyzes a tutor session — that processing happens on our servers, and we never store your plaintext afterward. When you claim your brain, it becomes permanently yours."

Note we do **not** claim "we never read your data" — in Phase 1, processing is server-side. We claim only what is true. The full zero-exposure guarantee arrives with TEE (Phase 3).

---

## Build Priority for FschoolAI Launch

In order of impact on brain quality and student trust.

> **Engineering reality:** several of these are real builds, not config. Today's codebase has the SDK CRUD (`getContext`/`update`) but knowledge extraction and weekly synthesis are not yet wired, and the brain engines aren't in the request path. Budget for that — the strategy below assumes this work gets done.

### Must-Have at Launch

**1. Canvas Sync (highest priority)**
The brain's primary fuel. OAuth, grade/assignment/deadline sync. This is what turns FschoolAI from a chatbot into an academic intelligence system.

**2. Knowledge Extraction from Tutor Conversations**
Every tutor conversation writes structured knowledge signals: what concept, what the student got right/wrong, how they asked. This is the cognitive fingerprint — built automatically from normal usage. *(Net-new build.)*

**3. Weekly Brain Synthesis (`brain.reports`)**
Claude reads the week's signals and writes a structured update: learned, gaps, next focus. This is the "second brain" experience the student can actually read. *(Net-new build.)*

**4. Student Brain Dashboard**
A view where the student sees their brain — knowledge map, trends, gaps, deadlines, weekly synthesis. Makes the brain tangible and is the core trust mechanism before claim.

**5. Export and Delete Controls**
Export full brain (JSON/PDF) anytime; delete brain + all data anytime. Foundation of the trust relationship, not a nice-to-have.

**6. Consent UI (Tier 1 / Tier 2)**
- **Tier 1 (on, clearly disclosed):** Canvas data, tutor sessions, assignments, user-initiated uploads — the academic record the student signed up to share.
- **Tier 2 (explicit opt-in, off by default):** behavioral inference — session length, time-of-day, focus, avoidance. Plain-language explanation, one-tap on/off.
- A master **"pause / disable brain"** switch (stateless mode) so the brain is never mandatory.

**7. Privy Wallet (optional at signup, used at claim)**
Plant the wallet option at signup for those who want it; everyone else is prompted at claim. Avoids forcing crypto on students who just want homework help.

### Defer Until NeuroAGI Launch

- Polygon blockchain anchor (needs wallet — do at claim)
- Lit Protocol access control (only needed for cross-app sharing)
- Neural Card migration flow
- TEE processing (Phase 3)

---

## The Positioning

### For FschoolAI Students (now)
> "FschoolAI builds your second brain as you study. Every assignment, every tutoring session — your AI understands you better over time. When NeuroAGI launches, you'll claim that brain as yours forever."

### For NeuroAGI Investors (now)
> "We are not launching hardware cold. Every FschoolAI student is a pre-seeded NeuroAGI user with months of longitudinal data. By hardware launch, we'll have thousands of rich brains waiting to be claimed. The hardware launch is a migration event, not a cold start."

### For Students at Claim Time
> "Your second brain has been building since [date]. Claim it now. It's yours."

---

## The Flywheel

Student signs up for FschoolAI
↓
Brain starts building (Canvas + tutor sessions + opted-in behavioral)
↓
Brain gets smarter → FschoolAI gets better for that student
↓
Student trusts FschoolAI more → shares more → brain gets richer
↓
NeuroAGI launches → student claims brain → hardware ships
↓
Brain migrates to Neural Card → full ownership
↓
Student uses the NeuroAGI ecosystem (Reggie, future products)
↓
Brain gets smarter across products → student never leaves



The lock-in is the brain — built by the student, over months, through normal usage — which they cannot replicate anywhere else.

---

## Decisions Made (and the reasoning)

1. **Consent: split by data type.** Tier 1 (academic) silent + clearly disclosed; Tier 2 (behavioral inference) explicit opt-in, off by default. Reason: legal (GDPR/FERPA, minors) and trust.

2. **Day-one dashboard:** show an empty-with-progress state ("Your brain is 3% built — connect Canvas to accelerate") rather than hiding it. Reason: transparency builds trust and drives the Canvas connect.

3. **Ownership before claim:** NeuroAGI holds the data as **custodian** on behalf of the student; student can export/delete anytime; at claim, ownership transfers cryptographically. Must be in the terms of service.

4. **If a student never claims:** brain stays in custody; after [X] months of inactivity, the student is notified and the brain is archived, then deleted per a published retention policy. Reason: data minimization, especially for minors.

5. **Brain is on by default but optional** (not mandatory). Students can run a stateless mode. Reason: keeps the "you own it" story honest and avoids the legal/PR risk of forced profiling — at near-zero adoption cost.

---

*Document version: 1.1 — June 2026*
*Repo: vincentyang0702-pixel/neuroagi-core*
