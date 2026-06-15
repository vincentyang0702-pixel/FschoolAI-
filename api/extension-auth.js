/**
 * api/extension-auth.js — Secure auth proxy for Chrome extension popup
 *
 * WHY THIS EXISTS:
 *   The extension popup previously used a hardcoded publishable anon key to
 *   query the users table directly. This endpoint replaces those calls so no
 *   Supabase keys are stored in the extension bundle.
 *
 * ACTIONS:
 *   login   — verify email + password_hash, return user row
 *   signup  — create new user (or return existing if credentials match)
 *   profile — fetch user profile by userId (for session restore)
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: "public" } }
);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "POST only" });

  const { action, email, passwordHash, name, userId } = req.body ?? {};

  if (!action) return res.status(400).json({ error: "action is required" });

  try {
    switch (action) {

      // ── Login ────────────────────────────────────────────────────────────
      case "login": {
        if (!email || !passwordHash) {
          return res.status(400).json({ error: "email and passwordHash required" });
        }
        const { data: rows, error } = await supabase
          .from("users")
          .select("id, name, email, brain_person_id")
          .eq("email", email.toLowerCase())
          .eq("password_hash", passwordHash)
          .limit(1);
        if (error) throw error;
        if (!rows?.length) {
          return res.status(401).json({ error: "Incorrect email or password" });
        }
        return res.status(200).json({ ok: true, user: rows[0] });
      }

      // ── Signup ───────────────────────────────────────────────────────────
      case "signup": {
        if (!email || !passwordHash || !name) {
          return res.status(400).json({ error: "email, passwordHash, and name required" });
        }
        const normalizedEmail = email.toLowerCase();

        // Check if email already exists
        const { data: existing } = await supabase
          .from("users")
          .select("id, name, email")
          .eq("email", normalizedEmail)
          .limit(1);

        if (existing?.length) {
          // Verify password matches
          const { data: match } = await supabase
            .from("users")
            .select("id, name, email")
            .eq("email", normalizedEmail)
            .eq("password_hash", passwordHash)
            .limit(1);
          if (match?.length) return res.status(200).json({ ok: true, user: match[0] });
          return res.status(409).json({ error: "Email already registered. Please log in instead." });
        }

        // New user — generate UUID and create account
        const id = crypto.randomUUID();
        const { data: rows, error } = await supabase
          .from("users")
          .insert({ id, name, email: normalizedEmail, password_hash: passwordHash })
          .select("id, name, email");
        if (error) throw error;
        const user = rows?.[0] ?? { id, name, email: normalizedEmail };
        return res.status(201).json({ ok: true, user });
      }

      // ── Profile (session restore) ─────────────────────────────────────────
      case "profile": {
        if (!userId) return res.status(400).json({ error: "userId required" });
        const { data: user, error } = await supabase
          .from("users")
          .select("id, name, email, brain_person_id")
          .eq("id", userId)
          .maybeSingle();
        if (error) throw error;
        if (!user) return res.status(404).json({ error: "User not found" });
        return res.status(200).json({ ok: true, user });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("[extension-auth] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
