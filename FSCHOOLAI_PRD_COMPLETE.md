# FschoolAI — Complete Product Requirements Document (PRD)
**Version 1.0 | June 2026 | Confidential — Internal Use Only**

---

## 0. Product Vision

FschoolAI is the first AI ecosystem built specifically for students — not to do their work, but to understand them. It connects to every environment a student lives in (classroom, Canvas, study room, social network), builds a permanent model of how they learn, and serves them in the format that fits them best. The more a student uses it, the smarter it gets. No teacher in history has been able to do this at scale. FschoolAI does.

**One-line positioning:** "The Bloomberg Terminal for students — a brain that knows you, a network that connects you, and a terminal that commands your academic life."

**Core principle:** The AI adapts to the student. The student never adapts to the AI.

---

## 1. User Personas

### Persona A — The Overwhelmed Achiever
**Name:** Marcus, 20, sophomore at University of Hong Kong  
**Context:** Studying Finance + Computer Science double major. 5 courses, 3 part-time commitments. Constantly behind. Uses ChatGPT but gets generic answers. Misses deadlines because he loses track.  
**Pain:** "I know I need to study but I don't know where to start. ChatGPT just gives me textbook answers that don't match what my professor taught."  
**What he needs:** A system that knows his actual courses, tells him what to prioritise today, and explains things the way his professor explained them.

### Persona B — The Competitive Grinder
**Name:** Aisha, 21, junior at NUS Singapore  
**Context:** Pre-med. GPA-obsessed. Studies 8 hours a day. Wants to know she is doing enough — and doing better than her peers.  
**Pain:** "I study hard but I never know if I'm studying the right things. And I want to know where I stand compared to others."  
**What she needs:** Leaderboard, exam prediction, professor intelligence, and a system that tells her exactly what to focus on.

### Persona C — The Founder-Student
**Name:** Vincent, 19, founder of FschoolAI, studying at HKUST  
**Context:** Building a company while studying. Time is the scarcest resource. Needs an AI that understands both his academic life and his entrepreneurial thinking.  
**Pain:** "I need something that knows me completely — my courses, my projects, my thinking style — and helps me move faster without me having to explain everything every time."  
**What he needs:** A persistent brain that compounds over time, proactive interventions, and a tutor that already knows his context before he says a word.

### Persona D — The Social Learner
**Name:** Priya, 20, freshman at University of Melbourne  
**Context:** Learns best in groups. Struggles alone. Wants to study with friends but they are in different cities.  
**Pain:** "I can't focus when I study alone. I need someone to study with, but my friends are busy or far away."  
**What she needs:** Study Rooms with real-time AI tutor, friend leaderboard, collaborative learning features.

---

## 2. User Scenarios & Stories

### Scenario 1 — The Morning Command Centre

**Context:** It is 8:47am. Marcus has three classes today and a paper due tomorrow that he has not started.

**Story:**
Marcus opens FschoolAI. The Work page (home) shows his Terminal briefing at the top:

> "Good morning Marcus. Today: FINA 2011 paper due tomorrow — you haven't started. COMP 3511 quiz in 2 days — your last quiz score was 61%. ECON 1010 lecture at 10am. Recommended: spend 90 min on the paper now, 30 min on COMP revision tonight."

He taps the paper assignment. Reggie opens with full context — the rubric, the professor's grading notes from the Library Agent, and a suggested outline. Marcus starts writing. Reggie gives feedback grounded in Professor Chen's rubric, not generic writing advice.

**What makes this possible:** Canvas Agent has synced all assignments. Library Agent has Professor Chen's rubric and past grading patterns. Terminal Agent has computed today's priority order. Reggie reads all of this before Marcus says a word.

**Expandable story (with brain data):** After 30 days, Reggie knows Marcus procrastinates on writing tasks but starts strong on quantitative ones. It adjusts the morning briefing: "You tend to delay writing tasks — starting now gives you 4 hours before your focus drops. Here is the first paragraph to get you started."

---

