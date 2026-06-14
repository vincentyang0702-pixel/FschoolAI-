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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

  return res.status(400).json({ error: "Unknown action. Use ?action=signup or ?action=migrate" });
}
