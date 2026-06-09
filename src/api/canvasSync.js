/**
 * canvasSync.js — Orchestrates Canvas API fetches → Supabase storage.
 * Uses canvas-module as the source of truth for all API calls.
 * All writes are upserts to avoid duplicates on re-sync.
 *
 * Structured tables: public.courses + public.assignments
 * Blob storage (canvas_data): announcements, modules, assignment_groups, discussion_topics
 */

import {
  fetchCourses,
  fetchAssignments,
  fetchAnnouncements,
  fetchModules,
  fetchAssignmentGroups,
  fetchDiscussionTopics,
  fetchPastCourses,
  fetchCourseFiles,
  fetchCoursePages,
  fetchQuizzes,
} from '../../canvas-module/canvasApi.js';
import {
  normalizeCourses,
  normalizeAssignments,
  normalizeAnnouncements,
  normalizeModule,
  normalizeAssignmentGroup,
  normalizeDiscussionTopic,
  normalizeCourseFiles,
  normalizeCourseFile,
  normalizeCoursePageSummary,
  normalizeQuiz,
  normalizePastCourses,
} from '../../canvas-module/canvasTransform.js';
import { supabase } from './supabase.js';

const PROXY_URL = '/api/canvas';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const GROQ_URL = '/api/groq';

const FLASHCARD_SYSTEM =
  'You are a study assistant. Generate exactly 8 flashcards from the course material. ' +
  'Format EVERY card as exactly: Q: [question] | A: [answer] — one per line, no extra text, no numbering.';

/** Generate flashcards for one course via Groq and upsert into flashcards table */
async function generateAndSaveFlashcards(userId, courseDbId, courseName, assignments, modules) {
  try {
    const assignmentList = assignments
      .slice(0, 20)
      .map(a => `- ${a.name}${a.description ? ': ' + a.description.replace(/<[^>]+>/g, '').slice(0, 120) : ''}`)
      .join('\n');

    const moduleList = modules
      .flatMap(m => m.modules ?? [])
      .slice(0, 15)
      .map(m => `- ${m.name}`)
      .join('\n');

    const prompt =
      `Course: ${courseName}\n\nModules:\n${moduleList || '(none)'}\n\n` +
      `Assignments:\n${assignmentList || '(none)'}\n\nGenerate 8 study flashcards for this course.`;

    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system:   FLASHCARD_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content ?? '';

    const cards = text
      .split('\n')
      .filter(line => line.includes('Q:') && line.includes(' | ') && line.includes('A:'))
      .map((line, i) => {
        const [qPart, aPart] = line.split(' | ');
        return {
          id:       i,
          question: (qPart || '').replace(/^Q:\s*/i, '').trim(),
          answer:   (aPart || '').replace(/^A:\s*/i, '').trim(),
        };
      })
      .filter(c => c.question && c.answer);

    if (!cards.length) return null;

    await supabase
      .from('flashcards')
      .upsert(
        { user_id: userId, course_id: courseDbId, cards, generated_at: new Date().toISOString() },
        { onConflict: 'user_id,course_id' }
      );

    return cards;
  } catch (err) {
    console.warn(`Flashcard gen failed for ${courseName}:`, err.message);
    return null;
  }
}

/** Build a structured syllabus from modules + assignments per course */
function buildSyllabus(courses, allModules, allAssignments, allAssignmentGroups) {
  return courses.map(course => {
    const cid = String(course.id);
    const courseModules     = (allModules.find(m => String(m.courseId) === cid))?.modules ?? [];
    const courseAssignments = allAssignments.filter(a => String(a.courseId) === cid);
    const courseGroups      = (allAssignmentGroups.find(g => String(g.courseId) === cid))?.groups ?? [];
    return {
      courseId:     course.id,
      courseName:   course.name,
      courseCode:   course.courseCode,
      modules:      courseModules.map(m => ({
        name:  m.name,
        items: (m.items ?? []).map(i => i.title ?? i.name).filter(Boolean),
      })),
      assignments:  courseAssignments.map(a => ({
        name:           a.name,
        dueAt:          a.dueAt,
        pointsPossible: a.pointsPossible,
      })),
      gradeWeights: courseGroups.map(g => ({ name: g.name, weight: g.weight })),
    };
  });
}

export function buildApiBase(rawUrl) {
  let url = rawUrl.trim().replace(/\/+$/, '');
  if (!url.startsWith('http')) url = `https://${url}`;
  if (!url.includes('/api/v1')) url = `${url}/api/v1`;
  return url;
}

