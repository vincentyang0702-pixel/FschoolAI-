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

  const { messages, system, max_tokens = 400, tools } = req.body ?? {};
  if (!messages || !Array.isArray(messages))
    return res.status(400).json({ error: "messages array required" });

  // Sanitize — Anthropic rejects empty string content. Array content (tool_use /
  // tool_result blocks) must pass through untouched (don't stringify it).
  const cleanMessages = messages
    .filter(m => m?.role && m?.content != null)
    .map(m => Array.isArray(m.content)
      ? { role: m.role, content: m.content }
      : { role: m.role, content: String(m.content).trim() })
    .filter(m => Array.isArray(m.content) ? m.content.length > 0 : m.content.length > 0);

  if (!cleanMessages.length)
    return res.status(400).json({ error: "No valid messages after sanitization" });

  // Model is configurable via ANTHROPIC_MODEL env var so it can be corrected without a redeploy.
  // Default is claude-sonnet-4-6; override if the key doesn't have access to that model.
  const model = (process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6").trim();
  const body: any = {
    model,
    max_tokens: Math.min(Number(max_tokens) || 400, 4096),
    messages:   cleanMessages,
  };
  // system accepts a string OR an array of content blocks (the latter may carry
  // cache_control breakpoints for prompt caching).
  if (Array.isArray(system) && system.length) {
    body.system = system;
  } else if (system && typeof system === "string" && system.trim()) {
    body.system = system.trim();
  }
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools;
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
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch (_) {}
      return res.status(502).json({
        error: parsed.error?.message ?? `Anthropic ${response.status}`,
        detail: raw.slice(0, 300),
      });
    }

    const data    = JSON.parse(raw);
    const content = (data.content ?? []).map(b => b.text ?? "").join("");
    // `content` (joined text) kept for existing callers; `contentBlocks` +
    // `stop_reason` + `usage` added for the tool-use loop and cache verification.
    return res.status(200).json({
      content,
      contentBlocks: data.content ?? [],
      stop_reason:   data.stop_reason ?? null,
      usage:         data.usage ?? null,
    });

  } catch (err) {
    console.error("[claude] proxy error:", err.message);
    return res.status(502).json({ error: err.message });
  }
}
