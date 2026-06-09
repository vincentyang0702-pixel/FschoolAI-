# FschoolAI — Token Economy & Subscription System
**Complete Design Document | v1.0**

---

## Overview

FschoolAI runs a dual-layer economy: a **subscription tier** that gates access to features, and a **Token system** that rewards genuine academic behaviour. The two layers are intentionally separate — you can be on the Free plan and still earn Tokens, and Tokens unlock features regardless of subscription tier. This design maximises engagement at every price point.

The core principle: **every Token is earned by a verified academic action, never purchased.** All earn events are validated against Canvas data (submission timestamps, grade records, session logs) so the system cannot be gamed.

---

## Part 1 — Subscription Tiers

### Free Tier — $0/month

The Free tier is designed to be genuinely useful, not a crippled demo. A Free user can run FschoolAI as their primary academic tool; they hit limits only when they want social or advanced brain features.

| Feature | Free |
|---|---|
| Canvas sync (courses, assignments, grades) | ✅ Unlimited |
| Reggie chat (AI tutor) | ✅ 20 messages/day |
| Brain context window | ✅ Updated every 24h |
| Nightly brain reflection | ✅ Basic (pattern detection only) |
| Proactive interventions | ✅ Up to 3/week |
| Assignment help (rubric alignment, outline) | ✅ |
| Chrome extension (Canvas scraper) | ✅ |
| Token earning | ✅ Full earn rates |
| Leaderboard access | ✅ View only (no custom categories) |
| Study Room | ❌ (join only, cannot create) |
| Voice (ElevenLabs TTS) | ❌ |
| Exam prediction | ❌ |
| Professor Intelligence | ❌ |
| Lesson Generator | ❌ |
| Brain export / Brain API | ❌ |
| Token exchange (partner rewards) | ✅ Basic partners only |

**Free tier philosophy:** A student who uses FschoolAI every day on Free will earn ~500 Tokens in 3–4 weeks and naturally unlock the Enhanced tier features. The subscription is for users who want voice, exam prediction, and Study Room hosting from day one — not a paywall on core utility.

---

### Student Pro — $12/month

The primary paid tier. Designed for the student who uses FschoolAI as their main academic OS.

| Feature | Student Pro |
|---|---|
| Everything in Free | ✅ |
| Reggie chat | ✅ Unlimited |
| Brain context window | ✅ Updated every 30 min |
| Nightly brain reflection | ✅ Full (patterns + hypotheses + weekly synthesis) |
| Proactive interventions | ✅ Unlimited |
| Voice responses (ElevenLabs TTS) | ✅ 500 voice messages/month |
| Study Room | ✅ Create + join, up to 10 rooms/week |
| Exam prediction | ✅ |
| Professor Intelligence | ✅ |
| Lesson Generator | ✅ 10 generated lessons/month |
| Motivation Engine nudges | ✅ |
| Social Intelligence (friend activity) | ✅ |
| Leaderboard (all categories + custom) | ✅ |
| Token exchange (all partners) | ✅ |
| Priority brain queue (reflection runs first) | ✅ |

**Monthly cost to serve a Pro user: ~$2.50** (Claude API + ElevenLabs + infra). Gross margin at $12: **~79%.**

---

### Student Max — $20/month

For power users and students who want full brain ownership.

| Feature | Student Max |
|---|---|
| Everything in Student Pro | ✅ |
| Voice responses | ✅ Unlimited |
| Study Room | ✅ Unlimited, host up to 20 participants |
| Lesson Generator | ✅ Unlimited |
| Brain export (full JSON download) | ✅ |
| Brain API access (read-only, 1,000 calls/month) | ✅ |
| Cognitive Style Report (monthly PDF) | ✅ |
| Cross-course knowledge graph visualisation | ✅ |
| Early access to Sprint features (beta) | ✅ |
| Dedicated brain refresh (every 15 min) | ✅ |
| Custom Reggie personality | ✅ |
| NeuroAGI hardware pre-order discount (20%) | ✅ |

---

### Tier Comparison Summary