function scoreToGpa(pct) {
  if (pct >= 90) return 4.0;
  if (pct >= 85) return 3.7;
  if (pct >= 80) return 3.3;
  if (pct >= 75) return 3.0;
  if (pct >= 70) return 2.7;
  if (pct >= 65) return 2.3;
  if (pct >= 60) return 2.0;
  return 1.0;
}

/** Helper — upsert a single blob row into canvas_data */
async function saveBlob(userId, dataType, payload, now) {
  await supabase
    .from('canvas_data')
    .upsert(
      { user_id: userId, data_type: dataType, payload, synced_at: now },
      { onConflict: 'user_id,data_type' }
    );
}

/**
 * Main sync function. Fetches all available Canvas data and upserts into Supabase.
 * Returns { cached: true } if data is less than 1 hour old.
 * Returns { courses, assignments, announcements, modules, assignmentGroups, discussionTopics, gpa } on fresh sync.
 */
export async function syncCanvasData(userId, canvasToken, canvasBaseUrl) {
  const baseUrl = buildApiBase(canvasBaseUrl);

  // Check cache
  const { data: user } = await supabase
    .from('users')
    .select('canvas_synced_at')
    .eq('id', userId)
    .maybeSingle();

  if (user?.canvas_synced_at) {
    const age = Date.now() - new Date(user.canvas_synced_at).getTime();
    if (age < CACHE_TTL_MS) return { cached: true };
  }

  const proxy = PROXY_URL || undefined;
  const now = new Date().toISOString();

  // ── 1. Courses ───────────────────────────────────────────────────
  const rawCourses = await fetchCourses(canvasToken, baseUrl, proxy);
  const courses = normalizeCourses(rawCourses);

  const courseRows = courses.map(c => ({
    user_id:          userId,
    canvas_course_id: c.id,
    name:             c.name,
    course_code:      c.courseCode,
    current_score:    c.currentScore,
    final_score:      c.finalScore,
    image_url:        c.imageUrl,
    source:           'canvas',
    updated_at:       now,
  }));

  const { data: upsertedCourses, error: courseError } = await supabase
    .from('courses')
    .upsert(courseRows, { onConflict: 'user_id,canvas_course_id' })
    .select('id, canvas_course_id');

  if (courseError) throw new Error(`Courses upsert failed: ${courseError.message}`);

  const courseIdMap = {};
  (upsertedCourses || []).forEach(c => { courseIdMap[c.canvas_course_id] = c.id; });

  const courseIds = courses.map(c => c.id);

  // ── 1b. Past/completed courses ───────────────────────────────────
  let pastCourses = [];
  try {
    const rawPast = await fetchPastCourses(canvasToken, baseUrl, proxy);
    pastCourses = normalizePastCourses(rawPast);
  } catch { /* skip */ }

  // ── 1c. Fetch assignments for past courses (up to 5 most recent) ─
  const allPastAssignments = [];
  const recentPast = pastCourses.slice(0, 5);
  for (const pastCourse of recentPast) {
    try {
      const raw = await fetchAssignments(canvasToken, baseUrl, pastCourse.id, proxy);
      const meta = { courseId: pastCourse.id, courseCode: pastCourse.courseCode, courseName: pastCourse.name };
      allPastAssignments.push(...normalizeAssignments(raw, meta));
    } catch { /* skip — past courses may return 404 */ }
  }

  // Upsert past assignments if any were fetched
  if (allPastAssignments.length > 0) {
    const pastAssignRows = allPastAssignments.map(a => ({
      user_id:              userId,
      canvas_assignment_id: a.id ? String(a.id) : null,
      title:                a.name,
      description:          a.description ?? null,
      due_at:               a.dueAt ?? null,
      points_possible:      a.pointsPossible ?? null,
      score:                a.submission?.score ?? null,
      source:               'past_canvas',
      is_manual:            false,
      updated_at:           now,
    }));
    await supabase
      .from('assignments')
      .upsert(pastAssignRows.filter(r => r.canvas_assignment_id), { onConflict: 'user_id,canvas_assignment_id' });
  }

  // ── 2. Per-course data (sequential to avoid rate limits) ─────────
  const allAssignments      = [];
  const allModules          = [];
  const allAssignmentGroups = [];
  const allDiscussionTopics = [];
  const allCourseFiles      = [];
  const allCoursePages      = [];
  const allQuizzes          = [];

  for (const course of courses) {
    const meta = { courseId: course.id, courseCode: course.courseCode, courseName: course.name };

    // Assignments
    try {
      const raw = await fetchAssignments(canvasToken, baseUrl, course.id, proxy);
      allAssignments.push(...normalizeAssignments(raw, meta));
    } catch { /* skip */ }

    // Modules
    try {
      const raw = await fetchModules(canvasToken, baseUrl, course.id, proxy);
      allModules.push({
        courseId:   course.id,
        courseCode: course.courseCode,
        courseName: course.name,
        modules:    raw.map(normalizeModule),
      });
    } catch { /* skip */ }

    // Assignment groups (grade weights)
    try {
      const raw = await fetchAssignmentGroups(canvasToken, baseUrl, course.id, proxy);
      allAssignmentGroups.push({
        courseId:   course.id,
        courseCode: course.courseCode,
        courseName: course.name,
        groups:     raw.map(normalizeAssignmentGroup),
      });
    } catch { /* skip */ }

    // Discussion topics
    try {
      const raw = await fetchDiscussionTopics(canvasToken, baseUrl, course.id, proxy);
      allDiscussionTopics.push({
        courseId:   course.id,
        courseCode: course.courseCode,
        courseName: course.name,
        topics:     raw.map(normalizeDiscussionTopic),
      });
    } catch { /* skip */ }

    // Course files (slides, PDFs, docs)
    try {
      const raw = await fetchCourseFiles(canvasToken, baseUrl, course.id, proxy);
      allCourseFiles.push({
        courseId:   course.id,
        courseCode: course.courseCode,
        courseName: course.name,
        files:      normalizeCourseFiles(raw),
      });
    } catch { /* skip */ }

    // Course pages (lecture notes, reading pages)
    try {
      const raw = await fetchCoursePages(canvasToken, baseUrl, course.id, proxy);
      allCoursePages.push({
        courseId:   course.id,
        courseCode: course.courseCode,
        courseName: course.name,
        pages:      raw.map(normalizeCoursePageSummary),
      });
    } catch { /* skip */ }

    // Quizzes
    try {
      const raw = await fetchQuizzes(canvasToken, baseUrl, course.id, proxy);
      allQuizzes.push({
        courseId:   course.id,
        courseCode: course.courseCode,
        courseName: course.name,
        quizzes:    raw.map(normalizeQuiz),
      });
    } catch { /* skip */ }
  }

  // ── 3. Announcements (global, across all courses) ────────────────
  let announcements = [];
  try {
    const raw = await fetchAnnouncements(canvasToken, baseUrl, courseIds, proxy);
    announcements = normalizeAnnouncements(raw);
  } catch { /* skip */ }

  // ── 4. Upsert assignments to structured table ────────────────────
  if (allAssignments.length) {
    const assignmentRows = allAssignments.map(a => ({
      user_id:              userId,
      course_id:            courseIdMap[a.courseId] ?? null,
      canvas_assignment_id: a.id,
      title:                a.name,
      description:          a.description           || null,
      due_at:               a.dueAt                 || null,
      points_possible:      a.pointsPossible         ?? null,
      score:                a.submission?.score       ?? null,
      submitted_at:         a.submission?.submittedAt ?? null,
      submission_type:      a.submission?.submissionType ?? null,
      late:                 a.submission?.late    ?? false,
      missing:              a.submission?.missing ?? false,
      source:               'canvas',
      updated_at:           now,
    }));

    const { error: assignError } = await supabase
      .from('assignments')
      .upsert(assignmentRows, { onConflict: 'user_id,canvas_assignment_id' });

    if (assignError) throw new Error(`Assignments upsert failed: ${assignError.message}`);
  }

  // ── 5. Save blob data to canvas_data ────────────────────────────
  const syllabus = buildSyllabus(courses, allModules, allAssignments, allAssignmentGroups);

  await Promise.all([
    saveBlob(userId, 'announcements',     announcements,       now),
    saveBlob(userId, 'modules',           allModules,          now),
    saveBlob(userId, 'assignment_groups', allAssignmentGroups, now),
    saveBlob(userId, 'discussion_topics', allDiscussionTopics, now),
    saveBlob(userId, 'syllabus',          syllabus,            now),
    saveBlob(userId, 'course_files',      allCourseFiles,      now),
    saveBlob(userId, 'course_pages',      allCoursePages,      now),
    saveBlob(userId, 'quizzes',           allQuizzes,          now),
    saveBlob(userId, 'past_courses',      pastCourses,         now),
  ]);

  // ── 6. GPA + update user ─────────────────────────────────────────
  const scoredCourses = courses.filter(c => c.currentScore !== null);
  const avgScore = scoredCourses.length
    ? scoredCourses.reduce((s, c) => s + c.currentScore, 0) / scoredCourses.length
    : null;
  const gpa = avgScore !== null ? scoreToGpa(avgScore) : null;

  await supabase
    .from('users')
    .upsert({ id: userId, gpa, canvas_synced_at: now }, { onConflict: 'id' });

  // ── 7. Auto-generate flashcards per course (non-blocking) ────────
  Promise.allSettled(
    courses.map(course => {
      const dbId       = courseIdMap[course.id];
      const courseAssn = allAssignments.filter(a => a.courseId === course.id);
      return generateAndSaveFlashcards(userId, dbId, course.name, courseAssn, allModules);
    })
  ).catch(() => {/* non-fatal */});

  return {
    courses,
    assignments:      allAssignments,
    announcements,
    modules:          allModules,
    assignmentGroups: allAssignmentGroups,
    discussionTopics: allDiscussionTopics,
    syllabus,
    courseFiles:      allCourseFiles,
    coursePages:      allCoursePages,
    quizzes:          allQuizzes,
    pastCourses,
    gpa,
  };
}

