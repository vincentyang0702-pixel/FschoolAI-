# Page 00: ONBOARDING

**Route:** `/onboarding`  
**Trigger:** First login only. Never shown again after completion.  
**Target time:** Under 2 minutes.

---

## What the Student Feels

Meeting their tutor for the first time. Exciting, not overwhelming.

---

## Step 1: Name Your Tutor

```
┌─────────────────────────────────┐
│                                 │
│         ╔═══════════╗           │
│         ║  (ring)   ║           │  ← Neural Ring, dim
│         ╚═══════════╝           │
│                                 │
│  "I'm your AI tutor.            │
│   What would you like           │
│   to call me?"                  │
│                                 │
│  ┌─────────────────────────┐    │
│  │  [Type a name...]       │    │
│  └─────────────────────────┘    │
│                                 │
│  Suggestions: Nova  Sage  Aria  │
│                                 │
│  [Continue →]                   │
└─────────────────────────────────┘
```

- Student types any name they want. No restrictions.
- Suggestions are offered but not required.
- Name stored in `neuro.memory` as `key='tutor_name'`.
- After confirming: Neural Ring brightens slightly. "Nice to meet you. I'm [Name]."

---

## Step 2: Connect Canvas

```
┌─────────────────────────────────┐
│                                 │
│  "Hi, I'm [Name].               │  ← Tutor name appears immediately
│   Connect Canvas and I'll       │
│   know your whole semester      │
│   in 30 seconds."               │
│                                 │
│  What I'll see:                 │
│  ✓ Your courses                 │
│  ✓ Your assignments             │
│  ✓ Your grades                  │
│                                 │
│  What I won't see:              │
│  ✗ Your messages to professors  │
│  ✗ Other students' data         │
│                                 │
│  [Connect Canvas →]             │
│  [Skip for now — smaller text]  │
└─────────────────────────────────┘
```

- Canvas OAuth opens in browser. Returns to app after auth.
- After connecting: "Got it. You have 4 courses and 20 assignments. Let me get to work."
- Skip is allowed — they can connect later from CANVAS page.

---

## Step 3: Brain Intro

```
┌─────────────────────────────────┐
│                                 │
│         ╔═══════════╗           │
│         ║  (ring)   ║           │  ← Neural Ring, medium brightness
│         ╚═══════════╝           │
│                                 │
│  "This is your Neural Ring.     │
│   It shows your brain state.    │
│   The more we work together,    │
│   the smarter it gets."         │
│                                 │
│  [dim ring] ──► [bright ring]   │  ← Animation showing growth
│   Day 1            Day 100      │
│                                 │
│  [Let's go →]                   │
└─────────────────────────────────┘
```

- Simple animation: ring grows brighter from left to right
- Sets expectations: the app gets better the more they use it
- "Let's go" takes them to HOME page

---

## Design Rules for Onboarding

1. **No progress bar** — it feels like a task. Instead, the Neural Ring grows slightly brighter after each step.
2. **Tutor name must appear in Step 2 and 3 immediately** after being entered in Step 1.
3. **Step 2 transparency section is non-negotiable** — students are cautious about data. Be explicit about what is and is not accessed.
4. **Skip is always available** but visually de-emphasized (smaller text, lower contrast).
5. **Total time: under 2 minutes** — do not add more steps.
6. **Tone:** Conversational, not instructional. The tutor speaks, not the app.
