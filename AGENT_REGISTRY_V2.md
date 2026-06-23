# FschoolAI — Definitive Agent Registry v2.0
**Date:** June 19, 2026  
**Author:** Vincent Yang / FschoolAI  
**For:** Full Engineering Team (Aryan, 李小雷, Tencent, Bytedance, Rivann)  
**Classification:** Internal — Founding Team Only

---

## Audit Summary

Before defining agents, here is what the GitHub codebase audit found:

### Duplicates Found (Merge These)

| Duplicate Pair | Problem | Resolution |
|---|---|---|
| `Tutor Agent` appears for both Study Room AND Solo Study | Same agent, two environments — no need for two agents | **One Tutor Agent** handles both environments. Environment context is passed as input, not a different agent. |
| `Extract Agent` + `Library Organizer Agent` | Both process uploaded content into the Library | **Merge into Library Agent** — extraction and organisation are the same pipeline |
| `Signal Agent` | Appears 5 times but is never fully defined — it is a ghost agent | **Delete** — signal writing is a tool (`write_brain_signal`) available to authorised agents, not a separate agent |
| `Aibrary Agent` + `Commute Agent` | Aibrary is a format (audio). Commute is an environment. The agent is the same. | **One Audio Agent** — handles both Aibrary and Commute mode. Environment context determines the queue. |
| `Assignment Agent` | Appears once — it is just Canvas Agent's assignment sub-task | **Delete** — absorbed into Canvas Agent |

### Missing Agents Found (Add These)

| Missing Agent | Where it was referenced | Status |
|---|---|---|
| `Intervention Agent` | PRD scenario 6 ("Reggie detects fatigue at 2am") | Not defined — add as P0 |
| `Extract Agent` (document upload) | PRD Study Toolkit page | Partially defined — formalise |
| `Planner Agent` | Referenced in 9 places but never fully specced | Not defined — add as P0 |

### First-Principles Violations Found

| Violation | Where | Fix |
|---|---|---|
| **Tutor Agent stores conversation history** | Current `chat_logs` table in FschoolAI DB | Violation: agents must be stateless. Chat logs are operational data, not agent state. The agent reads brain context, not its own history. Keep chat_logs for audit/recovery only — not as agent memory. |
| **Library Agent described as "constantly organising"** | ENVIRONMENTS_AND_CAPABILITIES.md | Violation: agents should be event-driven, not polling loops. Library Agent triggers on `content_ingested` event, not on a timer. |
| **Canvas Agent writes directly to brain** | AGENT_ARCHITECTURE_FINAL.md | Violation: Canvas Agent should only `notify_reggie`. Only Reflection Agent and high-confidence agents write to brain. |
| **"Modes" inside Reggie (explain_mode, plan_mode)** | Current codebase | Violation: modes are hardcoded agents. Replace with A2A calls to specialist agents. |
| **Commute Agent "extends Aibrary Agent"** | ENVIRONMENTS_AND_CAPABILITIES.md | Violation: inheritance in agent design creates coupling. They are the same agent with different input context. |

---

## The Corrected Agent Count

After merging duplicates and removing ghost agents:

**13 agents total** (not 17 — 4 were duplicates/ghosts)

| # | Agent | Environment | Priority | Can Write Brain? |
|---|---|---|---|---|
| 1 | **Reggie (Orchestrator)** | All | P0 | ✅ Session signals only |
| 2 | **Canvas Agent** | School Portal / LMS | P0 | ❌ → notify_reggie only |
| 3 | **Lecture Agent** | Classroom | P0 | ❌ → notify_reggie only |
| 4 | **Tutor Agent** | Study Room + Solo Study | P0 | ❌ → notify_reggie only |
| 5 | **Library Agent** | Background (event-driven) | P0 | ❌ Library only, not brain |
| 6 | **Terminal Agent** | Dashboard | P0 | ❌ Read-only |
| 7 | **Reflection Agent** | Nightly (2am, event-driven) | P0 | ✅ Primary brain writer |
| 8 | **Planner Agent** | Study Plan | P0 | ❌ → notify_reggie only |
| 9 | **Intervention Agent** | Background (signal-triggered) | P0 | ✅ Intervention signals |
| 10 | **Audio Agent** | Commute + Aibrary | P1 | ❌ → notify_reggie only |
| 11 | **Exam Mode Agent** | Exam Hall | P1 | ✅ High-confidence recall signals |
| 12 | **Office Hours Agent** | Office Hours / Tutorial | P1 | ✅ High-confidence gap signals |
| 13 | **Calendar Agent** | Background (always-on) | P1 | ❌ Read-only |

