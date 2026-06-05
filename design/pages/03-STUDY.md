# Page 03: STUDY

**Route:** `/study`  
**Position in swipe order:** 3 of 7

---

## What the Student Feels

The app already knows what they need to study — they don't have to figure it out. It feels like having a tutor who reviewed their whole semester and prepared exactly the right material.

---

## Layout

```
┌─────────────────────────────────┐
│  Study              [ENGR 301▼] │  ← Header + course selector
│                                 │
│  ┌─────────────────────────┐    │
│  │ 📚 Lessons For You      │    │  ← AI-generated lessons section
│  │                         │    │
│  │  ┌─────────────────┐    │    │
│  │  │ Entropy Basics  │    │    │
│  │  │ 12 min  ✦ Gap   │    │    │
│  │  │ [Start →]       │    │    │
│  │  └─────────────────┘    │    │
│  │                         │    │
│  │  ┌─────────────────┐    │    │
│  │  │ Carnot Cycle    │    │    │
│  │  │ 8 min  ✦ Exam   │    │    │
│  │  │ [Start →]       │    │    │
│  │  └─────────────────┘    │    │
│  └─────────────────────────┘    │
│                                 │
│  [Flashcards 24] [Study Guide]  │  ← Tab bar
│                                 │
│  ┌─────────────────────────┐    │
│  │ Q: What is entropy?     │    │  ← Flashcard (active tab)
│  │                         │    │
│  │ [Flip]                  │    │
│  └─────────────────────────┘    │
│                                 │
│  [+ Generate Flashcards ✦]      │  ← AI generate button
│         ● ● ● ○ ○ ○ ○           │
└─────────────────────────────────┘
```

---

## AI Presence

- **Lessons For You** — Lesson Generator Agent. Detects knowledge gaps from chat history and Canvas performance. Generates micro-lessons targeting exactly what the student doesn't know.
- **Flashcards** — Study Agent. Generated from uploaded notes or Canvas content. Tagged by concept.
- **Study Guide** — Study Agent. A structured summary of the course material, personalized to the student's learning style.
- **Focus timer suggestion** — Focus Agent. Suggests session length based on the student's historical focus patterns.

---

## Key Interactions

1. **Tap lesson card** → Opens lesson in chat panel. Tutor teaches the concept step by step.
2. **Tap flashcard** → Flips to reveal answer. Swipe right = got it, swipe left = review again.
3. **Tap "Generate Flashcards"** → AI generates flashcards from course material. Shows progress.
4. **Tap "Study Guide" tab** → Shows structured summary with AI highlights.
5. **Swipe page left** → Go to CANVAS.
6. **Swipe page right** → Go to ASSIGNMENTS.

---

## Empty State (No Content Generated Yet)

```
┌─────────────────────────────────┐
│  Study              [ENGR 301▼] │
│                                 │
│  ┌─────────────────────────┐    │
│  │ ✦ "Upload your notes    │    │
│  │   or I'll generate      │    │
│  │   study material from   │    │
│  │   your Canvas content." │    │
│  └─────────────────────────┘    │
│                                 │
│  [Upload Notes]                 │
│  [Generate from Canvas ✦]       │
└─────────────────────────────────┘
```

---

## Token Moments

| Action | Tokens |
|---|---|
| Complete a lesson | +60 |
| Complete a flashcard session (10+ cards) | +30 |
| Study streak (3 days in a row) | +50 bonus |
| Upload notes | +20 |

---

## Design Notes

- Lessons For You section should always show 2-3 lessons max. Not overwhelming.
- Each lesson card shows the reason it was generated ("You seemed confused about this in chat" or "This is on your upcoming exam")
- Flashcard flip animation: card rotates 180° on Y axis, 300ms
- Flashcard swipe: right = green flash, left = red flash
- Focus timer is optional — student can dismiss it
- Course selector dropdown should show all enrolled courses with brain health indicator per course
