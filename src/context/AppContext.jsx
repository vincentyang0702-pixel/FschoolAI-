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
    if (result.courses?.length)          setCourses(result.courses);
    if (result.assignments?.length)      setAssignments(result.assignments);
    if (result.announcements?.length)    setAnnouncements(result.announcements);
    if (result.modules?.length)          setModules(result.modules);
    if (result.assignmentGroups?.length) setAssignmentGroups(result.assignmentGroups);
    if (result.discussionTopics?.length) setDiscussionTopics(result.discussionTopics);
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

  /** Merge a manually-uploaded course + its assignments into local state. */
  const addManualCourse = useCallback((course, newAssignments) => {
    setCourses(prev => [...prev, course]);
    setAssignments(prev => [...prev, ...newAssignments]);
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