**Future agents (P2/P3, not building now):**
- Community Intelligence Agent (Discord/WhatsApp) — P2
- Lab Report Agent — P2
- Health Signal Agent — P2
- Shadow Economy Agent — P3
- Career Agent — P3

---

## The Core Architecture Rules (Non-Negotiable)

Before reading individual agent specs, every agent builder must internalise these rules:

**Rule 1 — Agents are stateless functions, not roles.**
An agent does not "remember" anything between calls. It reads context from the brain and Library at the start of every call. It writes signals at the end. Nothing in between is stored inside the agent.

**Rule 2 — Only 3 agents can write directly to the brain.**
Reflection Agent (nightly synthesis), Intervention Agent (urgent signals), Exam Mode Agent and Office Hours Agent (high-confidence confirmed signals). All other agents route through `notify_reggie()` and Reggie decides whether to write.

**Rule 3 — Agents are event-driven, not polling loops.**
No agent runs on a timer. Every agent is triggered by a specific event. Library Agent triggers on `content_ingested`. Reflection Agent triggers on `session_closed` after 11pm. Intervention Agent triggers on `signal_threshold_crossed`.

**Rule 4 — Tool access is restricted per agent.**
Each agent has a whitelist of tools it can call. It cannot call tools outside its whitelist. This prevents agents from overstepping their scope.

**Rule 5 — Reggie is the only agent the student talks to.**
Students never interact directly with Canvas Agent, Library Agent, or any specialist agent. All student-facing communication goes through Reggie. Specialist agents communicate with Reggie via A2A, not with the student.

**Rule 6 — Raw domain data never enters the brain.**
A grade of 94/100 stays in FschoolAI's production DB. The signal `quantitative_reasoning: strong` enters the brain. The Reflection Agent is the only agent that performs this distillation.

---

## Full Agent Specifications

---

### Agent 1 — Reggie (Orchestrator)

**Role:** The only agent the student interacts with. Reads brain context, routes tasks to specialist agents via A2A, assembles responses, writes session-level signals.

```yaml
agent_id: reggie
name: Reggie
type: orchestrator
student_facing: true

trigger:
  - event: student_message_received
  - event: proactive_nudge_queued  # from Intervention Agent
  - event: morning_briefing_time   # 8am daily, from Calendar Agent

input:
  required:
    - student_message: string
    - student_id: uuid
    - session_id: uuid
  auto_loaded:
    - brain_context: read_brain_context(student_id)  # loaded before every response
    - today_schedule: read_calendar(student_id)

allowed_tools:
  - read_brain_context(student_id)
  - read_calendar(student_id)
  - read_canvas_data(student_id, course_id)
  - call_agent_a2a(agent_id, input)   # A2A calls to specialist agents
  - write_session_signal(student_id, signal)
  - send_student_message(student_id, content)

output_schema:
  type: reggie_response
  payload:
    message: string              # what the student sees
    agents_called: array         # which specialist agents were invoked
    signals_written: array       # what was written to brain this session

writes_to_brain: true   # session-level signals only
can_write_signals:
  - session_completed
  - topic_discussed
  - emotional_state_observed
  - question_asked

first_principles_note: >
  Reggie is a router and composer, not a subject-matter expert. 
  When a student asks about monetary policy, Reggie does not answer from 
  its own knowledge — it calls Tutor Agent with the Library context and 
  brain context, then delivers the result. Reggie's intelligence is in 
  knowing WHICH agent to call and HOW to blend their outputs.
```

---

### Agent 2 — Canvas Agent

**Role:** Syncs all academic data from the school portal. Detects risk. Extracts course intelligence. Writes to Library. Notifies Reggie of important events.

