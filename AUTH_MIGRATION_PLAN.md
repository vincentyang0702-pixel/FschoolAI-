# Auth Migration Plan — hand-rolled login → Supabase Auth

> **⚠️ CORRECTION (2026-06-14): target is the `public` schema, not `neuroagi`.**
> The live app at **fschoolai.com** is built from **`vincent/frontend/dev`** and uses
> **`public.users`** + client-side SHA-256. An earlier draft of this plan (and the
> `neuroagi.users.auth_id` column run on 2026-06-12) targeted the wrong tree — harmless
> but inert. The design below is unchanged; mentally substitute **`public`** for every
> `neuroagi` reference, and note the **file-by-file diffs must be re-authored against
> `vincent/frontend/dev`'s files** (App.jsx login is ~L230-236, plus an existing SHA-256
> password-reset flow at ~L140-142 that also needs migrating). Deploy lands on
> `vincent/frontend/dev` (Vincent's prod). See [[deployment-topology]].

**Goal:** Replace the custom SHA-256-against-`public.users` login with Supabase Auth
(GoTrue), which owns the `auth` schema and does proper bcrypt salting + sessions + JWTs.

**Key correction to the framing:** This is *not* an `ALTER TABLE … SET SCHEMA`. The
`auth` schema is managed by GoTrue — you don't move a table into it, you adopt the Auth
API and let GoTrue manage `auth.users`. Our `neuroagi.users` table stays as a **profile
table** and gains an `auth_id` link. No FKs move.

---

## Current state (what we're replacing)

| Path | What it does |
|------|--------------|
| [src/api/auth.js](src/api/auth.js) | `signUp`/`signIn` helpers — SHA-256, queries `neuroagi.users`. **Unused by App.jsx.** |
| [src/App.jsx:143-205](src/App.jsx#L143) | The login/signup the web app actually runs (inline SHA-256). |
| [extension/popup/popup.js:55-73](extension/popup/popup.js#L55) | Extension login/signup — raw REST + anon key against `neuroagi.users`. |
| [src/context/AppContext.jsx:10-20](src/context/AppContext.jsx#L10) | Identity = `crypto.randomUUID()` in `localStorage.fschool_uid`. No JWT. |
| schema files | RLS is `open_all USING (true)` everywhere because `auth.uid()` is null. |

`neuroagi.users.id` is **`text`** (client UUID). `courses`/`assignments`/`files.user_id`
all FK to it. `auth.users.id` is `uuid`. We bridge rather than re-key everything.

---

## The one decision that drives everything: password migration

SHA-256 hashes **cannot** be imported into GoTrue (bcrypt). Existing accounts need an
`auth.users` row created fresh. Two options:

| | **A. Force reset** | **B. Lazy migrate** (recommended) |
|---|---|---|
| How | Bulk-create auth users with random pwds, email everyone a reset link | On next login, verify old SHA-256 once, then create the auth user with the plaintext they typed |
| User friction | Everyone must reset | Zero — transparent |
| Code | One backfill script | A server endpoint + login fallback path |
| Risk | Inboxes/deliverability | Slightly more logic |

Both need a **Vercel serverless function with the `service_role` key** (admin
`createUser` can't run client-side). We already have `api/email.js` as a pattern.

> **Need Aryan/Johan to pick A or B before I touch client code.** The rest assumes B.

---

## Phased rollout (each phase is independently shippable)

### Phase 0 — Supabase dashboard config
- Auth → Providers → Email: enable Email/Password.
- Decide email confirmation. Recommend **off initially** (we already have our own
  `api/email.js` verification flow) so signup doesn't double-gate. Can enable later.
- Confirm the project (`wqgxpouhbwhwpzudrptp`) — Auth lives at `/auth/v1`, independent
  of the `neuroagi` data schema. They coexist fine.

### Phase 1 — DB bridge (`supabase-auth-migration.sql`, Phase 1 block)
Add `neuroagi.users.auth_id uuid references auth.users(id)` + unique index. Additive,
safe to run now. Keep `password_hash` until backfill is done.

### Phase 2 — Server migration endpoint  *(new file: `api/auth-migrate.js`)*
Service-role function with two actions:
- `signup`: `admin.createUser({ email, password, email_confirm: true })` → insert
  `neuroagi.users` profile row (fresh text `id`) with `auth_id` set.
- `migrate` (lazy): given email+password, verify SHA-256 against the existing profile;
  on match, `admin.createUser`, set `auth_id`, return the access token.

### Phase 3 — Web app swap
**[src/api/auth.js](src/api/auth.js)** — replace body:
```js
import { supabase } from './supabase.js';

export async function signIn(email, password) {
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // lazy-migration fallback for pre-Auth accounts
    const res = await fetch('/api/auth-migrate?action=migrate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Incorrect email or password.');
    ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
    if (error) throw error;
  }
  return data.user;            // session is now stored by supabase-js automatically
}

export async function signUp({ name, email, password }) {
  const res = await fetch('/api/auth-migrate?action=signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? 'Could not create account.');
  await supabase.auth.signInWithPassword({ email, password });
}
```
(Both `src/supabase.js` and `src/api/supabase.js` need `auth: { persistSession: true }` —
it's the default, just confirm no `persistSession:false` is set.)

**[src/App.jsx:143-205](src/App.jsx#L143)** — delete the inline SHA-256 blocks; call
`signIn`/`signUp` from `auth.js`. Drop the `localStorage.fschool_uid` writes — the
session is now the source of truth. Keep the `fschool_pending_onboarding` reload flow.

**[src/context/AppContext.jsx:10-20](src/context/AppContext.jsx#L10)** — replace
`getOrCreateUserId()`:
```js
// resolve identity from the Auth session, map auth.uid → profile.id (text)
const [userId, setUserId] = useState(null);
useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return;                       // not logged in
    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', session.user.id).maybeSingle();
    setUserId(profile?.id ?? null);
  });
  const { data: sub } = supabase.auth.onAuthStateChange(() => location.reload());
  return () => sub.subscription.unsubscribe();
}, []);
```
Everything downstream keeps using `userId` (the text profile id) unchanged — so
`canvasSync`, `files`, `courses`, `updateUserField` all keep working with zero edits.

**Logout** (`src/pages/Identity.jsx`) — add `await supabase.auth.signOut();` before the
`localStorage.remove` calls.

### Phase 4 — Extension swap (`extension/popup/popup.js`)
GoTrue is reachable over plain REST, so no supabase-js needed:
```js
async function login(email, password) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Incorrect email or password');
  // fetch profile id using the new access token
  const prof = await sbFetch(`users?auth_id=eq.${j.user.id}&select=id,name,email`, {
    headers: { Authorization: `Bearer ${j.access_token}` },
  });
  await chrome.storage.local.set({ neuroagi_token: j.access_token, neuroagi_refresh: j.refresh_token });
  return prof[0];
}
```
Then `sbFetch` should send `Authorization: Bearer <stored access_token>` instead of the
anon key once logged in — that's also what makes Phase 5 RLS work for the extension.
Signup → call `api/auth-migrate?action=signup` (same endpoint as the web app).

### Phase 5 — Tighten RLS (`supabase-auth-migration.sql`, Phase 2 block)
Only after Phases 3+4 are deployed and confirmed sending JWTs. Swap `open_all` for
owner-scoped policies. **This is the actual security win** (closes the open-RLS + anon-key
hole in AUDIT.md). Ship it as its own step so a regression is easy to bisect.

### Phase 6 — Cleanup
Once `select count(*) from neuroagi.users where auth_id is null` is ~0 for active users:
drop `password_hash`, delete the dead `sha256` helpers, remove the lazy-migrate fallback.

---

## Blast radius / gotchas
- **Two clients, three login paths** — all three must change or login diverges between
  web and extension.
- **`auth.uid()` only resolves when a real JWT is sent.** The app gets this free via
  supabase-js; the extension must attach the access token to every REST call. Until both
  do, RLS must stay open (hence Phase 5 last).
- **`brain_person_id` bridge** (FschoolAI wiring) keys off our identity — verify it maps
  from `auth_id`/profile, not the old `fschool_uid`.
- **Existing localStorage `fschool_uid`** on returning users is now ignored; their first
  login re-establishes identity via the session. Worth a one-time "please log in again."
- **No data is destroyed** in Phases 1-4; everything is reversible until Phase 6.

## Suggested PR sequence
1. `sql: auth bridge column` (Phase 1) — mergeable immediately.
2. `feat: api/auth-migrate endpoint` (Phase 2).
3. `feat: web app on Supabase Auth` (Phase 3).
4. `feat: extension on Supabase Auth` (Phase 4).
5. `sql: scope RLS to auth.uid()` (Phase 5).
6. `chore: drop password_hash + dead SHA-256` (Phase 6).
