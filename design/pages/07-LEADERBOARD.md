# Page 07: LEADERBOARD

**Route:** `/leaderboard`  
**Position in swipe order:** 7 of 7

---

## What the Student Feels

Studying feels like a competition they can win. Every action moves their rank. The categories reward different kinds of effort — not just grades.

---

## Layout

```
┌─────────────────────────────────┐
│  Leaderboard      [Resets: 3d]  │
│                                 │
│  [Nerd▼] [Univ▼]  [Week▼]      │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 🥇 Alex     1,240 pts    │  │
│  │ 🥈 Jordan   1,180 pts    │  │
│  │ 🥉 Priya    1,050 pts    │  │
│  │ ─────────────────────── │  │
│  │ #4  YOU ★    847 pts     │  │  ← Highlighted
│  │ ─────────────────────────│  │
│  │ #5  Marcus   820 pts     │  │
│  └───────────────────────────┘  │
│                                 │
│  ✦ "15 pts from #3. One study   │
│     session tonight."           │
│                                 │
│  [Challenge #3 ⚔️]              │
│                                 │
│  ← Nerd  Grind  Late  Social →  │  ← Category scroll
│         ● ● ● ● ● ● ●           │
└─────────────────────────────────┘
```

---

## The 8 Categories

| Category | What It Measures |
|---|---|
| 🧠 Nerdmaxing | Total knowledge concepts mastered |
| 💪 Grindmaxing | Total study hours this week |
| 🌙 Late Night Maxing | Study sessions after 10pm |
| 👥 Social Maxing | Study room participation + help given |
| 🔮 Brain Maxing | Brain age × brain health score |
| 🔥 Streak Maxing | Longest active study streak |
| ⚡ Token Maxing | Total tokens earned this week |
| 📣 Influencer Maxing | Friends referred + rooms created |

---

## AI Presence

- **Motivation nudge** (`✦ "15 pts from #3"`) — Motivation Engine Agent. Calculates exactly what the student needs to do to move up.
- **Challenge mechanic** — Leaderboard Agent. Challenges a specific student to a head-to-head study session. Winner gets bonus tokens.

---

## Key Interactions

1. **Tap category chip** → Switches leaderboard to that category.
2. **Tap scope chip** → Switches between University / City / Country / Friends.
3. **Tap "Challenge #3"** → Sends a study challenge to the student ranked above them.
4. **Tap any student** → Views their public profile (name, tier, top category).
5. **Swipe page right** → Go to SOCIAL.

---

## Token Moments

| Action | Tokens |
|---|---|
| Reach top 10 in any category | +100 |
| Reach top 3 in any category | +300 |
| Win a challenge | +150 |
| Weekly #1 in any category | +500 |

---

## Design Notes

- Student's own row is highlighted with `--accent-primary` border
- Top 3 rows have gold/silver/bronze left border accent
- Weekly reset countdown creates urgency — show it prominently in header
- The motivation nudge must be specific, not generic ("15 pts from #3" not "Keep going!")
- Challenge button uses `--accent-warm` color — feels exciting, competitive
- Categories are horizontally scrollable chips — student can swipe through all 8
- Scope switcher: University → City → Country → Friends (4 scopes)
