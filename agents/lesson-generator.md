# Agent: Lesson Generator

**Priority:** Sprint 2
**Status:** 🔴 NOT BUILT
**Pages:** STUDY, CHAT
**Existing code:** None

---

## Purpose

Creates personalized micro-lessons that target the student's specific knowledge gaps, in their specific learning style, using their actual course material. Not generic flashcards — targeted interventions.

---

## Trigger

- Student opens STUDY page (shows "Lessons for you")
- Brain Scheduler detects a gap + upcoming deadline (proactive lesson push)
- Student asks in chat: "Teach me about [topic]"
- After a low quiz/assignment score (remediation lesson)

---

## Inputs

| Source | What It Reads |
|---|---|
| Knowledge gaps | From context window (detected from low scores, confused chat messages) |
| Upcoming deadlines | From Canvas sync — what's due soon? |
| Learning style | From `neuro.patterns` — examples-first? visual? short bursts? |
| Course material | From uploaded notes/recordings (if available) |
| Attention span | From `neuro.patterns` — average session duration |
| Previous lessons | From `brain.signals` — what lessons were completed, what scores? |

---

## Output: Lesson Object

```json
{
  "lesson_id": "uuid",
  "title": "Entropy — From Confusion to Clarity",
  "topic": "entropy",
  "course": "Thermodynamics 101",
  "style": "example-first",
  "estimated_duration": "12 min",
  "difficulty": "bridge_chapter_6_to_7",
  "sections": [
    {
      "type": "hook",
      "content": "Remember the heat engine problem you got right on Quiz 3? Entropy is why that engine can't be 100% efficient.",
      "duration": "1 min"
    },
    {
      "type": "explanation",
      "content": "...",
      "format": "analogy + diagram description",
      "duration": "4 min"
    },
    {
      "type": "practice",
      "questions": [...3 questions at student's level...],
      "duration": "5 min"
    },
    {
      "type": "connection",
      "content": "This connects to your upcoming Chapter 7 essay — you can use this understanding in Section 2.",
      "duration": "2 min"
    }
  ],
  "completion_tokens": 60,
  "connection_to_assignment": "assignment_uuid"
}
```

---

## Lesson Types

| Type | When Generated | Duration | Trigger |
|---|---|---|---|
| **Gap Filler** | Brain detects knowledge gap | 5-15 min | Low quiz score or confused chat |
| **Pre-Assignment Prep** | 48h before major assignment | 10-20 min | Deadline approaching |
| **Exam Review** | 7 days before exam | 30-45 min | Canvas calendar event |
| **Connection Builder** | Two courses share a concept | 5-10 min | Pattern recognition |
| **Weakness Drill** | Recurring struggle detected | 10-15 min | Multiple low scores on same topic |
| **Professor Style Prep** | Before submission | 5-10 min | Professor Intelligence + deadline |

---

## Logic

```
1. Read student's context window
2. Identify top 3 knowledge gaps (ranked by urgency):
   - Urgency = (deadline_proximity × grade_impact × gap_severity)
3. For each gap, generate a lesson:
   a. Choose lesson type based on trigger
   b. Choose style based on learning style pattern
   c. Set duration based on attention span pattern
   d. Set difficulty based on current mastery level
   e. Generate content using LLM with:
      - System prompt: "Generate a {duration} lesson on {topic} for a student who learns best from {style}. Start at {current_level}, build to {target_level}. Reference their specific context: {context}."
   f. Include practice questions calibrated to their level
   g. Connect to upcoming assignment if relevant
4. Store generated lessons in brain.signals (type = 'lesson_generated')
5. Present top lesson on STUDY page with: "I made this for you because..."
```

---

## Example Proactive Push

**Tutor message (48h before Thermo essay):**
> "Your Chapter 7 essay is due Friday. I noticed you were confused about entropy yesterday in chat. I made you a 12-minute lesson that starts with the heat engine example you liked and builds up to the applications you'll need for the essay. Want to do it now? (+60 tokens on completion)"

---

## Adaptation Rules

- If student completes lesson and scores > 80% on practice: mark gap as "closing"
- If student completes lesson and scores < 60%: generate an easier version
- If student skips a lesson 3 times: stop pushing it, try a different format
- If student completes lessons at 2am: schedule future lessons for nighttime
- If student always skips theory sections: make lessons 100% example-based

---

## Writes To

| Table | What It Writes |
|---|---|
| `brain.signals` | Lesson generated, lesson started, lesson completed, lesson score |
| `neuro.patterns` | Updated knowledge gap status after completion |

---

## How It Compounds

- Week 1: Generic lessons based on course syllabus
- Week 4: Lessons target specific gaps detected from quiz scores
- Week 8: Lessons are perfectly calibrated — right difficulty, right style, right duration
- Week 12: Lessons predict gaps BEFORE the student encounters them (from syllabus + pattern)
- The student who does lessons regularly has a measurably smaller knowledge gap than one who doesn't — and the grade predictions reflect this