```yaml
agent_id: canvas_agent
name: Canvas Agent
type: specialist
student_facing: false

trigger:
  - event: canvas_page_visited
    condition: chrome_extension_active
  - event: scheduled_sync
    schedule: every_6_hours
  - event: grade_posted
    source: canvas_webhook

input:
  required:
    - student_id: uuid
    - canvas_page_dom: string
  optional:
    - course_id: string
    - assignment_id: string
    - screenshot_text: string

allowed_tools:
  - read_canvas_dom(page_url)
  - parse_assignment_metadata(dom)
  - parse_rubric(dom)
  - parse_grade(dom)
  - write_library(course_id, content_type, content)
  - write_fschoolai_db(table, payload)
  - notify_reggie(student_id, event_type, payload)
  # NOT ALLOWED: write_brain_signal, create_study_plan

output_schema:
  type: canvas_sync_result
  payload:
    courses_updated: array
    assignments_updated: array
    grades_updated: array
    risk_items: array          # assignments due soon with no submission
    library_writes: array      # what was written to Library
    reggie_notifications: array

writes_to_brain: false
notifies_reggie: true
reggie_notification_events:
  - assignment_due_in_48h_no_submission
  - grade_dropped_significantly
  - new_exam_announced
  - rubric_available_for_upcoming_assignment

first_principles_violation_fixed: >
  Previous design had Canvas Agent writing directly to brain. 
  FIXED: Canvas Agent only writes to FschoolAI Library and production DB.
  Brain signals are derived by Reflection Agent from production DB data, not 
  pushed directly by Canvas Agent. This prevents low-confidence signals 
  from polluting the brain.
```

---

### Agent 3 — Lecture Agent

**Role:** Captures, transcribes, and structures live lecture audio. Extracts professor emphasis signals. Writes structured lecture notes to Library. Notifies Reggie.

```yaml
agent_id: lecture_agent
name: Lecture Agent
type: specialist
student_facing: false

trigger:
  - event: lecture_recording_started
    source: chrome_extension

input:
  required:
    - audio_stream: binary
    - student_id: uuid
    - course_id: string
    - recording_mode: enum[lecture, office_hours]
  optional:
    - page_context: string   # what Canvas page is open
    - existing_syllabus: string  # from Library

allowed_tools:
  - transcribe_audio(audio_stream)
  - detect_emphasis(transcript)    # repetition, tone, explicit exam signals
  - read_library(course_id, content_type="syllabus")
  - write_library(course_id, content_type="lecture", content)
  - notify_reggie(student_id, event_type, payload)
  # NOT ALLOWED: write_brain_signal

output_schema:
  type: lecture_processed
  payload:
    transcript: string
    structured_notes: object
    key_concepts: array
    professor_emphasis_signals: array   # "this will be on the exam" etc
    library_entry_id: uuid
    reggie_notification: string | null

writes_to_brain: false
notifies_reggie: true
reggie_notification_events:
  - exam_signal_detected          # "this will be on the midterm"
  - new_concept_introduced
  - lecture_captured_summary

deduplication_rule: >
  If 10 students in ECON 201 all record the same lecture, the Library 
  stores the highest-quality transcript once. Subsequent recordings are 
  compared by content hash — if >85% overlap, the existing entry is 
  updated with any new signals, not duplicated.
```

---

### Agent 4 — Tutor Agent

**Role:** The subject-matter expert. Answers student questions grounded in Library content and brain context. Generates lessons, flashcards, explanations. Called by Reggie via A2A.

