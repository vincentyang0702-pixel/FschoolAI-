# Library Architecture: The World's Biggest Academic Intelligence Layer

**Owner:** Vincent Yang (Product/Architecture)  
**Audience:** Investors, technical coders, new team members  
**Last updated:** June 2026

---

## What the Library Is

The FschoolAI Library is a shared, university-scoped database of course content — lecture slides, syllabi, assignment rubrics, professor feedback, and course announcements — captured from real students' real courses at real universities around the world.

It is not a content platform. It is not a textbook database. It is not scraped from the internet. Every item in the library was captured from an actual student's actual LMS (Canvas, Moodle, D2L, Blackboard) by the FschoolAI Chrome extension. This means the library contains the exact content a professor assigned, the exact rubric they graded by, and the exact feedback they gave — not a generic approximation.

This is the most important asset FschoolAI will ever build.

---

## Why the Library Lives in FschoolAI, Not the NeuroAGI Brain

The FschoolAI Library and the NeuroAGI Brain are two separate databases serving two fundamentally different purposes. Understanding this distinction is critical to understanding the entire architecture.

The NeuroAGI Brain is **personal**. It belongs to the student. It contains their behavioral signals, their grade trajectory, their knowledge gaps, their learning patterns. When the student deletes their brain, all of that data is gone. No other student ever sees it.

The FschoolAI Library is **institutional**. It belongs to the course. The PSYC 201 syllabus at the University of Toronto is the same document for all 200 students enrolled in that course. No single student owns it. FschoolAI owns the indexed version of it, and every student in that course benefits from it.

| Data | Where It Lives | Owned By | Deletable By Student? |
|---|---|---|---|
| Student's grade on Assignment 2 | NeuroAGI Brain | The student | Yes |
| Student's procrastination patterns | NeuroAGI Brain | The student | Yes |
| PSYC 201 Week 3 lecture text | FschoolAI Library | FschoolAI | No |
| Prof Chen's rubric for Essay 1 | FschoolAI Library | FschoolAI | No |
| Prof Chen's grading style profile | FschoolAI Library | FschoolAI | No |

This separation mirrors how Apple structures its ecosystem: iCloud (shared infrastructure, Apple-owned) and the personal device (personal data, user-owned). Neither works as well without the other, but they are governed by completely different rules.

---

## The Shared Library Model: One Copy, Infinite Students

The fundamental design principle of the library is deduplication by content hash. Before any new content is stored, the backend computes a hash of the content and checks whether it already exists in the library.

The first student who installs the FschoolAI extension and visits the PSYC 201 syllabus page at the University of Toronto triggers a library write. The raw text is stored, Claude analyzes it and extracts concepts, and the professor's course structure is indexed. This takes approximately 3 seconds and costs a fraction of a cent in API fees.

The second student who visits the same syllabus page triggers a hash check. The hash matches. No storage write occurs. No Claude API call is made. The second student instantly inherits the fully analyzed library item that the first student built — at zero cost.

By the time 50 students at the University of Toronto are using FschoolAI, the library for every major course is complete. New students get a fully populated course library on their first day, without doing any work.

---

## The Network Effect: Why This Is the Moat

The library compounds with every student. This is not a metaphor — it is a mathematical property of the architecture.

| Students at a University | What the Library Contains |
|---|---|
| 10 students | Syllabi and some lectures for the most popular courses |
| 50 students | Complete library for all courses those students are enrolled in |
| 200 students | Complete library for all major courses at the university |
| 1,000 students | Professor intelligence profiles built from hundreds of graded assignments per professor |
| 10,000 students across 50 universities | The most comprehensive database of university course content ever assembled |
| 100,000 students globally | Every major course at every major university, indexed, analyzed, and connected |

A competitor starting today would have zero library. They would need to acquire students, wait for those students to browse their LMS, and slowly accumulate content. FschoolAI's library grows every day. The gap widens every day. After two years of operation, the library is effectively impossible to replicate.

This is the same moat that made Google Maps dominant — not the map technology, but the years of Street View cars, satellite imagery, and user-contributed data that no competitor could replicate quickly.

---

## What the Library Contains

### Content Types

| Content Type | What It Is | How It's Captured | Shared? |
|---|---|---|---|
| `syllabus` | Full course syllabus text | Student visits syllabus page | Yes — same for all students in course |
| `lecture` | Full text of lecture slides or module pages | Student visits lecture/module page | Yes |
| `rubric` | Full assignment rubric text | Student opens assignment details | Yes |
| `announcement` | Professor announcements | Student views course announcements | Yes |
| `feedback` | Professor's written feedback on graded work | Student views graded assignment | No — personal, stored in brain only |

### Database Schema

