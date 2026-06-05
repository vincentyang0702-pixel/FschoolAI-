# Agent: Motivation Engine

**Priority:** Sprint 3
**Status:** 🔴 NOT BUILT
**Pages:** HOME, SOCIAL, LEADERBOARD, CHAT (global nudges)
**Existing code:** None

---

## Purpose

Detects motivation drops before they become procrastination spirals. Intervenes with the RIGHT type of motivation for THIS specific student. Not generic "you can do it!" — personalized nudges that actually work.

---

## Trigger

- Student hasn't opened app in 24+ hours (absence detection)
- Study session duration dropping (engagement decline)
- Assignment not started with < 48h to deadline (procrastination pattern)
- Streak about to break (midnight approaching, no activity)
- Leaderboard position dropped (competitive nudge opportunity)
- Friend started studying (social nudge opportunity)

---

## Student Motivation Types

The brain learns which type works for each student:

| Type | Nudge Style | Example |
|---|---|---|
| **Competitive** | Leaderboard + comparison | "Sarah just passed you. 15 min gets you back to #1" |
| **Achievement** | Streaks + milestones | "You're 2 days from your longest streak ever" |
| **Social** | Friends + belonging | "3 friends are in a study room right now" |
| **Fear-driven** | Consequences + predictions | "Your grade prediction drops to C+ if you start tomorrow" |
| **Curiosity** | Insights + discoveries | "I found a connection between your Physics and Econ courses" |
| **Reward** | Tokens + unlocks | "One more session unlocks Advanced tier" |

---

## Logic

```
ON motivation_check (runs every 2 hours for active students):
  1. Read student's recent signals (last 48h)
  2. Detect motivation state:
     - DECLINING: session durations dropping, longer gaps between actions
     - ABSENT: no signals in 24+ hours
     - AT_RISK: deadline approaching + no preparation signals
     - STABLE: normal activity patterns
     - HIGH: above-average engagement
  3. If state is DECLINING, ABSENT, or AT_RISK:
     a. Determine motivation type for this student:
        - Read neuro.patterns for motivation_response_history
        - Pick the type with highest historical success rate
        - If no history: try SOCIAL first (highest average success across all students)
     b. Generate nudge:
        - Gather context specific to the chosen type
        - Generate message using LLM with student context
     c. Deliver nudge:
        - Push notification (if enabled)
        - Queue for next app open (situation synthesizer includes it)
     d. Write signal: { type: 'motivation_nudge_sent', data: { nudge_type, context } }
  4. Track nudge effectiveness:
     - If student acts within 2 hours of nudge → mark as SUCCESS
     - If student ignores → mark as IGNORED
     - Update motivation_response_history in neuro.patterns

ADAPTATION RULES:
  - If a nudge type is ignored 3 times in a row → stop using it for 2 weeks
  - If a nudge type succeeds 3 times in a row → increase its weight
  - Never send more than 2 nudges per day (avoid notification fatigue)
  - Never send nudges between 11pm-7am (respect sleep)
  - If student explicitly says "stop" → pause all nudges for 1 week
```

---

## Example Nudges

**Competitive student, leaderboard drop:**
> "Heads up — Sarah just moved to #2 in Nerdmaxing. You're at #3 now. A 20-minute study session tonight puts you back on top. Your Thermo essay is a good candidate."

**Social student, friend online:**
> "Marcus and Priya just started a Calculus study room. They're working on the same problem set you have due Thursday. Join them? You study 40% longer when Marcus is there."

**Fear-driven student, deadline approaching:**
> "Your Physics lab report is due in 36 hours. Based on your pace, you need at least 3 hours to write it. If you start tonight: predicted grade B+. If you start tomorrow night: predicted grade C+. The difference is one evening."

**Achievement student, streak at risk:**
> "Your streak is at 14 days — your personal best is 15. Midnight is in 3 hours. Even a 10-minute flashcard session keeps it alive. Want me to pull up your weakest topic?"

---

## Writes To

| Table | What It Writes |
|---|---|
| `brain.signals` | Nudge sent, nudge response (success/ignored) |
| `neuro.patterns` | Motivation type effectiveness history |

---

## How It Compounds

- Week 1: Tries different nudge types, observes what works
- Week 4: Knows this student responds to social nudges but ignores competitive ones
- Week 8: Knows the optimal time of day to nudge, the optimal tone, the optimal frequency
- Week 12: Nudges feel like a friend who knows exactly what to say — because the brain has learned exactly what works

The motivation engine is the agent that prevents churn. Without it, students download the app, use it for a week, and forget. With it, the app reaches out at exactly the right moment with exactly the right message.