```yaml
agent_id: tutor_agent
name: Tutor Agent
type: specialist
student_facing: false   # student talks to Reggie, not directly to Tutor Agent

trigger:
  - event: a2a_call_from_reggie
    task_types: [explain_concept, generate_lesson, create_flashcards, 
                 answer_question, socratic_dialogue, exam_prep]

input:
  required:
    - task_type: enum
    - topic: string
    - student_id: uuid
  auto_loaded:
    - brain_context: read_brain_context(student_id)
    - library_content: read_library(course_id, topic)
  optional:
    - course_id: string
    - format_preference: enum[text, audio_script, visual_description, socratic]
    - difficulty_level: enum[review, standard, challenge]

allowed_tools:
  - read_brain_context(student_id)
  - read_library(course_id, content_type, topic)
  - read_fschoolai_db(table="assignments", filters)
  - notify_reggie(student_id, event_type, payload)
  # NOT ALLOWED: write_brain_signal, write_library, write_fschoolai_db

output_schema:
  type: tutor_response
  payload:
    content: string              # the explanation/lesson/answer
    format: enum                 # how it was formatted
    concepts_covered: array
    follow_up_questions: array   # Socratic follow-ups for Reggie to ask
    confidence_assessment: object  # Tutor Agent's read on student understanding

writes_to_brain: false
notifies_reggie: true
reggie_notification_events:
  - repeated_confusion_on_concept   # student asked same thing 3 times
  - knowledge_gap_confirmed

first_principles_note: >
  Tutor Agent does NOT store conversation history. It reads brain context 
  (which contains the student's knowledge profile) at the start of every 
  call. This is why the brain must be kept current — it IS the Tutor 
  Agent's memory. If the brain is stale, the Tutor Agent gives generic answers.
```

---

### Agent 5 — Library Agent

**Role:** Background organiser. Processes all incoming content (lectures, syllabi, rubrics, uploads). Builds and maintains the course intelligence database. Event-driven — never polls.

```yaml
agent_id: library_agent
name: Library Agent
type: background
student_facing: false

trigger:
  - event: content_ingested
    sources: [lecture_agent, canvas_agent, extract_agent, student_upload]
  - event: new_student_enrolled_in_course
    action: pre_load_existing_course_content

input:
  required:
    - content_type: enum[lecture, syllabus, rubric, announcement, upload, past_exam]
    - content_text: string
    - course_id: string
    - source_agent: string
  optional:
    - student_id: uuid   # only for personal uploads
    - professor_id: string

allowed_tools:
  - read_library(course_id, content_type)
  - write_library(course_id, content_type, content)
  - extract_concepts(text)
  - update_professor_profile(professor_id, signal)
  - compute_content_hash(content)
  - check_duplicate(content_hash)
  # NOT ALLOWED: write_brain_signal, read_brain_context, notify_reggie

output_schema:
  type: library_updated
  payload:
    action: enum[created, updated, deduplicated]
    library_entry_id: uuid
    concepts_indexed: array
    professor_profile_updated: boolean

writes_to_brain: false
writes_to_library: true

first_principles_violation_fixed: >
  Previous design described Library Agent as "constantly organising" 
  (polling loop). FIXED: Library Agent is purely event-driven. It only 
  runs when content_ingested event fires. No polling, no timers.
  
  Also fixed: Library Agent does NOT read brain context. It is institutional 
  intelligence, not personal. It has no knowledge of individual students.
```

---

### Agent 6 — Terminal Agent

**Role:** Generates the daily morning briefing. Computes the student's current priority order, GPA trajectory, and risk items. Read-only — never writes to brain or Library.

```yaml
agent_id: terminal_agent
name: Terminal Agent
type: specialist
student_facing: false

trigger:
  - event: morning_briefing_requested
    schedule: 8am_daily
  - event: student_opens_dashboard
  - event: a2a_call_from_reggie
    task_types: [generate_briefing, compute_priorities, get_risk_items]

input:
  required:
    - student_id: uuid
  auto_loaded:
    - brain_context: read_brain_context(student_id)
    - assignments: read_canvas_data(student_id, type="assignments")
    - calendar: read_calendar(student_id)

allowed_tools:
  - read_brain_context(student_id)
  - read_canvas_data(student_id, type)
  - read_calendar(student_id)
  - read_fschoolai_db(table="grades", student_id)
  - read_library(course_id, content_type="professor_profile")
  # NOT ALLOWED: write_brain_signal, write_library, write_fschoolai_db

output_schema:
  type: terminal_briefing
  payload:
    priority_items: array        # top 3 things to do today
    risk_items: array            # assignments at risk
    gpa_trajectory: object       # current vs target
    momentum_state: enum         # building / stable / declining
    morning_message: string      # Reggie's daily opening line
    exam_countdown: array        # upcoming exams with days remaining

writes_to_brain: false
writes_to_library: false
read_only: true
```

---

### Agent 7 — Reflection Agent

