# Agent: Social Intelligence

**Priority:** Sprint 3
**Status:** 🔴 NOT BUILT
**Pages:** SOCIAL, CHAT
**Existing code:** None

---

## Purpose

Understands the student's social learning patterns. Who they study with, when social study helps vs hurts, which friends push them to do better. Suggests optimal study partners and room configurations.

---

## Trigger

- Student opens SOCIAL page (shows compatibility scores)
- Study room session ends (analyzes social dynamics)
- Student asks: "Who should I study with?"
- Brain detects student studying alone when social would help

---

## Inputs

| Source | What It Reads |
|---|---|
| Study room history | Who was in the room, duration, activity level |
| Post-room performance | Did the student perform better after social study? |
| Friend interactions | Chat messages, help given/received |
| Comparative data (opt-in) | Overlapping courses, complementary knowledge gaps |
| Time patterns | When does social study work vs when does solo work better? |

---

## Output: Social Learning Profile

```json
{
  "optimal_group_size": 2,
  "best_study_partners": [
    { "friend_id": "uuid", "name": "Sarah", "compatibility": 0.87, "reason": "Complementary gaps in Thermo" },
    { "friend_id": "uuid", "name": "Marcus", "compatibility": 0.73, "reason": "You study 40% longer together" }
  ],
  "social_patterns": {
    "best_time_for_social": "evening (7-10pm)",
    "max_effective_group_size": 3,
    "distraction_threshold": "4+ people → focus drops 30%",
    "optimal_format": "solo first, then 15-min friend review"
  },
  "insights": [
    "You study 40% longer when Sarah is in the room",
    "Groups of 4+ reduce your focus by 30%",
    "Your best grades come after solo study + friend review"
  ]
}
```

---

## Logic

```
ON study_room_session_end:
  1. Record: participants, duration, activity levels, topic
  2. Track: did this student's focus increase or decrease with these people?
  3. After next assignment/quiz: correlate social study with performance
  4. Update social learning profile

ON social_page_open:
  1. Read social learning profile
  2. Calculate compatibility scores for all friends:
     - Complementary knowledge gaps (you're strong where they're weak)
     - Historical study effectiveness together
     - Schedule overlap (both free at similar times)
     - Course overlap (studying same material)
  3. Suggest study partners ranked by compatibility

ON proactive_suggestion:
  1. Detect: student is studying alone on a topic where social study historically helps
  2. Check: is a compatible friend online right now?
  3. If yes: nudge via Motivation Engine ("Sarah is online and you both have Thermo due Friday")
```

---

## Compatibility Score Calculation

```
compatibility = (
  0.3 × knowledge_complementarity +  // They know what you don't
  0.3 × historical_effectiveness +    // You perform better after studying together
  0.2 × schedule_overlap +            // You're both free at the same times
  0.2 × course_overlap                // You're taking the same classes
)
```

---

## Writes To

| Table | What It Writes |
|---|---|
| `brain.signals` | Social study sessions, compatibility updates |
| `brain.reflections` | Social learning insights |
| `neuro.patterns` | Social study effectiveness patterns |

---

## How It Compounds

- Week 1: No data, shows all friends equally
- Week 4: Knows who you study with most, starts measuring effectiveness
- Week 8: Can say "You and Sarah are 87% compatible — you cover each other's gaps"
- Week 12: Proactively suggests: "You have a Thermo exam in 3 days. Last time you studied with Sarah before an exam, you scored 12% higher. She's free tonight."
- Semester 2: Suggests new friends based on course overlap + learning style compatibility
