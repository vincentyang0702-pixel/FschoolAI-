# Instagram Social Signal Integration
## FschoolAI × NeuroAGI Brain — Gap Analysis & Architecture

> **The "AI Friend" model: how FschoolAI reads the student's social world through Instagram without OAuth, without permission dialogs, and without breaking trust.**

---

## The Concept

Instead of asking a student to connect their Instagram account — which feels clinical, invasive, and like handing over a key to their private life — FschoolAI runs its own Instagram Business account. The student adds it as a friend. From that moment, the AI can see what the student chooses to share with it: stories forwarded in DMs, reels sent as messages, late-night texts about exams. The same way a real friend would.

This is not a workaround. It is the correct product model. The distinction between "grant OAuth access to your account" and "DM your AI tutor like you DM a friend" is the difference between a surveillance tool and a trusted relationship. The data captured is identical. The trust dynamic is completely different.

---

## What Composio Provides

Composio's Instagram toolkit (36 tools, Business/Creator accounts only) gives the AI everything it needs to operate as a social presence:

| Composio Tool | What It Does for the Brain |
|---|---|
| `INSTAGRAM_LIST_ALL_MESSAGES` | Reads every DM in the AI account's inbox — text, forwarded reels, story replies |
| `INSTAGRAM_GET_CONVERSATION` | Reads a specific conversation thread with a student |
| `INSTAGRAM_GET_IG_USER_STORIES` | Reads stories from accounts the AI follows (public accounts only) |
| `INSTAGRAM_SEND_TEXT_MESSAGE` | AI replies naturally in the DM thread |
| `INSTAGRAM_SEND_IMAGE` | AI sends images, study cards, or visual responses |
| `INSTAGRAM_MARK_SEEN` | Marks messages as read — signals active presence |
| `INSTAGRAM_LIST_ALL_CONVERSATIONS` | Scans all active student conversations for new signals |
| Composio Triggers | Webhook fires the moment a new DM arrives — zero polling lag |

**Critical constraint:** Composio's Instagram integration requires a Business or Creator account. The AI tutor account (`@FschoolAI` or `@ReggieAI`) must be a Business account. The student's personal account has no restrictions — they follow and DM normally.

---

## Gap Analysis — What's Missing

The audit of the FschoolAI codebase (as of June 2026) reveals the following gaps between the vision and what's actually built:

### Gap 1 — No Instagram Ingest Route (Severity: Critical)

**What exists:** `POST /api/signals/ingest`, `POST /api/signals/batch`, `POST /api/signals/canvas`, `POST /api/signals/session`

**What's missing:** `POST /api/signals/instagram` — a dedicated route that receives Composio webhook payloads, parses Instagram DM content, and converts it into structured brain signals.

**Fix:** Add a new route `POST /api/signals/instagram` that:
1. Validates the Composio webhook signature
2. Parses the message payload (text, media type, forwarded content)
3. Calls a new `InstagramSignalExtractor` service to run Claude over the content
4. Writes structured signals to `brain.signals`

---

### Gap 2 — No Instagram Signal Types in the Schema (Severity: Critical)

**What exists:** The `signal_types` comment in `signal-ingestion.ts` lists: `behavioral, emotional, academic, sleep, stress, momentum, context, knowledge, outcome, voice, biometric, expression, app_usage, social, location, temporal, intervention_response, canvas_event, manual`

**What's missing:** The `social` signal type exists as a label but has no defined subtypes for Instagram-specific signals. There is no schema for:
- `social_interest` — topic the student is consuming
- `social_mood` — emotional tone of what they're sharing
- `social_timing` — time-of-day activity pattern from Instagram
- `social_content_type` — reel vs. story vs. text vs. meme
- `social_academic_link` — when shared content connects to a course topic

**Fix:** Add a migration that seeds these subtypes into `brain.signal_types` and documents the `value_json` schema for each.

---

### Gap 3 — No Instagram Signal Extractor Service (Severity: Critical)

**What exists:** Signal ingestion accepts raw `value_json` but has no service that reads Instagram DM content and extracts structured signals from it.

**What's missing:** An `InstagramSignalExtractor` service that:
1. Receives raw DM content (text, reel URL, story reply)
2. Calls Claude with a structured extraction prompt
3. Returns: `{ topic, sentiment, academic_relevance, content_type, urgency, knowledge_signals[] }`
4. Maps extracted fields to `brain.signals` rows

