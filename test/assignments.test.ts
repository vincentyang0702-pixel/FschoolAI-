import { describe, it, expect } from "vitest";
import { selectUpcomingAssignments, OVERDUE_WINDOW_MS } from "../src/lib/assignments";

// Fixed "now" so the tests are deterministic.
const NOW = new Date("2026-06-22T12:00:00Z").getTime();
const daysFromNow = (d: number) => new Date(NOW + d * 86400_000).toISOString();

const make = (over: any = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  name: over.name ?? "Assignment",
  dueAt: over.dueAt ?? daysFromNow(3),
  source: over.source ?? "canvas",
  submission: over.submission ?? { submittedAt: null },
  ...over,
});

describe("selectUpcomingAssignments", () => {
  it("reproduces the bug scenario: current-course work shows, past-course work is excluded", () => {
    const assignments = [
      // Ancient never-submitted assignments from a completed course — these used
      // to sort to the top and evict everything below them.
      make({ name: "Old PastCourse HW1", source: "past_canvas", dueAt: daysFromNow(-300), submission: { submittedAt: null } }),
      make({ name: "Old PastCourse HW2", source: "past_canvas", dueAt: daysFromNow(-280), submission: { submittedAt: null } }),
      make({ name: "Old PastCourse HW3", source: "past_canvas", dueAt: daysFromNow(-260), submission: { submittedAt: null } }),
      make({ name: "Old PastCourse HW4", source: "past_canvas", dueAt: daysFromNow(-240), submission: { submittedAt: null } }),
      make({ name: "Old PastCourse HW5", source: "past_canvas", dueAt: daysFromNow(-220), submission: { submittedAt: null } }),
      // The assignment the student actually cares about — current course, due soon.
      make({ name: "Current Essay", source: "canvas", dueAt: daysFromNow(2) }),
    ];

    const upcoming = selectUpcomingAssignments(assignments, { now: NOW, limit: 5 });
    const names = upcoming.map(a => a.name);

    expect(names).toContain("Current Essay");
    expect(names.some(n => n.startsWith("Old PastCourse"))).toBe(false);
  });

  it("includes future-due current assignments", () => {
    const r = selectUpcomingAssignments([make({ name: "Future", dueAt: daysFromNow(5) })], { now: NOW });
    expect(r.map(a => a.name)).toEqual(["Future"]);
  });

  it("includes recently-overdue, still-unsubmitted work (the nag case)", () => {
    const r = selectUpcomingAssignments(
      [make({ name: "JustMissed", dueAt: daysFromNow(-3), submission: { submittedAt: null } })],
      { now: NOW },
    );
    expect(r.map(a => a.name)).toEqual(["JustMissed"]);
  });

  it("excludes overdue work older than the window", () => {
    const r = selectUpcomingAssignments(
      [make({ name: "LongGone", dueAt: new Date(NOW - OVERDUE_WINDOW_MS - 86400_000).toISOString(), submission: { submittedAt: null } })],
      { now: NOW },
    );
    expect(r).toHaveLength(0);
  });

  it("excludes submitted assignments that are overdue", () => {
    const r = selectUpcomingAssignments(
      [make({ name: "Done", dueAt: daysFromNow(-2), submission: { submittedAt: daysFromNow(-3) } })],
      { now: NOW },
    );
    expect(r).toHaveLength(0);
  });

  it("excludes manual_past as well as past_canvas", () => {
    const r = selectUpcomingAssignments(
      [
        make({ name: "ManualPast", source: "manual_past", dueAt: daysFromNow(2) }),
        make({ name: "Keep", source: "canvas", dueAt: daysFromNow(2) }),
      ],
      { now: NOW },
    );
    expect(r.map(a => a.name)).toEqual(["Keep"]);
  });

  it("skips assignments with no/invalid due date", () => {
    const r = selectUpcomingAssignments(
      [make({ name: "NoDue", dueAt: null }), make({ name: "BadDue", dueAt: "not-a-date" })],
      { now: NOW },
    );
    expect(r).toHaveLength(0);
  });

  it("sorts soonest-first and respects the limit", () => {
    const r = selectUpcomingAssignments(
      [
        make({ name: "C", dueAt: daysFromNow(9) }),
        make({ name: "A", dueAt: daysFromNow(1) }),
        make({ name: "B", dueAt: daysFromNow(5) }),
      ],
      { now: NOW, limit: 2 },
    );
    expect(r.map(a => a.name)).toEqual(["A", "B"]);
  });

  it("is null-safe", () => {
    expect(selectUpcomingAssignments(undefined as any, { now: NOW })).toEqual([]);
  });
});