| | Free | Pro $12 | Max $20 |
|---|---|---|---|
| Reggie chat | 20 msg/day | Unlimited | Unlimited |
| Brain refresh | Every 24h | Every 30 min | Every 15 min |
| Voice | ❌ | 500/month | Unlimited |
| Study Room | Join only | Create (10/week) | Create (unlimited) |
| Exam Predictor | ❌ | ✅ | ✅ |
| Professor Intel | ❌ | ✅ | ✅ |
| Lesson Generator | ❌ | 10/month | Unlimited |
| Brain Export | ❌ | ❌ | ✅ |
| Token exchange | Basic | All partners | All partners + bonus |

---

## Part 2 — FschoolAI Token System

### What Are Tokens?

FschoolAI Tokens (FST) are an in-app reward currency earned exclusively through verified academic actions. They are **not purchasable with money** — the only way to earn them is to actually study, submit work, and engage with the platform. This makes the leaderboard and tier system a genuine reflection of academic engagement, not spending power.

Tokens serve two purposes:
1. **Unlock higher feature tiers** (Enhanced → Advanced → Brain Owner) regardless of subscription level
2. **Exchange for real-world rewards** through the partner program

---

### Token Earn Table

Every earn event is validated. The validation method is listed for each action.

| Action | Tokens | Validation Method | Daily Cap |
|---|---|---|---|
| Submit assignment on time | **+50** | Canvas submission timestamp ≤ deadline | No cap |
| Submit assignment early (≥20% time remaining) | **+100** | Canvas timestamp vs deadline | No cap |
| Submit assignment very early (≥50% time remaining) | **+150** | Canvas timestamp vs deadline | No cap |
| Complete focused study session (25–60 min) | **+30** | Focus Agent: active time ≥ 25 min, no idle > 5 min | 3×/day (90 max) |
| Complete long study session (60+ min) | **+60** | Focus Agent: active time ≥ 60 min | 2×/day (120 max) |
| Study with a friend in Study Room (both active) | **+50** | Room Orchestrator: both participants active ≥ 20 min | 2×/day |
| Help a friend in Study Room (friend confirms) | **+25** | Confirmation prompt sent to helped student | 5×/day |
| Ask Reggie a question | **+5** | Message sent to chat | 20×/day (100 max) |
| Upload lecture notes or recording | **+40** | File successfully processed by brain | 3×/day |
| Grade improvement (higher than last grade, same course) | **+200** | Canvas grade comparison (previous vs new) | No cap |
| Daily streak (login + ≥1 meaningful action) | **+10** | Signal exists for today | 1×/day |
| Weekly streak bonus (7 consecutive days) | **+100** | 7 consecutive daily signals | 1×/week |
| Complete a brain-generated lesson (score ≥ 60%) | **+60** | Lesson completion signal with score | 5×/day |
| Beat a brain prediction (predicted < B, actual ≥ B) | **+150** | Exam Predictor vs Canvas final grade | Per exam |
| Refer a friend (signs up + completes onboarding) | **+200** | Referral tracking + onboarding completion | No cap |
| First-time actions (first upload, first Study Room, etc.) | **+50 each** | One-time bonus per action type | One-time |
| Contribute data to shared Library (new content, first sync) | **+75** | Library dedup: content_hash not found → you added it | No cap |
| Streak milestone (30-day streak) | **+500** | 30 consecutive daily signals | One-time |
| Streak milestone (100-day streak) | **+2,000** | 100 consecutive daily signals | One-time |
| Semester GPA improvement | **+1,000** | Canvas semester GPA: current > last semester | Per semester |

**Anti-gaming rules:**
- All earn events require a Canvas-verifiable signal. No Canvas confirmation = no tokens.
- Rapid-fire actions (e.g., 20 chat messages in 2 minutes) are rate-limited and flagged.
- Study session tokens require the Focus Agent to confirm active engagement (no idle tab).
- Referral tokens are held for 7 days and released only after the referred user completes their first study session.

---

### Token Tier Unlock System

Tokens unlock feature tiers **in addition to** subscription access. A Free user who earns 2,000 Tokens gets Advanced features without paying. A Pro user who earns 5,000 Tokens gets Brain Owner features on top of their subscription.

