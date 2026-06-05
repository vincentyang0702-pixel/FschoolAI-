# FschoolAI Design System

**This is the single source of truth for all visual decisions.**

Every page must follow this system. No exceptions. Consistency is what makes the app feel like a product, not a collection of screens.

---

## Brand Identity

**Product name:** FschoolAI  
**Tutor name:** Chosen by each student (no brand name for the tutor)  
**Tone:** Intelligent, warm, direct. Like a brilliant older student who actually cares.  
**Never:** Corporate, clinical, gamified-for-the-sake-of-it, or condescending.

---

## Color Palette

### Core Colors (Dark Theme — Default)

| Token | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#0A0A0F` | Main background |
| `--bg-secondary` | `#111118` | Cards, panels |
| `--bg-elevated` | `#1A1A24` | Modals, overlays |
| `--border` | `#2A2A38` | Subtle borders |
| `--text-primary` | `#F0F0FF` | Headings, important text |
| `--text-secondary` | `#8888AA` | Labels, metadata |
| `--text-muted` | `#444466` | Placeholders, disabled |

### Accent Colors

| Token | Hex | Usage |
|---|---|---|
| `--accent-primary` | `#7B6FFF` | Primary CTA, active states, Neural Ring |
| `--accent-secondary` | `#4ECDC4` | Secondary actions, success states |
| `--accent-warm` | `#FF6B6B` | Urgency, overdue, alerts |
| `--accent-gold` | `#FFD700` | Tokens, achievements, tier badges |
| `--accent-social` | `#FF6B9D` | Social features, friends, study rooms |

### Signal Colors (Neural Ring segments)

| Signal | Color |
|---|---|
| Behavioral | `#7B6FFF` |
| Temporal | `#4ECDC4` |
| Emotional | `#FF6B6B` |
| Social | `#FF6B9D` |
| Knowledge | `#45B7D1` |
| Context | `#96CEB4` |
| Outcome | `#FFD700` |
| Engagement | `#FFEAA7` |

### AI-Generated Interface Colors

When a student customizes their interface through chat, the AI can modify:
- Background gradient (within dark theme range)
- Accent color (from a curated palette)
- Card opacity
- Font size (small / medium / large)

Store these in `neuro.preferences` under `key='ui_preferences'`.

---

## Typography

### Font Stack

```css
--font-display: 'Space Grotesk', sans-serif;   /* Headings, numbers, stats */
--font-body: 'Inter', sans-serif;               /* Body text, labels */
--font-mono: 'JetBrains Mono', monospace;       /* Code, data, IDs */
```

### Type Scale

| Name | Size | Weight | Usage |
|---|---|---|---|
| `display-xl` | 48px | 700 | Page hero numbers (GPA, rank) |
| `display-lg` | 32px | 700 | Page titles |
| `display-md` | 24px | 600 | Section headings |
| `body-lg` | 18px | 400 | Tutor messages, primary content |
| `body-md` | 16px | 400 | Card content, descriptions |
| `body-sm` | 14px | 400 | Labels, metadata |
| `caption` | 12px | 400 | Timestamps, fine print |
| `badge` | 11px | 600 | Badges, tags, chips |

---

## Spacing System

Based on 4px grid:

```
4px   — micro spacing (icon gaps)
8px   — tight spacing (within components)
12px  — small spacing (between related items)
16px  — base spacing (standard padding)
24px  — medium spacing (between sections)
32px  — large spacing (major section breaks)
48px  — xlarge spacing (page-level padding)
```

---

## Components

### Neural Ring
- Always centered on the Home page
- 240px diameter on mobile
- 8 segments, each representing a signal type
- Pulses gently when AI is thinking
- Glows accent-primary when chat is open
- Tap opens chat panel

### Cards
- Background: `--bg-secondary`
- Border: 1px `--border`
- Border radius: 16px
- Padding: 16px
- No box shadows (use border instead)
- Hover: border color lightens to `--text-muted`

