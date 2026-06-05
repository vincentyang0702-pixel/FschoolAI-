# Page 08: STUDY ROOMS

**Route:** `/rooms/:id`  
**Access:** From SOCIAL page → Join or Create room

---

## What the Student Feels

Like being in a library with friends — everyone is focused, the AI tutor is in the room with them, and studying together actually helps.

---

## Layout

```
┌─────────────────────────────────┐
│  ← Thermo Study    45:23 ⏱     │
│                                 │
│  ┌─────────────────────────┐    │
│  │ PARTICIPANTS  3/8       │    │
│  │  🟢 Sarah    studying   │    │
│  │  🟢 Marcus   studying   │    │
│  │  🟢 You      studying   │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ ROOM CHAT               │    │
│  │                         │    │
│  │  Sarah: anyone get Q3?  │    │
│  │  ✦ Tutor: Q3 is about   │    │
│  │    entropy — here's...  │    │
│  │  Marcus: thx!           │    │
│  └─────────────────────────┘    │
│                                 │
│  [Type a message...]    [✦ Ask] │
│                                 │
│  [🎵 Focus Music] [⏸ Break]    │
└─────────────────────────────────┘
```

---

## AI Presence

- **In-room AI tutor** — Study Room Orchestrator Agent. Answers questions when @mentioned or "Ask AI" is tapped. Uses each student's Brain context window to personalize answers.
- **Focus music** — Plays ambient study music. Genre based on student preferences.
- **Break reminder** — Motivation Engine. Suggests breaks based on session length.
- **Room summary** — At end of session, AI generates a summary of what was discussed. Writes signals to each participant's Brain DB.

---

## Key Interactions

1. **Type in chat** → Message goes to all participants in real-time.
2. **Tap "Ask AI"** → Sends message to the in-room tutor. Response visible to all.
3. **@mention tutor** → Same as Ask AI button.
4. **Tap "Focus Music"** → Plays ambient music. Student can change genre.
5. **Tap "Break"** → Pauses session timer. Shows 5-min break countdown.
6. **Tap back arrow** → Leaves room. Session summary generated.

---

## Room Creation Flow (from SOCIAL page)

1. Tap "Create Study Room"
2. AI suggests: topic (based on upcoming deadlines), duration, privacy
3. Student confirms or modifies
4. Room created. Share link generated. Friends notified.

---

## Session End Summary

When the last student leaves (or timer ends):

```
┌─────────────────────────────────┐
│  Session Complete! 🎉           │
│                                 │
│  Duration: 47 minutes           │
│  Participants: 3                │
│                                 │
│  What you covered:              │
│  • Entropy and disorder         │
│  • Carnot cycle efficiency      │
│  • Q3 from Problem Set 4        │
│                                 │
│  +40 tokens earned              │
│  Brain signals recorded: 12     │
│                                 │
│  [Back to Social]               │
└─────────────────────────────────┘
```

---

## Token Moments

| Action | Tokens |
|---|---|
| Join a room | +15 |
| Stay for 25+ minutes | +40 |
| Answer a question that helps others | +25 |
| Create a room that 3+ people join | +30 |

---

## Design Notes

- Room feels darker and more focused than other pages — this is a concentration space
- AI tutor responses in room chat have a distinct bubble style (different color, ✦ prefix)
- Focus timer is prominent but not distracting — top right corner
- Session summary is a key moment — make it feel like an achievement, not a receipt
- Real-time is powered by Cloudflare Durable Objects (Aryan's architecture)
- Max 8 participants per room