### Scenario 2 — In-Class Recording

**Context:** Aisha is in her BIOL 3201 lecture. Professor Kim is explaining enzyme kinetics. She is taking notes but missing key points.

**Story:**
Aisha taps her NFC Founding Card against her phone. The Chrome extension activates lecture recording mode. Professor Kim says: "This will definitely be on the midterm — the Michaelis-Menten equation and its three assumptions." The Lecture Agent flags this as a high-priority signal and tags it in the transcript.

After class, Aisha opens FschoolAI. The Toolkit page shows a new lecture note: "BIOL 3201 — Enzyme Kinetics. Professor Kim flagged: Michaelis-Menten equation (3 assumptions) — exam signal." She taps it. Reggie opens with the lecture content loaded and asks: "Do you want to review the three assumptions now, or should I quiz you on them?"

**What makes this possible:** Chrome extension captures audio → Lecture Agent transcribes and detects emphasis signals → Library Agent stores the structured lecture note → Reggie reads it in the next session.

**Expandable story:** After 10 lectures, the Library Agent has built a Professor Kim intelligence profile: "Kim's midterms are 70% from lecture examples, 30% from textbook. She always tests the mechanism, not just the definition." Reggie surfaces this before every Kim exam.

---

### Scenario 3 — The Leaderboard Effect

**Context:** It is 11pm. Vincent has been studying for 3 hours. He is about to stop.

**Story:**
He opens the Leaderboard page. He is ranked #3 in the HK Nerdmaxing board. His roommate is #2. The gap is 47 minutes of study time.

He keeps studying.

At midnight, he crosses into #2. A token reward appears: "+50 FST — Late Night Maxing streak extended." He screenshots it and sends it to his roommate on WhatsApp. His roommate opens FschoolAI to check his own rank.

**What makes this possible:** Network Agent tracks study session duration and depth. Token Engine awards FST for verified academic behaviour. Leaderboard updates in real time.

**Expandable story:** The University of Hong Kong board shows HKU ranked #4 globally among universities. A campus ambassador posts about it. 20 new students sign up that week to represent their university.

---

### Scenario 4 — Study Room Collaboration

**Context:** Priya and her friend Mei are both preparing for their PSYC 201 midterm. They are in different cities.

**Story:**
Priya creates a Study Room, selects PSYC 201 as the course context, and invites Mei. Both join. Reggie appears in the room with full context: "You're both studying PSYC 201. Based on your brain profiles, Priya — you're strong on classical conditioning but weak on operant. Mei — you have the opposite pattern. Want to quiz each other?"

They spend 45 minutes in the room. Reggie facilitates, asks questions, gives explanations grounded in their actual lecture notes. At the end: "Session complete. Priya: operant conditioning confidence +12%. Mei: classical conditioning confidence +8%."

**What makes this possible:** Study Room connects to both students' Canvas data and brain profiles. Reggie reads both brain contexts simultaneously. Library Agent provides PSYC 201 course content. Session signals are written back to both brains.

**Expandable story:** After 5 Study Room sessions, Reggie knows Priya learns better in dialogue than alone. Her morning briefing changes: "You have a PSYC 201 quiz in 3 days. You learn best in Study Rooms — Mei is available tonight at 9pm. Want me to send her an invite?"

---

### Scenario 5 — The NFC Card Identity

**Context:** Marcus is at a university networking event. Someone asks what he uses for studying.

**Story:**
Marcus pulls out his Founding Card — matte black, engraved "#0047." He taps it against his phone. His FschoolAI profile opens: GPA trajectory, streak, Leaderboard rank, Brain ID. He shows it. The person asks: "How do I get one?" Marcus says: "You can't. There are only 500. But you can join the waitlist."

That night, 3 people from the event join the waitlist.

**What makes this possible:** NFC chip in the Founding Card triggers the Identity page. ShareCard component generates a shareable profile snapshot. Scarcity mechanics (500 cards, numbered) create social currency.