**Role:** The brain's primary writer. Runs nightly after the last session closes. Distils the day's raw operational data into learned abstractions and writes them to the NeuroAGI brain. The only agent with full brain write access.

```yaml
agent_id: reflection_agent
name: Reflection Agent
type: background
student_facing: false

trigger:
  - event: session_closed
    condition: time_after_11pm
  - event: daily_reflection_scheduled
    schedule: 2am_if_no_session_closed

input:
  required:
    - student_id: uuid
  auto_loaded:
    - todays_sessions: read_fschoolai_db(table="sessions", date=today)
    - todays_messages: read_fschoolai_db(table="chat_logs", date=today)
    - todays_assignments: read_canvas_data(student_id, type="activity_today")
    - current_brain: read_brain_context(student_id, full=true)

allowed_tools:
  - read_fschoolai_db(table, filters)
  - read_brain_context(student_id, full=true)
  - write_brain_signal(student_id, signal_type, payload, confidence)
  - write_brain_reflection(student_id, content)
  - update_brain_patterns(student_id, pattern_updates)
  - update_brain_context_window(student_id)
  # FULL brain write access — this is the only agent with this permission

output_schema:
  type: reflection_complete
  payload:
    signals_written: array
    patterns_updated: array
    context_window_updated: boolean
    reflection_summary: string

writes_to_brain: true
brain_write_scope: full

distillation_rule: >
  Raw data → learned abstraction ONLY.
  
  NOT allowed to write:
  - "Student got 74% on ECON 201 Assignment 3"
  
  MUST write:
  - "quantitative_reasoning: improving, confidence 0.72"
  - "assignment_submission_pattern: last-minute, 3 consecutive occurrences"
  - "study_session_duration: declining this week, avg 23min vs 47min last week"
  
  The brain stores WHO the student is, not WHAT happened.
```

---

### Agent 8 — Planner Agent

**Role:** Generates and updates the student's study plan. Converts brain knowledge gaps + Canvas deadlines + calendar availability into a concrete day-by-day plan. Called by Reggie via A2A.

```yaml
agent_id: planner_agent
name: Planner Agent
type: specialist
student_facing: false

trigger:
  - event: a2a_call_from_reggie
    task_types: [generate_study_plan, update_study_plan, get_today_plan]
  - event: assignment_added
    source: canvas_agent
  - event: exam_detected_within_14_days
    source: calendar_agent

input:
  required:
    - student_id: uuid
    - plan_horizon: enum[today, this_week, until_exam]
  auto_loaded:
    - brain_context: read_brain_context(student_id)
    - assignments: read_canvas_data(student_id, type="assignments")
    - calendar: read_calendar(student_id)
    - knowledge_gaps: read_brain_context(student_id, fields=["knowledge_gaps"])

allowed_tools:
  - read_brain_context(student_id)
  - read_canvas_data(student_id, type)
  - read_calendar(student_id)
  - read_library(course_id, content_type="syllabus")
  - write_fschoolai_db(table="study_plans", payload)
  - notify_reggie(student_id, event_type, payload)
  # NOT ALLOWED: write_brain_signal

output_schema:
  type: study_plan
  payload:
    plan_items: array    # [{date, time, course, topic, duration, priority}]
    rationale: string    # why this order
    risk_flags: array    # what happens if student skips an item

writes_to_brain: false
writes_to_library: false
```

---

### Agent 9 — Intervention Agent

**Role:** Monitors brain signals for threshold crossings. Fires proactive nudges to Reggie when a student needs intervention. The early warning system.