/**
 * Load all synced Canvas data from Supabase (Canvas + manual courses).
 * FIX: manual courses have no canvas_course_id — use DB id as fallback.
 */
export async function loadCanvasData(userId) {
  const [cResult, aResult, blobResult, fcResult, fileResult] = await Promise.all([
    supabase.from('courses').select('*').eq('user_id', userId),
    supabase.from('assignments').select('*, courses(id, canvas_course_id, course_code, name)').eq('user_id', userId),
    // Single query for all blob types — avoids 5 separate requests and 400s on missing rows
    supabase.from('canvas_data').select('data_type, payload').eq('user_id', userId),
    supabase.from('flashcards').select('course_id, cards, generated_at').eq('user_id', userId),
    // Extension-synced file index (structured `files` table).
    supabase.from('files').select('id, course_id, assignment_id, name, file_type, size_bytes, source_url, folder, status').eq('user_id', userId),
  ]);

  // Build a lookup map from the single blob query
  const blobMap = {};
  (blobResult.data || []).forEach(row => { blobMap[row.data_type] = row.payload; });

  console.log("[loadCanvasData] userId:", userId,
    "| blob types:", Object.keys(blobMap),
    "| ext_courses:", blobMap['ext_courses']?.length ?? 0,
    "| ext_assignments:", blobMap['ext_assignments']?.length ?? 0,
    "| ext_grades:", blobMap['ext_grades']?.length ?? 0);

  const annResult  = { data: { payload: blobMap['announcements']    ?? [] } };
  const modResult  = { data: { payload: blobMap['modules']          ?? [] } };
  const agResult   = { data: { payload: blobMap['assignment_groups']?? [] } };
  const dtResult   = { data: { payload: blobMap['discussion_topics']?? [] } };
  const sylResult  = { data: { payload: blobMap['syllabus']          ?? [] } };
  const filesResult  = { data: { payload: blobMap['course_files']   ?? [] } };
  const pagesResult  = { data: { payload: blobMap['course_pages']   ?? [] } };
  const quizResult   = { data: { payload: blobMap['quizzes']        ?? [] } };
  const pastResult   = { data: { payload: blobMap['past_courses']   ?? [] } };

  const courses = (cResult.data || []).map(c => ({
    // Canvas courses: expose canvas_course_id as the id (used for assignment matching)
    // Manual courses: canvas_course_id is null, so use the DB UUID (matches course_id on assignments)
    id:               c.canvas_course_id ?? c.id,
    dbId:             c.id,
    name:             c.name,
    courseCode:       c.course_code,
    currentScore:     c.current_score,
    finalScore:       c.final_score,
    imageUrl:         c.image_url,
    source:           c.source,
    isManual:         c.source === 'manual' || c.is_manual === true,
    enrollmentState:  'active',
    accessRestricted: false,
    assignmentGroups: null,
  }));

  const assignments = (aResult.data || []).map(a => {
    const isManual = a.source === 'manual' || a.is_manual === true;
    // Canvas: courseId = canvas_course_id from the joined course row
    // Manual: courseId = course_id (DB UUID), which matches c.canvas_course_id ?? c.id above
    const courseId = isManual
      ? (a.course_id ?? null)
      : (a.courses?.canvas_course_id ?? a.course_id ?? null);

    return {
      id:             a.canvas_assignment_id ?? a.id,
      name:           a.title ?? a.name,
      description:    a.description,
      dueAt:          a.due_at,
      pointsPossible: a.points_possible,
      courseId,
      courseCode:     a.courses?.course_code ?? '',
      courseName:     a.courses?.name        ?? '',
      source:         a.source,
      isManual,
      submission: {
        score:          a.score,
        submittedAt:    a.submitted_at,
        submissionType: a.submission_type,
        late:           a.late    ?? false,
        missing:        a.missing ?? false,
      },
    };
  });

  // Extension file index → app shape. `courseDbId` matches a course's DB UUID
  // (course.dbId in the mapped courses above), so the UI can group by course.
  const files = (fileResult.data || []).map(f => ({
    id:             f.id,
    courseDbId:     f.course_id,
    assignmentDbId: f.assignment_id,
    name:           f.name,
    fileType:       f.file_type,
    sizeBytes:      f.size_bytes,
    sourceUrl:      f.source_url,
    folder:         f.folder,
    status:         f.status,
  }));

  // Build flashcard map: course_id → cards[]
  const flashcardMap = {};
  (fcResult.data || []).forEach(row => {
    flashcardMap[row.course_id] = { cards: row.cards, generatedAt: row.generated_at };
  });

  // ── Merge browser-extension data (non-Canvas users) ──────────────────────────
  // The Chrome extension writes ext_courses / ext_assignments / ext_grades blobs.
  // Convert them to the app's shape and append so they show on the dashboard.
  const extCourses     = blobMap['ext_courses']     ?? [];
  const extAssignments = blobMap['ext_assignments'] ?? [];
  const extGrades      = blobMap['ext_grades']      ?? [];

  // Parse a percentage/score string ("85%", "85/100", "A") into a 0-100 number
  function parseScore(g) {
    if (g == null) return null;
    const s = String(g);
    const pct = s.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
    if (pct) return parseFloat(pct[1]);
    const frac = s.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (frac) return (parseFloat(frac[1]) / parseFloat(frac[2])) * 100;
    const num = s.match(/^\s*(\d{1,3}(?:\.\d+)?)\s*$/);
    if (num) return parseFloat(num[1]);
    return null; // letter grades left unscored
  }

  if (extCourses.length) {
    // Map course name → score from ext_grades
    const gradeByCourse = {};
    extGrades.forEach(g => {
      const score = parseScore(g.percentage) ?? parseScore(g.score) ?? null;
      if (g.course) gradeByCourse[g.course.toLowerCase()] = score;
    });

    extCourses.forEach((c, i) => {
      const key = (c.name ?? c.code ?? `ext${i}`).toLowerCase();
      const score = gradeByCourse[key]
        ?? gradeByCourse[(c.code ?? "").toLowerCase()]
        ?? null;
      courses.push({
        id:               `ext_${c.code ?? i}`,
        dbId:             null,
        name:             c.name ?? c.code ?? "Course",
        courseCode:       c.code ?? "",
        currentScore:     score,
        finalScore:       null,
        imageUrl:         null,
        source:           "extension",
        isManual:         false,
        enrollmentState:  "active",
        accessRestricted: false,
        assignmentGroups: null,
      });
    });
  }

  if (extAssignments.length) {
    extAssignments.forEach((a, i) => {
      const due = a.dueDate ? new Date(a.dueDate) : null;
      const validDue = due && !isNaN(due.getTime()) ? due.toISOString() : null;
      const submitted = a.status === "submitted" || a.status === "graded";
      assignments.push({
        id:             `ext_a_${i}_${(a.name ?? "").slice(0, 20)}`,
        name:           a.name ?? "Assignment",
        description:    null,
        dueAt:          validDue,
        pointsPossible: a.pointsPossible != null ? Number(String(a.pointsPossible).replace(/[^\d.]/g, "")) || null : null,
        courseId:       `ext_${a.course ?? ""}`,
        courseCode:     a.course ?? "",
        courseName:     a.course ?? "",
        source:         "extension",
        isManual:       false,
        submission: {
          score:          parseScore(a.grade),
          submittedAt:    submitted ? new Date().toISOString() : null,
          submissionType: null,
          late:           false,
          missing:        a.status === "missing",
        },
      });
    });
  }

  return {
    courses,
    assignments,
    files,
    announcements:    annResult.data?.payload  ?? [],
    modules:          modResult.data?.payload  ?? [],
    assignmentGroups: agResult.data?.payload   ?? [],
    discussionTopics: dtResult.data?.payload   ?? [],
    syllabus:         sylResult.data?.payload  ?? [],
    courseFiles:      filesResult.data?.payload ?? [],
    coursePages:      pagesResult.data?.payload ?? [],
    quizzes:          quizResult.data?.payload  ?? [],
    pastCourses:      pastResult.data?.payload  ?? [],
    flashcardMap,
    syncedAt:         null,
  };
}
