import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BottomNav from "../src/components/BottomNav";

// Force the wide (≥768px) breakpoint → BottomNav renders its sidebar layout.
beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: true, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  })) as any;
});

describe("BottomNav (web sidebar)", () => {
  it("shows every page (primary + secondary) and no mobile 'More' sheet", () => {
    render(<BottomNav currentPage="work" onNavigate={vi.fn()} />);
    for (const label of ["Work", "Canvas", "Study", "Leaderboard", "Identity", "Assignment", "Toolkit", "Files", "Rooms"])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText("More")).not.toBeInTheDocument();
  });

  it("routes on click", () => {
    const onNav = vi.fn();
    render(<BottomNav currentPage="work" onNavigate={onNav} />);
    fireEvent.click(screen.getByText("Files"));
    expect(onNav).toHaveBeenCalledWith("files");
  });

  it("fires onToggleCollapse from the collapse control", () => {
    const onToggle = vi.fn();
    render(<BottomNav currentPage="work" onNavigate={vi.fn()} collapsed={false} onToggleCollapse={onToggle} />);
    fireEvent.click(screen.getByTitle("Collapse sidebar"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("collapses to icon-only (labels hidden, expand affordance shown)", () => {
    render(<BottomNav currentPage="work" onNavigate={vi.fn()} collapsed={true} onToggleCollapse={vi.fn()} />);
    expect(screen.queryByText("Work")).not.toBeInTheDocument(); // labels hidden when collapsed
    expect(screen.getByTitle("Expand sidebar")).toBeInTheDocument();
  });
});