```yaml
agent_id: intervention_agent
name: Intervention Agent
type: background
student_facing: false

trigger:
  - event: brain_signal_written
    condition: signal_crosses_intervention_threshold
  - event: scheduled_check
    schedule: every_4_hours

input:
  required:
    - student_id: uuid
  auto_loaded:
    - brain_context: read_brain_context(student_id, full=true)
    - recent_signals: read_brain_signals(student_id, last_48h=true)
    - upcoming_deadlines: read_canvas_data(student_id, type="upcoming")

allowed_tools:
  - read_brain_context(student_id, full=true)
  - read_brain_signals(student_id, window)
  - read_canvas_data(student_id, type)
  - write_brain_signal(student_id, signal_type="intervention_triggered", payload)
  - queue_reggie_proactive_message(student_id, message, priority)

intervention_thresholds:
  - signal: study_session_duration
    condition: declining_50pct_over_7_days
    action: queue_engagement_nudge
  - signal: assignment_submission_rate
    condition: missed_2_consecutive
    action: queue_urgent_intervention
  - signal: stress_level
    condition: high_for_3_consecutive_days
    action: queue_support_message
  - signal: exam_proximity
    condition: exam_in_7_days AND knowledge_gap_score_below_0.6
    action: queue_exam_alert

output_schema:
  type: intervention_queued
  payload:
    intervention_type: enum
    message_for_reggie: string
    priority: enum[low, medium, high, urgent]
    supporting_signals: array

writes_to_brain: true
brain_write_scope: intervention_signals_only
```

---

### Agent 10 — Audio Agent

**Role:** Converts Library content into personalised audio sessions. Serves both Aibrary (study mode) and Commute mode. The format is audio; the content is always Library-grounded and brain-personalised.

```yaml
agent_id: audio_agent
name: Audio Agent
type: specialist
student_facing: false

trigger:
  - event: a2a_call_from_reggie
    task_types: [generate_audio_session, get_commute_queue]
  - event: commute_mode_activated
    source: student_action

input:
  required:
    - student_id: uuid
    - mode: enum[aibrary, commute]
    - duration_minutes: integer
  auto_loaded:
    - brain_context: read_brain_context(student_id)
    - knowledge_gaps: read_brain_context(student_id, fields=["knowledge_gaps"])
    - today_schedule: read_calendar(student_id)

allowed_tools:
  - read_brain_context(student_id)
  - read_library(course_id, content_type, topic)
  - read_calendar(student_id)
  - generate_audio_script(content, style, duration)
  - synthesise_speech(script, voice="reggie")
  - notify_reggie(student_id, event_type, payload)
  # NOT ALLOWED: write_brain_signal

output_schema:
  type: audio_session
  payload:
    audio_url: string
    transcript: string
    topics_covered: array
    duration_seconds: integer
    follow_up_questions: array   # for Reggie to ask after listening

writes_to_brain: false
notifies_reggie: true
reggie_notification_events:
  - audio_session_completed

first_principles_violation_fixed: >
  Previous design had "Commute Agent extends Aibrary Agent" — inheritance 
  creates coupling. FIXED: One Audio Agent with mode parameter. 
  Commute mode queues a 15-20min session optimised for background listening.
  Aibrary mode queues content for active study. Same agent, different input.
```

---

### Agent 11 — Exam Mode Agent

**Role:** Activates in the 24 hours before an exam. Generates a stripped-down review session. Captures post-exam recall. Writes high-confidence knowledge signals to brain.

```yaml
agent_id: exam_mode_agent
name: Exam Mode Agent
type: specialist
student_facing: false

trigger:
  - event: exam_within_24_hours
    source: calendar_agent
  - event: student_activates_exam_mode
  - event: exam_completed
    condition: student_opens_app_within_2h_of_exam_end

input:
  required:
    - student_id: uuid
    - course_id: string
    - exam_phase: enum[pre_exam, post_exam]
  auto_loaded:
    - brain_context: read_brain_context(student_id)
    - knowledge_gaps: read_brain_context(student_id, fields=["knowledge_gaps", course_id])
    - professor_profile: read_library(course_id, content_type="professor_profile")
    - past_exams: read_library(course_id, content_type="past_exam")

allowed_tools:
  - read_brain_context(student_id)
  - read_library(course_id, content_type)
  - write_brain_signal(student_id, signal_type, payload, confidence)
  - notify_reggie(student_id, event_type, payload)

output_schema:
  pre_exam:
    type: exam_review_session
    payload:
      priority_topics: array    # top 5 only
      review_cards: array       # 60-second summary per topic
      exam_signals: array       # what professor historically tests
  post_exam:
    type: post_exam_recall
    payload:
      recall_items: array       # what student logged as uncertain
      signals_written: array

writes_to_brain: true
brain_write_scope: exam_recall_signals
confidence_threshold: >
  Only writes to brain when student explicitly confirms uncertainty 
  ("I wasn't sure about X"). These are high-confidence confirmed gaps.
```