**Expandable story (Phase 3):** The Founding Card becomes a verifiable credential. Marcus taps his card at a startup's hiring event. The recruiter's phone shows: "Brain ID verified — GPA trajectory positive, Ambition Score 87/100, 3 verified projects." No CV needed.

---

### Scenario 6 — The Proactive Intervention

**Context:** It is 2am. Aisha has been studying for 6 hours. Her typing speed has dropped 40%. She has not taken a break.

**Story:**
Reggie sends a push notification: "Aisha — your focus signals dropped significantly in the last 30 minutes. You've been studying for 6 hours. Research shows retention drops after 90-minute blocks without rest. Take 15 minutes. Your BIOL notes will still be here."

She puts her phone down. 15 minutes later: "Ready? Let's do a quick 5-question review of what you covered tonight before you sleep. It takes 3 minutes and doubles retention."

She does the review. The next morning, she remembers 40% more.

**What makes this possible:** Brain Scheduler monitors behavioral signals (typing speed, session duration, time of day). Intervention Agent detects fatigue pattern. Nudge API sends the push notification. Reflection Agent writes the fatigue signal to the brain.

**Expandable story:** After 30 days, Reggie knows Aisha's optimal study pattern: 90 minutes on, 15 off, never past 1am. It builds her study schedule around this automatically.

---

### Scenario 7 — Canvas Sync First Use (Onboarding)

**Context:** Priya just downloaded FschoolAI. She is on the Onboarding page.

**Story:**
She types "University of Melbourne." The school appears. She taps it. FschoolAI says: "Connect your Canvas to sync your courses automatically." She enters her Canvas URL and token. In 8 seconds: "6 courses synced. 14 assignments imported. 2 due this week."

Reggie appears: "Hi Priya. I've loaded your courses. Your most urgent assignment is PSYC 201 — due in 3 days. Want to start there?"

She has never explained her courses. She has never told Reggie what she is studying. Reggie already knows.

**What makes this possible:** Canvas Agent fetches courses, assignments, grades, and syllabi automatically. Onboarding flow handles OAuth token flow for supported schools. Course Resolver normalises Canvas data into the FschoolAI schema.

---

### Scenario 8 — The Library as Shared Intelligence

**Context:** 500 students at HKU use FschoolAI. 200 of them are in ECON 1010 with Professor Chen.

**Story:**
Over the semester, 200 students have had their lectures recorded and processed. The Library Agent has built a Professor Chen intelligence profile from 200 data points: "Chen's finals are 60% from lecture slides, 25% from tutorial problems, 15% from readings. He always tests the mechanism behind monetary policy, not just the definition. His favourite trick question involves the Fisher equation."

When Marcus asks Reggie about ECON 1010 exam prep, Reggie says: "Based on Professor Chen's pattern across 200 students, focus on the mechanism behind monetary policy — specifically the Fisher equation. He has tested this in 4 of the last 5 finals."

Marcus has never met those 200 students. But their collective experience is now his advantage.

**What makes this possible:** Library Agent aggregates anonymised lecture signals across all students in the same course. Professor Intelligence profile is built from crowd-sourced data. Reggie reads the Library before answering exam prep questions.

---

### Scenario 9 — FST Token Economy

**Context:** Aisha has been using FschoolAI for 3 weeks. She has earned 340 FST tokens.

**Story:**
She opens the Identity page. Her token balance shows 340 FST. She taps "Redeem." Options appear: Notion Pro (1 month free — 200 FST), Spotify Student (1 month — 150 FST), FschoolAI Pro upgrade (500 FST for 3 months).

She redeems Notion Pro. A code appears instantly. She uses it.

The next day, she submits an assignment on time. "+30 FST — Assignment submitted." She is 130 FST away from FschoolAI Pro.

**What makes this possible:** Token Engine validates academic actions against Canvas data (submission timestamps, grade records). Token balance stored in Supabase. Partner redemption layer handles code delivery. Every token is earned, never purchased.

---

### Scenario 10 — The Expandable Future: Brain as Credential (Phase 3)

