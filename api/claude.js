// api/claude.js — Vercel serverless Anthropic Claude proxy
// Used by NeuralRing tutor brain (higher quality than Groq for conversation)
// Groq stays for flashcard/study guide generation (speed matters there)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { messages, system, max_tokens = 400 } = req.body;
  if (!messages || !Array.isArray(messages))
    return res.status(400).json({ error: "messages array required" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens,
        system:     system ?? undefined,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("Claude API error:", err);
      return res.status(502).json({ error: err.error?.message ?? `Claude ${response.status}` });
    }

    const data    = await response.json();
    const content = data.content?.map(b => b.text ?? "").join("") ?? "";
    return res.status(200).json({ content });

  } catch (err) {
    console.error("Claude proxy error:", err.message);
    return res.status(502).json({ error: err.message });
  }
}
