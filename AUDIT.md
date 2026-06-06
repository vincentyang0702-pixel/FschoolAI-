# NeuroAgi — Full Audit (website + extension)

**Date:** 2026-06-05 · **Trigger:** switching from one account to another showed the *same* courses on both.

**Root cause of the reported bug (confirmed):** there is only **one** row in `neuroagi.users` — its email/name was overwritten from the friend's account to yours, and all 23 courses + 87 assignments hang off that single id. Two "accounts" became one database row. See C1.

Legend: **[FIXED]** done in this pass · **[TODO]** needs a follow-up (often a decision or the auth project).

---

## CRITICAL

### C1 — Accounts collapse into one row (the reported bug) **[FIXED]**
- **Where:** `src/pages/Identity.jsx:58-61` (sign-out) + `src/App.jsx:159-202` (signup) + `src/context/AppContext.jsx:20` (`userId` is `useState`, only re-reads on full reload).
- **Mechanism:** Sign-out cleared `fschool_logged_in`/`fschool_name` but **left `fschool_uid`**. The next signup wrote `{ id: userId /* the stale uid */ }` with `upsert(onConflict:"id")` → overwrote the previous user's row. Both logins now resolve to one id, one set of courses.
- **Fix applied:** (1) sign-out now clears `fschool_uid`, `fschool_name`, `sa_onboarding_draft`, `fschool_logged_in`; (2) signup **mints a fresh `crypto.randomUUID()`** per new account and uses `insert` (never overwrites), then reloads so the context re-initializes as the new user (onboarding resumes via a `fschool_pending_onboarding` flag); (3) duplicate-email signup now errors "please log in" instead of silently adopting the account.

### C2 — Open RLS + shipped anon key = full data breach **[TODO — needs auth project]**
- **Where:** `supabase-neuroagi-schema.sql:161` (`for all using (true) with check (true)`) + `:167-170` (`grant all ... to anon`); anon key shipped in `src/supabase.js:3-4`, `extension/popup/popup.js:4-5`, `extension/background.js:6-7`.
- **Exposure:** Anyone with the (public, shipped) key can `GET /rest/v1/users?select=*` with `Accept-Profile: neuroagi` and **dump every user** — `email`, `password_hash`, **`canvas_token`** (a live Canvas credential), `gpa`, school, location — and can also overwrite/delete any row (`with check (true)`, bulk PATCH/DELETE). The UUID identity protects nothing because rows return with no `user_id` filter.
- **Fix (real work):** adopt **Supabase Auth** so `auth.uid()` is populated; make policies owner-scoped (`using (user_id = auth.uid()::text)`); `revoke all on neuroagi.users from anon`; never `select` `password_hash`/`canvas_token` from the client. This is the #1 thing to fix and pairs with Pratik's auth work.

### C3 — Password auth is a client-side hash match against a world-readable table **[TODO — needs auth project]**
- **Where:** `src/App.jsx:142-152`, `extension/popup/popup.js:52-59`.
- **Problems:** unsalted **SHA-256 computed in the browser**; login = "does `password_hash` column equal this value"; the hash is selectable (C2), so an attacker who dumps the table can authenticate as anyone by replaying the stored hash — no cracking needed. The "session" is just `localStorage.fschool_uid`; set it to any id and you're that user.
- **Fix:** server-side auth with a salted slow KDF (bcrypt/argon2); real session tokens; never expose `password_hash`.

### C4 — `canvas_token` stored in plaintext, client-readable **[TODO]**
- **Where:** `users.canvas_token` (`supabase-neuroagi-schema.sql:32`).
- **Impact:** under C2 this hands an attacker every student's live Canvas account. Even after RLS is fixed, a third-party credential shouldn't sit in a client-`select`able table. Move to a `service_role`-only table / Supabase Vault; rotate all existing tokens after C2 lands.

---

## HIGH

### H1 — Extension & web app can mint divergent ids for the same person **[TODO — decision]**
- **Where:** `extension/popup/popup.js:62-70` (extension signup uses its own `randomUUID()`) vs `src/App.jsx` (web keys by `fschool_uid`).
- **Impact:** if a person signs up in the extension and separately in the web app, data lands under two different ids and the surfaces don't see each other. Ids only converge if the user always uses **Log In** (which reads the real row id).
- **Fix (decision):** make the extension **login-only** (web app owns account creation), or have extension signup adopt the existing row id on email match. Tie to the identity/auth cleanup.

### H2 — Extension doesn't clear the previous user on account switch **[FIXED]**
- **Where:** `extension/popup/popup.js:74` (`clearSession`) + login/signup handlers.
- **Impact:** `neuroagi_captures`/`neuroagi_stats`/`neuroagi_captured_urls` from user A persisted into user B's popup (showed A's progress; suppressed B's auto-capture for 30 min/URL).
- **Fix applied:** `clearSession` now also removes `neuroagi_captured_urls`; login/signup call a `switchToUser` helper that clears the prior session when the incoming user id differs.

### H3 — Auto-capture can attribute one user's data to another (stale-user race) **[TODO]**
- **Where:** `extension/content/universal.js:96-141` reads `neuroagi_user` once, fires 2.5s after load on `<all_urls>`; `background.js` trusts `msg.userId` blindly.
- **Fix:** re-read `neuroagi_user` immediately before sending; stamp captures with the user id and verify it's still active before persisting.