**Fix:** Build `server/services/instagram-signal-extractor.ts` — the Claude-powered parser that turns a forwarded reel about quantum mechanics into a `social_interest` signal with `topic: "quantum_computing"`, `academic_relevance: 0.7`, and a linked `knowledge` signal.

---

### Gap 4 — No Composio Webhook Handler (Severity: Critical)

**What exists:** The codebase has no webhook infrastructure at all. There is no route that receives external event triggers.

**What's missing:** A Composio trigger listener that fires when:
- A new DM arrives in the AI's Instagram inbox
- A student replies to a story
- A student sends a reel

**Fix:** Add `POST /api/webhooks/composio` — validates Composio's HMAC signature, routes the event to the appropriate handler (Instagram DM, future: Gmail, Calendar, etc.), and responds with `200 OK` within 3 seconds to prevent Composio from retrying.

---

### Gap 5 — Brain Context Window Does Not Read Social Signals (Severity: High)

**What exists:** `brain-context-window.ts` reads: stress signals, momentum signals, upcoming deadlines, pending interventions, voice preferences, confirmed hypotheses.

**What's missing:** The context window has no awareness of what the student has been consuming on Instagram. When Claude builds the context for a tutoring session, it does not know that the student spent 2 hours watching physics reels last night, or that they DM'd the AI at midnight saying they're stressed about their exam.

**Fix:** Add a `social_context` block to the context window builder that reads the last 48 hours of `social_*` signals and summarizes: recent interests, mood signals, academic links, and any direct DMs. This gives every tutoring session awareness of the student's social world.

---

### Gap 6 — Proactive Intervention Engine Has No Instagram Delivery Channel (Severity: High)

**What exists:** `brain-intervention-delivery.ts` delivers interventions via SSE (Server-Sent Events) to the FschoolAI frontend only. The proactive intervention engine decides what to say and when — but can only push to the in-app chat.

**What's missing:** An Instagram DM delivery channel. If the student is not in the FschoolAI app, the intervention never reaches them. The vision — "AI reaches out to you like a friend" — requires the AI to DM the student on Instagram when the intervention fires.

**Fix:** Add an `InstagramDeliveryChannel` to `brain-intervention-delivery.ts` that uses `INSTAGRAM_SEND_TEXT_MESSAGE` via Composio when:
- The student has linked their Instagram
- The intervention urgency is `medium` or higher
- The student has not opened the FschoolAI app in the last 2 hours

---

### Gap 7 — No Student Instagram Linking Flow (Severity: High)

**What exists:** No onboarding step for Instagram. Students cannot currently connect their Instagram presence to their brain.

**What's missing:** An onboarding card in FschoolAI that says: "Add @FschoolAI on Instagram to unlock social learning." When the student DMs the AI account for the first time, the AI asks for their FschoolAI email to link the accounts. Once linked, their `person_id` is stored against their Instagram sender ID in a `brain.instagram_links` table.

**Fix:** Build the linking flow: onboarding card → student DMs the AI → AI asks for email → match to `persons` table → store `instagram_sender_id` → all future DMs from that sender are routed to their brain.

---

### Gap 8 — No Rate Limiting or Signal Deduplication for Social Signals (Severity: Medium)

**What exists:** Signal ingestion has no deduplication logic. The same signal can be written multiple times if the webhook fires more than once.

**What's missing:** Idempotency keys on the Composio webhook handler, and a deduplication check in the Instagram ingest route that prevents the same DM from being processed twice.

**Fix:** Add `composio_event_id` as a unique index on `brain.signals` for Instagram-sourced signals. Check before insert.

---

### Gap 9 — Story Visibility Limitation Not Handled (Severity: Low)

**What exists:** The architecture doc describes the AI "seeing the student's stories" — but this is only possible for public accounts or stories explicitly shared to the AI's DM.

**What's missing:** Clarity in the codebase and user-facing copy about what the AI can and cannot see. The `INSTAGRAM_GET_IG_USER_STORIES` tool only reads stories from accounts the AI follows — and only if those accounts are public or have shared the story directly.

**Fix:** The onboarding copy should say: "Share stories and reels with @FschoolAI in DMs — the AI will use them to understand what you're interested in." Do not promise passive story viewing. The active sharing model is actually better for trust.

---

## The Complete Integration Architecture

