# Page 06: SOCIAL

**Route:** `/social`  
**Position in swipe order:** 6 of 7

---

## What the Student Feels

Studying feels less lonely. They can see what their friends are working on, find the right study partner, and join a room in one tap.

---

## Layout

```
┌─────────────────────────────────┐
│  Social                         │
│                                 │
│  ┌─────────────────────────┐    │
│  │ 🟢 LIVE ROOMS           │    │
│  │  ┌───────────────────┐  │    │
│  │  │ Thermo Study  3👤 │  │    │
│  │  │ Sarah + 2 others  │  │    │
│  │  │ Chapter 7  •  45m │  │    │
│  │  │ [Join →]          │  │    │
│  │  └───────────────────┘  │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ FRIENDS                 │    │
│  │  Sarah     🟢 Studying  │    │
│  │  87% match  Thermo      │    │
│  │  [Study together →]     │    │
│  │                         │    │
│  │  Marcus    🟡 Idle      │    │
│  │  72% match  Physics     │    │
│  │  [Invite to room →]     │    │
│  └─────────────────────────┘    │
│                                 │
│  ✦ "You study 40% longer        │
│     with Sarah"                 │
│                                 │
│  [+ Create Study Room]          │
│         ● ● ● ● ● ● ○           │
└─────────────────────────────────┘
```

---

## AI Presence

- **Compatibility score** (87% match) — Social Intelligence Agent. Based on complementary knowledge gaps, shared courses, and historical study session outcomes.
- **Partner suggestion** (`✦ "You study 40% longer with Sarah"`) — Social Intelligence Agent. Derived from actual session data.
- **Room topic suggestion** — When creating a room, AI suggests the topic based on both students' upcoming deadlines.

---

## Key Interactions

1. **Tap "Join"** → Enters the study room. Real-time session begins.
2. **Tap "Study together"** → Sends a study invite to the friend. Creates a room if accepted.
3. **Tap "Create Study Room"** → Opens room creation flow. AI suggests topic and duration.
4. **Tap friend card** → Opens friend profile with shared stats.
5. **Swipe page left** → Go to LEADERBOARD.
6. **Swipe page right** → Go to BRAIN.

---

## Privacy

- Compatibility scores are only shown to the student, not to their friends
- "Currently studying" status is opt-in (default: on)
- Friends can only see: online/offline status, current course (not specific assignment)

---

## Empty State (No Friends Yet)

```
┌─────────────────────────────────┐
│  Social                         │
│                                 │
│  ┌─────────────────────────┐    │
│  │ ✦ "Add friends from     │    │
│  │   your courses and I'll │    │
│  │   find your best study  │    │
│  │   partner."             │    │
│  └─────────────────────────┘    │
│                                 │
│  [Find classmates →]            │
└─────────────────────────────────┘
```

---

## Token Moments

| Action | Tokens |
|---|---|
| Join a study room | +15 |
| Study in a room for 25+ min | +40 |
| Help a friend (answer their question in room) | +25 |
| Create a room others join | +20 |

---

## Design Notes

- Online status indicator: green dot = studying, yellow dot = idle, gray = offline
- Compatibility percentage uses `--accent-primary` color
- Live rooms should feel urgent and alive — pulsing green indicator
- The AI partner suggestion is the most important element — make it prominent
