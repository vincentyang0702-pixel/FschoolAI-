// api/email.js — unified email handler
// Routes:
//   POST /api/email?action=send          — generate token, store on user, send via Resend
//   GET  /api/email?action=verify        — mark verified, show success page
//   POST /api/email?action=reset         — send password reset email (alias: send-reset)
//   GET  /api/email?action=reset-confirm — validate reset token, redirect to app

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
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

    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

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

    const verifyUrl = "https://neuro-agi.vercel.app/api/email?action=verify&token=" + token + "&userId=" + userId;

    try {
      await resend.emails.send({
        from:    "FSchoolAI <noreply@fschoolai.com>",
        to:      email,
        subject: "Verify your FSchoolAI account",
        html: "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;max-width:480px;margin:0 auto;padding:48px 24px;background:#fff;\">"
          + "<div style=\"margin-bottom:32px;\"><span style=\"font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#999;font-weight:500;\">FSchoolAI Beta</span></div>"
          + "<h2 style=\"font-size:24px;font-weight:700;color:#111;margin:0 0 12px;letter-spacing:-0.5px;\">Welcome" + (name ? ", " + name : "") + ".</h2>"
          + "<p style=\"color:#555;margin:0 0 32px;line-height:1.7;font-size:15px;\">You're in the beta. Verify your email to activate your free 1-month subscription and unlock full access.</p>"
          + "<a href=\"" + verifyUrl + "\" style=\"display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;\">Verify my email &rarr;</a>"
          + "<p style=\"color:#bbb;font-size:12px;margin-top:40px;line-height:1.6;\">This link expires in 24 hours.<br/>If you didn't sign up for FSchoolAI, you can safely ignore this email.</p>"
          + "</div>",
      });
    } catch (emailErr) {
      console.error("[email/send] resend failed:", emailErr.message);
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

    const sentAt     = new Date(user.email_verify_sent_at);
    const hoursSince = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 24) return res.redirect("/?verify=error&reason=expired");

    const { error: updateErr } = await supabase
      .from("users")
      .update({ email_verified: true, email_verify_token: null })
      .eq("id", userId);

    if (updateErr) {
      console.error("[email/verify] update failed:", updateErr);
      return res.redirect("/?verify=error&reason=db_failed");
    }

    // Standalone success page — no redirect into app so opening on phone doesn't log into someone's account
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send(
      "<!DOCTYPE html><html lang=\"en\"><head>"
      + "<meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/>"
      + "<title>Email verified &mdash; FSchoolAI</title>"
      + "<style>"
      + "*{margin:0;padding:0;box-sizing:border-box}"
      + "body{background:#111;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px}"
      + ".card{max-width:380px;width:100%;text-align:center;animation:up .5s cubic-bezier(.34,1.56,.64,1) both}"
      + "@keyframes up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}"
      + "@keyframes ring{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.2);opacity:0}}"
      + ".wrap{position:relative;width:56px;height:56px;margin:0 auto 28px}"
      + ".ring{position:absolute;inset:0;border-radius:50%;background:#30d158;animation:ring 1.6s ease-out infinite}"
      + ".core{position:absolute;inset:6px;border-radius:50%;background:#30d158;display:flex;align-items:center;justify-content:center}"
      + "h1{font-size:28px;font-weight:700;letter-spacing:-.5px;margin-bottom:10px}"
      + "p{font-size:15px;color:rgba(255,255,255,.4);line-height:1.7;margin-bottom:32px}"
      + ".pill{display:inline-flex;align-items:center;gap:6px;background:rgba(48,209,88,.1);border:1px solid rgba(48,209,88,.2);border-radius:20px;padding:6px 16px;font-size:12px;color:rgba(48,209,88,.85);font-weight:500;margin-bottom:24px}"
      + ".dot{width:6px;height:6px;border-radius:50%;background:rgba(48,209,88,.8)}"
      + "a{display:inline-block;background:rgba(255,255,255,.92);color:#111;text-decoration:none;padding:13px 28px;border-radius:12px;font-size:15px;font-weight:600}"
      + "</style></head><body>"
      + "<div class=\"card\">"
      + "<div class=\"wrap\"><div class=\"ring\"></div><div class=\"core\">"
      + "<svg width=\"18\" height=\"18\" viewBox=\"0 0 18 18\" fill=\"none\"><path d=\"M3.5 9l4 4 7-7\" stroke=\"#111\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>"
      + "</div></div>"
      + "<div class=\"pill\"><span class=\"dot\"></span>Beta access activated</div>"
      + "<h1>Email verified.</h1>"
      + "<p>Your 1-month free subscription is now active.<br/>Open the app on your device to get started.</p>"
      + "<a href=\"https://neuro-agi.vercel.app\">Open FSchoolAI &rarr;</a>"
      + "</div></body></html>"
    );
  }

  // ── POST /api/email?action=reset (alias: send-reset) ─────────────────────
  if (action === "reset" || action === "send-reset") {
    if (req.method !== "POST") return res.status(405).end();
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });

    const { data: user } = await supabase
      .from("users")
      .select("id, name")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    // Always return 200 — don't reveal if email exists (security)
    if (!user) return res.status(200).json({ success: true });

    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    await supabase
      .from("users")
      .update({ email_verify_token: token, email_verify_sent_at: new Date().toISOString() })
      .eq("id", user.id);

    const resetUrl = "https://neuro-agi.vercel.app/api/email?action=reset-confirm&token=" + token + "&userId=" + user.id;

    try {
      await resend.emails.send({
        from:    "FSchoolAI <noreply@fschoolai.com>",
        to:      email,
        subject: "Reset your FSchoolAI password",
        html: "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;max-width:480px;margin:0 auto;padding:48px 24px;background:#fff;\">"
          + "<div style=\"margin-bottom:32px;\"><span style=\"font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#999;font-weight:500;\">FSchoolAI</span></div>"
          + "<h2 style=\"font-size:24px;font-weight:700;color:#111;margin:0 0 12px;letter-spacing:-0.5px;\">Reset your password</h2>"
          + "<p style=\"color:#555;margin:0 0 32px;line-height:1.7;font-size:15px;\">Click below to reset your password. This link expires in 1 hour.</p>"
          + "<a href=\"" + resetUrl + "\" style=\"display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;\">Reset password &rarr;</a>"
          + "<p style=\"color:#bbb;font-size:12px;margin-top:40px;line-height:1.6;\">If you didn't request this, you can safely ignore this email.</p>"
          + "</div>",
      });
    } catch (emailErr) {
      console.error("[email/reset] resend failed:", emailErr.message);
    }

    return res.status(200).json({ success: true });
  }

  // ── GET /api/email?action=reset-confirm&token=X&userId=Y ─────────────────
  if (action === "reset-confirm") {
    if (req.method !== "GET") return res.status(405).end();
    const { token, userId } = req.query;
    if (!token || !userId) return res.redirect("/?reset=error");

    const { data: user } = await supabase
      .from("users")
      .select("id, email_verify_token, email_verify_sent_at")
      .eq("id", userId)
      .maybeSingle();

    if (!user || user.email_verify_token !== token) return res.redirect("/?reset=error");

    const sentAt     = new Date(user.email_verify_sent_at);
    const hoursSince = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince > 1) return res.redirect("/?reset=expired");

    return res.redirect("/?reset=confirm&token=" + token + "&userId=" + userId);
  }

  // Unknown action
  return res.status(400).json({ error: "Unknown action. Use ?action=send, verify, reset, send-reset, or reset-confirm" });
}
