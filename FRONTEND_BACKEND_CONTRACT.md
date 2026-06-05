# Frontend ↔ Backend Contract

**This is the single agreement between the UI team and the backend team.**

UI team designs to this contract. Backend team builds to this contract. Neither team needs to know the other's implementation details. When both sides follow this contract, connecting them is a one-hour job per page.

---

## The One Rule

**The frontend never calls individual agents directly.**

Every AI interaction goes through one endpoint:

```
POST /api/agent-manager
Body: { page, student_id, action?, context? }
Response: { type, content, signals? }
```

That is it. One endpoint. The Agent Manager decides which agent runs.

---

## Per-Page Contract

### Page: HOME

**Frontend sends:**
```json
{
  "page": "home",
  "student_id": "uuid"
}
```

**Backend returns:**
```json
{
  "type": "greeting",
  "content": {
    "message": "Hey, it's Wednesday 9pm. Your Thermo essay is due Friday...",
    "tone": "urgent",
    "priority_action": {
      "type": "assignment",
      "id": "uuid",
      "label": "Start Thermo Chapter 7 Essay",
      "cta": "Help me start"
    },
    "social_nudge": "Sarah is studying Thermo right now",
    "token_opportunity": "Submit early for +100 tokens",
    "stats": {
      "streak": 7,
      "tokens": 1250,
      "tier": "enhanced",
      "gpa": 3.4
    }
  }
}
```

**UI displays:** Tutor greeting bubble, priority action card, stats bar (streak/tokens/tier/GPA), social nudge badge.

