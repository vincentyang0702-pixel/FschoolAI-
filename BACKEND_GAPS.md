# Backend Gaps: Critical Fixes Before Extension v2 Is Useful

**Owner:** Johan (Backend Lead)  
**Audience:** Johan — this is your prioritized task list  
**Last updated:** June 2026  
**Depends on:** Aryan completing `fix/extension-neuroagi-schema` first

---

## Overview

The extension v2 (Aryan's branch) is ready to send data to the backend. But the backend currently has 9 critical gaps that mean the data would either fail to arrive, arrive in the wrong place, or arrive and never be used by any agent. This document lists every gap, exactly which file to create or modify, and what to build.

**Do these in order. Gaps 1–5 are blockers. Gaps 6–9 can be done in parallel after.**

---

## Gap 1 — No `user_id` → `person_id` Bridge (CRITICAL BLOCKER)

**The problem:** FschoolAI uses `user_id` (UUID from `public.users`). The NeuroAGI Brain uses `person_id` (UUID from `neuro.persons`). These are two different IDs for the same student. The chat route requires `person_id`. The Canvas sync uses `user_id`. The extension uses `user_id`. There is no code that reliably maps one to the other.

**What breaks without this:** Every chat session either loads the wrong brain context or fails entirely. Every signal emitted by the extension cannot be linked to the correct brain record.

**Fix — create this utility function:**

File: `backend/server/utils/person-bridge.ts` (new file)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Maps a FschoolAI user_id to the corresponding NeuroAGI person_id.
 * Creates the neuro.persons record if it doesn't exist yet.
 */
export async function getPersonId(userId: string): Promise<string> {
  // Check if mapping already exists
  const { data: existing } = await supabase
    .schema('neuro')
    .from('persons')
    .select('id')
    .eq('fschool_user_id', userId)
    .single();

  if (existing) return existing.id;

  // Get user details from FschoolAI
  const { data: user } = await supabase
    .from('users')
    .select('id, email, name, university, timezone')
    .eq('id', userId)
    .single();

  if (!user) throw new Error(`User ${userId} not found`);

  // Create neuro.persons record
  const { data: person } = await supabase
    .schema('neuro')
    .from('persons')
    .insert({
      fschool_user_id: user.id,
      name: user.name,
      email: user.email,
      university: user.university,
      timezone: user.timezone || 'America/Toronto'
    })
    .select('id')
    .single();

  return person!.id;
}
```

**Also add `fschool_user_id` column to `neuro.persons`:**
```sql
ALTER TABLE neuro.persons ADD COLUMN IF NOT EXISTS fschool_user_id UUID REFERENCES public.users(id);
CREATE INDEX IF NOT EXISTS idx_neuro_persons_fschool_user ON neuro.persons(fschool_user_id);
```

**Update every route** that currently receives `user_id` and needs to call brain services: import `getPersonId` and call it before any brain operation.

---

## Gap 2 — No Extension Backend Routes (CRITICAL BLOCKER)

**The problem:** The extension currently calls Supabase directly (bypassing the backend entirely). Aryan's v2 is being rewritten to call the backend API instead. But the backend has no extension routes. The `routes/` folder contains: `agents.ts`, `brain.ts`, `canvas.ts`, `chat.ts`, `feedback.ts`, `signals.ts`, `voice.ts` — no `extension.ts`.

**Fix — create this file:**

File: `backend/server/routes/extension.ts` (new file)

```typescript
import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/error-handler';
import { getPersonId } from '../utils/person-bridge';
import { signalIngestion } from '../services/signal-ingestion';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/extension/sync
// Receives courses, assignments, grades from the extension
router.post('/sync', asyncHandler(async (req: Request, res: Response) => {
  const { user_id, courses, assignments, grades, university_id } = req.body;
  const person_id = await getPersonId(user_id);

  // Write to FschoolAI product DB
  // (upsert courses, assignments, grades into public.* tables)
  // Also write to fschool.* schema for brain access
  // ...implementation here...

  res.json({ success: true, person_id, synced: { courses: courses?.length, assignments: assignments?.length } });
}));

// POST /api/extension/signal
// Receives behavioral signals (assignment_viewed, procrastination_loop, etc.)
router.post('/signal', asyncHandler(async (req: Request, res: Response) => {
  const { user_id, signal_type, subtype, value, value_json, source, occurred_at } = req.body;
  const person_id = await getPersonId(user_id);

  const result = await signalIngestion.ingest({
    person_id,
    signal_type,
    subtype,
    value,
    value_json,
    source: source || 'chrome_extension',
    occurred_at
  });

  res.json(result);
}));

// POST /api/extension/content
// Receives course content for the shared library
router.post('/content', asyncHandler(async (req: Request, res: Response) => {
  const { user_id, university_id, course_id, content_type, text, week_number, module_name, professor_name, source_url } = req.body;

  // Compute dedup hash
  const hashInput = `${university_id}:${course_id}:${content_type}:${text.slice(0, 500)}`;
  const content_hash = crypto.createHash('sha256').update(hashInput).digest('hex');

  // Check if already exists
  const { data: existing } = await supabase
    .from('course_content')
    .select('id, seen_by_count')
    .eq('content_hash', content_hash)
    .single();

  if (existing) {
    // Update seen_by_count and last_seen_at
    await supabase
      .from('course_content')
      .update({ seen_by_count: existing.seen_by_count + 1, last_seen_at: new Date().toISOString() })
      .eq('id', existing.id);

    return res.json({ success: true, action: 'existing', id: existing.id });
  }

  // Store new library item
  const { data: newItem } = await supabase
    .from('course_content')
    .insert({ university_id, course_id, content_type, content_hash, text, week_number, module_name, professor_name, source_url })
    .select('id')
    .single();

  // TODO: Trigger Library Organizer Agent (Gap 6)

  res.json({ success: true, action: 'created', id: newItem!.id });
}));

// GET /api/extension/library/exists
// Dedup check before sending content
router.get('/library/exists', asyncHandler(async (req: Request, res: Response) => {
  const { hash } = req.query;
  const { data } = await supabase
    .from('course_content')
    .select('id')
    .eq('content_hash', hash as string)
    .single();

  res.json({ exists: !!data });
}));

export default router;
```

**Register the route in `backend/server/index.ts`:**
```typescript
import extensionRoutes from './routes/extension';
app.use('/api/extension', extensionRoutes);
```

---

## Gap 3 — Context Window Never Reads the Library (CRITICAL)

**The problem:** `brain-context-window.ts` reads from 9 tables but never reads `course_content`. When a student asks about an assignment, Reggie has no rubric. When they ask about a lecture topic, Reggie has no lecture context.

**Fix — add library retrieval to `brain-context-window.ts`:**

File: `backend/server/services/brain-context-window.ts` (modify existing)

Add this function and call it during context assembly:

```typescript
async function getRelevantLibraryItems(personId: string, courseIds: string[]): Promise<string> {
  if (!courseIds.length) return '';

  const { data: items } = await supabase
    .from('course_content')
    .select('content_type, text, week_number, module_name, summary')
    .in('course_id', courseIds)
    .in('content_type', ['syllabus', 'rubric'])
    .order('first_seen_at', { ascending: false })
    .limit(5);

  if (!items?.length) return '';

  return items.map(item =>
    `[${item.content_type.toUpperCase()}${item.week_number ? ` Week ${item.week_number}` : ''}]
${item.summary || item.text.slice(0, 800)}`
  ).join('

');
}
```

Then in the context window assembly, add:
```typescript
const courseIds = assignments.map(a => a.course_id).filter(Boolean);
const libraryContext = await getRelevantLibraryItems(personId, courseIds);
// Include libraryContext in the system prompt under "Course Materials"
```

---

## Gap 4 — Assignment Agent Has No Rubric Source (CRITICAL)

**The problem:** `assignment-agent.ts` has a `rubric` field in its context interface and uses it in the prompt, but the field is always `undefined`. No code fetches the rubric.

**Fix — add rubric lookup in `backend/server/agents/assignment-agent.ts`:**

```typescript
// Add at the top of the agent's process function, before building the prompt:
async function getRubricForAssignment(courseId: string, assignmentTitle: string): Promise<string | null> {
  const { data } = await supabase
    .from('course_content')
    .select('text')
    .eq('course_id', courseId)
    .eq('content_type', 'rubric')
    .ilike('text', `%${assignmentTitle.slice(0, 30)}%`)
    .single();

  return data?.text || null;
}

// Call it when building assignmentCtx:
const rubric = await getRubricForAssignment(assignment.course_id, assignment.title);
// Pass rubric into assignmentCtx
```

---

## Gap 5 — `fschool.assignments` Never Populated (CRITICAL)

**The problem:** The brain's context window reads from `fschool.assignments` for upcoming deadlines. But the extension writes to `public.assignments`. These are two different tables. The brain's deadline awareness is always empty.

**Fix — in the `/api/extension/sync` route (Gap 2), write assignments to BOTH tables:**

```typescript
// After writing to public.assignments, also write to fschool schema:
if (assignments?.length) {
  const fschoolAssignments = assignments.map(a => ({
    id: a.id,
    person_id,
    name: a.name,
    title: a.title,
    due_date: a.due_date,
    course_id: a.course_id,
    points_possible: a.points_possible,
    submission_status: a.submission_status
  }));

  await supabase
    .schema('fschool')
    .from('assignments')
    .upsert(fschoolAssignments, { onConflict: 'id,person_id' });
}
```

---

## Gap 6 — No Library Organizer Agent (HIGH PRIORITY)

**The problem:** When new content lands in the library, nothing processes it. No concepts are extracted. No brain knowledge is written. The library fills with raw text that no agent ever reads.

**Fix — create this service:**

File: `backend/server/services/library-organizer.ts` (new file)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function processLibraryItem(itemId: string): Promise<void> {
  const { data: item } = await supabase
    .from('course_content')
    .select('*')
    .eq('id', itemId)
    .single();

  if (!item) return;

  // Extract concepts and summary with Claude
  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022', // Use Haiku for cost efficiency
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Extract from this ${item.content_type} for course ${item.course_id}:
1. A 2-sentence summary
2. A JSON array of key concepts (max 10)
3. Difficulty level: beginner/intermediate/advanced

Content:
${item.text.slice(0, 3000)}

Respond as JSON: { "summary": "...", "concepts": [...], "difficulty": "..." }`
    }]
  });

  const parsed = JSON.parse((response.content[0] as any).text);

  // Update library item with extracted data
  await supabase
    .from('course_content')
    .update({ summary: parsed.summary, concepts: parsed.concepts })
    .eq('id', itemId);

  // Write to brain.knowledge as shared course intelligence
  for (const concept of parsed.concepts) {
    await supabase
      .schema('brain')
      .from('knowledge')
      .upsert({
        course_id: item.course_id,
        university_id: item.university_id,
        concept,
        source_type: item.content_type,
        source_id: itemId,
        difficulty: parsed.difficulty,
        week_number: item.week_number
      }, { onConflict: 'course_id,concept' });
  }

  // If rubric or feedback, trigger Professor Intelligence
  if (['rubric', 'feedback'].includes(item.content_type) && item.professor_name) {
    // TODO: call professor-intelligence-agent.ts (Gap 9)
  }
}
```

**Call `processLibraryItem(newItem.id)` at the end of the `/api/extension/content` route (Gap 2).**

---

## Gap 7 — No Prompt Caching (HIGH PRIORITY — Cost Reduction)

**The problem:** Every chat message re-sends the full brain context to Claude from scratch. At 1,000 students × 10 messages/day, this is 5× more expensive than necessary. Claude supports prompt caching — the brain context can be cached across turns within a session.

**Fix — in `backend/server/services/brain-chat-session.ts`:**

Add `cache_control` to the system prompt and the brain context block:

```typescript
// In the messages array passed to Claude:
{
  role: 'user',
  content: [
    {
      type: 'text',
      text: systemPrompt, // The full brain context
      cache_control: { type: 'ephemeral' } // Cache this block
    },
    {
      type: 'text',
      text: userMessage // Not cached — changes every turn
    }
  ]
}
```

This caches the brain context (typically 2,000–4,000 tokens) across all turns in a session. Cache hits cost 10% of normal input token price. Expected cost reduction: 70–80% per multi-turn session.

---

## Gap 8 — No University ID on Any Data (HIGH PRIORITY)

**The problem:** The shared library requires `university_id` to scope content correctly. A PSYC 201 rubric at UofT is different from one at UBC. There is no `university` field on `public.users`, no `university_id` on `public.courses`, and no university detection in the extension.

**Fix — two parts:**

**Part A — Add to `public.users` table:**
```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS university_id TEXT;
-- e.g. "uoft", "ubc", "mcmaster", "mit", "stanford"
```

**Part B — Tell Aryan to detect university from LMS URL in the extension:**
```javascript
// In background.js:
function detectUniversityId(url) {
  const hostname = new URL(url).hostname;
  const mappings = {
    'canvas.utoronto.ca': 'uoft',
    'q.utoronto.ca': 'uoft',
    'canvas.ubc.ca': 'ubc',
    'canvas.mcmaster.ca': 'mcmaster',
    'canvas.mit.edu': 'mit',
    'canvas.stanford.edu': 'stanford',
    // Add more as needed
  };
  return mappings[hostname] || hostname.replace(/[^a-z0-9]/g, '_');
}
```

Include `university_id` in every `/api/extension/sync` and `/api/extension/content` request body.

---

## Gap 9 — No Professor Identity Across Students (HIGH PRIORITY)

**The problem:** The Professor Intelligence Agent is supposed to build profiles from multiple students' graded feedback. But there is no `professor_name` or `professor_id` on any table. Two students with the same professor have no way to link their feedback to the same professor profile.

**Fix — add professor tracking to `course_content` table:**
```sql
ALTER TABLE course_content ADD COLUMN IF NOT EXISTS professor_name TEXT;
ALTER TABLE course_content ADD COLUMN IF NOT EXISTS professor_id TEXT;
-- professor_id = hash of (university_id + professor_name) for stable cross-student linking
```

**Tell Aryan to extract professor name from the LMS page when capturing rubrics or feedback.** On Canvas, the professor name is typically in the course header or the assignment submission feedback section.

In the `/api/extension/content` route, compute `professor_id`:
```typescript
const professor_id = professor_name
  ? crypto.createHash('sha256').update(`${university_id}:${professor_name.toLowerCase().trim()}`).digest('hex').slice(0, 16)
  : null;
