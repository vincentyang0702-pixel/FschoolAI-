// api/email.js — unified email handler (merged from send-verify + verify-email)
// Routes:
//   POST /api/email?action=send   — generate token, store on user, send via Resend
//   GET  /api/email?action=verify&token=X&userId=Y — mark verified, redirect to app
// PLACE IN: /api/email.js

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: "neuroagi" } }  // app data lives in `neuroagi`, not public.* (Vincent's)
);
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const action = req.query.action;

  // ── POST /api/email?action=send ──────────────────────────────────────────
  if (action === "send") {
    if (req.method !== "POST") return res.status(405).end();

    const { userId, email, name } = req.body;
    if (!userId || !email) return res.status(400).json({ error: "userId and email required" });

    // Generate a secure random token
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

    // Store token + mark beta signup + set 30-day free period
    const { error } = await supabase
      .from("users")
      .update({
        email_verify_token:   token,
        email_verify_sent_at: new Date().toISOString(),
        beta_signup:          true,
        beta_expires_at:      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("[email/send] supabase update failed:", error);
      return res.status(500).json({ error: "Failed to store token" });
    }

    const verifyUrl = `https://fschoolai.com/api/email?action=verify&token=${token}&userId=${userId}`;

    try {
      await resend.emails.send({
        from:    "FSchoolAI <noreply@fschoolai.com>",
        to:      email,
        subject: "Verify your FSchoolAI account",
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;max-width:480px;margin:0 auto;padding:48px 24px;background:#fff;">
            <div style="margin-bottom:32px;">
              <span style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#999;font-weight:500;">FSchoolAI Beta</span>
            </div>
            <h2 style="font-size:24px;font-weight:700;color:#111;margin:0 0 12px;letter-spacing:-0.5px;">
              Welcome${name ? `, ${name}` : ""}.
            </h2>
            <p style="color:#555;margin:0 0 32px;line-height:1.7;font-size:15px;">
              You're in the beta. Verify your email to activate your free 1-month subscription and unlock full access.
            </p>
            <a href="${verifyUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">
              Verify my email →
            </a>
            <p style="color:#bbb;font-size:12px;margin-top:40px;line-height:1.6;">
              This link expires in 24 hours.<br>If you didn't sign up for FSchoolAI, you can safely ignore this email.
            </p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("[email/send] resend failed:", emailErr.message);
      // Don't fail the signup — user row is already created
      return res.status(200).json({ success: true, emailSent: false });
    }

    return res.status(200).json({ success: true, emailSent: true });
  }

  // ── GET /api/email?action=verify&token=X&userId=Y ────────────────────────
  if (action === "verify") {
    if (req.method !== "GET") return res.status(405).end();

    const { token, userId } = req.query;
    if (!token || !userId) return res.redirect("/?verify=error&reason=missing");

    const { data: user, error } = await supabase
      .from("users")
      .select("id, email_verify_token, email_verify_sent_at, email_verified")
      .eq("id", userId)
      .maybeSingle();

    if (error || !user) return res.redirect("/?verify=error&reason=not_found");
    if (user.email_verified) return res.redirect("/?verify=already_done");
    if (user.email_verify_token !== token) return res.redirect("/?verify=error&reason=invalid_token");

    // Check token not older than 24 hours
    const sentAt     = new Date(user.email_verify_sent_at);
    const hoursSince = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 24) return res.redirect("/?verify=error&reason=expired");

    // Mark verified + clear token
    const { error: updateErr } = await supabase
      .from("users")
      .update({ email_verified: true, email_verify_token: null })
      .eq("id", userId);

    if (updateErr) {
      console.error("[email/verify] update failed:", updateErr);
      return res.redirect("/?verify=error&reason=db_failed");
    }

    return res.redirect("/?verify=success");
  }

  // Unknown action
  return res.status(400).json({ error: "Unknown action. Use ?action=send or ?action=verify" });
}
