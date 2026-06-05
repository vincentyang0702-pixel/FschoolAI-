# FschoolAI — Brain Integration Guide

> **For the FschoolAI dev team only**
> 
> This explains exactly how FschoolAI connects to the NeuroAGI brain, what's working, what's broken, and what every developer must do.

---

## The Connection

FschoolAI does NOT own the brain. It consumes the brain through the NeuroAGI SDK.

```
FschoolAI (this repo)
    ↓
neuroagi-sdk/brain-sdk-impl.ts   ← This is the bridge
    ↓
NeuroAGI Core (separate repo — neuroagi-core)
    ↓
Supabase (shared database — 57 tables)
```

The SDK files live in `neuroagi-sdk/` in this repo. That's the only way FschoolAI talks to the brain. **Never bypass the SDK to query the database directly.**

---

## The Rule Every FschoolAI Developer Must Follow

**Every agent response must follow this 3-step pattern:**

```typescript
import { createBrainSDK } from '../neuroagi-sdk/brain-sdk-impl';
const brain = createBrainSDK({ productId: 'fschoolai' });

// ✅ CORRECT PATTERN
async function respondToUser(userId: string, message: string) {
  // 1. Get brain context FIRST — always
  const context = await brain.getContext(userId, 'fschoolai');
  
  // 2. Ask brain what user needs
  const suggestion = await brain.suggestNext(userId, context);
  
  // 3. Build personalized response using context
  const response = buildResponse(message, context, suggestion);
  
  // 4. Update brain after — always
  await brain.update({
    userId, productId: 'fschoolai',
    eventType: 'signal_captured',
    data: { signalType: 'chat', agentUsed: suggestion.agentId }
  });
  
  return response;
}

// ❌ WRONG — never do this
async function respondToUserWrong(userId: string, message: string) {
  // Keyword matching with no brain context = generic chatbot
  if (message.includes('study')) return 'Here is some study advice...';
}
```

---

## Where Brain Updates Must Happen in FschoolAI

Every meaningful user action must call `brain.update()`. Here is the complete list:

### Canvas Integration (`server/services/canvas-sync.ts`)
```typescript
// ✅ Already implemented — grades feed the brain
await brain.update({
  userId, productId: 'fschoolai',
  eventType: 'grade_received',
  data: { subject: course.name, grade: score / pointsPossible }
});
```

### Study Sessions (TODO — not yet implemented)
```typescript
// When user starts/ends a study session
await brain.update({
  userId, productId: 'fschoolai',
  eventType: 'study_session',
  data: { subject, duration, outcome: 'completed' }
});
```

### Focus Mode (TODO — not yet implemented)
```typescript
// When user enters/exits focus mode
await brain.update({
  userId, productId: 'fschoolai',
  eventType: 'focus_session',
  data: { duration, subject, distractions: 0 }
});
```

### Chat Interactions (TODO — not yet implemented)
```typescript
// After every AI chat response
await brain.update({
  userId, productId: 'fschoolai',
  eventType: 'signal_captured',
  data: { signalType: 'chat_interaction', topic, agentUsed }
});
```

### Content Consumed (TODO — not yet implemented)
```typescript
// When user watches a video or reads content
await brain.update({
  userId, productId: 'fschoolai',
  eventType: 'content_consumed',
  data: { topic, contentType: 'video', duration }
});
```

---

## The Agent Orchestrator (Fixed)

The orchestrator at `server/services/agent-orchestrator.ts` now properly calls the brain. Here's what changed:

**Before (broken):**
```
User message → keyword match → agent → response
(agents had zero knowledge of who the user was)
```

**After (fixed):**
```
User message → brain.getContext() → brain.suggestNext() → agent → response → brain.update()
(agents know everything about the user before responding)
```

---

## API Routes

The brain is exposed to the frontend through these routes:

| Route | Method | What It Does |
|---|---|---|
| `/api/brain/context/:userId` | GET | Get full brain context for a user |
| `/api/brain/suggest/:userId` | GET | Get next agent suggestion |
| `/api/brain/insights/:userId` | GET | Get AI insights about user |
| `/api/brain/update` | POST | Feed an event to the brain |
| `/api/brain/signals/:userId` | GET | Get all signals for debugging |
| `/api/brain/predict` | POST | Get predictions from prediction engine |
| `/api/brain/intervene` | POST | Get intervention recommendations |
| `/api/brain/feedback` | POST | Submit feedback to improve brain |

---

## What FschoolAI Gets From the Brain

When you call `brain.getContext(userId)`, here is what you get back and how to use it in the UI:

```typescript
const context = await brain.getContext(userId);

// Use for: personalized dashboard greeting
context.emotionalState      // 'stressed' → show calming UI, break tasks down
                            // 'motivated' → show ambitious goals, harder challenges
                            // 'fatigued' → show short tasks, suggest break

// Use for: study recommendations
context.knowledgeGaps       // Show these as "Focus areas" on dashboard
context.strengths           // Show these as "Your strengths" with badges

// Use for: scheduling features
context.focusPattern.peakHours      // "Your best study time: 9pm–11pm"
context.focusPattern.avgSessionMinutes  // Suggest session lengths

// Use for: content personalization
context.learningStyle       // 'visual' → show diagrams
                            // 'kinesthetic' → show practice problems
                            // 'reading' → show structured text

// Use for: progress tracking
context.knowledgeLevel      // { 'Calculus': 0.85, 'Physics': 0.62 }
                            // Show as progress bars on subject cards
```

