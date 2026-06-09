# Brain Integration Patch for NeuralRing.jsx

**Pratik — apply these 4 changes to `frontend/src/components/NeuralRing.jsx`**

Johan must complete Gap 1 (add `brain_person_id` to `public.users`) and add the Vercel env vars before this works. But you can add the code now — it fails gracefully if brain context is not available.

---

## Change 1 — Add imports at the top of NeuralRing.jsx

After the existing imports, add:

```js
import { loadBrainContext, formatBrainContextForPrompt, getBrainSuggestedCapability } from '../api/brain';
```

---

## Change 2 — Add brainContext state variable

In the state declarations section (around line 390, near `const [impressions, setImpressions]`), add:

```js
const [brainContext, setBrainContext] = useState(null);
```

---

## Change 3 — Load brain context in the loadMemory() useEffect

In the `loadMemory()` async function (around line 461), after loading `tutor_mind`, add:

```js
// Load NeuroAGI brain context window
// Requires: public.users.brain_person_id (Johan's Gap 1 fix)
// Requires: VITE_BRAIN_SUPABASE_URL + VITE_BRAIN_SUPABASE_ANON_KEY env vars
const personId = userData?.brain_person_id;
if (personId) {
  const ctx = await loadBrainContext(personId);
  if (ctx) {
    setBrainContext(ctx);
    console.log('[Brain] Context loaded:', {
      stress: ctx.stress_level,
      momentum: ctx.momentum_state,
      deadline: ctx.most_urgent_deadline?.name,
      written: ctx.written_at,
    });
  }
}
```

**Important:** The `loadMemory` useEffect depends on `userId`. But `userData` (which has `brain_person_id`) is loaded in a separate useEffect. You need to either:
- Add `userData` to the dependency array of the `loadMemory` useEffect, OR
- Move the brain context load into the `init()` function in `AppContext.jsx` and pass it down via context

The simplest approach: add a separate useEffect that fires when `userData` changes:

```js
// Separate useEffect — fires when userData loads and has brain_person_id
useEffect(() => {
  if (!userData?.brain_person_id) return;
  loadBrainContext(userData.brain_person_id).then(ctx => {
    if (ctx) setBrainContext(ctx);
  });
}, [userData?.brain_person_id]);
```

---

## Change 4 — Inject brain context into buildChatSystem()

In the `buildChatSystem()` function (around line 113), add `brainContext` as a parameter and inject it into the system prompt:

**Function signature change:**
```js
// Before:
function buildChatSystem(courseOptions, userData, assignments, flashcardMap, syllabus, impressions, lastSession, livingMind, isFirstMessage = false) {

// After:
function buildChatSystem(courseOptions, userData, assignments, flashcardMap, syllabus, impressions, lastSession, livingMind, isFirstMessage = false, brainContext = null) {
```

**Add brain section inside the function** (after the `livingMind` section, before the RULES):

```js
// Brain intelligence section — from NeuroAGI brain.context_window
const brainSection = formatBrainContextForPrompt(brainContext, userData?.name || 'the student');
```

**Add `${brainSection}` to the return string** (after the livingMind line):

```js
${livingMind ? `LIVING MIND (your full student model — built across all sessions):\n${livingMind}` : ""}
${brainSection}
${lastSessionLine ? `CONTINUITY:\n${lastSessionLine}` : ""}
```

**Update the buildChatSystem() call** (around line 804, where it's called with all the parameters):

```js
const system = buildChatSystem(
  courseOptions,
  userData,
  assignments,
  flashcardMap,
  syllabus,
  impressions,
  lastSession,
  livingMind,
  isFirstMessage,
  brainContext  // ← add this
);
```

---

## Change 5 — Brain-aware routing before sending message

In the message send handler (around line 760, where the message is processed), add brain-aware routing BEFORE the existing keyword detection:

```js
// Brain-aware routing — check brain state before keyword detection
// This catches cases like "help me" when brain knows deadline is in 2 hours + avoidance active
const brainSuggestedCapability = getBrainSuggestedCapability(brainContext, text);
// Pass brainSuggestedCapability to your routing logic
// If brainSuggestedCapability is not null, use it as the capability hint
// The backend agent-router will do the full brain-aware routing via the system prompt
```

Note: The frontend doesn't need to do full routing — the brain context injected into the system prompt already guides Claude to respond appropriately. This is just an optional optimization for pre-routing before the API call.

---

## What This Unlocks

Once these 4 changes are applied and Johan has:
1. Added `brain_person_id` to `public.users`
2. Added the brain Supabase env vars to Vercel
3. Fixed the context window startup refresh (Bug 1)

Every chat session will have:
- Reggie knowing the student's current stress level
- Reggie knowing if there's a deadline in the next 24 hours
- Reggie knowing the student's confirmed behavioral patterns
- Reggie knowing what NOT to mention this session
- Reggie knowing the student's voice preferences
- The brain's pending intervention delivered naturally in conversation

The product immediately feels like it knows the student. That's the brain working.

---

## Fallback Behavior

If brain context is not available (env vars not set, Johan's fix not done, or brain scheduler not running), `brainContext` stays `null` and `formatBrainContextForPrompt(null)` returns `''`. The system prompt is unchanged. Reggie works exactly as it does today — no regression.