**Context:** Vincent graduates. He is applying to a YC startup.

**Story:**
The startup asks for a CV. Vincent sends his Brain ID instead. The recruiter opens the NeuroAGI verification portal. It shows: "Brain ID #0047 — 4-year academic trajectory, GPA positive trend, top 5% in global Leaderboard, 3 verified projects, Ambition Score 91/100. Zero-knowledge proof: all claims verified without exposing raw data."

The recruiter calls Vincent the next day.

**What makes this possible:** NeuroAGI DID (Decentralised Identity) anchors Vincent's brain data. Verifiable Brain Credential uses ZK proof to prove claims without exposing raw data. Founding Card NFC chip carries the Brain ID. This is Phase 3 — not built yet, but the data foundation is being laid from Day 1.

---

## 3. Every Product Page — Full Specification

### Page 1 — Work (Home / Terminal)

**Route:** `work` (default home page)  
**Navigation:** Swipe right → Assignment, Swipe left → Canvas, Swipe up → Identity, Swipe down → Toolkit

**Purpose:** The Bloomberg Terminal morning briefing. The reason students open FschoolAI every morning.

**Components:**
- **Terminal Briefing Card** (top): Reggie's proactive daily summary — most urgent assignments, knowledge gaps to review today, GPA trajectory note, motivational signal. Generated by Terminal Agent reading brain context + Canvas data.
- **Upcoming Assignments List**: Cards sorted by urgency. Each card shows: assignment name, course code, due date badge (colour-coded: red = overdue/today, yellow = this week, grey = later), submission status, progress bar.
- **Stats Row** (bottom): Streak counter, FST token balance, Leaderboard rank badge. Tapping any stat navigates to the relevant page.
- **NeuralRing (Reggie)**: Floating orb at bottom centre. Tap to open full Reggie chat. Reggie pre-loads today's context before the first message.

**Agent connections:**
- Terminal Agent → generates morning briefing
- Canvas Agent → provides assignment data
- Reggie (Tutor Agent) → available on tap

**Data sources:** `assignments` table (Canvas sync), `brain.context_window` (NeuroAGI), `users` table (streak, tokens)

---

### Page 2 — Assignment

**Route:** `assignment`  
**Navigation:** Swipe left → Work, Swipe down → Study

**Purpose:** Deep dive into a single assignment. Reggie helps the student complete it grounded in the actual rubric and professor's style.

**Components:**
- **Assignment Header**: Title, course, due date, points possible, submission status
- **Rubric Panel**: Parsed rubric from Canvas or Library Agent. Shows grading criteria with weights.
- **Professor Intelligence Badge**: "Prof Chen grades this type of assignment: focus on mechanism, not definition. Average grade: 78%." Sourced from Library Agent.
- **Reggie Chat** (full screen): Pre-loaded with assignment context, rubric, and professor intelligence. Student can ask questions, get outlines, get feedback on drafts.
- **Submission Tracker**: Checkbox list of rubric criteria. Student marks off as they complete.

**Agent connections:**
- Canvas Agent → assignment metadata and rubric
- Library Agent → professor intelligence for this assignment type
- Tutor Agent (Reggie) → grounded in rubric and professor style

---

### Page 3 — Canvas

**Route:** `canvas`  
**Navigation:** Swipe right → Work, Swipe down → Rooms

**Purpose:** Full view of the student's Canvas LMS data. Courses, assignments, modules, grades, announcements.

**Components:**
- **Sync Status Badge**: Synced / Syncing / Error — with last sync timestamp
- **Course Cards** (expandable): Each course shows course code, name, grade percentage, assignment count. Expand to see: assignments list, modules, grade weights breakdown.
- **Announcements Feed**: Professor announcements from Canvas, sorted by date.
- **Manual Upload Sheet**: For students whose school does not support OAuth — manual Canvas token entry.
- **Grade Weights Chart**: Visual breakdown of how the final grade is calculated (midterm %, final %, assignments %, participation %).

