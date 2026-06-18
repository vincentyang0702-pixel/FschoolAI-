import { describe, it, expect } from "vitest";
import { NAV, DOT_GRID, LABEL } from "../src/navigation/navConfig";

describe("navigation graph", () => {
  const gridPages = DOT_GRID.flat().filter(Boolean);

  it("every NAV source and target is a labelled page", () => {
    for (const [from, dirs] of Object.entries(NAV)) {
      expect(LABEL[from], `source "${from}" missing from LABEL`).toBeDefined();
      for (const to of Object.values(dirs)) {
        expect(LABEL[to as string], `target "${to}" missing from LABEL`).toBeDefined();
      }
    }
  });

  it("the dot grid has no duplicate pages", () => {
    expect(new Set(gridPages).size).toBe(gridPages.length);
  });

  it("every page on the grid is reachable from 'work' by swiping", () => {
    const seen = new Set(["work"]);
    const queue = ["work"];
    while (queue.length) {
      const p = queue.shift()!;
      for (const to of Object.values(NAV[p] ?? {})) {
        if (!seen.has(to as string)) { seen.add(to as string); queue.push(to as string); }
      }
    }
    for (const page of gridPages) {
      expect(seen.has(page), `"${page}" is unreachable from work via swipe nav`).toBe(true);
    }
  });
});
