// api/claude.js — Vercel serverless function for Anthropic Claude.
// Proxies Claude Messages API server-side so the key never hits the browser.
// POST { messages: [...], system: "..." } → { content: "..." }

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL         = "claude-haiku-4-5-20251001";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST")   { return res.status(405).json({ error: "Method not allowed" }); }

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server" });
  }

  const { messages, system } = req.body ?? {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 4096,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message ?? `Claude error ${upstream.status}` });
    }
    res.status(200).json({ content: data.content?.[0]?.text ?? "" });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};