---

### Agent 12 — Office Hours Agent

**Role:** Captures and processes office hours / tutorial sessions. Tags student questions as confirmed knowledge gaps. Stores TA explanations as alternative concept explanations in Library.

```yaml
agent_id: office_hours_agent
name: Office Hours Agent
type: specialist
student_facing: false

trigger:
  - event: office_hours_recording_started
    source: chrome_extension

input:
  required:
    - audio_stream: binary
    - student_id: uuid
    - course_id: string
    - session_type: enum[office_hours, tutorial, ta_session]
  auto_loaded:
    - existing_concepts: read_library(course_id, content_type="concept_index")

allowed_tools:
  - transcribe_audio(audio_stream)
  - detect_student_questions(transcript)
  - read_library(course_id, content_type)
  - write_library(course_id, content_type="office_hours_explanation", content)
  - write_brain_signal(student_id, signal_type="confirmed_knowledge_gap", payload, confidence=0.9)
  - notify_reggie(student_id, event_type, payload)

output_schema:
  type: office_hours_processed
  payload:
    student_questions: array      # each question = confirmed gap
    ta_explanations: array        # stored in Library as alternative explanations
    signals_written: array        # confirmed gaps written to brain
    library_entries_created: array

writes_to_brain: true
brain_write_scope: confirmed_knowledge_gap_signals
confidence_threshold: >
  If a student asked a question in office hours, that is a confirmed gap 
  with confidence 0.9. This is higher confidence than quiz performance 
  (0.7) because it is an explicit, voluntary admission of uncertainty.
```

---

### Agent 13 — Calendar Agent

**Role:** Maintains the academic calendar. Tracks semester phase, exam proximity, and available study time. Provides timing context to all other agents. Read-only — never writes.

```yaml
agent_id: calendar_agent
name: Calendar Agent
type: background
student_facing: false

trigger:
  - event: daily_update
    schedule: midnight_daily
  - event: a2a_call_from_any_agent
    task_types: [get_semester_phase, get_exam_proximity, get_available_time]

input:
  required:
    - student_id: uuid
  auto_loaded:
    - university_calendar: read_fschoolai_db(table="university_calendars")
    - student_courses: read_canvas_data(student_id, type="courses")
    - exam_dates: read_canvas_data(student_id, type="exams")

allowed_tools:
  - read_fschoolai_db(table="university_calendars")
  - read_canvas_data(student_id, type)
  # NOT ALLOWED: write anything

output_schema:
  type: calendar_context
  payload:
    semester_week: integer
    semester_phase: enum[orientation, building, midterm, reading_week, finals, break]
    days_to_next_exam: integer
    days_to_finals: integer
    available_study_hours_today: float
    upcoming_deadlines_7d: array

writes_to_brain: false
writes_to_library: false
writes_to_fschoolai_db: false
read_only: true
```

---

## The Tool Registry

All tools available in the system. Each agent's `allowed_tools` list is a subset of this registry.