**Agent connections:**
- Canvas Agent → all data
- Library Agent → enriches course data with professor intelligence

---

### Page 4 — Study (Flashcards + Knowledge Graph)

**Route:** `study`  
**Navigation:** Swipe up → Assignment, Swipe left → Rooms

**Purpose:** Active recall and knowledge mapping. Two modes: Flashcard review and Knowledge Graph exploration.

**Components:**
- **Mode Toggle**: Flashcards / Knowledge Graph
- **Flashcard Mode**: AI-generated flashcards from lecture notes and Canvas content. Spaced repetition algorithm. Confidence rating (1–5) after each card. Cards generated by Tutor Agent from Library content.
- **Knowledge Graph Mode**: Interactive node graph of academic concepts across all courses. Nodes coloured by course. Edges show concept relationships. Tap a node to ask Reggie about it. Built by Canvas Agent + GROQ from course content.
- **Study Session Timer**: Pomodoro-style timer. Session signals written to brain on completion.

**Agent connections:**
- Tutor Agent → generates flashcards
- Canvas Agent + GROQ → builds knowledge graph
- Reflection Agent → writes study session signal to brain

---

### Page 5 — Toolkit

**Route:** `toolkit`  
**Navigation:** Swipe up → Work, Swipe left → Rooms

**Purpose:** All AI-powered academic tools. The feature hub.

**Sub-tools:**
- **Lecture Notes**: View all captured lecture notes. Searchable. Sorted by course and date.
- **Lesson Generator**: Generate a structured lesson on any topic. 10 formats: concept explanation, worked example, Socratic dialogue, visual description, analogy, timeline, comparison, case study, practice problems, summary. Tutor Agent generates from Library content.
- **Aibrary (Audio Mode)**: Convert any lecture note or lesson into a podcast-style audio explanation. ElevenLabs TTS. Student listens during commute.
- **Document Upload**: Upload PDFs, slides, notes. Extract Agent processes and adds to personal Library.
- **Whiteboard**: Freehand drawing canvas for visual learners. Reggie can annotate and explain diagrams.
- **Exam Predictor**: Based on professor intelligence and past exam patterns, predicts likely exam topics with confidence scores. Pro feature.

**Agent connections:**
- Lecture Agent → provides lecture notes
- Tutor Agent → generates lessons
- Extract Agent → processes uploaded documents
- Library Agent → provides course content for all tools

---

### Page 6 — Rooms (Study Rooms)

**Route:** `rooms`  
**Navigation:** Swipe up → Canvas, Swipe right → Toolkit

**Purpose:** Real-time collaborative study with AI tutor. Social learning layer.

**Components:**
- **Friends List**: Online friends with their current study status (studying PSYC 201, idle, in a room).
- **Active Rooms**: Rooms the student is in or has been invited to.
- **Create Room**: Select course context, invite friends, set focus topic.
- **Room View**: Real-time chat between members. Reggie present as a participant — reads all messages, can be addressed directly. Presence indicators (who is typing, who is active). Course context shown at top.
- **Session Summary** (on exit): What was covered, confidence changes for each participant, tokens earned.

**Architecture:** Cloudflare Durable Objects for real-time WebSocket. Supabase for persistent room history and social graph.

**Agent connections:**
- Tutor Agent (Reggie) → in-room AI tutor with both students' brain context
- Canvas Agent → course context for the room
- Network Agent → friend presence and social graph

---

### Page 7 — Identity (Profile)

**Route:** `identity`  
**Navigation:** Swipe down → Work, Swipe right → Leaderboard, Swipe left → Files

**Purpose:** The student's full academic identity. GPA trajectory, token balance, streak, brain tier, social connections.

