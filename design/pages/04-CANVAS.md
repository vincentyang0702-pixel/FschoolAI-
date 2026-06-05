# Page 04: CANVAS

**Route:** `/canvas`  
**Position in swipe order:** 4 of 7

---

## What the Student Feels

Their academic life is organized and the AI has already analyzed everything — grades, trends, what each professor actually wants.

---

## Layout

```
┌─────────────────────────────────┐
│  Courses            [Sync ↻]    │  ← Header
│  Last synced: 2 min ago         │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Thermodynamics 101        │  │  ← Course card
│  │ Prof Chen  •  B+  ↑       │  │
│  │ ████████░░ Brain: 72%     │  │
│  │ ✦ "Values citations"      │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ Chemistry 201             │  │
│  │ Prof Davis  •  A-  →      │  │
│  │ ██████████ Brain: 88%     │  │
│  │ ✦ "Prefers lab precision" │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ [+ Add course manually]   │  │
│  └───────────────────────────┘  │
│                                 │
│         ● ● ● ● ○ ○ ○           │
└─────────────────────────────────┘
```

---

## AI Presence

- **Brain health bar** — Context Window Builder. Shows how well the brain understands this course (0-100%). Low = needs more signals.
- **Grade trend arrow** (↑ improving, → stable, ↓ declining) — Exam Predictor Agent.
- **Professor insight badge** (`✦ "Values citations"`) — Professor Intelligence Agent. Derived from grading patterns on submitted work.

---

## Key Interactions

1. **Tap course card** → Expands to show grade breakdown, assignment list, professor profile, and brain insights for that course.
2. **Tap sync button** → Triggers Canvas sync. Shows "Syncing..." then "Updated."
3. **Tap "Add course manually"** → Form to add a course not on Canvas.
4. **Swipe page left** → Go to BRAIN.
5. **Swipe page right** → Go to STUDY.

---

## Expanded Course View

When a course card is tapped, it expands (or navigates to a detail screen) showing:
- Grade breakdown by assignment category
- All assignments with status
- Professor profile (grading style, what they emphasize)
- Brain health breakdown (which signal types are strong/weak for this course)
- "Ask about this course" button → opens chat with course context

---

## Empty State (Canvas Not Connected)

```
┌─────────────────────────────────┐
│  Courses                        │
│                                 │
│  ┌─────────────────────────┐    │
│  │ ✦ "Connect Canvas and   │    │
│  │   I'll know your grades,│    │
│  │   assignments, and what │    │
│  │   each prof wants."     │    │
│  └─────────────────────────┘    │
│                                 │
│  [Connect Canvas →]             │
└─────────────────────────────────┘
```

---

## Design Notes

- Brain health bar uses gradient from `--accent-warm` (low) to `--accent-secondary` (high)
- Grade trend arrow color: green (↑), gray (→), red (↓)
- Professor insight badge should feel like insider knowledge — subtle but valuable
- Sync button shows a spinning animation while syncing
- Course cards should be sorted by priority (most urgent course first)
