# Page 02: ASSIGNMENTS

**Route:** `/assignments`  
**Position in swipe order:** 2 of 7

---

## What the Student Feels

Every assignment feels manageable. The AI already knows what each one requires, how hard it will be for this specific student, and what the professor actually wants.

---

## Layout

```
┌─────────────────────────────────┐
│  Assignments          [filter▼] │  ← Header
│                                 │
│  ┌───────────────────────────┐  │
│  │ 🔴 Thermo Essay    Due Fri│  │  ← Assignment card (urgent)
│  │    ENGR 301               │  │
│  │    ✦ B+ predicted         │  │
│  │    ✦ Prof Chen: cite srcs  │  │
│  │    [Help me start →]      │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 🟡 Lab Report     Due Mon │  │  ← Assignment card (normal)
│  │    CHEM 201               │  │
│  │    ✦ A- predicted         │  │
│  │    Sarah submitted early  │  │
│  │    [Help me start →]      │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ ✅ Problem Set    Submitted│  │  ← Assignment card (done)
│  │    MATH 301               │  │
│  │    +100 tokens earned     │  │
│  └───────────────────────────┘  │
│                                 │
│         ● ● ○ ○ ○ ○ ○           │
└─────────────────────────────────┘
```

---

## AI Presence

- **Grade prediction badge** (`✦ B+ predicted`) — Exam Predictor Agent. Updates as the student works on the assignment.
- **Professor tip badge** (`✦ Prof Chen: cite sources`) — Professor Intelligence Agent. Pulled from grading history.
- **Friend status** (`Sarah submitted early`) — Social Intelligence Agent. Motivational social proof.
- **"Help me start" button** — Assignment Agent. Opens chat with full assignment context pre-loaded.
- **Token preview** — Token Engine. Shows what the student will earn for completing/submitting early.

---

## Key Interactions

1. **Tap "Help me start"** → Chat opens with assignment pre-loaded. Tutor generates a framework immediately.
2. **Tap assignment card** → Expands to show full details, rubric, and all AI insights.
3. **Tap filter** → Filter by course, urgency, status.
4. **Swipe right** → Back to HOME.
5. **Swipe left** → Go to STUDY.

---

## Assignment Card States

| State | Color | Icon |
|---|---|---|
| Overdue | `--accent-warm` | 🔴 |
| Due today | `--accent-warm` | 🟠 |
| Due this week | `--accent-gold` | 🟡 |
| Due later | `--text-secondary` | ⚪ |
| Submitted | `--accent-secondary` | ✅ |
| In progress | `--accent-primary` | 🔵 |

---

## Empty State

"No assignments due. Enjoy it — or get ahead." with a small illustration.

---

## Token Moments

| Action | Tokens |
|---|---|
| Tap "Help me start" and engage | +5 |
| Submit assignment on time | +50 |
| Submit assignment early (24h+) | +100 |
| Submit assignment early (48h+) | +150 |
| Get grade above predicted | +25 bonus |

---

## Mobile Gestures

- **Swipe left on card:** Mark as "working on it" (changes badge to 🔵)
- **Swipe right on card:** Snooze notification for 2 hours
- **Tap card:** Expand detail
- **Long press card:** Quick actions (share, add reminder, ask tutor)
- **Swipe page left:** Go to STUDY
- **Swipe page right:** Go to HOME

---

## Design Notes

- Cards should be sorted by urgency by default (overdue first, then by due date)
- Submitted assignments should be visually de-emphasized (lower opacity, pushed to bottom)
- The grade prediction should show confidence level subtly (e.g., "B+ predicted" with a thin confidence bar underneath)
- "Help me start" button should be the most visually prominent element on each card
- Professor tip badge should only show if the professor has enough history to generate a reliable tip
