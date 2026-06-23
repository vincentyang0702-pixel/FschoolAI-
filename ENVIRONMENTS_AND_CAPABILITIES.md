# FschoolAI — Complete Environment Map & Unlocked Capabilities
**Version 1.0 — June 19, 2026**
**Author: Manus AI (for Vincent Yang, FschoolAI)**

---

## Overview

This document covers two things:

1. **All 17 academic environments** where FschoolAI collects data — including 9 environments missing from the original PRD
2. **10 unlocked capabilities** that become possible only when all 17 environments are connected — derived from first principles

No competitor has more than 1–2 of these environments. FschoolAI is the only platform that can connect all 17.

---

## Part 1 — All 17 Academic Environments

### Original 8 (Already in PRD)

| # | Environment | Agent | Priority |
|---|---|---|---|
| 1 | Classroom — live lecture | Lecture Agent | P0 |
| 2 | Canvas / School Portal | Canvas Agent | P0 |
| 3 | Study Room (collaborative) | Tutor Agent | P0 |
| 4 | Solo Study Session | Tutor Agent | P0 |
| 5 | Dashboard / Terminal | Terminal Agent | P0 |
| 6 | Leaderboard / Network | Network Agent | P0 |
| 7 | Nightly Reflection (2am background) | Reflection Agent | P0 |
| 8 | Library (background organiser) | Library Agent | P0 |

---

### 9 Missing Environments (New — Add to PRD)

---

#### Environment 9 — Office Hours / Tutorial Sessions

**What it is:** The student attends the professor's office hours or a TA-led tutorial session. Small group, interactive, verbal Q&A, whiteboard explanations.

**Why it matters:** If a student had to ask a question in office hours, that question is a confirmed knowledge gap — a stronger signal than any quiz result. The TA's answer is often the clearest explanation of a concept in the entire course.

**Agent: `Office Hours Agent`**

| | Detail |
|---|---|
| **Trigger** | Student activates "Office Hours" recording mode in the Chrome extension |
| **Reads from Library** | Existing concept explanations for the topic being discussed |
| **Reads from Brain** | Student's current knowledge gaps for the course |
| **What it does** | Transcribes the Q&A session. Tags the student's specific questions as confirmed knowledge gaps (high-confidence signal). Stores the TA's explanation as an alternative explanation in the Library. |
| **Writes to Brain** | `office_hours_attended` signal, confirmed knowledge gap signals for each question asked |
| **Writes to Library** | TA explanation variant for the concept, tagged as "office hours explanation" |
| **Connects to Reggie** | Reggie references the TA's explanation next time the student asks about that concept: "Your TA explained this differently in office hours — here is that version." |

**New UI element needed:** Office Hours mode toggle in the Chrome extension (separate from Lecture mode — smaller group, more interactive, student questions are the primary signal).

---

#### Environment 10 — The Exam Hall (Pre-Exam + Post-Exam)

**What it is:** The student sits the actual exam. Paper or computer-based. The 30 minutes before and the 30 minutes after are the highest-stakes moments in the academic calendar.

**Why it matters:** Post-exam recall is the most accurate signal of what the student actually knew vs. what they thought they knew. Pre-exam review is the highest-value study moment.

**Agent: `Exam Mode Agent`**

| | Detail |
|---|---|
| **Trigger (pre-exam)** | Student opens Exam Mode from the Terminal when an exam is within 24 hours |
| **Trigger (post-exam)** | Student opens FschoolAI within 2 hours of an exam ending |
| **Reads from Library** | Professor's historical exam patterns, high-probability topics |
| **Reads from Brain** | Student's top 5 knowledge gaps for the course, current confidence levels |
| **Pre-exam output** | Stripped-down review screen: 5 highest-priority topics only, no distractions, no chat. Each topic has a 60-second summary card. |
| **Post-exam output** | Reggie asks: "How did it feel? Any questions you weren't sure about?" Student logs recall. These become knowledge gap signals. |
| **Writes to Brain** | Post-exam recall signals, confidence updates per topic, `exam_completed` event |
| **Writes to Library** | Confirmed exam question patterns (anonymised, aggregated across students) |
| **Grade received (Canvas sync)** | Reflection Agent compares predicted grade vs actual grade. Delta updates the Exam Predictor accuracy model. |

