// AppContext.jsx — Shared state for Canvas token, user data, courses, assignments.
// User identity is a UUID persisted in localStorage (no Supabase auth required).

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../api/supabase";
import { syncCanvasData, loadCanvasData } from "../api/canvasSync";

const AppContext = createContext(null);

function getOrCreateUserId() {
  let uid = localStorage.getItem("fschool_uid");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("fschool_uid", uid);
  }
  return uid;
}

export function AppProvider({ children }) {
  const [userId] = useState(getOrCreateUserId);
  const [userData, setUserData]               = useState(null);
  const [canvasToken, setCanvasToken]         = useState("");
  const [canvasBaseUrl, setCanvasBaseUrl]     = useState("");
  const [courses, setCourses]                 = useState([]);
  const [assignments, setAssignments]         = useState([]);
  // NEW — extra Canvas data types
  const [announcements, setAnnouncements]         = useState([]);
  const [modules, setModules]                     = useState([]);
  const [assignmentGroups, setAssignmentGroups]   = useState([]);
  const [discussionTopics, setDiscussionTopics]   = useState([]);
  const [flashcardMap, setFlashcardMap]           = useState({}); // course_id → { cards, generatedAt }
  const [syllabus, setSyllabus]                   = useState([]);
  // idle | syncing | synced | error | cors-error
  const [syncStatus, setSyncStatus]           = useState("idle");

  // AI navigation: set by NeuralRing, consumed by App.jsx
  // { page: string }
  const [pendingNav, setPendingNav]   = useState(null);
  // Pre-config for Study page: { course: string, mode: 'flashcards'|'guide' }
  const [studyConfig, setStudyConfig] = useState(null);

  // Helper — apply any result object (from loadCanvasData or syncCanvasData)
  // to the relevant state setters. Only overwrites when the array is non-empty
  // so a partial result never clears previously-loaded data.
  function applyCanvasResult(result) {
    // Always apply courses + assignments (even empty) so manual-only users load correctly
    if (result.courses     !== undefined) setCourses(result.courses);
    if (result.assignments !== undefined) setAssignments(result.assignments);
    if (result.announcements?.length)    setAnnouncements(result.announcements);
    if (result.modules?.length)          setModules(result.modules);
    if (result.assignmentGroups?.length) setAssignmentGroups(result.assignmentGroups);
    if (result.discussionTopics?.length) setDiscussionTopics(result.discussionTopics);
    if (result.syllabus?.length)         setSyllabus(result.syllabus);
    if (result.flashcardMap)             setFlashcardMap(result.flashcardMap);
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
      }

      const cached = await loadCanvasData(userId);
      applyCanvasResult(cached);
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

  /** Save Canvas credentials to Supabase and trigger a fresh sync. */
  const saveCanvasCredentials = useCallback(async (token, baseUrl) => {
    await supabase.from("users").upsert(
      { id: userId, canvas_token: token, canvas_base_url: baseUrl },
      { onConflict: "id" }
    );
    setCanvasToken(token);
    setCanvasBaseUrl(baseUrl);
  }, [userId]);

  /** Merge a manually-uploaded course + its assignments into local state AND persist to Supabase. */
  const addManualCourse = useCallback(async (course, newAssignments) => {
    try {
      // Insert course first — let Supabase generate a real UUID as the PK
      const { data: insertedCourse, error: courseErr } = await supabase
        .from("courses")
        .insert({
          user_id:      userId,
          name:         course.name,
          course_code:  course.courseCode ?? course.course_code ?? null,
          current_score: null,
          final_score:  null,
          source:       "manual",
          is_manual:    true,
        })
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

    } catch (err) {
      console.warn("Failed to persist manual course to Supabase:", err.message);
      // Fallback: still show in UI even if DB write failed
      setCourses(prev => [...prev, course]);
      setAssignments(prev => [...prev, ...newAssignments]);
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

  return (
    <AppContext.Provider value={{
      userId,
      userData,
      canvasToken,
      canvasBaseUrl,
      courses,
      assignments,
      announcements,
      modules,
      assignmentGroups,
      discussionTopics,
      syncStatus,
      saveCanvasCredentials,
      updateUserField,
      addManualCourse,
      forceSync,
      flashcardMap,
      syllabus,
      pendingNav,
      setPendingNav,
      studyConfig,
      setStudyConfig,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
