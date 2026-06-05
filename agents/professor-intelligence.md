# Agent: Professor Intelligence

**Priority:** Sprint 2
**Status:** 🔴 NOT BUILT
**Pages:** ASSIGNMENTS, CANVAS, CHAT
**Existing code:** None

---

## Purpose

Builds a profile of each professor's grading style, preferences, and patterns by analyzing graded assignments. Gives students insider knowledge about what their professor actually wants.

---

## Trigger

- New grade posted on Canvas (Canvas Watcher detects it)
- Student opens a course page (surfaces professor card)
- Student asks in chat: "What does Prof [name] want?"
- Assignment Agent calls it when generating frameworks

---

## Inputs

| Source | What It Reads |
|---|---|
| Graded assignments | Score + written feedback from Canvas |
| Assignment rubrics | From Canvas assignment details |
| Grade distribution | Student's grades over time in this course |
| Multiple students (with consent) | Aggregate patterns across students in same course |

---

## Output: Professor Profile

```json
{
  "professor_id": "prof_chen_thermo_101",
  "name": "Professor Chen",
  "course": "Thermodynamics 101",
  "grading_style": {
    "values": ["conciseness", "citations", "real-world examples"],
    "penalizes": ["missing citations", "overly long paragraphs", "unsupported claims"],
    "format_preference": "2-3 focused paragraphs over 5+ rambling ones",
    "average_score_range": "B to B+",
    "feedback_style": "brief, direct, focuses on what's missing"
  },
  "patterns": [
    "Students who cite 4+ sources score 15% higher",
    "Deducts 5% per missing citation even on informal assignments",
    "Values concrete examples over abstract theory",
    "Late submissions: strict -10% per day, no exceptions"
  ],
  "tips_for_student": [
    "Always add citations — even if the rubric doesn't mention them",
    "Start with a concrete example, not a definition",
    "Keep your thesis in the first 2 sentences"
  ],
  "confidence": 0.72,  // increases with more graded assignments
  "data_points": 5     // number of graded assignments analyzed
}
```

---

## Logic

```
ON new_grade_posted:
  1. Read the assignment submission + grade + feedback (if any)
  2. Read the rubric (if available)
  3. Compare: what did the student do vs what score they got?
  4. Extract patterns:
     - High scores: what did these submissions have in common?
     - Low scores: what was missing or wrong?
     - Feedback keywords: what does the professor mention repeatedly?
  5. Update professor profile in brain.reflections:
     - type: 'professor_insight'
     - data: updated profile JSON
  6. Write signal: { type: 'professor_profile_updated', data: { professor_id, new_patterns } }

ON student_request (chat or page load):
  1. Read professor profile from brain.reflections
  2. If profile exists and confidence > 0.5: surface tips
  3. If profile is thin (< 3 data points): say "I'm still learning about Prof [name]. After a few more graded assignments, I'll have better insights."
```

---

## Example Insights Surfaced

**On Assignment page (badge):**
> "⚠️ Prof Chen: Always cite sources"

**In chat (when asked):**
> "Based on 5 graded assignments, Prof Chen values:
> 1. Conciseness — students who write 2-3 focused paragraphs score 15% higher than those who write 5+
> 2. Citations — she deducts 5% per missing citation, even on informal assignments
> 3. Real-world examples — she always gives bonus points for connecting theory to engineering applications
>
> For your upcoming essay, I'd suggest: short paragraphs, 4+ citations, and open with the refrigeration cycle example from lecture."

---

## Privacy and Ethics

- Professor profiles are built ONLY from the student's own graded work
- If multiple students in the same course consent to sharing, aggregate patterns become more accurate
- The profile is never shared outside the student's brain
- This is not surveillance of professors — it is pattern recognition from the student's own grades

---

## Writes To

| Table | What It Writes |
|---|---|
| `brain.reflections` | Professor profile (type = 'professor_insight') |
| `brain.signals` | Profile update events |

---

## How It Compounds

- Week 1: "I don't know much about Prof Chen yet"
- Week 4 (after 3 graded assignments): "Prof Chen values citations and conciseness"
- Week 8 (after 6 graded assignments): "Prof Chen deducts exactly 5% per missing citation. Students who open with examples score 12% higher. She never gives A+ on first drafts but always gives A on revisions."
- Week 16 (end of semester): Complete professor profile that can be shared (with consent) to help next semester's students

The profile gets exponentially more accurate with each data point. By midterm, the student has genuine insider knowledge.