**New page needed:** `Exam Mode` — full-screen, minimal UI, shows only the 5 highest-priority topics. No Leaderboard, no chat, no distractions. Activates automatically when an exam is detected within 24 hours.

---

#### Environment 11 — Lab / Practical Session

**What it is:** Science, engineering, and medical students have lab sessions — hands-on practical work, experiments, data collection, lab reports.

**Why it matters:** Lab reports are a distinct assignment type with a fixed format (hypothesis, method, results, discussion, conclusion). They require different AI support than essays or problem sets.

**Agent: `Lab Report Agent`**

| | Detail |
|---|---|
| **Trigger** | Canvas Agent detects a lab report assignment |
| **Reads from Library** | Lab report rubric for the course, professor's marking criteria for lab reports |
| **Reads from Brain** | Student's writing patterns, previous lab report grades |
| **What it does** | Provides structured lab report scaffolding. Student can photograph lab data/results — Extract Agent processes the image and converts it to structured data. Reggie helps write each section grounded in the student's actual experimental data. |
| **Writes to Brain** | Lab report completion signal, grade signal when returned |
| **Writes to Library** | Lab report rubric updates, professor marking pattern updates |

---

#### Environment 12 — The Commute (Audio-First Environment)

**What it is:** Student is on the MTR, bus, or walking. Phone in pocket or earphones in. Cannot look at a screen. 20–40 minutes of dead time every day.

**Why it matters:** 20 minutes of commute × 5 days × 30 weeks = 50 hours per year of potential learning time that is currently wasted. Aibrary makes this time productive without requiring screen attention.

**Agent: `Commute Agent` (extends Aibrary Agent)**

| | Detail |
|---|---|
| **Trigger** | Student activates Commute Mode manually, or it is triggered automatically when motion is detected between 7–9am or 5–7pm |
| **Reads from Library** | Most relevant audio content for today: yesterday's lecture, upcoming exam topics, knowledge gap explanations |
| **Reads from Brain** | Learning style (audio preference score), current knowledge gaps, today's schedule |
| **What it does** | Queues a personalised 15–20 minute audio session: "You have ECON 201 lecture from yesterday — 12 minutes. Then a 4-minute explanation of the Fisher equation, which is your weakest topic and is on the midterm." Student listens. Can ask questions via voice. Reggie responds via audio. |
| **Writes to Brain** | `commute_learning_session` signal, audio learning preference confirmation, knowledge gap confidence updates |

**New page/mode needed:** `Commute Mode` — voice-first interface. Large play/pause button. No text input required. Waveform visualiser. "Ask Reggie" voice button.

---

#### Environment 13 — Professor Email / Canvas Announcement

**What it is:** Professor sends an email or Canvas announcement: "The midterm will cover chapters 3–7. Focus on the mechanism, not the definitions." This is one of the highest-value signals in the entire academic calendar — the professor is telling you exactly what matters.

**Why it matters:** Most students read announcements once and forget them. FschoolAI should extract the exam intelligence and act on it immediately.

**Agent: `Announcement Agent`**

| | Detail |
|---|---|
| **Trigger** | Canvas Agent detects a new announcement or email from a professor |
| **Reads from Library** | Existing professor intelligence profile for that professor |
| **What it does** | Reads the announcement. Extracts exam signals: topic emphasis, format hints, scope clarifications. Updates the professor's intelligence profile in the Library. Generates a Reggie proactive message. |
| **Writes to Library** | Professor intelligence profile update: new exam signal with high confidence score |
| **Writes to Brain** | `professor_announcement` signal, updated exam priority weights for the course |
| **Reggie proactive message** | "Professor Chen just posted an announcement. Key signal: focus on mechanism, not definitions. I've updated your study plan to prioritise the mechanism sections. Want to review them now?" |

---

#### Environment 14 — Group Chat (Discord / WhatsApp / WeChat)

**What it is:** Students share past papers, exam tips, and course notes in WhatsApp groups, Discord servers, and WeChat groups. This is where the most valuable peer intelligence lives — and it is currently invisible to FschoolAI.