```sql
CREATE TABLE course_content (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id   TEXT NOT NULL,
  -- e.g. "uoft", "ubc", "mcmaster", "mit", "stanford"
  -- Derived from LMS URL: canvas.utoronto.ca → "uoft"

  course_id       TEXT NOT NULL,
  -- e.g. "PSYC201" or the LMS's internal course ID

  canvas_course_id TEXT,
  -- Original LMS course ID for cross-referencing

  content_type    TEXT NOT NULL,
  -- "syllabus" | "lecture" | "rubric" | "announcement" | "module"

  content_hash    TEXT NOT NULL UNIQUE,
  -- SHA-256 of (university_id + course_id + content_type + text[:500])
  -- This is the deduplication key

  text            TEXT NOT NULL,
  -- Full extracted text (up to 50,000 characters)

  summary         TEXT,
  -- Claude-generated summary (populated by Library Organizer Agent)

  concepts        JSONB,
  -- Claude-extracted concept list: ["regression analysis", "p-value", ...]

  week_number     INTEGER,
  -- For lectures: which week of the semester

  module_name     TEXT,
  -- For modules: the module title

  professor_name  TEXT,
  -- Extracted from page when available (used for Professor Intelligence)

  source_url      TEXT,
  -- Original LMS URL (for debugging and re-fetch if needed)

  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
  seen_by_count   INTEGER DEFAULT 1
  -- How many students have encountered this content item
);

CREATE INDEX idx_course_content_course    ON course_content(university_id, course_id);
CREATE INDEX idx_course_content_hash      ON course_content(content_hash);
CREATE INDEX idx_course_content_type      ON course_content(university_id, course_id, content_type);
CREATE INDEX idx_course_content_concepts  ON course_content USING gin(concepts);
```

---

## How the Library Feeds Every Agent

The library is not a passive storage layer. It is the raw material that every intelligence agent in FschoolAI consumes. Without the library, agents give generic answers. With the library, agents give course-specific, professor-specific, personally-relevant answers.

### Assignment Agent

When a student asks for help with an essay, the Assignment Agent queries the library for the rubric associated with that assignment. Instead of giving generic essay advice, it says: "Professor Chen's rubric awards 30% for citation quality. Your draft has 2 citations — the top-scoring submissions in this course typically have 5 or more."

### Lesson Generator

When the brain detects a knowledge gap in regression analysis, the Lesson Generator queries the library for the Week 3 lecture where regression was introduced. Instead of generating a generic statistics lesson, it builds a lesson using the exact examples and language from the student's actual course.

### Professor Intelligence

When multiple students in the same course submit assignments and receive feedback, the Professor Intelligence Agent aggregates the feedback patterns from the library. Over time it builds a profile: "Professor Chen deducts 5% per missing citation, values concrete examples over abstract theory, and gives higher scores to submissions under 800 words." Every student in that course benefits from this profile, even if they personally never received feedback from Professor Chen yet.

### AI Tutor (Reggie)

When a student asks any question about their coursework, the context window builder queries the library for relevant content from their enrolled courses. Reggie's answer is grounded in the actual course material — not in generic internet knowledge. This is the difference between a tutor who has read your textbook and a tutor who has never seen it.

---

## The FschoolAI vs NeuroAGI Boundary

The library sits entirely within FschoolAI's infrastructure. The NeuroAGI Brain reads from the library through the Brain SDK — it never writes to it, and it never owns it.

```
FschoolAI Infrastructure
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  FschoolAI Production DB                                    │
│  ├── public.users          (student accounts)               │
│  ├── public.courses        (enrolled courses)               │
│  ├── public.assignments    (assignment metadata)            │
│  ├── public.grades         (grade records)                  │
│  └── public.course_content (THE LIBRARY)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                    Brain SDK reads library
                    (never writes to it)
                              │
                              ▼
NeuroAGI Brain Infrastructure
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  NeuroAGI Brain DB                                          │
│  ├── neuro.persons         (student identity)               │
│  ├── neuro.patterns        (behavioral patterns)            │
│  ├── brain.signals         (raw signal stream)              │
│  ├── brain.knowledge       (processed intelligence)         │
│  ├── brain.reflections     (weekly summaries, prof profiles)│
│  ├── brain.hypotheses      (predictions about the student)  │
│  └── brain.interventions   (queued nudges)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

When the NeuroAGI hardware device launches, the personal brain travels with the student — on their device, private, theirs. The library stays in FschoolAI's cloud. The device connects to both: the local brain for personal intelligence, the FschoolAI library for course intelligence. This is the Apple model: the device is personal, iCloud is shared infrastructure.

---

## The Business Implication

The library creates two compounding advantages that are difficult for competitors to replicate:

**Advantage 1 — Answer quality compounds with scale.** A student at a university with 10 FschoolAI users gets decent answers. A student at a university with 1,000 FschoolAI users gets answers grounded in a complete course library, professor profiles built from hundreds of graded assignments, and cross-course connections mapped across the entire curriculum. The product gets measurably better as the user base grows — not just marginally better, but categorically better.

**Advantage 2 — The library is a data asset, not just a feature.** The library represents years of structured, analyzed, university-specific academic content that no competitor can purchase or replicate quickly. It is the kind of proprietary dataset that makes an AI company defensible at the data layer, not just the model layer. As AI models commoditize, proprietary data becomes the primary source of durable competitive advantage.

---

## What Needs to Be Built

The library schema is designed. The extension captures content. The missing pieces are:

1. **The `course_content` table** — needs to be created in the FschoolAI Production DB (schema above, ready to execute)
2. **The `/api/extension/content` backend route** — receives content from the extension, runs the dedup check, stores new items
3. **The Library Organizer Agent** — processes new library items, extracts concepts, triggers downstream agents
4. **University ID detection** in the extension — derives `university_id` from the LMS URL

See `BACKEND_GAPS.md` for the prioritized build list.
