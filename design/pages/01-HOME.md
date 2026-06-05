# Page 01: HOME

**Route:** `/` (default after login)  
**Position in swipe order:** 1 of 7

---

## What the Student Feels

The moment they open the app, they feel like their tutor already knows what today looks like and is ready to help — without the student having to explain anything.

---

## Layout

```
┌─────────────────────────────────┐
│  [streak 🔥7]    [tokens ⚡1250] │  ← Stats bar (top)
│                                 │
│                                 │
│         ╔═══════════╗           │
│         ║           ║           │
│         ║  NEURAL   ║           │  ← Neural Ring (center)
│         ║   RING    ║           │
│         ║           ║           │
│         ╚═══════════╝           │
│                                 │
│  ┌─────────────────────────┐    │
│  │ ✦ "Hey, your Thermo     │    │  ← Tutor greeting card
│  │   essay is due Friday.  │    │
│  │   Here's what matters   │    │
│  │   most today."          │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌──────────────────────────┐   │
│  │ 🔴 Thermo Essay  Due Fri │   │  ← Priority action card
│  │    [Help me start →]     │   │
│  └──────────────────────────┘   │
│                                 │
│  Sarah is studying Thermo now   │  ← Social nudge
│                                 │
│         ● ○ ○ ○ ○ ○ ○           │  ← Page indicator dots
└─────────────────────────────────┘
```

---

## AI Presence

- **Tutor greeting card** — Situation Synthesizer generates this. Reads today's assignments, recent signals, and brain state. Speaks in the student's tutor name.
- **Priority action card** — The single most important thing the student should do today. Tapping "Help me start" opens chat with the assignment pre-loaded.
- **Social nudge** — Social Intelligence Agent. Shows if a friend is studying something relevant right now.
- **Neural Ring** — Visualizes the 8 brain signal types. Pulses when AI is active. Tap opens chat.
- **Stats bar** — Streak, tokens, tier. Updates in real-time.

---

## Key Interactions

1. **Tap Neural Ring** → Opens chat panel (slides up from bottom)
2. **Tap "Help me start"** → Opens chat panel with assignment context pre-loaded
3. **Tap social nudge** → Opens Social page or sends "Study together?" to friend
4. **Swipe left** → Goes to ASSIGNMENTS page
5. **Swipe up** → Opens chat panel (same as tapping ring)

---

## Empty State (New User, No Data Yet)

```
┌─────────────────────────────────┐
│  [streak 🔥0]    [tokens ⚡0]   │
│                                 │
│         ╔═══════════╗           │
│         ║  (dim)    ║           │
│         ║  NEURAL   ║           │
│         ║   RING    ║           │
│         ╚═══════════╝           │
│                                 │
│  ┌─────────────────────────┐    │
│  │ "Hey! I'm [TutorName].  │    │
│  │  Connect Canvas and     │    │
│  │  I'll know your whole   │    │
│  │  semester in 30 sec."   │    │
│  └─────────────────────────┘    │
│                                 │
│  [Connect Canvas →]             │
└─────────────────────────────────┘
```

---

## Token Moments on This Page

| Action | Tokens |
|---|---|
| Open app (daily first open) | +10 |
| Tap "Help me start" and engage with response | +5 |
| Complete the priority action | +50–100 (depends on action) |

Animation: Floating "+10" rises from stats bar on first open.

---

## Mobile Gestures

- **Swipe left:** Go to ASSIGNMENTS
- **Swipe right:** Nothing (first page)
- **Swipe up:** Open chat panel
- **Tap Neural Ring:** Open chat panel
- **Tap greeting card:** Expand to full message
- **Tap priority card:** Open assignment detail

---

## Design Notes

- Neural Ring should animate gently on page load (segments fade in one by one)
- Greeting card text should never be the same twice — the Situation Synthesizer generates it fresh each time
- The tutor name appears in the greeting: "Hey, I'm [Name]" on first use, then just the message after
- Stats bar numbers should count up on first load (satisfying animation)
- If streak is 0, show "Start your streak today" instead of "🔥0"
- The priority action card border should pulse with `--accent-warm` if urgency is high
- Dark background, no clutter — the Neural Ring is the hero element
