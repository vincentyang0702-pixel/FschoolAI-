# Agent: Token Engine

**Priority:** Sprint 1 — Build second
**Status:** 🔴 NOT BUILT
**Pages:** ALL (global agent, visible on every page)
**Existing code:** None

---

## Purpose

Awards FschoolAI tokens for validated actions. Manages tier progression. Makes every action in the app feel consequential — the student sees their token count change in real-time.

---

## Trigger

- Any token-earning event occurs (assignment submitted, study session completed, etc.)
- Student opens any page (displays current balance)
- Weekly reset (leaderboard token bonuses)

---

## Token Earning Table

| Action | Tokens | Validation Method |
|---|---|---|
| Submit assignment on time | 50 | Canvas confirms submission before deadline |
| Submit assignment early (before 80% of deadline elapsed) | 100 | Canvas timestamp vs deadline |
| Complete study session (25+ min) | 30 | Focus Agent confirms active time ≥ 25 min |
| Study with a friend (both active in same room) | 50 | Room Orchestrator confirms both participants active |
| Ask tutor a question | 5 | Message sent to chat (max 20/day = 100/day cap) |
| Upload lecture notes/recording | 40 | File successfully processed by brain |
| Grade improvement (higher than last grade in same course) | 200 | Canvas grade comparison |
| Daily streak (login + at least 1 meaningful action) | 10 | Signal exists for today |
| Weekly streak bonus (7 consecutive days) | 100 | 7 consecutive daily signals |
| Help a friend in study room (friend confirms) | 25 | Confirmation prompt to helped student |
| Complete brain-generated lesson | 60 | Lesson completion signal with score ≥ 60% |
| Beat a prediction (brain predicted struggle, you didn't) | 150 | Exam Predictor predicted < B, actual ≥ B |
| Refer a friend (friend signs up and completes onboarding) | 200 | Referral tracking + onboarding completion |
| First-time actions (first upload, first study room, etc.) | 50 each | One-time bonus per action type |

---

## Tier System

| Tier | Tokens Required | Unlocks |
|---|---|---|
| **Basic** | 0 | Standard tutor, 5 study rooms/week, basic insights |
| **Enhanced** | 500 | Unlimited rooms, grade prediction, professor intel, custom UI |
| **Advanced** | 2,000 | Host rooms, brain analytics, cross-course connections, badge customization |
| **Brain Owner** | 5,000 | Brain export, Brain API, tutor personality customization, beta access |

---

## Data Model

### New table: `fschool.tokens`

```sql
CREATE TABLE fschool.tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES neuro.persons(id),
  action TEXT NOT NULL,           -- 'assignment_submit', 'study_session', etc.
  amount INTEGER NOT NULL,        -- tokens earned (always positive)
  reference_id TEXT,              -- optional: assignment_id, session_id, etc.
  validated BOOLEAN DEFAULT false,-- anti-cheat: only validated tokens count
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tokens_person ON fschool.tokens(person_id);
CREATE INDEX idx_tokens_created ON fschool.tokens(person_id, created_at);
```

### New table: `fschool.token_balance`

```sql
CREATE TABLE fschool.token_balance (
  person_id UUID PRIMARY KEY REFERENCES neuro.persons(id),
  total_earned INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  current_balance INTEGER DEFAULT 0,
  current_tier TEXT DEFAULT 'basic',  -- basic, enhanced, advanced, brain_owner
  streak_days INTEGER DEFAULT 0,
  last_active_date DATE,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Logic

```
ON token_earning_event:
  1. Validate the action (check against Canvas/signals/sessions)
  2. If valid:
     a. INSERT into fschool.tokens (validated = true)
     b. UPDATE fschool.token_balance: current_balance += amount, total_earned += amount
     c. Check tier progression: if current_balance crosses tier threshold → upgrade tier
     d. Write brain.signal: { type: 'token_earned', data: { action, amount, new_balance } }
     e. Push real-time notification to frontend (WebSocket or polling)
  3. If invalid:
     a. INSERT into fschool.tokens (validated = false) — for audit
     b. Log attempted gaming for pattern detection

ON daily_check (midnight):
  1. Check if student had at least 1 meaningful signal today
  2. If yes: award streak bonus (10 tokens), increment streak_days
  3. If no: reset streak_days to 0
  4. If streak_days == 7: award weekly bonus (100 tokens)

ON tier_change:
  1. Write brain.signal: { type: 'tier_upgrade', data: { old_tier, new_tier } }
  2. Tutor acknowledges: "You just reached Enhanced tier! Grade predictions are now unlocked."
  3. Update UI to show new capabilities
```

---

## Anti-Cheat Rules

| Cheat Attempt | Prevention |
|---|---|
| Spam chat messages for 5 tokens each | Cap at 20 messages/day (100 tokens max from chat) |
| Open study timer and walk away | Focus Agent checks for activity (mouse/keyboard/scroll) |
| Submit empty assignment for tokens | Canvas must confirm non-empty submission |
| Create fake study room with alt account | Both participants must have separate Canvas accounts |
| Refer yourself with alt email | Referred user must complete onboarding + have Canvas connected |

---

## Frontend Display

- **Header bar (all pages):** Token count + tier badge (always visible)
- **Token animation:** When tokens are earned, show "+50" floating animation
- **Tier progress bar:** Shows progress toward next tier
- **Token history:** Accessible from settings — full log of earnings

---

## Writes To

| Table | What It Writes |
|---|---|
| `fschool.tokens` | Individual token earning records |
| `fschool.token_balance` | Running balance and tier |
| `brain.signals` | Token events as signals (for reflection engine) |

---

## Reads From

| Table | What It Reads |
|---|---|
| `brain.signals` | To validate actions occurred |
| `agents.sessions` | To validate study room participation |
| `fschool.assignments` | To validate submission timing |

---

## How It Compounds

The Reflection Engine reads token signals and generates insights:
- "Student earns most tokens from study sessions, not assignments → intrinsically motivated by learning"
- "Student's token earning dropped 60% this week → motivation engine should intervene"
- "Student is 50 tokens from Advanced tier → nudge: 'One more study session gets you to Advanced'"

Tokens are not just points — they are signals that tell the brain about the student's engagement patterns.
