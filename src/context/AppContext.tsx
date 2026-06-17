// AppContext.jsx — Shared state for Canvas token, user data, courses, assignments.
// User identity is a UUID persisted in localStorage (no Supabase auth required).

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase }                  from "../api/supabase";
import { syncCanvasData, loadCanvasData } from "../api/canvasSync";
import { getTokenSummary, onTokenAwarded } from "../api/tokens";

const AppContext = createContext(null);

/* ─── Per-course-card change detection ────────────────────────────────
 * We keep a lightweight snapshot (score + per-assignment score) per course
 * in localStorage. On a Supabase re-read we diff the fresh data against the
 * last snapshot to surface "N new assignments" / "grade updated" badges. */

const SNAPSHOT_KEY = uid => `fschool_card_snapshot_${uid}`;

/** Reduce courses + assignments to { [courseId]: { score, assignments:{id:score} } } */
function buildCardSnapshot(courses, assignments) {
  const snap = {};
  for (const c of courses) {
    const cid = String(c.id);
    const courseAssignments = (assignments ?? []).filter(a => String(a.courseId) === cid);
    snap[cid] = {
      score: c.currentScore ?? c.finalScore ?? null,
      assignments: Object.fromEntries(
        courseAssignments.map(a => [String(a.id), a.submission?.score ?? null])
      ),
    };
  }
  return snap;
}

/** Diff two snapshots → { [courseId]: { newAssignments, gradedAssignments, scoreChanged, scoreDelta } } */
function diffCardSnapshots(prev, next) {
  const changes = {};
  if (!prev) return changes; // no baseline yet → nothing to flag
  for (const cid of Object.keys(next)) {
    const before = prev[cid];
    const after  = next[cid];
    if (!before) continue; // brand-new course — don't flag every assignment as "new"

    let newAssignments    = 0;
    let gradedAssignments = 0;
    for (const [aid, score] of Object.entries(after.assignments)) {
      if (!(aid in before.assignments)) newAssignments++;
      else if (before.assignments[aid] !== score && score != null) gradedAssignments++;
    }
    const scoreChanged = before.score !== after.score;

    if (newAssignments || gradedAssignments || scoreChanged) {
      changes[cid] = {
        newAssignments,
        gradedAssignments,
        scoreChanged,
        scoreDelta: (after.score != null && before.score != null)
          ? Math.round((after.score - before.score) * 10) / 10
          : null,
      };
    }
  }
  return changes;
}

function readSnapshot(uid) {
  try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY(uid)) || "null"); }
  catch { return null; }
}
function writeSnapshot(uid, snap) {
  try { localStorage.setItem(SNAPSHOT_KEY(uid), JSON.stringify(snap)); } catch { /* quota */ }
}

function getOrCreateUserId() {
  let uid = localStorage.getItem("fschool_uid");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("fschool_uid", uid);
  }
  return uid;
}