```

---

## Gap 10 — Extension Manifest Name (LOW PRIORITY)

**The problem:** `manifest.json` says `"name": "NeuroAgi"`. Students see "NeuroAgi" in Chrome extensions.

**Fix (Aryan):** Change to `"name": "FschoolAI"` or `"name": "Reggie by FschoolAI"` in `extension/manifest.json`.

---

## Build Order Summary

| # | Gap | File | Priority | Who |
|---|---|---|---|---|
| 1 | user_id → person_id bridge | `backend/server/utils/person-bridge.ts` (new) | 🔴 Critical | Johan |
| 2 | Extension backend routes | `backend/server/routes/extension.ts` (new) | 🔴 Critical | Johan |
| 3 | Context window reads library | `backend/server/services/brain-context-window.ts` (modify) | 🔴 Critical | Johan |
| 4 | Assignment Agent rubric source | `backend/server/agents/assignment-agent.ts` (modify) | 🔴 Critical | Johan |
| 5 | fschool.assignments populated | Inside Gap 2 route (modify) | 🔴 Critical | Johan |
| 6 | Library Organizer Agent | `backend/server/services/library-organizer.ts` (new) | 🟡 High | Johan |
| 7 | Prompt caching | `backend/server/services/brain-chat-session.ts` (modify) | 🟡 High | Johan |
| 8 | University ID on data | DB migration + Aryan extension change | 🟡 High | Johan + Aryan |
| 9 | Professor identity | DB migration + `extension.ts` route (modify) | 🟡 High | Johan |
| 10 | Manifest name | `extension/manifest.json` (modify) | 🟢 Low | Aryan |

**Gaps 1–5 must be done before Aryan's v2 is useful. Gaps 6–9 can be done in any order after.**

---

## What Aryan Needs From You Before He Can Test

Once you complete Gap 2 (extension routes), tell Aryan:
- The base URL for the deployed backend (Railway URL)
- That `/api/extension/sync`, `/api/extension/signal`, `/api/extension/content`, and `/api/extension/library/exists` are live
- That JWT auth is required on all routes (send `Authorization: Bearer <supabase_jwt>` header)

He will update his extension to call these endpoints instead of Supabase directly.