| Tier | Tokens Required | Features Unlocked |
|---|---|---|
| **Basic** | 0 | Standard Reggie, 5 Study Rooms/week, basic insights |
| **Enhanced** | 500 | Unlimited Study Rooms, grade prediction, Professor Intelligence, custom leaderboard categories |
| **Advanced** | 2,000 | Host Study Rooms (up to 20), Brain Analytics dashboard, cross-course knowledge graph, badge customisation |
| **Brain Owner** | 5,000 | Brain export, Brain API (1,000 calls/month), Reggie personality customisation, beta feature access, NeuroAGI hardware early access |

A student earning tokens at the average rate (~150 FST/day for an active user) reaches:
- Enhanced (500) in ~3–4 days
- Advanced (2,000) in ~2 weeks
- Brain Owner (5,000) in ~5 weeks

This is intentional. The token system is not a long grind — it rewards consistent daily use, not marathon sessions.

---

## Part 3 — Leaderboard

### Leaderboard Categories

The leaderboard is filterable by **continent → country → city → university → course**. Every category is computed from verified brain signals, not self-reported data.

| Category | What It Measures | Signal Source |
|---|---|---|
| **Overall Score** | Weighted composite of all categories | All signals |
| **Nerdmaxing** | Total focused study hours this week | Focus Agent session durations |
| **Late Night Maxing** | Study sessions between 10pm–3am | Session timestamps |
| **Streak King** | Current consecutive daily streak | Daily signal chain |
| **Assignment Crusher** | % of assignments submitted early | Canvas submission timestamps |
| **Grade Climber** | Grade improvement delta this semester | Canvas grade history |
| **Study Room MVP** | Times confirmed as helpful in Study Rooms | Peer confirmation signals |
| **Brain Builder** | Brain knowledge mastery score (0–100) | brain.knowledge mastery average |
| **Influencer Maxing** | Friends referred + Study Rooms hosted | Referral + room creation signals |
| **Library Contributor** | New content added to shared Library | Library dedup new-entry count |

### Leaderboard Customisation (Enhanced tier and above)

Users on Enhanced tier or above can:
- Create **custom leaderboard categories** (e.g., "PSYC 201 grind", "Thursday night warriors")
- Filter by friend group (only show people you follow)
- Set private leaderboards visible only to a Study Room group
- Pin up to 3 categories to their home screen

### Leaderboard Privacy Rules

- Grades are **never shown publicly**. Grade Climber shows delta (improvement), not absolute grade.
- Brain mastery scores are shown as a 0–100 index, not as individual concept breakdowns.
- Users can opt out of any leaderboard category individually.
- "Late Night Maxing" can be hidden if a student does not want their study hours visible.

---

## Part 4 — Token Exchange & Partner Program

### What Can Tokens Be Exchanged For?

Tokens are redeemable through the FschoolAI partner network. The exchange rate is fixed per partner and reviewed quarterly. Tokens are **not convertible to cash** — they exchange for goods, services, and discounts from partners.

### Exchange Categories

**Academic & Productivity**

| Partner | What You Get | Tokens Required | Tier Required |
|---|---|---|---|
| Notion | 3 months Notion Plus | 800 | Basic |
| Grammarly | 1 month Grammarly Premium | 600 | Basic |
| Coursera | 1 course certificate | 1,200 | Basic |
| Scribd | 1 month Scribd unlimited | 500 | Basic |
| Overleaf | 1 month Overleaf Professional | 700 | Basic |

**Food & Campus Life**

| Partner | What You Get | Tokens Required | Tier Required |
|---|---|---|---|
| Uber Eats | $10 credit | 1,000 | Basic |
| Starbucks | $5 gift card | 500 | Basic |
| Campus bookstore (partner universities) | $15 voucher | 1,500 | Enhanced |
| DoorDash | $10 credit | 1,000 | Basic |

**Tech & Subscriptions**

| Partner | What You Get | Tokens Required | Tier Required |
|---|---|---|---|
| Spotify Student | 1 month free | 400 | Basic |
| Adobe Creative Cloud | 1 month student plan | 1,500 | Enhanced |
| GitHub Copilot | 1 month free | 600 | Basic |
| 1Password | 1 year student plan | 1,200 | Enhanced |

