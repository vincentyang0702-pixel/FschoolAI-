// api/auth-migrate.js — Supabase Auth bridge (service_role; never expose to client)
// Routes:
//   POST /api/auth-migrate?action=signup  { name, email, password }
//       → creates an auth.users row (GoTrue bcrypt) + a neuroagi.users profile
//         linked via auth_id. Returns { userId } (the profile's text id).
//   POST /api/auth-migrate?action=migrate { email, password }
//       → lazy-migration for pre-Auth accounts: verifies the legacy SHA-256 hash,
//         then creates the auth.users row and links auth_id. Returns { migrated }.
//         The client then calls supabase.auth.signInWithPassword() normally.
// PLACE IN: /api/auth-migrate.js
//
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_KEY (same as api/email.js).

import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

// service_role key → bypasses RLS and unlocks auth.admin.*
// Targets the `public` schema — where the live fschoolai.com app's users table lives
// (vincent/frontend/dev: src/api/supabase.js uses { db: { schema: 'public' } }).
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: "public" }, auth: { autoRefreshToken: false, persistSession: false } }
);

// Matches the client's Web-Crypto SHA-256 (hex of UTF-8 bytes) used by the legacy
// login in src/App.jsx / extension/popup/popup.js — same input → same digest.
const sha256 = (str) => createHash("sha256").update(str, "utf8").digest("hex");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const action = req.query.action;

  // ── signup ────────────────────────────────────────────────────────────────
  if (action === "signup") {
    const { name, email: rawEmail, password } = req.body ?? {};
    if (!rawEmail || !password) return res.status(400).json({ error: "email and password required" });
    const email = rawEmail.toLowerCase().trim();

    // Reject if a profile already owns this email (mirrors the old signup guard).
    const { data: existing } = await supabase
      .from("users").select("id, auth_id").eq("email", email).maybeSingle();
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists — please log in instead." });
    }

    // Create the GoTrue user (bcrypt). email_confirm:true so they can log in now;
    // the beta verification email is still sent separately by the client via /api/email.
    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (authErr) {
      console.error("[auth-migrate/signup] createUser failed:", authErr);
      // 422 = email already registered in auth but no profile (partial prior run)
      return res.status(authErr.status === 422 ? 409 : 500).json({ error: authErr.message });
    }

    // Profile row: fresh text id (keeps existing FK shape), linked via auth_id.
    const userId = randomUUID();
    const { error: insErr } = await supabase
      .from("users").insert({ id: userId, name, email, auth_id: created.user.id });
    if (insErr) {
      // Roll back the orphaned auth user so a retry can succeed cleanly.
      await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
      console.error("[auth-migrate/signup] profile insert failed:", insErr);
      return res.status(500).json({ error: "Could not create your account. Please try again." });
    }

    return res.status(200).json({ userId, authId: created.user.id });
  }

  // ── migrate (lazy) ──────────────────────────────────────────────────────────
  if (action === "migrate") {
    const { email: rawEmail, password } = req.body ?? {};
    if (!rawEmail || !password) return res.status(400).json({ error: "email and password required" });
    const email = rawEmail.toLowerCase().trim();

    const { data: profile } = await supabase
      .from("users").select("id, auth_id, password_hash").eq("email", email).maybeSingle();

    // No such account, or already migrated (then GoTrue is the source of truth and the
    // earlier signInWithPassword already failed → genuinely wrong password). Either way
    // we don't reveal which: return 401 and let the client show "incorrect email/password".
    if (!profile || profile.auth_id) return res.status(401).json({ error: "Incorrect email or password." });

    // Verify against the legacy SHA-256 hash.
    if (!profile.password_hash || sha256(password) !== profile.password_hash) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    // Promote: create the GoTrue user with the plaintext they just proved they know.
    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (authErr) {
      console.error("[auth-migrate/migrate] createUser failed:", authErr);
      return res.status(500).json({ error: "Migration failed. Please try again." });
    }

    const { error: linkErr } = await supabase
      .from("users").update({ auth_id: created.user.id }).eq("id", profile.id);
    if (linkErr) {
      await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
      console.error("[auth-migrate/migrate] link failed:", linkErr);
      return res.status(500).json({ error: "Migration failed. Please try again." });
    }

    return res.status(200).json({ migrated: true });
  }

  // ── reset (set a new password via the email reset link) ─────────────────────
  // The client reaches here from /?reset=confirm&token=…&userId=… (token issued by
  // api/email.js ?action=reset). We validate the token, then set the password in
  // GoTrue — creating + linking the auth user if this account hasn't migrated yet.
  if (action === "reset") {
    const { userId, token, password } = req.body ?? {};
    if (!userId || !token || !password) return res.status(400).json({ error: "userId, token and password required" });

    const { data: profile } = await supabase
      .from("users").select("id, email, auth_id, email_verify_token").eq("id", userId).maybeSingle();
    if (!profile || !profile.email_verify_token || profile.email_verify_token !== token) {
      return res.status(401).json({ error: "Invalid or expired reset link." });
    }

    if (profile.auth_id) {
      const { error: updErr } = await supabase.auth.admin.updateUserById(profile.auth_id, { password });
      if (updErr) {
        console.error("[auth-migrate/reset] updateUserById failed:", updErr);
        return res.status(500).json({ error: "Could not reset password. Please try again." });
      }
    } else {
      // Account never migrated — create the GoTrue user with the new password and link it.
      const { data: created, error: authErr } = await supabase.auth.admin.createUser({
        email: profile.email, password, email_confirm: true,
      });
      if (authErr) {
        console.error("[auth-migrate/reset] createUser failed:", authErr);
        return res.status(500).json({ error: "Could not reset password. Please try again." });
      }
      await supabase.from("users").update({ auth_id: created.user.id }).eq("id", userId);
    }

    // Burn the one-time token.
    await supabase.from("users").update({ email_verify_token: null }).eq("id", userId);
    return res.status(200).json({ ok: true });
  }

  // ── adopt (merge a stale/guest uid into the caller's canonical profile) ────
  // POST /api/auth-migrate?action=adopt   Authorization: Bearer <supabase access token>
  // body { oldId }. The canonical id derives from the verified JWT (auth_id → users.id),
  // NEVER from the body — so a client can only re-key data onto its OWN profile, and only
  // from an id that is unowned or already linked to the same auth account.
  if (action === "adopt") {
    const jwt = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return res.status(401).json({ error: "Authorization required" });
    const { data: userData, error: jwtErr } = await supabase.auth.getUser(jwt);
    const authUser = userData?.user;
    if (jwtErr || !authUser) return res.status(401).json({ error: "Invalid session" });

    const { data: canonical } = await supabase
      .from("users").select("id").eq("auth_id", authUser.id).maybeSingle();
    if (!canonical) return res.status(404).json({ error: "No profile for this account" });

    const oldId = String(req.body?.oldId ?? "").trim();
    if (!oldId || oldId === canonical.id)
      return res.status(200).json({ userId: canonical.id, merged: false });

    // Never merge a profile owned by a DIFFERENT auth account (shared computer).
    const { data: oldRow } = await supabase
      .from("users").select("id, auth_id").eq("id", oldId).maybeSingle();
    if (oldRow?.auth_id && oldRow.auth_id !== authUser.id)
      return res.status(200).json({ userId: canonical.id, merged: false, refused: true });

    // Proceed even when oldRow is null — non-FK tables (rag_*, room_messages,
    // whiteboard_strokes) can hold rows for a guest uid that has no users row.
    const { error: mergeErr } = await supabase.rpc("merge_user_ids", { p_old: oldId, p_new: canonical.id });
    if (mergeErr) {
      console.error("[auth-migrate/adopt] merge failed:", mergeErr.message);
      return res.status(500).json({ error: "Could not merge accounts. Please try again." });
    }
    return res.status(200).json({ userId: canonical.id, merged: true });
  }

  return res.status(400).json({ error: "Unknown action. Use ?action=signup, ?action=migrate, ?action=reset, or ?action=adopt" });
}
