// api/claude.js — Vercel serverless Anthropic Claude proxy
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("[claude] ANTHROPIC_API_KEY not set");
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { messages, system, max_tokens = 400 } = req.body ?? {};
  if (!messages || !Array.isArray(messages))
    return res.status(400).json({ error: "messages array required" });

  // Sanitize — Anthropic rejects empty content strings
  const cleanMessages = messages
    .filter(m => m?.role && m?.content)
    .map(m => ({ role: m.role, content: String(m.content).trim() }))
    .filter(m => m.content.length > 0);

  if (!cleanMessages.length)
    return res.status(400).json({ error: "No valid messages after sanitization" });

  const body = {
    model:      "claude-haiku-4-5-20251001",
    max_tokens: Math.min(Number(max_tokens) || 400, 4096),
    messages:   cleanMessages,
  };
  if (system && typeof system === "string" && system.trim()) {
    body.system = system.trim();
  }

  // ── Streaming path — forward SSE directly to client ──────────────────────
  if (req.body?.stream) {
    body.stream = true;
    let anthropicRes;
    try {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return res.status(502).json({ error: `Anthropic ${anthropicRes.status}`, detail: errText.slice(0, 300) });
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    const reader = anthropicRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      res.end();
    }
    return;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const raw = await response.text();

    if (!response.ok) {
      console.error(`[claude] Anthropic ${response.status}:`, raw);
      let parsed = {};
      try { parsed = JSON.parse(raw); } catch (_) {}
      return res.status(502).json({
        error: parsed.error?.message ?? `Anthropic ${response.status}`,
        detail: raw.slice(0, 300),
      });
    }

    const data    = JSON.parse(raw);
    const content = (data.content ?? []).map(b => b.text ?? "").join("");
    return res.status(200).json({ content });

  } catch (err) {
    console.error("[claude] proxy error:", err.message);
    return res.status(502).json({ error: err.message });
  }
}