**NeuroAGI Ecosystem**

| Partner | What You Get | Tokens Required | Tier Required |
|---|---|---|---|
| NeuroAGI Neural Card | $50 off hardware pre-order | 2,000 | Advanced |
| NeuroAGI Neural Card | $100 off hardware pre-order | 5,000 | Brain Owner |
| FschoolAI Student Max | 1 month free upgrade | 1,500 | Enhanced |
| FschoolAI Student Max | 3 months free upgrade | 4,000 | Advanced |

**Study Room Boosts (consumable)**

| Boost | What It Does | Tokens Required |
|---|---|---|
| 2× Token Weekend | Double all token earn rates for 48h | 300 |
| Brain Priority Pass | Your nightly reflection runs first (within 1 min of midnight) | 200 |
| Streak Shield | Protects your streak for 1 missed day | 150 |
| Exam Crunch Mode | Unlocks unlimited Lesson Generator for 7 days | 500 |

---

### Partner Program — How FschoolAI Partners With Companies

FschoolAI offers two partnership tiers for companies wanting to reach the student demographic through the token economy.

**Standard Partner**

- Company provides a reward (gift card, subscription credit, discount code)
- FschoolAI lists the reward in the Token Exchange
- Company pays FschoolAI a **flat fee per redemption** ($2–$5 per redemption depending on reward value)
- Minimum commitment: 500 redemptions/quarter
- Data shared with partner: redemption count only (no PII, no academic data)

**Premium Partner (Campus Integration)**

- Everything in Standard Partner
- Company logo appears on the Leaderboard page ("Powered by [Partner]" for a specific category)
- Company can sponsor a leaderboard category (e.g., "Starbucks Late Night Maxing Award")
- Company receives **aggregate anonymised insights** (e.g., "students who study 4+ hours/day are 3× more likely to redeem Spotify")
- Company can offer **exclusive challenges** (e.g., "Starbucks Study Challenge: log 10 study sessions this week, earn a $10 Starbucks card")
- Pricing: $5,000–$15,000/month depending on university reach

**University Partner**

- University pays FschoolAI a per-student annual fee ($20–$50/student/year)
- All students at that university get Student Pro features for free (university-subsidised)
- University gets an admin dashboard: aggregate study patterns, assignment completion rates, at-risk student flags (no individual data)
- University can add their own token rewards (e.g., library late fee waiver, priority course registration)
- This is the **enterprise go-to-market path**: one university deal = thousands of Pro users

---

### Partner Pipeline (Target Q3 2025)

| Partner Type | Target Companies | Status |
|---|---|---|
| Academic tools | Notion, Grammarly, Overleaf | Outreach planned |
| Food delivery | Uber Eats, DoorDash | Outreach planned |
| Music/entertainment | Spotify, YouTube Premium | Outreach planned |
| Tech tools | GitHub, 1Password, Adobe | Outreach planned |
| University pilot | University of Toronto (existing users) | In discussion |
| University pilot | 2 additional Canadian universities | Target Q3 2025 |

---

## Part 5 — Token Economy Unit Economics

### Revenue from Token Exchange (Partner Fees)

At 1,000 active users with 40% redeeming tokens monthly:
- 400 redemptions/month × $3 average partner fee = **$1,200/month additional revenue**
- This is pure margin — no COGS for digital rewards

At 10,000 users:
- 4,000 redemptions/month × $3 = **$12,000/month**
- Premium partner sponsorships (2 partners × $7,500) = **$15,000/month**
- Total partner revenue: **$27,000/month** at 10K users

### Token Inflation Control

To prevent token inflation devaluing rewards:
1. **Earn caps** on high-frequency actions (chat: 20×/day, study sessions: 3×/day)
2. **Redemption sinks** — tokens spent on boosts are permanently consumed
3. **Quarterly rebalancing** — earn rates and exchange costs reviewed each quarter based on redemption data
4. **No token transfers** between users (prevents farming/selling)

---

*Document version: 2025-06-09 v1.0 | Author: Vincent Yang / FschoolAI*
*This document is confidential — for internal team and investor review only*