```yaml
tools:
  
  # Brain tools (MCP interface to NeuroAGI)
  read_brain_context:
    description: Read student's brain context from NeuroAGI
    params: [student_id, fields?, full?]
    returns: brain_context_object
    
  read_brain_signals:
    description: Read recent brain signals for a student
    params: [student_id, window?, signal_type?]
    returns: array_of_signals
    
  write_brain_signal:
    description: Write a learned abstraction to NeuroAGI brain
    params: [student_id, signal_type, payload, confidence]
    requires_permission: brain_write
    
  write_brain_reflection:
    description: Write a synthesised reflection to NeuroAGI brain
    params: [student_id, content]
    requires_permission: brain_write_full
    
  update_brain_patterns:
    description: Update confirmed behavioral patterns in brain
    params: [student_id, pattern_updates]
    requires_permission: brain_write_full
    
  update_brain_context_window:
    description: Recompute the pre-cached context window
    params: [student_id]
    requires_permission: brain_write_full

  # Library tools (FschoolAI Library)
  read_library:
    description: Read course content from FschoolAI Library
    params: [course_id, content_type?, topic?]
    returns: library_content_array
    
  write_library:
    description: Write content to FschoolAI Library
    params: [course_id, content_type, content, source_agent]
    requires_permission: library_write

  # Canvas / LMS tools
  read_canvas_data:
    description: Read student's Canvas data
    params: [student_id, type, course_id?]
    returns: canvas_data_object
    
  read_canvas_dom:
    description: Parse Canvas page DOM (extension only)
    params: [page_url]
    returns: structured_dom_data

  # FschoolAI DB tools
  read_fschoolai_db:
    description: Read from FschoolAI production database
    params: [table, filters?]
    returns: rows
    
  write_fschoolai_db:
    description: Write to FschoolAI production database
    params: [table, payload]
    requires_permission: db_write

  # Calendar tools
  read_calendar:
    description: Read student's academic calendar context
    params: [student_id]
    returns: calendar_context_object

  # Communication tools
  notify_reggie:
    description: Send an event notification to Reggie
    params: [student_id, event_type, payload, priority?]
    
  queue_reggie_proactive_message:
    description: Queue a proactive message for Reggie to send
    params: [student_id, message, priority]
    
  call_agent_a2a:
    description: Call a specialist agent via A2A protocol
    params: [agent_id, task_type, input]
    returns: agent_output
    requires_permission: orchestrator_only

  # Processing tools
  transcribe_audio:
    description: Convert audio to text
    params: [audio_stream]
    returns: transcript_string
    
  detect_emphasis:
    description: Detect professor emphasis signals in transcript
    params: [transcript]
    returns: emphasis_signals_array
    
  extract_concepts:
    description: Extract academic concepts from text
    params: [text, course_id?]
    returns: concepts_array
    
  generate_audio_script:
    description: Convert content to audio-optimised script
    params: [content, style, duration_minutes]
    returns: script_string
    
  synthesise_speech:
    description: Convert script to audio
    params: [script, voice]
    returns: audio_url
```

---

## A2A Communication Map

How agents communicate with each other:

```
Student message
      ↓
  REGGIE (Orchestrator)
  reads: brain_context, calendar
  routes via A2A to:
  ├── Tutor Agent     (explain, lesson, flashcards, exam prep)
  ├── Planner Agent   (study plan, priorities)
  ├── Audio Agent     (aibrary, commute session)
  ├── Terminal Agent  (briefing, risk items, GPA)
  └── Exam Mode Agent (pre/post exam review)
  
Background agents (not called by Reggie — event-driven):
  ├── Canvas Agent      → fires on canvas_page_visited
  ├── Lecture Agent     → fires on recording_started
  ├── Office Hours Agent → fires on office_hours_recording_started
  ├── Library Agent     → fires on content_ingested
  ├── Reflection Agent  → fires on session_closed (after 11pm)
  ├── Intervention Agent → fires on signal_threshold_crossed
  └── Calendar Agent    → fires on daily_update + responds to A2A reads

FschoolAI ↔ NeuroAGI (A2A at system level):
  FschoolAI Brain SDK (MCP server) ←→ NeuroAGI Brain DB
  All brain reads/writes go through MCP, not direct SQL
```

---

## Brain Write Permission Levels

| Permission Level | Agents | What They Can Write |
|---|---|---|
| `brain_write_full` | Reflection Agent only | All signal types, patterns, reflections, context window |
| `brain_write` | Intervention Agent, Exam Mode Agent, Office Hours Agent | Specific signal types only (see each agent spec) |
| `session_signals` | Reggie | Session-level events only |
| `none` | All other agents | Cannot write to brain — must use `notify_reggie()` |

---

## What Was Removed and Why

| Removed | Reason |
|---|---|
| `Signal Agent` | Ghost agent — signal writing is a tool, not an agent |
| `Assignment Agent` | Duplicate of Canvas Agent's assignment sub-task |
| Separate `Commute Agent` | Merged into Audio Agent — same function, different mode parameter |
| Separate `Extract Agent` | Merged into Library Agent — extraction is part of ingestion pipeline |
| `Aibrary Agent` as separate entity | Merged into Audio Agent |

---

*This is the canonical agent registry. Any new agent must be added here before implementation begins. No agent should be built without a complete spec in this format.*

*Push to GitHub: `frontend/dev` branch as `AGENT_REGISTRY_V2.md`*