**Why it matters:** A student who shares "the prof said question 3 is definitely about the IS-LM model" in a WhatsApp group is generating high-value exam intelligence. FschoolAI should capture it.

**Agent: `Community Intelligence Agent`**

| | Detail |
|---|---|
| **Trigger** | FschoolAI Discord bot is active in a course-specific server; or student manually shares content from group chat into FschoolAI |
| **What it does** | Discord bot monitors course channels for past papers, exam tips, and course notes. Extracts intelligence and adds it to the Library with a "peer-sourced" tag. Aggregates across multiple students to confirm signals. |
| **Writes to Library** | Peer-sourced exam intelligence, past paper questions, course tips — all tagged with confidence scores based on how many students confirmed them |
| **Connects to Reggie** | Reggie surfaces peer intelligence: "3 students in your ECON 201 Discord said the IS-LM model will definitely be on the exam. This matches Professor Chen's announcement. High confidence." |

**Priority: P2** — requires Discord bot infrastructure. WhatsApp requires manual sharing (no API).

---

#### Environment 15 — Shadow Economy (Freelance / Tutoring / Gig Work)

**What it is:** Many students do informal work — tutoring other students, freelance design, coding, ghostwriting, content creation. This is invisible to employers, universities, and the current FschoolAI system. It represents real capability that is never credentialed.

**Why it matters:** A student who has tutored 12 students in PSYC 201 and improved 10 of their grades has demonstrated mastery that no exam score captures. FschoolAI can make this visible.

**Agent: `Shadow Economy Agent`**

| | Detail |
|---|---|
| **Trigger** | Student logs a tutoring session, freelance project, or gig work in FschoolAI |
| **What it does** | Verifies the work (peer confirmation, payment receipt, outcome data). Stores verified gig history on the student's brain profile and Founding Card. Generates a capability signal: "tutored 12 students in PSYC 201, 10 improved their grade." |
| **Writes to Brain** | Verified gig history, capability signals, teaching mastery signals |
| **Connects to Career Layer** | Verified gig history becomes part of the Ambition Graph — visible to employers and investors who recruit from FschoolAI |

**Priority: P3** — Layer 3 feature. Requires Founding Card infrastructure.

---

#### Environment 16 — Sleep / Biometric Signals

**What it is:** The student's sleep quality, exercise, and physical state directly affect their academic performance. This is in the 7-Layer Brain spec but has no current agent or scenario.

**Why it matters:** A student who slept 4 hours should not be assigned a new complex topic. A student who exercised this morning has higher cognitive performance. These signals make the study plan dramatically more accurate.

**Agent: `Health Signal Agent`**

| | Detail |
|---|---|
| **Trigger** | Optional Apple Health / Google Fit integration; or student manually logs sleep |
| **What it does** | Reads sleep duration and quality. Writes a fatigue or recovery signal to the brain. Adjusts the Terminal's daily briefing and study plan based on physical state. |
| **Writes to Brain** | `sleep_hours`, `fatigue_level`, `recovery_score` signals |
| **Reggie adjustment** | "You slept 5 hours. Cognitive performance is reduced today. Recommendation: review only, no new material. Protect your ECON 201 exam prep for tomorrow when you are rested." |

**Priority: P2** — requires Health API integration. High value for the brain model accuracy.

---

#### Environment 17 — Academic Calendar (Semester Rhythm)

**What it is:** Every semester has a macro rhythm — add/drop period, midterm week, reading week, finals, grade release. The current system treats every day the same. A student in week 2 needs different support than a student in week 13.

**Why it matters:** The most valuable interventions are timed to the semester rhythm. "You are 3 weeks from finals" is a completely different context than "you are in week 2."

**Agent: `Calendar Agent`**

