# Page 05: BRAIN

**Route:** `/brain`  
**Position in swipe order:** 5 of 7

---

## What the Student Feels

They can see their own mind — what they know, how they think, how they've grown. It feels like looking at a map of themselves.

---

## Layout

```
┌─────────────────────────────────┐
│  Your Brain         Day 34 🧠   │  ← Header with brain age
│                                 │
│  ┌─────────────────────────┐    │
│  │                         │    │
│  │   [Knowledge Graph]     │    │  ← Interactive graph (canvas)
│  │   47 concepts mastered  │    │
│  │                         │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ 🧠 You learn 40% faster │    │  ← Top brain insights
│  │    in the morning       │    │
│  ├─────────────────────────┤    │
│  │ ✍️ Writing: developing  │    │
│  │    → improving          │    │
│  ├─────────────────────────┤    │
│  │ 💡 Strongest: Physics   │    │
│  │    Weakest: Stats Mech  │    │
│  └─────────────────────────┘    │
│                                 │
│  [Share Brain Card ↗]           │  ← Export/share
│         ● ● ● ● ● ○ ○           │
└─────────────────────────────────┘
```

---

## AI Presence

- **Knowledge Graph** — Knowledge Graph Agent. Nodes = concepts mastered. Edges = connections between concepts. Color = signal type. Size = confidence level.
- **Brain insights** — Situation Synthesizer + Reflection Engine. Derived from patterns in brain signals.
- **Writing evolution** — Writing Intelligence Agent. Tracks writing quality over time.
- **Brain age** — How many days the brain has been compounding. Grows every day the student uses the app.

---

## Key Interactions

1. **Tap a node in the knowledge graph** → Shows what signals built this concept, when it was learned, confidence level.
2. **Pinch/zoom on graph** → Zoom in to see concept clusters.
3. **Tap writing insight** → Opens writing evolution timeline. Shows how writing quality has changed over the semester.
4. **Tap "Share Brain Card"** → Generates a shareable card with top stats. Student can share to social media.
5. **Swipe page left** → Go to SOCIAL.
6. **Swipe page right** → Go to CANVAS.

---

## Brain Share Card

A beautiful, shareable card that shows:
- Student's tutor name
- Brain age (days)
- Top 3 strongest concepts
- Learning style
- GPA trend
- Semester stats

Design: Dark card with Neural Ring visualization, gold accents, student's name. Feels like an achievement card.

---

## Empty State (Brain Just Started)

```
┌─────────────────────────────────┐
│  Your Brain         Day 1 🧠    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ ✦ "Your brain is just   │    │
│  │   getting started.      │    │
│  │   Chat with me, study,  │    │
│  │   and I'll map what     │    │
│  │   you know."            │    │
│  └─────────────────────────┘    │
│                                 │
│  [Start a lesson →]             │
└─────────────────────────────────┘
```

---

## Design Notes

- Knowledge graph should use D3.js force-directed layout
- Nodes pulse gently when the student has recently learned that concept
- Graph background is slightly lighter than page background to create depth
- Brain age counter should feel like a badge of honor — the longer it grows, the more valuable the brain
- Writing evolution shows a simple line chart (quality score over time)
- The "Share Brain Card" is a key viral/marketing feature — make it beautiful
