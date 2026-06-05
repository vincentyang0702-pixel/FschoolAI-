# Agent: Situation Synthesizer

**Priority:** Sprint 1 — Build first
**Status:** 🔴 NOT BUILT
**Pages:** HOME, CHAT
**Existing code:** None

---

## Purpose

Generates the tutor's opening greeting every time the student opens the app. Not "Hello! How can I help?" — a real, situation-aware message that proves the brain is alive.

---

## Trigger

- Student opens the app (HOME page load)
- Student opens chat from HOME page
- Called by Motivation Engine when sending a proactive nudge

---

## Inputs

| Source | What It Reads | Table |
|---|---|---|
| Recent signals | Last 24 hours of activity | `brain.signals` |
| Upcoming deadlines | Assignments due in next 7 days | `fschool.assignments` (via Canvas sync) |
| Recent grades | Any grades posted in last 48 hours | `brain.signals` where type = 'grade_posted' |
| Current streak | Days of consecutive activity | `brain.signals` aggregate |
| Social context | Friends currently online/studying | `agents.sessions` (active) |
| Time context | Current time, day of week | System clock |
| Historical patterns | What the student usually does at this time | `neuro.patterns` |
| Last interaction | What happened last time they used the app | `agents.messages` (most recent) |

---

## Output

A single JSON object:

```json
{
  "greeting": "Hey, it's Wednesday 9pm. Your Thermo assignment is due Friday...",
  "tone": "urgent",  // urgent | encouraging | celebratory | casual | concerned
  "priority_action": {
    "type": "assignment",
    "id": "assignment_uuid",
    "label": "Start Thermo Chapter 7 Essay"
  },
  "social_nudge": "Sarah is studying Thermo right now",
  "token_opportunity": "Submit early for +100 tokens"
}
```

---

## Logic

```
1. Gather all inputs (parallel queries)
2. Determine TONE:
   - If deadline < 24h and not started → "urgent"
   - If grade just posted and improved → "celebratory"
   - If streak about to break → "concerned"
   - If friend is online studying same subject → "encouraging"
   - Default → "casual"
3. Determine PRIORITY ACTION:
   - Sort upcoming deadlines by urgency
   - Weight by: (time_remaining × difficulty × predicted_grade_impact)
   - Pick the top one
4. Determine SOCIAL NUDGE:
   - Check if any friends are currently active
   - If friend is studying same subject → include nudge
5. Generate GREETING:
   - Call LLM with: tone, priority action, social nudge, student name, tutor name
   - System prompt: "You are [tutor_name]. Generate a 2-3 sentence greeting that is {tone}. Reference the specific situation. Do not be generic."
6. Write signal: { type: "situation_synthesis", data: { tone, priority_action } }
```

---

## Example Outputs

**Urgent:**
> "Hey, it's Tuesday night. Your Thermodynamics essay is due in 36 hours and you haven't started. Based on your pattern, you usually start Wednesday night — but Prof Chen's essays take you 4+ hours. Sarah is online working on hers right now. Want to join her or should I help you outline it?"

**Celebratory:**
> "Your Calculus midterm came back — 87%! That's up from 74% on the last quiz. The integration practice we did last week paid off. You've got nothing due until Thursday. Take a breath."

**Concerned:**
> "I noticed you haven't opened the app in 3 days. Your streak was at 12 days — it'll reset at midnight. You have a Physics lab report due Monday. Even 10 minutes tonight keeps the streak alive and I can help you outline the lab report."

**Casual:**
> "Good morning. Light day today — just one reading assignment for English Lit. Your knowledge graph grew 3 nodes yesterday from that study session. Want to do a quick 15-min review of yesterday's material while it's fresh?"

---

## Writes To

| Table | What It Writes |
|---|---|
| `brain.signals` | Signal with type `situation_synthesis` — records what was presented |
| `brain.context_window` | Updates the "current_situation" field for other agents to read |

---

## Reads From

| Table | What It Reads |
|---|---|
| `brain.signals` | Last 24h signals for this person |
| `brain.context_window` | Pre-computed context (if available) |
| `neuro.patterns` | Historical behavior patterns |
| `neuro.memory` | Tutor name, preferences |
| `agents.sessions` | Active friend sessions |

---

## Dependencies

- Context Window Builder must have run recently (within 30 min)
- Canvas Watcher must be syncing (for deadline data)
- Brain Scheduler must be active (keeps context fresh)

---

## How It Compounds

Every situation synthesis is stored as a signal. Over time, the Reflection Engine can analyze:
- "Student ignores urgent greetings 60% of the time → switch to encouraging tone"
- "Student responds to social nudges 80% of the time → always include friend status"
- "Student opens app most at 9pm → schedule synthesis for 9pm context"

The greeting gets smarter every week because the brain learns what works for THIS student.

---

## Implementation Notes

- Must respond in < 2 seconds (student is waiting on page load)
- If context window is stale (> 1 hour), do a quick signal query instead of full rebuild
- Cache the greeting for 15 minutes (don't regenerate on every page revisit)
- If no meaningful situation exists, fall back to: streak status + token balance + random insight from reflections
