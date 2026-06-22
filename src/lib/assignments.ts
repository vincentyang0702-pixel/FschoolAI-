// Pure assignment-selection logic, extracted from the dashboard so it can be
// unit-tested. The dashboard "Upcoming" list regressed: it showed only old
// assignments from already-completed courses while current-course work was
// pushed out. Two compounding causes:
//   1. The old filter admitted any *unsubmitted* assignment regardless of age,
//      so ancient never-submitted items from past courses leaked in.
//   2. Sorting ascending-by-due-date floated those oldest items to the top, and
//      slice(limit) then evicted current/future work.
// The fix: exclude past-course sources, and only show overdue work that is both
// unsubmitted AND recently due.

export const OVERDUE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export interface UpcomingOptions {
  now?: number;            // epoch ms; defaults to Date.now()
  limit?: number;          // max items returned; defaults to 5
  overdueWindowMs?: number;
}

/** Assignments due soon (future) or recently-overdue-and-unsubmitted, soonest first.
 *  Past-course assignments are excluded entirely. */
export function selectUpcomingAssignments(assignments: any[], opts: UpcomingOptions = {}): any[] {
  const now             = opts.now ?? Date.now();
  const limit           = opts.limit ?? 5;
  const overdueWindowMs = opts.overdueWindowMs ?? OVERDUE_WINDOW_MS;

  return (assignments || [])
    .filter(a => {
      if (!a?.dueAt) return false;
      if (a.source === "past_canvas" || a.source === "manual_past") return false;
      const due = +new Date(a.dueAt);
      if (Number.isNaN(due)) return false;
      if (due > now) return true; // future → upcoming
      // Overdue: only nag about recently-missed, still-unsubmitted work
      return !a.submission?.submittedAt && now - due < overdueWindowMs;
    })
    .sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))
    .slice(0, limit);
}