**Components:**
- **Profile Header**: Name, university, year, Brain ID (if Founding Member)
- **GPA Graph**: Semester-by-semester GPA trajectory. Trend line. Target GPA marker.
- **Brain Tier Badge**: Basic → Scholar → Mastermind → Brain Owner (based on FST tokens)
- **Token Balance + History**: Current FST balance. Transaction history with icons and labels. Redeem button.
- **Streak Counter**: Current daily streak. Longest streak. Streak calendar heatmap.
- **ShareCard**: Tap to generate a shareable profile card. NFC tap shares it instantly.
- **Friends Section**: Friend list. Add friends. See friends' streaks and ranks.
- **Discord Integration**: Connect Discord for community features.

**Agent connections:**
- Token Engine → FST balance and history
- Network Agent → friends and social graph
- Brain Scheduler → streak tracking

---

### Page 8 — Leaderboard

**Route:** `leaderboard`  
**Navigation:** Swipe left → Identity

**Purpose:** Competitive social layer. The mechanism that turns studying into a game students want to win.

**Board types:**
- **Nerdmaxing**: Study depth score (time × quality × consistency). University filter, city filter, global.
- **Late Night Maxing**: Study sessions after 10pm. Streak-based.
- **Streak Board**: Longest active streak. Most consistent learners.
- **University Board**: Aggregate score by university. HKU vs NUS vs Melbourne.
- **Friends Board**: Your friend group only. Most intimate competition.

**Components:**
- **Board Selector**: Tab bar across top
- **Rank List**: Rank, anonymous username, score, university badge, streak indicator
- **Your Position**: Always visible at bottom — your rank, score, gap to next position
- **Token Reward**: FST tokens awarded for rank milestones (top 10, top 100, weekly winner)

**Agent connections:**
- Network Agent → aggregates study signals into leaderboard scores
- Token Engine → awards FST for rank milestones

---

### Page 9 — Files

**Route:** `files`  
**Navigation:** Swipe right → Identity

**Purpose:** Personal document library. All uploaded and auto-generated files.

**Components:**
- **File List**: PDFs, slides, notes — uploaded by student or auto-generated from lectures
- **Upload Button**: Drag and drop or file picker. Extract Agent processes on upload.
- **Search**: Full-text search across all files
- **File Preview**: In-app PDF viewer. Tap any section to ask Reggie about it.
- **Auto-generated Files**: Lecture notes, lesson exports, flashcard sets — automatically appear here after generation.

**Agent connections:**
- Extract Agent → processes uploaded files
- Library Agent → indexes file content for RAG
- Tutor Agent → can be asked about any file content

---

### Page 10 — Card (Founding Card)

**Route:** `card` (accessible from Identity or direct link)  
**Navigation:** Back to Identity

**Purpose:** The Founding Card purchase and personalisation flow. Apple AirPods Pro 3 style.

**Sections:**
- **Hero**: Full-viewport card showcase. Countdown to founding deadline.
- **Colorway Picker**: 5 colours (Titanium Black, Royal Purple, Royal Pink, Royal Blue, Royal Green). Selected card glows, others dim.
- **Engraving**: Free personalisation. Text input with live preview on card. Character limit: 20.
- **Features Grid**: 9 features included with the card.
- **Delivery Options**: Standard (free) or Founder Delivery ($3,000 — includes 1-hour personal setup session with Vincent).
- **Application Form**: Name, university, email. Apply button.
- **Trust Icons**: Free delivery, Lifetime Pro included, Cancel anytime.

**Connections:** Supabase `founding_cards` table. Email notification on application.

---

### Page 11 — Onboarding

**Route:** `onboarding` (first launch only)  
**Navigation:** → Work (on completion)

**Purpose:** Get the student set up in under 2 minutes. Canvas connected, Reggie introduced.

**Steps:**
1. **Name + University**: Search 10,000+ schools. Auto-detects Canvas URL.
2. **Canvas Connect**: OAuth flow for supported schools. Manual token for others.
3. **Sync**: 8-second Canvas sync. Shows courses and assignments loading.
4. **Reggie Introduction**: "Hi [Name]. I've loaded your [N] courses. Your most urgent assignment is [X]. Want to start there?" First Reggie message pre-loaded with their actual data.
5. **Notifications**: Enable push notifications for proactive interventions.

