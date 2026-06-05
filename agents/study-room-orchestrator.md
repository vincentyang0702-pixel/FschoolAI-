# Agent: Study Room Orchestrator

**Priority:** Sprint 3
**Status:** 🔴 NOT BUILT
**Pages:** SOCIAL (inside study rooms)
**Existing code:** None (Aryan building Cloudflare Durable Objects infrastructure)

---

## Purpose

Manages the AI tutor's behavior inside study rooms with multiple students. Adapts to everyone simultaneously while maintaining individual personalization. Never reveals one student's weaknesses to another.

---

## Trigger

- Student joins a study room
- Any participant asks a question in the room
- Room has been silent for 10+ minutes (engagement drop)
- Room topic changes

---

## Inputs

| Source | What It Reads |
|---|---|
| All participants' brain profiles | Knowledge gaps, learning styles, strengths |
| Room topic | What subject/assignment the room is focused on |
| Conversation history | What's been discussed in this session |
| Individual contexts | Each student's context window (private) |

---

## Room AI Behavior Modes

| Mode | When | Behavior |
|---|---|---|
| **Facilitator** | Room just started | Suggests a structure: "Let's start with a concept check" |
| **Peer Teaching** | Detects complementary knowledge | Asks strong student to explain to weaker one |
| **Clarifier** | Someone asks a question | Answers for the group, calibrated to lowest understanding |
| **Challenger** | Everyone seems comfortable | Poses a harder question to push the group |
| **Timekeeper** | Session running long | "You've been at it for 45 min. Take a 5-min break?" |
| **Silent** | Group is productive on their own | Stays quiet, only speaks if asked |

---

## Privacy Rules (Critical)

| Rule | Implementation |
|---|---|
| Never reveal individual grades | "Let's review this concept" NOT "Sarah got this wrong" |
| Never reveal individual gaps | Use peer teaching naturally, not by calling out weaknesses |
| Never compare students publicly | Comparisons only happen in private chat |
| Individual follow-up is private | After room ends, sends private insights to each student |

---

## Logic

```
ON student_joins_room:
  1. Read their brain profile (private)
  2. Identify their knowledge gaps relevant to room topic
  3. Identify their strengths relevant to room topic
  4. Add to room_state: { student_id, gaps: [...], strengths: [...] }

ON room_question_asked:
  1. Determine who asked and what they're confused about
  2. Check: does another student in the room know this well?
  3. If yes: suggest peer teaching ("Marcus, you got this on the quiz — want to explain?")
  4. If no: answer directly, calibrated to the group's average level
  5. Write signal for each participant: { type: 'study_room_interaction' }

ON room_silent_10min:
  1. Check room_state: is everyone working independently? (good silence)
  2. Or has engagement dropped? (bad silence)
  3. If bad silence: pose a discussion question or suggest a break
  4. If good silence: stay quiet

ON room_ends:
  1. For each participant (privately):
     - "You explained entropy really well to Sarah — teaching deepens understanding (+25 tokens)"
     - "You seemed confused about enthalpy — I have a 10-min lesson ready"
  2. Write signals: session duration, interactions, peer teaching events
  3. Update Social Intelligence: effectiveness of this group configuration
```

---

## Example Room Interaction

**Room: 3 students studying Thermodynamics**

*Tutor (Facilitator mode):*
> "Alright, you're all working on Chapter 7. Let's do a quick warm-up. Can someone explain the second law of thermodynamics in one sentence?"

*Sarah answers correctly.*

*Tutor (Peer Teaching mode):*
> "Nice, Sarah. Marcus, does that match your understanding? What would you add?"

*Marcus gives a partial answer.*

*Tutor (Clarifier mode):*
> "Good start. Let me connect those two answers — Sarah's definition and Marcus's example are actually the same thing from different angles. Here's how..."

*Later, room goes quiet for 12 minutes.*

*Tutor (Timekeeper mode):*
> "You've been grinding for 40 minutes. Quick break? When you come back, I have a challenge problem that combines everything you've discussed."

---

## Writes To

| Table | What It Writes |
|---|---|
| `brain.signals` | Per-student: room joined, interactions, peer teaching given/received |
| `neuro.patterns` | Social study effectiveness for this group configuration |

---

## How It Compounds

- Session 1: Generic facilitation, doesn't know group dynamics
- Session 5: Knows who explains well, who needs more time, optimal group rhythm
- Session 10: Can orchestrate the room like a master teacher — knows exactly when to push, when to back off, when to pair students
- Over time: Suggests room configurations that maximize learning for everyone
