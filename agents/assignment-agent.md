# Agent: Assignment Agent

**Priority:** Sprint 2
**Status:** 🟡 PARTIAL (`backend/server/services/brain-assignment.ts` exists but is basic)
**Pages:** ASSIGNMENTS, CHAT
**Existing code:** `brain-assignment.ts`

---

## Purpose

When a student taps "Help me start" on an assignment, this agent reads the full assignment details, the professor's grading style, and the student's knowledge gaps — then generates a personalized starting framework.

---

## Trigger

- Student taps "Help me start" on an assignment card
- Student asks in chat: "Help me with my [assignment name]"
- Proactive: 48 hours before deadline if student hasn't started

---

## Inputs

| Source | What It Reads |
|---|---|
| Assignment details | Title, description, rubric, due date from `fschool.assignments` |
| Professor profile | Grading style from `brain.reflections` where type = 'professor_insight' |
| Student's knowledge gaps | From context window |
| Student's writing style | From `brain.reflections` where type = 'writing_analysis' |
| Past submissions for this course | From `brain.signals` where type = 'assignment_submitted' |
| Learning style | From `neuro.patterns` |

---

## Output

```json
{
  "framework": {
    "type": "essay_outline",  // or "problem_set_approach", "lab_report_structure", etc.
    "sections": [
      { "title": "Introduction", "guidance": "Prof Chen wants a thesis in the first 2 sentences...", "estimated_time": "15 min" },
      { "title": "Body Paragraph 1", "guidance": "Use the entropy example from lecture 12...", "estimated_time": "25 min" }
    ],
    "total_estimated_time": "3.5 hours",
    "professor_tips": ["Always cite sources — Chen deducts 5% per missing citation", "Keep paragraphs under 5 sentences"],
    "predicted_grade_if_followed": "B+"
  }
}
```

---

## Logic

```
1. Read assignment details from Canvas data
2. Read professor profile (if exists)
3. Read student's context window (knowledge gaps, writing style)
4. Determine assignment type (essay, problem set, lab report, project, presentation)
5. Generate framework using LLM:
   - System prompt includes: professor style, student's writing level, known gaps
   - Output format matches assignment type
6. Estimate time based on: student's historical pace + assignment complexity
7. Generate predicted grade based on: student's course average + framework quality
8. Write signal: { type: 'assignment_help_requested', data: { assignment_id, framework_type } }
9. Award tokens: 5 (asked for help — curiosity reward)
```

---

## Example Interaction

**Student taps "Help me start" on "Thermodynamics Chapter 7 Essay"**

Tutor responds:
> "I've read the rubric. Prof Chen wants 1500-2000 words on entropy applications in engineering. Based on your writing style, here's your framework:
>
> 1. **Opening (15 min):** Start with the heat engine example from Lecture 12 — you understood that well. Use it as your hook. Chen likes concrete examples first, theory second.
>
> 2. **Section 1: Entropy basics (25 min):** You're solid on the second law but shaky on statistical mechanics. Skip the Boltzmann equation derivation — Chen doesn't test on that. Focus on the qualitative explanation.
>
> 3. **Section 2: Engineering applications (30 min):** Use the refrigeration cycle example. You got 92% on that quiz question.
>
> 4. **Conclusion (10 min):** Chen always wants a 'so what' — connect entropy to a real-world engineering challenge.
>
> **Tips:** Cite at least 4 sources (Chen deducts 5% per missing citation). Keep paragraphs under 5 sentences. Total time estimate: ~2.5 hours at your pace.
>
> Want me to help you write the opening paragraph?"

---

## Writes To

| Table | What It Writes |
|---|---|
| `brain.signals` | Assignment help requested + framework generated |
| `agents.messages` | The framework as a chat message |

---

## How It Compounds

- Every framework generated is stored as a signal
- Reflection Engine analyzes: "Student follows framework 70% of the time → frameworks work for this student"
- If student ignores framework and gets a lower grade → brain learns to make frameworks more directive
- If student follows framework and gets a higher grade → brain validates the approach
- Professor Intelligence gets better with each graded assignment → frameworks get more accurate