**Agent connections:**
- Canvas Agent → initial sync
- Tutor Agent (Reggie) → first personalised message
- Brain Scheduler → initialises brain context window

---

### Page 12 — Landing (Marketing)

**Route:** `/` (unauthenticated users)  
**Navigation:** → Onboarding (on sign up)

**Purpose:** Convert visitors to sign-ups. Communicate the FschoolAI value proposition.

**Sections:**
- **Hero**: "The first AI that actually knows you." CTA: "Start free — connect Canvas in 2 minutes."
- **Problem**: "Every AI resets when you close the tab. Yours shouldn't."
- **Solution**: Three pillars — Brain, Network, Terminal.
- **Features**: Canvas sync, lecture recording, Reggie, Leaderboard, Study Rooms, NFC Card.
- **Social Proof**: Leaderboard preview, student testimonials (real, not fabricated).
- **Founding Card CTA**: "500 founding members. [N] spots left."
- **Footer**: Privacy policy, terms, contact.

---

## 4. Chrome Extension — Scenarios & Spec

The Chrome extension is the data collection layer. Without it, FschoolAI has no live academic data.

### Extension Scenario 1 — Canvas Auto-Sync
Student visits their Canvas portal. Extension detects the Canvas domain. Automatically extracts: courses, assignments, grades, syllabi, announcements. Sends to FschoolAI backend via `extension-sync.ts`. No manual action required after initial setup.

### Extension Scenario 2 — Lecture Recording
Student taps NFC Card or clicks extension icon before class. Extension activates microphone. Records lecture audio. Sends to STT API (`stt.ts`) for transcription. Lecture Agent processes transcript: detects emphasis signals, structures notes, links to Canvas course. Notes appear in Toolkit within 5 minutes of class ending.

### Extension Scenario 3 — Assignment Context Injection
Student opens a Canvas assignment page. Extension detects assignment ID. Injects a "Ask Reggie" button. Student clicks it. Reggie opens pre-loaded with the full assignment context — rubric, professor notes from Library, student's brain context. No copy-paste needed.

### Extension Scenario 4 — Brain Signal Collection
Extension monitors Canvas activity passively: which pages the student visits, how long they spend on each assignment, submission timing patterns. These are behavioral signals sent to the Brain Scheduler. Over time, they build the procrastination pattern, focus pattern, and submission behaviour profile.

---

## 5. Agent-to-Page Connection Map

| Page | Primary Agent | Secondary Agents | Brain Read | Brain Write |
|---|---|---|---|---|
| Work | Terminal Agent | Canvas Agent, Reggie | context_window, signals | — |
| Assignment | Tutor Agent | Canvas Agent, Library Agent | patterns, person_model | session signal |
| Canvas | Canvas Agent | Library Agent | — | course sync signal |
| Study | Tutor Agent | Canvas Agent | knowledge gaps | study session signal |
| Toolkit | Tutor Agent | Lecture Agent, Extract Agent, Library Agent | learning style | tool usage signal |
| Rooms | Tutor Agent | Canvas Agent, Network Agent | both students' brain | room session signal |
| Identity | — | Token Engine, Network Agent | full profile | — |
| Leaderboard | Network Agent | Token Engine | — | rank signal |
| Files | Extract Agent | Library Agent | — | file indexed signal |
| Card | — | — | — | founding member signal |
| Onboarding | Canvas Agent | Tutor Agent | — | initial brain seed |

---

## 6. Expandable User Stories (Unlocked by Brain Data)

These stories are not yet built but are unlocked by the brain data being collected from Day 1.

### Story E1 — Predictive Burnout Prevention
After 60 days of data, the Reflection Agent detects that Aisha's stress signals spike every 3 weeks, correlated with assignment clusters. Two weeks before the next predicted spike, Reggie adjusts her study schedule to front-load work and protect the high-stress week. She never burns out because the system saw it coming.