### H4 — Dual course-key produces duplicate course rows **[TODO]**
- **Where:** API path keys `courses.canvas_course_id` by the **numeric** LMS id (`background.js` `ingestApiData`); scrape path keys by `deriveCode(name)` **text** (`ingestStructured:142`).
- **Impact:** if both the API sync and a scrape/auto-capture run for the same course, you get **two rows** (e.g. `423038` and `vpac16h3`), double-counting courses + conflicting `current_score`.
- **Fix:** pick one canonical key. Prefer the API path; when it succeeds, don't also run the scrape ingest for that portal (we already short-circuit on API success in the popup — but the always-on `universal.js` auto-capture can still write scrape rows; gate it off when an API sync exists).

### H5 — `ingestApiData` can orphan assignments silently **[TODO]**
- **Where:** `extension/background.js` — the `courses?select=id,canvas_course_id` map fetch is wrapped in `catch {}`; if it fails, `refToId` is empty and every assignment is inserted with `course_id: null`.
- **Fix:** don't swallow that fetch failure; if courses were written but the map is empty, abort/retry rather than writing null FKs. (Note: the `sbUpsert`-throws fix from the earlier pass already surfaces write failures — this is the read-back step.)

---

## MEDIUM

### M1 — Auto-capture is `<all_urls>` + broad keyword matching **[TODO]**
- **Where:** `extension/manifest.json:8,19`; `extension/content/universal.js:6-12`.
- **Impact:** any site with "home/dashboard/grades/results/progress/schedule" in the URL triggers a full page scrape + a Claude proxy call and can write junk into `courses`/`assignments`. Privacy + cost + data-quality.
- **Fix:** scope `content_scripts.matches`/auto-capture to detected LMS domains (or only run when an LMS global like `window.ENV`/`M.cfg` is present).

### M2 — PII/page content logged to console **[TODO]**
- **Where:** `extension/background.js:273-280` logs up to 600 chars of scraped page text, tables, course ids, full Claude response; also Supabase error bodies.
- **Fix:** remove or gate behind a debug flag (student grades/names are PII).

### M3 — Auto-crawl learns a template from the first course and can poison all **[TODO]**
- **Where:** `extension/background.js` `autoCrawl` `toTemplate`/`fillTemplate` + `savePattern`.
- **Impact:** if the course id is a short/common substring, `toTemplate`'s string-replace corrupts the template; it's cached per-domain with no validation, so a bad first learn poisons future syncs.
- **Fix:** validate a learned template returned data before caching; bound the id-substitution to path segments. (Lower priority now that the API path is primary.)

### M4 — Missing indexes + nullable FKs **[TODO]**
- **Where:** `supabase-neuroagi-schema.sql` — no `user_id` index on `chat_logs`/`tutor_impressions`/`beta_sessions`; no `assignments(course_id)` index; all `user_id`/`course_id` FKs nullable.
- **Fix:** add indexes; add `not null` to ownership FKs (do during the auth migration since `users.id` changes then).

### M5 — Onboarding draft / display name leak across users **[PARTIALLY FIXED]**
- **Where:** `sa_onboarding_draft` (`Onboarding.jsx`) + `fschool_name` fallback used by Work/Identity/Toolkit/ShareCard.
- **Fix applied:** sign-out now clears `sa_onboarding_draft` + `fschool_name`. **[TODO]** login should also unconditionally set/clear `fschool_name` even when the matched user's `name` is null (currently `if (user.name)` only).

### M6 — Auto-capture step accounting mislabels/double-writes **[TODO]**
- **Where:** `extension/content/universal.js:114-133` — dedupe keyed only on `step`; multiple grades pages → one step but two writes; "schedule" pages mislabeled.
- **Fix:** rework step accounting or drop the 3-step model now that API sync does it in one shot.

---

## LOW

- **L1 — Duplicate `style` attribute** in `src/pages/Assignment.jsx:392-394` — the second `style` silently overrides the first (drops `WebkitTouchCallout`). Pre-existing. **[TODO]**
- **L2 — `appendBlob` dead code** (`background.js`) → extension-only users never get `canvas_data` blobs the web app's `loadCanvasData` reads (announcements/modules/syllabus), so their app is half-populated. **[TODO]**
- **L3 — Partial success reported as full** — a course whose assignments 401 is silently skipped but UI says "Synced ✓ — N assignments". **[TODO]**
- **L4 — `getCurrentStats` "grades"** counts only assignment scores, while the popup success line counts course+assignment grades — two definitions, one label. **[TODO]**
- **L5 — Email verification is decorative** — signup completes regardless; nothing checks a verified flag (no column exists). **[TODO]**
- **L6 — `crypto.randomUUID()` exists** — replace the hand-rolled `randomUUID` in the extension. **[TODO]**
- **L7 — Never run `supabase-schema.sql` against the shared project** — its `drop policy ... on storage.objects` lines would clobber Vincent's project-global storage policies. Use `supabase-neuroagi-schema.sql` only. **[INFO]**

---

## Remediation roadmap (suggested order)
1. **[DONE this pass]** Identity-collapse fixes (C1, H2, M5-partial) — unblocks correct multi-account behavior.
2. **Auth + RLS overhaul (C2/C3/C4)** — the real security fix; pairs with Pratik's auth work. Until then, treat all current data (esp. every `canvas_token`) as exposed.
3. **Identity unification (H1)** — one account model across web + extension.
4. **Sync correctness (H4/H5, M1/M3/M6)** — single canonical course key, scope auto-capture to LMS domains, harden ingest.
5. **Schema hardening (M4)** + cleanup (L1-L6).