```
Student DMs @FschoolAI on Instagram
        ↓
Composio Trigger fires → POST /api/webhooks/composio
        ↓
Webhook handler validates HMAC signature
        ↓
Routes to InstagramDMHandler
        ↓
Looks up student by instagram_sender_id → gets person_id
        ↓
InstagramSignalExtractor runs Claude over message content:
  Input:  { text, media_type, forwarded_reel_url, story_reply_context }
  Output: { topic, sentiment, academic_relevance, content_type, urgency, knowledge_signals[] }
        ↓
Signals written to brain.signals:
  signal_type: 'social'
  subtype: 'social_interest' | 'social_mood' | 'social_academic_link'
  value_json: { topic, sentiment, content_type, academic_relevance }
  source: 'instagram_dm'
        ↓
If academic_relevance > 0.5:
  Also write to brain.knowledge:
  { concept, domain, source: 'instagram', confidence: 0.4 }
        ↓
Signal ingestion checks urgency threshold
        ↓
If urgency = 'high' (e.g., student DMs "I'm so stressed about my exam"):
  ProactiveInterventionEngine fires
  InstagramDeliveryChannel sends response via INSTAGRAM_SEND_TEXT_MESSAGE
        ↓
Brain context window updated:
  social_context block now includes this signal
  Next tutoring session knows what the student was consuming
```

---

## What the Brain Learns from Instagram

This is the data layer that Canvas cannot provide. Canvas tells you what grade the student got. Instagram tells you who they actually are outside the classroom.

| Signal | Example | What the Brain Learns |
|---|---|---|
| **Interest mapping** | Student forwards a reel about quantum computing | "Curious about physics beyond coursework — link to PHYS 201 assignment" |
| **Stress signals** | Student DMs at 2am: "I can't do this anymore" | "Anxiety spike, deadline pressure — trigger check-in intervention" |
| **Learning style** | Student shares a 20-minute video essay vs. a 60-second explainer | "Prefers depth over speed — adjust tutoring pacing" |
| **Self-awareness** | Student sends a meme about procrastination | "Aware of avoidance behavior — don't lecture, mirror and redirect" |
| **Social context** | Student shares a reel from a trip they took | "Just returned from travel — use travel context in next assignment example" |
| **Time patterns** | Student is active on Instagram at 11pm–1am | "Night owl — schedule interventions for evening, not morning" |

None of this requires a form, a survey, or an OAuth dialog. It happens through behavior the student already exhibits naturally.

---

## Build Order

| Priority | What to Build | Estimated Effort |
|---|---|---|
| 1 | `POST /api/webhooks/composio` — webhook handler with HMAC validation | 1 day |
| 2 | `brain.instagram_links` table + student linking flow | 1 day |
| 3 | `InstagramSignalExtractor` service (Claude-powered parser) | 2 days |
| 4 | `POST /api/signals/instagram` route | 0.5 days |
| 5 | Social signal subtypes migration | 0.5 days |
| 6 | Brain context window `social_context` block | 1 day |
| 7 | `InstagramDeliveryChannel` in intervention delivery | 1 day |
| 8 | Onboarding card + Instagram linking UX | 1 day |
| 9 | Deduplication / idempotency keys | 0.5 days |

**Total: ~8–9 days of engineering.** This is the complete social signal layer — from student DM to brain signal to proactive AI response back in Instagram.

---

## Gaps Summary Table

| Gap | Severity | Status | Fix Required |
|---|---|---|---|
| No Instagram ingest route | Critical | Missing | Build `POST /api/signals/instagram` |
| No Instagram signal subtypes | Critical | Missing | DB migration for `social_*` subtypes |
| No Instagram signal extractor | Critical | Missing | Build `instagram-signal-extractor.ts` |
| No Composio webhook handler | Critical | Missing | Build `POST /api/webhooks/composio` |
| Context window ignores social signals | High | Missing | Add `social_context` block |
| No Instagram delivery channel | High | Missing | Add to `brain-intervention-delivery.ts` |
| No student Instagram linking flow | High | Missing | Build onboarding card + `brain.instagram_links` |
| No signal deduplication | Medium | Missing | Idempotency keys on webhook |
| Story visibility not handled in UX | Low | Misleading copy | Fix onboarding copy |

---

## Positioning

> "FschoolAI's AI tutor is the first AI that learns about you the way a friend does — not by asking for your data, but by being present in your life. Add it on Instagram. Share what you're watching. DM it when you're stressed. The more you treat it like a friend, the better it knows you — and the better it can help you."

This is the trust model that makes FschoolAI different from every other AI tutor. Not a form. Not an OAuth dialog. A friendship.

---

*Document version: 1.0 — June 2026*
*Repo: vincentyang0702-pixel/neuroagi-core*
