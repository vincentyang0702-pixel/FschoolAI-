// Work.jsx — Home page. Greeting, upcoming assignments from Canvas, bottom stats row.

import { useApp } from "../context/AppContext";

const card = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--depth-line)",
};

function formatDue(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const now = new Date();
  const diffMs = due - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0)  return { label: "Overdue",   urgent: true };
  if (diffDays === 0) return { label: "Due today", urgent: true };
  if (diffDays === 1) return { label: "Tomorrow",  urgent: true };
  if (diffDays <= 7)  return {
    label: due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    urgent: false,
  };
  return {
    label: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    urgent: false,
  };
}

function AssignmentCard({ a }) {
  const due = formatDue(a.dueAt);
  // Use submission score if available for progress, otherwise 0
  const progress = a.submission?.score != null && a.pointsPossible
    ? Math.round((a.submission.score / a.pointsPossible) * 100)
    : a.submission?.submittedAt ? 100 : 0;
  const submitted = Boolean(a.submission?.submittedAt);

  return (
    <div style={{ ...card, padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: "12px" }}>
          <p style={{
            color: "var(--text-primary)", fontSize: "15px", fontWeight: "500",
            marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {a.name}
          </p>
          <p style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
            {a.courseCode ?? a.courseName ?? ""}
          </p>
        </div>
        {due && (
          <span style={{
            fontSize: "11px", fontWeight: "600", padding: "4px 10px",
            borderRadius: "20px", flexShrink: 0, whiteSpace: "nowrap",
            background: due.urgent ? "rgba(255,59,48,0.15)" : "var(--color-surface-hover)",
            color: due.urgent ? "rgba(255,100,90,0.9)" : "var(--text-secondary)",
          }}>
            {due.label}
          </span>
        )}
      </div>

      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "4px", height: "3px" }}>
        <div style={{
          background: submitted ? "rgba(52,199,89,0.7)" : "rgba(255,255,255,0.6)",
          height: "100%", borderRadius: "4px",
          width: `${progress}%`,
          transition: "width 0.5s var(--ease-apple)",
        }} />
      </div>
      <p style={{ color: "var(--text-tertiary)", fontSize: "11px", marginTop: "6px" }}>
        {submitted ? "Submitted" : progress > 0 ? `${progress}% complete` : "Not started"}
      </p>
    </div>
  );
}

function EmptyState({ syncStatus, hasToken }) {
  if (syncStatus === "syncing") {
    return (
      <div style={{ ...card, padding: "24px", textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Syncing Canvas…</p>
      </div>
    );
  }
  if (syncStatus === "cors-error") {
    return (
      <div style={{ ...card, padding: "24px" }}>
        <p style={{ color: "rgba(255,100,90,0.9)", fontSize: "14px", fontWeight: "500", marginBottom: "6px" }}>Canvas blocked by browser</p>
        <p style={{ color: "var(--text-secondary)", fontSize: "12px", lineHeight: "1.6" }}>
          Your school's Canvas blocks direct requests. Use the Canvas page to import manually.
        </p>
      </div>
    );
  }
  if (!hasToken) {
    return (
      <div style={{ ...card, padding: "24px" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "4px" }}>No Canvas connected</p>
        <p style={{ color: "var(--text-dim)", fontSize: "12px" }}>Head to the Canvas page to connect your account and see your assignments here.</p>
      </div>
    );
  }
  return (
    <div style={{ ...card, padding: "24px", textAlign: "center" }}>
      <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>No upcoming assignments 🎉</p>
    </div>
  );
}

export default function Work() {
  const { userData, assignments, canvasToken, syncStatus, announcements } = useApp();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = userData?.name || localStorage.getItem("fschool_name") || "";

  // Filter to upcoming unsubmitted assignments, sorted by due date
  const upcoming = assignments
    .filter(a => {
      if (!a.dueAt) return false;
      const due = new Date(a.dueAt);
      const now = new Date();
      // Show if due in future OR overdue but not submitted
      return due > now || !a.submission?.submittedAt;
    })
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, 5); // show top 5

  const completedCount = assignments.filter(a => a.submission?.submittedAt).length;
  // "Connected" = has a Canvas OAuth token OR has any synced data (e.g. from the
  // browser extension, which syncs via the LMS session and sets no canvas_token).
  const hasToken = Boolean(canvasToken) || assignments.length > 0;

  const STATS = [
    { label: "GPA",       value: userData?.gpa != null ? Number(userData.gpa).toFixed(2) : "—" },
    { label: "Streak",    value: userData?.streak ? `${userData.streak}d` : "0d" },
    { label: "Completed", value: completedCount || 0 },
  ];

  // Most recent announcement
  const latestAnnouncement = announcements?.[0];

  return (
    <div>
      <h1 style={{ fontSize: "26px", fontWeight: "600", color: "var(--text-primary)", marginBottom: "4px", letterSpacing: "-0.3px" }}>
        {greeting}{name ? `, ${name}` : ""}
      </h1>
      <p style={{ color: "var(--text-dim)", fontSize: "14px", marginBottom: "28px" }}>
        {syncStatus === "syncing"
          ? "Syncing your Canvas…"
          : upcoming.length > 0
          ? `${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })} · ${upcoming.length} assignment${upcoming.length !== 1 ? "s" : ""} coming up`
          : hasToken ? "You're all caught up" : "Connect Canvas to see assignments"}
      </p>

      {/* Latest announcement banner */}
      {latestAnnouncement && (
        <div style={{
          ...card,
          padding: "14px 16px",
          marginBottom: "16px",
          borderLeft: "2px solid rgba(0,210,190,0.5)",
        }}>
          <p style={{ color: "rgba(0,210,190,0.8)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "4px" }}>
            Announcement · {latestAnnouncement.courseName ?? ""}
          </p>
          <p style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: "500", marginBottom: "2px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {latestAnnouncement.title}
          </p>
        </div>
      )}

      <p style={{ fontSize: "11px", color: "var(--text-dim)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "12px" }}>
        Upcoming
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
        {upcoming.length > 0
          ? upcoming.map(a => <AssignmentCard key={a.id} a={a} />)
          : <EmptyState syncStatus={syncStatus} hasToken={hasToken} />
        }
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        {STATS.map((s) => (
          <div key={s.label} style={{ ...card, flex: 1, padding: "14px", textAlign: "center" }}>
            <p style={{ color: "var(--text-primary)", fontSize: "20px", fontWeight: "600", letterSpacing: "-0.3px", marginBottom: "2px" }}>
              {s.value}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