| | Detail |
|---|---|
| **Trigger** | Runs continuously in background; reads university academic calendar |
| **Data source** | University academic calendar (scraped from university website or manually entered during onboarding) |
| **What it does** | Tracks the current semester phase. Adjusts the Terminal briefing, Reggie's tone, and study plan urgency based on how far from finals the student is. |
| **Writes to Brain** | `semester_week`, `days_to_finals`, `current_phase` (relaxed / building / intense / recovery) |
| **Reggie tone shift** | Week 2: exploratory, curious. Week 8: focused, strategic. Week 13: intense, protective. Post-finals: reflective, planning next semester. |

---

## Part 2 — 10 Unlocked Capabilities

These capabilities are only possible when all 17 environments are connected. No competitor can build any of them because no competitor has the data.

---

### Capability 1 — Video Tutor

**What it is:** Reggie appears as a video avatar. The student asks "explain the Krebs cycle" and receives a 90-second personalised video — animated diagrams, Reggie's voice, grounded in their specific professor's teaching style and terminology.

**Why only FschoolAI can build this:** The video is generated from the Library's version of the concept as their professor taught it. A student at HKU gets a different video than a student at NUS because their professors taught it differently. No competitor has the professor-specific content layer.

**Data required:** Library (professor's lecture content + terminology) + Brain (student's knowledge gap + learning style) + Lecture Agent (professor's diagram style and emphasis)

**Technical path:** HeyGen or D-ID for avatar video + ElevenLabs for voice + Library RAG for content grounding. Generated on demand, not pre-recorded.

---

### Capability 2 — Personalised Audio Briefing (Aibrary 2.0)

**What it is:** Every morning, a personalised 15-minute audio briefing — not a summary of notes, but a narrative curated for today. "You have ECON 201 in 2 hours. Last week you struggled with the Fisher equation. Professor Chen's announcement said it will be on the midterm. Here is a 4-minute explanation in the way Chen teaches it, followed by 3 practice questions you can answer out loud."

**Why only FschoolAI can build this:** Requires knowing what they struggled with (brain knowledge gaps), what the professor emphasised (Library professor intelligence), what is coming up (Canvas deadlines + Calendar Agent), and how they learn (audio preference from behaviour). No competitor has more than one of these signals.

**Data required:** Brain (knowledge gaps + learning style) + Library (professor intelligence + lecture content) + Canvas Agent (today's schedule) + Calendar Agent (semester phase)

---

### Capability 3 — Predictive Grade Engine

**What it is:** Before the student submits an assignment, Reggie tells them their predicted grade with specific improvement suggestions. "Based on your draft, Professor Chen's rubric, and the grading patterns of 200 previous submissions in this course, your current draft will score approximately 74%. Here are the 3 specific changes that would push it to 85%."

**Why only FschoolAI can build this:** Requires the rubric (Canvas Agent), the professor's grading patterns from 200 previous submissions (Library Agent), and the student's writing history (brain). No competitor has all three.

**Data required:** Library (professor rubric + 200-submission grading pattern) + Brain (student writing history + past grades) + Canvas Agent (assignment brief)

---

### Capability 4 — Exam Simulation

**What it is:** Two weeks before the exam, Reggie generates a full mock exam — same format as the professor's actual exams, same question types, same difficulty distribution. The student sits it under timed conditions. Reggie grades it and gives targeted feedback.

**Why only FschoolAI can build this:** The mock exam is generated from the professor's historical exam patterns (Library), the student's specific knowledge gaps (brain), and the course content (Library). It is a simulation of this professor's exam for this student's gaps — not a generic practice test.

**Data required:** Library (professor's historical exam patterns + course content) + Brain (student's knowledge gaps + confidence levels) + Calendar Agent (exam proximity)

---

### Capability 5 — The Study Plan That Actually Works

**What it is:** A day-by-day, hour-by-hour study plan generated from the intersection of what the student needs to learn, when they learn best, what is due when, and how much time they actually have.

**Example:** "Marcus learns quantitative material best on Tuesday mornings and struggles with writing after 9pm. His ECON problem set is due Thursday. His PSYC essay is due Friday. His study plan schedules ECON for Tuesday morning and PSYC writing for Sunday afternoon."

**Why only FschoolAI can build this:** Every other study planner is a calendar app. This is a recommendation engine — like Netflix's algorithm but for study sessions. Requires behavioural patterns (brain), knowledge gaps (brain), deadlines (Canvas Agent), and calendar context (Calendar Agent).

**Data required:** Brain (learning patterns + knowledge gaps + energy rhythms) + Canvas Agent (deadlines + assignment weights) + Calendar Agent (semester phase + available time)

---

### Capability 6 — The Intervention Before the Crisis

**What it is:** Reggie detects that a student is heading toward a grade crisis 3 weeks before it happens — not after the midterm comes back with a 52%.

**The signals:** Assignment submission rate dropping (Canvas Agent) + study session duration declining (Leaderboard) + knowledge gap confidence not improving (brain) + stress signals increasing (brain signals) + sleep declining (Health Signal Agent).

**Reggie's message:** "Marcus — I've noticed something. Over the last 2 weeks, your ECON 201 engagement has dropped 40%. Your midterm is in 18 days. Based on your current trajectory, I'm projecting a 61% on the midterm. That would drop your final grade from B+ to B-. Do you want to talk about what's going on, or should I build you a recovery plan?"

**Why only FschoolAI can build this:** Requires multi-signal correlation across 4+ data sources simultaneously. No competitor has more than 1 signal (usually just "you haven't logged in").

**Data required:** Canvas Agent (submission rate) + Brain (knowledge gap trajectory + stress signals) + Leaderboard (study session duration trend) + Health Signal Agent (sleep data) + Calendar Agent (exam proximity)

---

### Capability 7 — The Academic Twin (Peer Matching Engine)

**What it is:** FschoolAI knows every student's knowledge profile — what they are strong in, what they are weak in, how they learn, what courses they are in. This enables perfect academic peer matching.

**Example:** "You are weak in operant conditioning but strong in classical conditioning. Mei is the opposite. You are both in PSYC 201. You both learn best in dialogue. You are both free on Thursday evenings. Want me to introduce you?"

**Why only FschoolAI can build this:** Requires both students' knowledge profiles (brain), learning styles (behaviour), availability (Calendar Agent), and course overlap (Canvas Agent). A matching algorithm with 5 dimensions. No competitor has any of them.

**Data required:** Brain (knowledge profile + learning style for both students) + Canvas Agent (shared courses) + Calendar Agent (shared availability) + Network Agent (compatibility score)

---

### Capability 8 — The Professor Decoder

**What it is:** A complete intelligence profile for every professor — not just "what they test" but how they think, what they value, what frustrates them, what earns extra marks.

**Example output:** "Professor Chen values concrete examples over abstract theory. He deducts marks for passive voice. He gives bonus marks for connecting course concepts to current events. His office hours are most productive in week 8 — he gives hints about the final. His exams are 60% from lecture 4 and 6."

**Why only FschoolAI can build this:** Built from 200 students' graded feedback (Library Agent), lecture emphasis patterns (Lecture Agent), syllabus analysis (Canvas Agent), and historical exam patterns. This is a dataset no professor has ever seen about their own grading patterns. No competitor has graded feedback from 200 students in the same course.

**Data required:** Library (200-student graded feedback + lecture transcripts + historical exams) + Canvas Agent (syllabus + announcements) + Lecture Agent (professor emphasis patterns)

---

### Capability 9 — The Semester Debrief

**What it is:** At the end of every semester, Reggie generates a full intelligence debrief — not just grades, but insights about how the student learned and what to change next semester.

**Example output:** "This semester, you studied 312 hours. Your strongest course was COMP 3511 (A-). Your weakest was PSYC 201 (B-). The gap was not effort — you studied PSYC 201 more hours than COMP. The gap was method: you used text-based study for PSYC 201 but you are an auditory learner. Next semester, switch to Aibrary for PSYC 201. Also: your performance drops 23% in weeks when you sleep under 6 hours. Protect your sleep during midterm week."

**Why only FschoolAI can build this:** Requires correlating study method (Toolkit usage), study time (Leaderboard), grades (Canvas), learning style (brain), and sleep patterns (Health Signal Agent) across an entire semester. No competitor has any of this.

**Data required:** All 17 environments — this is the synthesis capability that requires the full data picture.

---

### Capability 10 — The Career Signal

**What it is:** Based on 4 years of brain data, Reggie can tell a student what careers they are actually suited for — not based on their major, but based on their demonstrated cognitive patterns.

**Example output:** "You consistently perform best on systems-thinking problems. You learn fastest when you can see the whole picture before the details. You have high ambition signals but low tolerance for repetitive tasks. This profile matches: product management, venture capital, and systems architecture. It does not match: accounting, clinical medicine, or academic research."

**Why only FschoolAI can build this:** Requires 4 years of knowledge graph data, learning pattern data, ambition signals, and gig work history. No career counsellor has ever had this. No LinkedIn profile captures it. This is the Layer 4 capability that turns FschoolAI from a study tool into a life intelligence layer.

**Data required:** Brain (4-year knowledge graph + learning patterns + ambition signals) + Shadow Economy Agent (verified gig history) + Canvas Agent (grade trajectory + course choices)

---

## Summary

### All 17 Environments

| # | Environment | Agent | Status | Priority |
|---|---|---|---|---|
| 1 | Classroom — live lecture | Lecture Agent | ✅ In PRD | P0 |
| 2 | Canvas / School Portal | Canvas Agent | ✅ In PRD | P0 |
| 3 | Study Room (collaborative) | Tutor Agent | ✅ In PRD | P0 |
| 4 | Solo Study Session | Tutor Agent | ✅ In PRD | P0 |
| 5 | Dashboard / Terminal | Terminal Agent | ✅ In PRD | P0 |
| 6 | Leaderboard / Network | Network Agent | ✅ In PRD | P0 |
| 7 | Nightly Reflection | Reflection Agent | ✅ In PRD | P0 |
| 8 | Library (background) | Library Agent | ✅ In PRD | P0 |
| 9 | Office Hours / Tutorial | Office Hours Agent | ❌ Missing | P1 |
| 10 | Exam Hall (pre/post exam) | Exam Mode Agent | ❌ Missing | P1 |
| 11 | Lab / Practical Session | Lab Report Agent | ❌ Missing | P2 |
| 12 | Commute (audio-first) | Commute Agent | ❌ Missing | P1 |
| 13 | Professor Email / Announcement | Announcement Agent | ❌ Missing | P1 |
| 14 | Group Chat (Discord/WhatsApp) | Community Intelligence Agent | ❌ Missing | P2 |
| 15 | Shadow Economy (gig/freelance) | Shadow Economy Agent | ❌ Missing | P3 |
| 16 | Sleep / Biometric | Health Signal Agent | ❌ Missing | P2 |
| 17 | Academic Calendar | Calendar Agent | ❌ Missing | P1 |

### 10 Unlocked Capabilities

| # | Capability | Data Required | Priority |
|---|---|---|---|
| 1 | Video Tutor | Library + Brain + Lecture Agent | P1 |
| 2 | Personalised Audio Briefing | Brain + Library + Canvas + Calendar | P1 |
| 3 | Predictive Grade Engine | Library + Brain + Canvas | P1 |
| 4 | Exam Simulation | Library + Brain + Calendar | P1 |
| 5 | Study Plan That Actually Works | Brain + Canvas + Calendar | P0 |
| 6 | Intervention Before the Crisis | All 5 signal sources | P0 |
| 7 | Academic Twin (Peer Matching) | Brain × 2 + Canvas + Calendar + Network | P2 |
| 8 | Professor Decoder | Library (200-student data) | P1 |
| 9 | Semester Debrief | All 17 environments | P2 |
| 10 | Career Signal | Brain (4-year) + Shadow Economy + Canvas | P3 |

---

## Key Principle

> **Every environment produces data. Every agent converts that data into brain signals. The brain synthesises all signals into a unified student model. Reggie reads that model before every interaction. The student never has to explain themselves — the system already knows.**

This loop — environment → agent → brain → Reggie → student — is what no competitor has. They have one environment (chat) and one agent. FschoolAI has 17 environments, 17 agents, and one brain that connects them all.

---

*Document prepared for the FschoolAI engineering and product team.*
*Push to GitHub: `frontend/dev` branch as `ENVIRONMENTS_AND_CAPABILITIES.md`*