### AI Insight Badge
- Small pill attached to a card
- Background: `--accent-primary` at 15% opacity
- Border: 1px `--accent-primary` at 40% opacity
- Text: `--accent-primary`
- Icon: ✦ (sparkle)
- Example: `✦ Prof Chen: cite sources`

### Token Badge
- Gold pill
- Background: `--accent-gold` at 15% opacity
- Border: 1px `--accent-gold` at 40% opacity
- Text: `--accent-gold`
- Example: `+100 tokens`

### Urgency Badge
- Red pill for overdue/high urgency
- Background: `--accent-warm` at 15% opacity
- Text: `--accent-warm`
- Example: `Due today`

### Prediction Badge
- Teal pill for grade predictions
- Background: `--accent-secondary` at 15% opacity
- Text: `--accent-secondary`
- Example: `B+ predicted`

### Chat Panel
- Slides up from bottom (80% screen height)
- Background: `--bg-elevated`
- Backdrop blur on the 20% behind it
- Input at bottom, messages scroll above
- Always accessible from any page via Neural Ring button

### Token Earn Animation
- Floating "+X tokens" text rises from the action point
- Color: `--accent-gold`
- Duration: 1.2 seconds
- Easing: ease-out with slight bounce
- Counter in stats bar increments simultaneously

---

## Navigation

### Bottom Navigation (Mobile)
7 pages accessible via swipe left/right. No tab bar.

**Swipe gestures:**
- Swipe left → next page
- Swipe right → previous page
- Swipe up → open chat panel (from any page)
- Swipe down (in chat) → close chat panel

**Page order:**
1. HOME
2. ASSIGNMENTS
3. STUDY
4. CANVAS
5. BRAIN
6. SOCIAL
7. LEADERBOARD

**Page indicator:** Small dots at bottom showing current position.

### Page Transitions
- Slide left/right with slight spring physics
- Duration: 280ms
- Easing: cubic-bezier(0.25, 0.46, 0.45, 0.94)

---

## AI Presence Guidelines

### Where AI Lives on Every Page

AI should feel like it is always present but never intrusive. Rules:

1. **Every page has one primary AI element** — the most important insight for that page
2. **AI speaks in the student's tutor voice** — uses the name the student chose
3. **AI never shows loading spinners for more than 2 seconds** — use skeleton screens
4. **AI never shows empty states without a suggestion** — always give the student something to do
5. **AI text is always slightly different** — never the same greeting twice

### AI Text Tone
- Direct: "Your Thermo essay is due Friday" not "You may have an assignment due soon"
- Personal: "You tend to submit late on Thursdays" not "Submission patterns detected"
- Warm: "Nice work finishing that early" not "Task completed"
- Honest: "This looks like a B+ based on your draft" not "Great job!"

---

## Onboarding Design Rules

The onboarding flow (first login) must:
1. Take under 2 minutes
2. Have exactly 3 steps: Name your tutor → Connect Canvas → Brain intro
3. Feel like meeting someone, not filling out a form
4. The tutor's name the student chooses must appear immediately in the next screen

---

## Accessibility

- Minimum contrast ratio: 4.5:1 for body text
- Minimum touch target: 44×44px
- All AI-generated text must be selectable
- No information conveyed by color alone (always add icon or label)

---

## What the AI Can Change (AI-Generated Interface)

When a student asks the tutor to change the interface:

| Request | What Changes | Stored In |
|---|---|---|
| "Make it darker" | `--bg-primary` shifts darker | `neuro.preferences` |
| "Change accent to blue" | `--accent-primary` changes | `neuro.preferences` |
| "Make text bigger" | Font scale increases | `neuro.preferences` |
| "Show assignments as timeline" | Layout variant for ASSIGNMENTS page | `neuro.preferences` |
| "Less animations" | Reduced motion mode | `neuro.preferences` |

The UI reads `neuro.preferences` on load and applies stored preferences. The tutor can modify any of these through chat.
