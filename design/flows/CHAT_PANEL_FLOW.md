# Chat Panel Flow

The chat panel is the most important UI element in FschoolAI. It is accessible from every page. It is the student's primary interface with their AI tutor.

---

## How It Opens

- **Tap Neural Ring** (HOME page) → slides up from bottom
- **Swipe up** (any page) → slides up from bottom
- **Tap "Help me start"** (ASSIGNMENTS) → slides up with assignment pre-loaded
- **Tap "Ask about this course"** (CANVAS) → slides up with course context pre-loaded
- **Tap "Start lesson"** (STUDY) → slides up with lesson context pre-loaded

## How It Closes

- **Swipe down** → slides back down
- **Tap outside panel** → slides back down
- **Tap X button** → slides back down

---

## Layout

```
┌─────────────────────────────────┐
│  ████████████████████████████   │  ← 20% backdrop (blurred)
│  ████████████████████████████   │
│                                 │
├─────────────────────────────────┤
│  [TutorName]              [✕]   │  ← Panel header
│                                 │
│  ┌─────────────────────────┐    │
│  │ Tutor: "Your Thermo     │    │  ← Tutor message bubble
│  │ essay is due Friday.    │    │
│  │ Want me to break it     │    │
│  │ down?"                  │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ You: "Yes please"       │    │  ← Student message bubble
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ Tutor: "Here's a 3-part │    │
│  │ framework..."           │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌───────────────────────────┐  │
│  │ [🎤] [Ask anything...]    │  │  ← Input bar
│  │                    [Send] │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

---

## What the Chat Can Do (15 Capabilities)

| # | Capability | Example |
|---|---|---|
| 1 | Answer academic questions | "Explain entropy" |
| 2 | Help start an assignment | "Help me start my Thermo essay" |
| 3 | Generate study materials | "Make flashcards for Chapter 7" |
| 4 | Predict grades | "What grade will I get on this?" |
| 5 | Explain professor expectations | "What does Prof Chen want?" |
| 6 | Create a study plan | "Plan my week for finals" |
| 7 | Recall past conversations | "What did we discuss last week?" |
| 8 | Motivate | "I don't want to study" |
| 9 | Modify the interface | "Make my background darker" |
| 10 | Find a study partner | "Who should I study with?" |
| 11 | Summarize course material | "Summarize Chapter 7" |
| 12 | Check assignment status | "What's due this week?" |
| 13 | Explain a concept step by step | "Teach me the Carnot cycle" |
| 14 | Generate a lesson | "Give me a 10-min lesson on entropy" |
| 15 | Export brain insights | "What have I learned this semester?" |

---

## Context Pre-loading

When the chat opens from a specific context, the first tutor message is already relevant:

| Opened from | First tutor message |
|---|---|
| HOME (no context) | Today's situation summary |
| ASSIGNMENTS → Help me start | "Here's how I'd approach [assignment name]..." |
| CANVAS → course | "For [Course], Prof [Name] tends to value..." |
| STUDY → lesson | "Let's start with [concept]. First..." |
| LEADERBOARD | "You're 15 pts from #3. Here's what to do tonight." |

---

## Design Notes

- Panel slides up with spring physics (slight overshoot, then settle)
- Backdrop is blurred, not black — student can still see the page behind
- Tutor message bubbles: left-aligned, `--bg-elevated` background
- Student message bubbles: right-aligned, `--accent-primary` background
- Streaming text: characters appear one by one (typewriter effect)
- Voice input: tap microphone icon, speak, release to send
- Artifact cards (study guides, flashcard sets) render inline in the chat as tappable cards