**When to call:** On every page load. Cache for 15 minutes (don't re-call on every revisit).

---

### Page: ASSIGNMENTS

**Frontend sends (on page load):**
```json
{
  "page": "assignments",
  "student_id": "uuid",
  "action": "load"
}
```

**Backend returns:**
```json
{
  "type": "assignments_enriched",
  "content": {
    "assignments": [
      {
        "id": "uuid",
        "title": "Thermodynamics Chapter 7 Essay",
        "course": "ENGR 301",
        "due_date": "2026-06-06T23:59:00Z",
        "status": "not_started",
        "predicted_grade": "B+",
        "prediction_confidence": 0.68,
        "professor_tip": "Prof Chen: always cite sources",
        "friend_status": "Sarah started this",
        "token_preview": "+100 tokens if submitted early",
        "urgency": "high"
      }
    ]
  }
}
```

**Frontend sends (on "Help me start" tap):**
```json
{
  "page": "assignments",
  "student_id": "uuid",
  "action": "help_start",
  "context": {
    "assignment_id": "uuid"
  }
}
```

**Backend returns:**
```json
{
  "type": "assignment_framework",
  "content": {
    "message": "I've read the rubric. Here's your framework...",
    "framework": {
      "sections": [...],
      "total_time": "3.5 hours",
      "professor_tips": [...],
      "predicted_grade_if_followed": "B+"
    }
  }
}
```

**UI displays:** Assignment cards with predicted grade badge, professor tip badge, friend status, token preview, "Help me start" button. On tap: framework slides up in chat panel.

---

### Page: STUDY

**Frontend sends (on page load):**
```json
{
  "page": "study",
  "student_id": "uuid",
  "action": "load",
  "context": {
    "course_id": "uuid"
  }
}
```

**Backend returns:**
```json
{
  "type": "study_ready",
  "content": {
    "lessons_for_you": [
      {
        "id": "uuid",
        "title": "Entropy — From Confusion to Clarity",
        "duration": "12 min",
        "reason": "You seemed confused about this in chat yesterday",
        "tokens_on_completion": 60,
        "urgency": "before_friday_essay"
      }
    ],
    "flashcard_count": 24,
    "study_guide_ready": true,
    "focus_suggestion": "You study best in 25-min sessions. Timer ready?"
  }
}
```

**Frontend sends (on "Generate Flashcards" tap):**
```json
{
  "page": "study",
  "student_id": "uuid",
  "action": "generate_flashcards",
  "context": {
    "course_id": "uuid",
    "topic": "entropy"
  }
}
```

**UI displays:** "Lessons for you" cards at top, flashcard deck, study guide, focus timer, session stats.

---

### Page: CANVAS

**Frontend sends (on page load):**
```json
{
  "page": "canvas",
  "student_id": "uuid",
  "action": "load"
}
```

**Backend returns:**
```json
{
  "type": "canvas_enriched",
  "content": {
    "courses": [
      {
        "id": "uuid",
        "name": "Thermodynamics 101",
        "professor": "Prof Chen",
        "current_grade": "B+",
        "grade_trend": "improving",
        "brain_health": 0.72,
        "professor_insight": "Values citations and conciseness",
        "priority_rank": 1
      }
    ],
    "last_synced": "2026-06-04T21:30:00Z"
  }
}
```

**UI displays:** Course list with brain health indicator, grade trend arrow, professor insight badge, priority ranking.

---

### Page: BRAIN

**Frontend sends:**
```json
{
  "page": "brain",
  "student_id": "uuid",
  "action": "load"
}
```

**Backend returns:**
```json
{
  "type": "brain_state",
  "content": {
    "knowledge_graph": {
      "nodes": [...],
      "edges": [...],
      "strongest_concept": "Newton's Laws",
      "weakest_concept": "Statistical Mechanics",
      "total_concepts": 47
    },
    "learning_style": "example-first, visual, short sessions",
    "writing_level": "developing",
    "writing_trend": "improving",
    "top_insights": [
      "You learn 40% faster in the morning",
      "Your strongest subject is Physics",
      "You've mastered 47 concepts this semester"
    ],
    "brain_age_days": 34
  }
}
```

**UI displays:** Interactive knowledge graph, learning style profile, writing evolution timeline, top insights, brain age counter.

---

### Page: SOCIAL

**Frontend sends:**
```json
{
  "page": "social",
  "student_id": "uuid",
  "action": "load"
}
```

**Backend returns:**
```json
{
  "type": "social_state",
  "content": {
    "friends": [
      {
        "id": "uuid",
        "name": "Sarah",
        "compatibility": 0.87,
        "compatibility_reason": "Complementary gaps in Thermo",
        "is_online": true,
        "current_activity": "Studying Thermo",
        "shared_courses": 2
      }
    ],
    "active_rooms": [
      {
        "id": "uuid",
        "name": "Thermo Study",
        "participants": 3,
        "topic": "Chapter 7",
        "join_cta": "Join Sarah's room"
      }
    ],
    "suggested_partner": {
      "name": "Marcus",
      "reason": "You study 40% longer together"
    }
  }
}
```

**UI displays:** Friends list with compatibility scores, active rooms, suggested partner card, "Study together" button.

---

### Page: LEADERBOARD

**Frontend sends:**
```json
{
  "page": "leaderboard",
  "student_id": "uuid",
  "action": "load",
  "context": {
    "category": "nerdmaxing",
    "scope": "university"
  }
}
```

**Backend returns:**
```json
{
  "type": "leaderboard",
  "content": {
    "student_rank": 4,
    "student_score": 847,
    "rankings": [...top 20...],
    "weekly_reset_in": "3 days 14 hours",
    "token_bonus_for_top3": 500,
    "challenge_available": true,
    "motivation_nudge": "You're 15 points from #3. One study session tonight."
  }
}
```

**UI displays:** Ranked list, student's position highlighted, weekly countdown, challenge button, motivation nudge.

---

### Chat (All Pages)

**Frontend sends:**
```json
{
  "page": "current_page_name",
  "student_id": "uuid",
  "action": "chat",
  "context": {
    "message": "Help me understand entropy",
    "visible_content": "assignment_id or course_id if relevant"
  }
}
```

**Backend streams back** (Server-Sent Events):
```json
{ "type": "stream_chunk", "content": "Entropy is..." }
{ "type": "stream_chunk", "content": " the measure of..." }
{ "type": "stream_done", "tokens_earned": 5 }
```

**UI displays:** Streaming text in chat bubble. Token earned animation on completion.

---

## Token Events (Real-Time)

Whenever tokens are earned, backend pushes an event (WebSocket or polling):

```json
{
  "type": "tokens_earned",
  "amount": 100,
  "reason": "Early submission",
  "new_balance": 1350,
  "tier_progress": 0.67
}
```

**UI displays:** Floating "+100" animation, token counter updates, tier progress bar updates.

---

## Error States

Every response can include an error state:

```json
{
  "type": "error",
  "content": {
    "code": "brain_not_ready",
    "message": "Your brain is still warming up. Check back in a few minutes.",
    "fallback": "Here's what I know so far..."
  }
}
```

**UI displays:** Graceful fallback message, never a blank screen or raw error.

---

## What the UI Team Does NOT Need to Know

- Which agent ran (Assignment Agent, Situation Synthesizer, etc.)
- How the brain context is assembled
- What database tables are read
- How compounding works internally

The UI team only needs this contract. Everything else is the backend's responsibility.

---

## What the Backend Team Does NOT Need to Know

- How the UI renders the response
- Which component displays which field
- Animation details, colors, layout

The backend team only needs to return the correct JSON shape. Everything else is the UI's responsibility.