### Story E2 — Learning Style Auto-Adaptation
After 30 days, the brain has detected that Marcus engages 3x longer with audio content than text. Reggie automatically switches to voice responses for Marcus without being asked. His retention improves 40%.

### Story E3 — Professor Intelligence Crowdsourcing
After 200 students use FschoolAI at HKU, the Library Agent has built intelligence profiles for 80 professors. A new student joins and takes ECON 1010. On day one, Reggie says: "Professor Chen's finals are 60% from lecture slides. His favourite question type is mechanism-based, not definition-based. Here is what to focus on." The new student has the advantage of 200 students' collective experience.

### Story E4 — Study Group Matching
After 90 days, the brain knows Priya's knowledge gaps in PSYC 201. The Network Agent identifies 3 other students in the same course with complementary strengths. Reggie says: "You're strong in classical conditioning but weak in operant. These 3 students have the opposite pattern. Want to start a Study Room with them?" Priya meets her study group through FschoolAI.

### Story E5 — Career Signal (Phase 3)
Vincent's brain has accumulated 4 years of academic signals: GPA trajectory, project completion rate, learning velocity, ambition score. When he applies to YC, he shares his Brain ID. YC's portal reads the verified signals via ZK proof. No CV needed. The brain is the credential.

### Story E6 — The Nightly Brain Reflection
Every night at 2am, the Reflection Agent runs. It reads all of today's signals — what Marcus studied, how long, what he got right and wrong, how his stress level changed, what Reggie said that helped. It synthesises these into 3 new insights and writes them to the brain. Tomorrow, Reggie is slightly smarter about Marcus than it was today. This compounds every single day for 4 years.

---

## 7. What Is Not Built Yet (Gap Register)

| Gap | Priority | Owner |
|---|---|---|
| A2A specialist agent layer (Reggie currently monolithic) | P0 | Aryan + Tencent/Bytedance engineers |
| Canvas → NeuroAGI brain sync (fschool.courses empty) | P0 | Aryan |
| Library Agent background process (currently request-only) | P1 | Library Agent team |
| Proactive intervention push notifications (code exists, not running reliably) | P1 | Backend team |
| Study Room Cloudflare Durable Objects deployment | P1 | Aryan |
| Leaderboard real-time update (currently manual refresh) | P2 | Frontend team |
| Professor Intelligence profile builder | P2 | Library Agent team |
| Exam Predictor (Pro feature) | P2 | Tutor Agent team |
| FST Token partner redemption layer | P2 | Vincent |
| NFC Card production and shipping | P2 | Vincent |
| NeuroAGI DID provisioning at signup | P3 | 李小雷 |
| ZK Proof circuit for Verifiable Brain Credential | P3 | 李小雷 |
| Brain data migration script (Supabase → DWN) | P3 | 李小雷 |

---

## 8. Success Metrics

| Metric | Target (Month 3) | Target (Month 12) |
|---|---|---|
| Daily Active Users | 500 | 10,000 |
| Canvas sync rate (% of users who connect Canvas) | 80% | 85% |
| D7 retention | 40% | 55% |
| D30 retention | 20% | 35% |
| Average sessions per week | 5 | 7 |
| Leaderboard engagement (% of DAU who check leaderboard) | 30% | 45% |
| Study Room sessions per week | 200 | 2,000 |
| Founding Cards sold | 500 | 500 (sold out) |
| FST tokens earned per DAU per day | 25 | 40 |
| NPS | 45 | 60 |

---

*Document compiled from: ALIVE_PRODUCT_SPEC.md, LIBRARY_ARCHITECTURE.md, STUDY_ROOM_PLAN.md, ROOM_FEATURES_PLAN.md, ECOSYSTEM_MASTER_VISION.md, TOKEN_ECONOMY.md, AGENT_ARCHITECTURE_FINAL.md, ARCHITECTURE_V2_STATEFUL_STATELESS.md, WEB5_BRAIN_OS.md, frontend/dev branch (src/pages/*, src/components/*, navConfig.js, api/*)*
