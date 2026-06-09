// navConfig.js — The only file to touch when adding or rearranging pages.
// NAV defines which page lives in each direction from a given page.
// DOT_GRID defines the 3×3 visual map shown in PageDots.
// LABEL maps page keys to display names used in the header.

export const NAV = {
  work:        { right: "assignment", left: "canvas",      up: "identity",    down: "toolkit" },
  assignment:  { left: "work",        down: "study" },
  study:       { up: "assignment" },
  files:       { right: "identity",   down: "canvas" },
  canvas:      { right: "work",       down: "courses",     up: "files" },
  courses:     { up: "canvas",        right: "toolkit" },
  toolkit:     { up: "work",          left: "courses" },
  identity:    { down: "work",        right: "leaderboard", left: "files" },
  leaderboard: { left: "identity" },
};

export const DOT_GRID = [
  ["files",   "identity",  "leaderboard"],
  ["canvas",  "work",      "assignment" ],
  ["courses", "toolkit",   "study"      ],
];

export const LABEL = {
  work:        "Work",
  canvas:      "Canvas",
  assignment:  "Assignment",
  study:       "Study",
  files:       "Files",
  toolkit:     "Toolkit",
  courses:     "Courses",
  identity:    "Identity",
  leaderboard: "Leaderboard",
};