---

## Skill Verification Feature

FschoolAI can show verified skill badges on student profiles. This is a major differentiator — no other ed-tech platform has AI-verified skills based on observed behavior.

```typescript
// On student profile page
const pythonProof = await brain.verifySkill(userId, 'Python');

if (pythonProof.verified) {
  // Show: "✓ Python — 92% mastery — verified across 47 sessions"
  showVerifiedBadge({
    skill: 'Python',
    mastery: pythonProof.masteryLevel,
    evidence: pythonProof.evidenceCount
  });
}
```

---

## Brain Health Dashboard

Show users how their brain is growing. This builds trust and engagement.

```typescript
const metrics = await brain.getHealthMetrics(userId);

// Display:
// "Your brain has been learning for 47 days"
// "You've captured 1,247 signals"
// "You've mastered 23 concepts"
// "Average mastery: 78%"

metrics.brainAge          // Days since first signal
metrics.totalSignals      // Total events captured
metrics.conceptsTracked   // Number of concepts in knowledge graph
metrics.avgMastery        // Average mastery across all concepts
```

---

## Environment Variables Required

```
SUPABASE_URL=           # Supabase project URL
SUPABASE_ANON_KEY=      # Supabase anon key (for client-side)
SUPABASE_SERVICE_KEY=   # Supabase service key (for server-side brain writes)
CANVAS_CLIENT_ID=       # Canvas OAuth client ID
CANVAS_CLIENT_SECRET=   # Canvas OAuth client secret
FRONTEND_URL=           # Frontend URL for CORS
PORT=5000
```

---

## File Structure

```
fschoolai-backend/
├── server/
│   ├── index.ts                    ← Express server entry point
│   ├── routes/
│   │   ├── brain.ts                ← Brain API endpoints
│   │   ├── agents.ts               ← Agent endpoints
│   │   ├── canvas.ts               ← Canvas LMS routes
│   │   └── signals.ts              ← Signal capture routes
│   ├── services/
│   │   ├── agent-orchestrator.ts   ← ✅ FIXED — now uses brain context
│   │   ├── agent-coordinator.ts    ← Multi-agent coordination
│   │   ├── canvas-api.ts           ← Canvas API client
│   │   ├── canvas-sync.ts          ← Syncs Canvas → brain
│   │   └── event-stream.ts         ← Real-time event capture
│   ├── agents/
│   │   ├── index.ts                ← Agent registry
│   │   ├── study-agent.ts          ← Study Buddy
│   │   ├── focus-agent.ts          ← Focus Guardian
│   │   └── core-agents.ts          ← Motivation, Performance, etc.
│   ├── middleware/
│   │   └── request-context.ts
│   └── utils/
│       └── error-handler.ts
├── neuroagi-sdk/                   ← Brain SDK (copy from neuroagi-core)
│   ├── brain-sdk.ts                ← Types and interface
│   └── brain-sdk-impl.ts           ← Implementation
├── supabase/
│   └── migrations/                 ← Database schema (57 tables)
└── docs/
    ├── BRAIN_INTEGRATION_GUIDE.md  ← This file
    └── FSCHOOLAI_NEUROAGI_INTEGRATION_GUIDE.md
```

---

## Common Mistakes to Avoid

**Mistake 1: Responding without brain context**
```typescript
// ❌ Wrong
const response = await studyAgent.respond(message);

// ✅ Right
const context = await brain.getContext(userId);
const response = await studyAgent.respond(message, context);
```

**Mistake 2: Not updating the brain after interactions**
```typescript
// ❌ Wrong — brain never learns from this
return response;

// ✅ Right — brain learns from every interaction
await brain.update({ userId, productId: 'fschoolai', eventType: 'signal_captured', data: {...} });
return response;
```

**Mistake 3: Querying Supabase directly instead of using the SDK**
```typescript
// ❌ Wrong — bypasses brain logic
const { data } = await supabase.from('knowledge_signals').select('*').eq('student_id', userId);

// ✅ Right — uses brain's processed intelligence
const context = await brain.getContext(userId);
```

**Mistake 4: Hardcoding agent selection**
```typescript
// ❌ Wrong — ignores brain's recommendation
if (message.includes('focus')) return focusAgent.respond(message);

// ✅ Right — brain decides which agent is best
const suggestion = await brain.suggestNext(userId);
const agent = agentRegistry[suggestion.agentId];
```

---

## Questions?

- **Brain internals:** Ask the NeuroAGI team — they own `neuroagi-core`
- **SDK questions:** Check `neuroagi-sdk/brain-sdk.ts` for the full interface
- **Architecture:** Check `docs/FSCHOOLAI_NEUROAGI_INTEGRATION_GUIDE.md`
- **Database schema:** Check `supabase/migrations/`
