# Design Folder

This folder is owned by the **UI/Design team**.

It contains the visual design spec, UX flows, and component guidelines for every page in FschoolAI. The backend team does not need to read this folder. The UI team should not need to read the `/agents` or `/backend` folders.

---

## Folder Structure

```
design/
├── README.md                  ← You are here
├── DESIGN_SYSTEM.md           ← Colors, fonts, spacing, components
├── pages/
│   ├── 01-HOME.md             ← Home / Dashboard page design spec
│   ├── 02-ASSIGNMENTS.md      ← Assignments page design spec
│   ├── 03-STUDY.md            ← Study page design spec
│   ├── 04-CANVAS.md           ← Canvas page design spec
│   ├── 05-BRAIN.md            ← Brain / Second Brain page design spec
│   ├── 06-SOCIAL.md           ← Social / Friends page design spec
│   ├── 07-LEADERBOARD.md      ← Leaderboard page design spec
│   ├── 08-STUDY-ROOMS.md      ← Study Rooms page design spec
│   └── 00-ONBOARDING.md       ← Onboarding flow (first login)
└── flows/
    ├── FIRST_LOGIN_FLOW.md    ← Tutor naming + Canvas connect flow
    ├── CHAT_PANEL_FLOW.md     ← How the chat panel opens/closes
    └── TOKEN_ANIMATION.md     ← Token earn animations and feedback
```

---

## How to Use This Folder

1. **UI intern:** Create a page spec file for each page you design. Use the template below.
2. **Vincent:** Review and approve each page spec before the intern builds it.
3. **Tech intern:** Read the page spec to understand what AI outputs need to be displayed. Then read `FRONTEND_BACKEND_CONTRACT.md` to know what JSON to return.

---

## Page Spec Template

Copy this template when creating a new page spec:

```markdown
# Page Name

## What the Student Feels
One sentence: what emotion or state does this page create?

## Layout
Describe the layout in plain language. Include:
- What is at the top
- What is in the middle
- What is at the bottom
- How the student navigates away

## AI Presence
Where does AI live on this page? List every AI element:
- [ ] Greeting / situation summary
- [ ] Inline cards with AI insight
- [ ] Prediction badges
- [ ] Chat panel (always accessible)
- [ ] Proactive nudge
- [ ] Other: ___

## Key Interactions
List the 3-5 most important things a student can do on this page.

## Empty State
What does the student see if there is no data yet?

## Token Moments
What actions on this page earn tokens? Show the animation.

## Mobile Gestures
- Swipe left/right: ___
- Swipe up: ___
- Tap: ___
- Long press: ___

## Design Notes
Any specific visual requirements, animations, or constraints.
```

---

## Connection to Backend

The UI team does not need to wire up agents. For every AI element on a page, refer to `FRONTEND_BACKEND_CONTRACT.md` to see what JSON the backend returns and what field to display where.
