# Agent: Exam Predictor

**Priority:** Sprint 2
**Status:** 🔴 NOT BUILT
**Pages:** ASSIGNMENTS, CANVAS, CHAT
**Existing code:** None

---

## Purpose

Predicts the student's grade on upcoming assignments and exams. Shows a real-time prediction that changes as the student studies more (or doesn't). Creates visible consequence — "if you study tonight, your prediction goes from C+ to B+."

---

## Trigger

- Assignment page loads (shows prediction per assignment)
- Student completes a study session or lesson (prediction updates)
- Student asks: "What will I get on the midterm?"
- 48h before any deadline (proactive prediction push)

---

## Inputs

| Source | What It Reads |
|---|---|
| Historical grades | All grades in this course from Canvas |
| Study activity | Study sessions, lessons completed, time spent on this topic |
| Knowledge gaps | From context window — unresolved gaps relevant to this assignment |
| Assignment difficulty | Inferred from rubric complexity + professor's historical grade distribution |
| Preparation level | How much of the relevant material has been studied |
| Professor profile | Grading tendencies from Professor Intelligence |
| Peer comparison (opt-in) | How other students in the same course are performing |

---

## Output

```json
{
  "assignment_id": "uuid",
  "prediction": {
    "grade_letter": "B+",
    "grade_range": [84, 89],
    "confidence": 0.68,
    "factors": {
      "positive": ["Completed entropy lesson", "Strong Chapter 6 quiz score", "Started early"],
      "negative": ["Knowledge gap in statistical mechanics", "Haven't reviewed rubric"],
      "neutral": ["Average time spent vs peers"]
    }
  },
  "improvement_actions": [
    { "action": "Complete the Chapter 7 lesson", "impact": "+5%", "time": "12 min" },
    { "action": "Review rubric and add citations", "impact": "+3%", "time": "10 min" },
    { "action": "Do one practice problem set", "impact": "+4%", "time": "20 min" }
  ],
  "if_no_action": {
    "grade_letter": "C+",
    "grade_range": [76, 79]
  }
}
```

---

## Logic

```
1. Gather all inputs for this assignment/course
2. Calculate base prediction:
   - Start with student's course average
   - Adjust for: topic difficulty, preparation level, time remaining
3. Calculate confidence:
   - < 3 data points in course → confidence < 0.5 (show as "low confidence")
   - 3-6 data points → confidence 0.5-0.7
   - 7+ data points → confidence 0.7-0.9
4. Identify improvement actions:
   - For each unresolved knowledge gap: estimate grade impact if resolved
   - For each unstarted preparation step: estimate grade impact
   - Sort by: impact / time_required (efficiency)
5. Calculate "if no action" prediction:
   - Current trajectory without additional study
6. Write signal: { type: 'grade_prediction', data: { assignment_id, prediction, confidence } }
7. After actual grade is posted: compare prediction vs actual → refine model
```

---

## Prediction Updates (Real-Time Consequence)

The prediction is NOT static. It changes as the student acts:

| Student Action | Prediction Change |
|---|---|
| Completes relevant lesson | +3-5% |
| Studies for 30+ min on topic | +2-4% |
| Asks tutor about the topic | +1-2% |
| Day passes with no action | -1-2% (time pressure) |
| Starts the assignment | +5% (commitment signal) |
| Friend helps in study room | +2-3% |

**The student sees this in real-time.** The prediction on their assignment card literally changes as they study. This creates visible consequence for every action.

---

## Validation and Learning

After each actual grade is posted:
1. Compare prediction vs actual
2. Calculate prediction error
3. Adjust model weights:
   - If consistently over-predicting → reduce base optimism
   - If consistently under-predicting → increase base
   - If specific factors are poor predictors → reduce their weight
4. Store validation as signal: { type: 'prediction_validated', data: { predicted, actual, error } }

Over time, the model becomes highly accurate for each individual student.

---

## Writes To

| Table | What It Writes |
|---|---|
| `brain.signals` | Prediction generated, prediction updated, prediction validated |
| `brain.context_window` | Current predictions for quick access |

---

## How It Compounds

- Semester 1: Predictions are rough (±10%), low confidence
- Semester 1 midterm: Predictions tighten (±5%), medium confidence
- Semester 1 finals: Predictions are accurate (±3%), high confidence
- Semester 2: Model transfers — predictions are accurate from Week 1 because the brain knows the student's patterns

The prediction model is the most powerful compounding feature because it creates VISIBLE consequence. The student can literally watch their future grade change based on their actions today.