export function AppProvider({ children }) {
  const [userId, setUserId] = useState(getOrCreateUserId);
  const [userData, setUserData]               = useState(null);
  const [canvasToken, setCanvasToken]         = useState("");
  const [canvasBaseUrl, setCanvasBaseUrl]     = useState("");
  const [courses, setCourses]                 = useState([]);
  const [assignments, setAssignments]         = useState([]);
  const [files, setFiles]                     = useState([]);
  // NEW — extra Canvas data types
  const [announcements, setAnnouncements]         = useState([]);
  const [modules, setModules]                     = useState([]);
  const [assignmentGroups, setAssignmentGroups]   = useState([]);
  const [discussionTopics, setDiscussionTopics]   = useState([]);
  const [flashcardMap, setFlashcardMap]           = useState({}); // course_id → { cards, generatedAt }
  const [syllabus, setSyllabus]                   = useState([]);
  const [pastCourses, setPastCourses]             = useState([]);
  // idle | syncing | synced | error | cors-error
  const [syncStatus, setSyncStatus]           = useState("idle");

  // AI navigation: set by NeuralRing, consumed by App.jsx
  const [pendingNav, setPendingNav]   = useState(null);
  // Pre-config for Study page: { course: string, mode: 'flashcards'|'guide' }
  const [studyConfig, setStudyConfig] = useState(null);
  // Token economy
  const [tokenSummary, setTokenSummary] = useState(null);
  // Per-course-card change badges: { [courseId]: { newAssignments, gradedAssignments, scoreChanged, scoreDelta } }
  const [cardChanges, setCardChanges] = useState({});
  // Navigation mode: 'swipe' (spatial/gesture graph) | 'tabs' (bottom tab bar).
  // localStorage mirror so it's available instantly and survives a missing DB column.
  const [navMode, setNavModeState] = useState(() => {
    try { return localStorage.getItem("fschool_nav_mode") || "swipe"; } catch { return "swipe"; }
  });

  // Helper — apply any result object (from loadCanvasData or syncCanvasData)
  // to the relevant state setters. Only overwrites when the array is non-empty
  // so a partial result never clears previously-loaded data.
  // Calculate GPA from course scores (4.0 scale)
  function computeGpa(courseList) {
    const scored = courseList.filter(c => c.currentScore != null || c.finalScore != null);
    if (!scored.length) return null;
    const avg = scored.reduce((s, c) => s + (c.currentScore ?? c.finalScore), 0) / scored.length;
    if (avg >= 90) return 4.0;
    if (avg >= 85) return 3.7;
    if (avg >= 80) return 3.3;
    if (avg >= 75) return 3.0;
    if (avg >= 70) return 2.7;
    if (avg >= 65) return 2.3;
    if (avg >= 60) return 2.0;
    return 1.0;
  }

  function applyCanvasResult(result) {
    // Always apply courses + assignments (even empty) so manual-only users load correctly
    if (result.courses     !== undefined) {
      setCourses(result.courses);
      // Recalculate GPA from loaded courses if sync didn't provide one
      if (result.gpa == null) {
        const gpa = computeGpa(result.courses);
        if (gpa != null) setUserData(prev => prev ? { ...prev, gpa } : prev);
      }
    }
    if (result.assignments !== undefined) setAssignments(result.assignments);
    if (result.files       !== undefined) setFiles(result.files);
    if (result.announcements?.length)    setAnnouncements(result.announcements);
    if (result.modules?.length)          setModules(result.modules);
    if (result.assignmentGroups?.length) setAssignmentGroups(result.assignmentGroups);
    if (result.discussionTopics?.length) setDiscussionTopics(result.discussionTopics);
    if (result.syllabus?.length)         setSyllabus(result.syllabus);
    if (result.flashcardMap)             setFlashcardMap(result.flashcardMap);
    if (result.pastCourses?.length)      setPastCourses(result.pastCourses);
  }

  // Load user + cached Canvas data from Supabase on mount
  useEffect(() => {
    async function init() {
      const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (user) {
        setUserData(user);
        if (user.canvas_token)    setCanvasToken(user.canvas_token);
        if (user.canvas_base_url) setCanvasBaseUrl(user.canvas_base_url);

        // ── Brain DB link (fire-and-forget) ─────────────────────────────────
        // If this user has no brain_person_id yet, create their neuro.persons
        // record in Brain DB and store the UUID back in users.brain_person_id.
        // This is the spine that connects all brain signals to this student.
        // Safe to call on every login — idempotent (checks before creating).
        if (!user.brain_person_id) {
          fetch('/api/brain-person-link', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ userId }),
          })
            .then(r => r.json())
            .then(data => {
              if (data?.ok && data?.brain_person_id) {
                // Update local userData so tutor-context can use it immediately
                setUserData(prev => prev ? { ...prev, brain_person_id: data.brain_person_id } : prev);
              }
            })
            .catch(() => { /* non-fatal — brain link retried on next login */ });
        }
      }

      const cached = await loadCanvasData(userId);
      applyCanvasResult(cached);

      // Load files synced by the browser extension (non-fatal if table doesn't exist yet)
      try {
        const { data: filesData } = await supabase
          .from("files")
          .select("id, course_id, lms_file_id, name, file_type, size_bytes, source_url, folder, status, storage_path")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(500);
        if (filesData?.length) {
          setFiles(filesData.map(f => ({
            ...f,
            courseDbId:  f.course_id,   // Files.jsx groups by this field
            sizeBytes:   f.size_bytes,
            fileType:    f.file_type,
            sourceUrl:   f.source_url,
            storagePath: f.storage_path,
          })));
        }
      } catch { /* files table may not exist yet — page shows empty state */ }

      // Establish a baseline snapshot if none exists yet, so the first manual
      // refresh doesn't flag every existing assignment as "new". We don't show
      // badges on mount — only on an explicit refresh.
      if (!readSnapshot(userId)) {
        writeSnapshot(userId, buildCardSnapshot(cached.courses ?? [], cached.assignments ?? []));
      }
    }
    init();
  }, [userId]);

  // Auto-sync when token is present
  useEffect(() => {
    if (!canvasToken || !canvasBaseUrl) return;

    async function doSync() {
      setSyncStatus("syncing");
      try {
        const result = await syncCanvasData(userId, canvasToken, canvasBaseUrl);
        if (!result.cached) {
          applyCanvasResult(result);
          if (result.gpa != null) {
            setUserData(prev => ({ ...prev, gpa: result.gpa }));
          }
        }
        setSyncStatus("synced");
      } catch (err) {
        const isCors = err instanceof TypeError && err.message.includes("fetch");
        setSyncStatus(isCors ? "cors-error" : "error");
        console.error("Canvas sync failed:", err);
      }
    }
    doSync();
  }, [canvasToken, canvasBaseUrl, userId]);

  /** Fetch / refresh token summary for the current user */
  const refreshTokens = useCallback(async () => {
    const s = await getTokenSummary();
    if (s) setTokenSummary(s);
  }, []);

  // Load token summary on mount + subscribe to live award events
  useEffect(() => {
    if (!userId) return;
    refreshTokens();
    const unsub = onTokenAwarded(data => {
      setTokenSummary(prev => prev ? {
        ...prev,
        points:     data.newTotal ?? (prev.points + (data.tokens ?? 0)),
        tier:       data.tier    ?? prev.tier,
        todayEarned: (prev.todayEarned ?? 0) + (data.tokens ?? 0),
      } : null);
    });
    return () => { unsub(); };
  }, [userId, refreshTokens]);

  /** Re-fetch the current user row from Supabase (e.g. after verifying on another device). */
  const refreshUser = useCallback(async () => {
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (user) {
      setUserData(user);
      if (user.canvas_token)    setCanvasToken(user.canvas_token);
      if (user.canvas_base_url) setCanvasBaseUrl(user.canvas_base_url);
    }
  }, [userId]);

  // When the tab regains focus, re-pull the user. This makes a verification
  // completed on a phone surface on the laptop without a manual reload.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") refreshUser();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshUser]);

  /** Save Canvas credentials to Supabase and trigger a fresh sync. */
  const saveCanvasCredentials = useCallback(async (token, baseUrl) => {
    await supabase.from("users").upsert(
      { id: userId, canvas_token: token, canvas_base_url: baseUrl },
      { onConflict: "id" }
    );
    setCanvasToken(token);
    setCanvasBaseUrl(baseUrl);
  }, [userId]);

  /** Merge a manually-uploaded course + its assignments into local state AND persist to Supabase.
   *  Returns the new DB course id so callers can link follow-up data (e.g. past-course fetches). */
  const addManualCourse = useCallback(async (course, newAssignments) => {
    try {
      // Insert course first — let Supabase generate a real UUID as the PK
      // Upsert so re-adding the same Canvas course updates instead of 409ing
      // (nulls never conflict, so purely-manual courses still insert freely)
      const { data: insertedCourse, error: courseErr } = await supabase
        .from("courses")
        .upsert({
          user_id:           userId,
          name:              course.name,
          course_code:       course.courseCode ?? course.course_code ?? null,
          canvas_course_id:  course.canvasCourseId ?? course.canvas_course_id ?? null,
          current_score:     null,
          final_score:       null,
          source:            course.source ?? "manual",
          is_manual:         course.source === "past_canvas" ? false : true,
        }, { onConflict: "user_id,canvas_course_id" })
        .select("id")
        .single();

      if (courseErr) throw courseErr;

      const dbCourseId = insertedCourse.id; // real UUID from Supabase

      // Build the course object for local state using the real DB id
      const localCourse = {
        ...course,
        id:       dbCourseId,  // use DB UUID so loadCanvasData matches correctly
        dbId:     dbCourseId,
        isManual: true,
        source:   "manual",
      };

      // Persist assignments referencing the real course UUID
      let localAssignments = [];
      if (newAssignments.length > 0) {
        const rows = newAssignments.map(a => ({
          user_id:         userId,
          course_id:       dbCourseId,
          title:           a.name,
          due_at:          a.dueAt ?? a.due_at ?? null,
          points_possible: a.pointsPossible ?? a.points_possible ?? null,
          source:          "manual",
          is_manual:       true,
        }));

        const { data: insertedAssignments, error: assignErr } = await supabase
          .from("assignments")
          .insert(rows)
          .select("id, title, due_at, points_possible, course_id");

        if (assignErr) throw assignErr;

        localAssignments = (insertedAssignments || []).map(a => ({
          id:             a.id,
          name:           a.title,
          dueAt:          a.due_at,
          pointsPossible: a.points_possible,
          courseId:       dbCourseId,
          isManual:       true,
          source:         "manual",
          submission:     { score: null, submittedAt: null, late: false, missing: false },
        }));
      }

      // Update local state with DB-backed ids
      setCourses(prev => [...prev, localCourse]);
      setAssignments(prev => [...prev, ...localAssignments]);
      return dbCourseId;  // caller can use this to link follow-up fetches

    } catch (err) {
      console.warn("Failed to persist manual course to Supabase:", err.message);
      // Fallback: still show in UI even if DB write failed
      setCourses(prev => [...prev, course]);
      setAssignments(prev => [...prev, ...newAssignments]);
      return null;
    }
  }, [userId]);

  /** Force a fresh Canvas sync, bypassing the 1-hour cache. */
  const forceSync = useCallback(async () => {
    if (!canvasToken || !canvasBaseUrl) return;
    await supabase
      .from("users")
      .upsert({ id: userId, canvas_synced_at: null }, { onConflict: "id" });

    setSyncStatus("syncing");
    try {
      const result = await syncCanvasData(userId, canvasToken, canvasBaseUrl);
      if (!result.cached) {
        applyCanvasResult(result);
        if (result.gpa != null) setUserData(prev => ({ ...prev, gpa: result.gpa }));
      }
      setSyncStatus("synced");
    } catch (err) {
      const isCors = err instanceof TypeError && err.message.includes("fetch");
      setSyncStatus(isCors ? "cors-error" : "error");
      console.error("Canvas force-sync failed:", err);
    }
  }, [userId, canvasToken, canvasBaseUrl]);

  /** Re-read all Canvas data from Supabase (cheap, no Canvas API hit) and diff
   *  it against the last snapshot to surface per-course-card change badges.
   *  This is what the Canvas "Refresh" button calls — it picks up rows written
   *  by other sources (e.g. the browser extension) since the last load. */
  const refreshFromSupabase = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      const fresh = await loadCanvasData(userId);

      const prevSnap = readSnapshot(userId);
      const nextSnap = buildCardSnapshot(fresh.courses ?? [], fresh.assignments ?? []);
      const changes  = diffCardSnapshots(prevSnap, nextSnap);

      applyCanvasResult(fresh);
      setCardChanges(changes);
      writeSnapshot(userId, nextSnap);
      setSyncStatus("synced");
    } catch (err) {
      setSyncStatus("error");
      console.error("Supabase refresh failed:", err);
    }
  }, [userId]);

  /** Dismiss the change badge for one course (e.g. when the user expands it). */
  const markCardSeen = useCallback((courseId) => {
    setCardChanges(prev => {
      const key = String(courseId);
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /** Upsert one field (field, value) or multiple fields (object) on the users table. */
  const updateUserField = useCallback(async (fieldOrPatch, value) => {
    const patch = typeof fieldOrPatch === "object"
      ? fieldOrPatch
      : { [fieldOrPatch]: value };
    await supabase.from("users").upsert(
      { id: userId, ...patch },
      { onConflict: "id" }
    );
    setUserData(prev => ({ ...(prev ?? { id: userId }), ...patch }));
  }, [userId]);

  /** Switch navigation mode. Drives the UI immediately via localStorage + state,
   *  then best-effort persists to Supabase (the column may not exist yet — never throw). */
  const setNavMode = useCallback((mode) => {
    if (mode !== "swipe" && mode !== "tabs") return;
    setNavModeState(mode);
    try { localStorage.setItem("fschool_nav_mode", mode); } catch { /* quota */ }
    updateUserField("nav_mode", mode).catch(() => { /* column may be absent — localStorage still wins */ });
  }, [updateUserField]);

  // When the user row loads (or changes), adopt its server-side nav_mode if set.
  // Existing users have null nav_mode → we keep the localStorage/default value.
  useEffect(() => {
    const m = userData?.nav_mode;
    if (m === "swipe" || m === "tabs") {
      setNavModeState(m);
      try { localStorage.setItem("fschool_nav_mode", m); } catch { /* quota */ }
    }
  }, [userData?.nav_mode]);

  return (
    <AppContext.Provider value={{
      userId,
      setUserId,
      refreshUser,
      userData,
      canvasToken,
      canvasBaseUrl,
      courses,
      assignments,
      setAssignments,
      announcements,
      modules,
      setModules,
      assignmentGroups,
      discussionTopics,
      syncStatus,
      saveCanvasCredentials,
      updateUserField,
      addManualCourse,
      forceSync,
      refreshFromSupabase,
      cardChanges,
      markCardSeen,
      flashcardMap,
      syllabus,
      pastCourses,
      files,
      pendingNav,
      setPendingNav,
      studyConfig,
      setStudyConfig,
      tokenSummary,
      refreshTokens,
      navMode,
      setNavMode,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
