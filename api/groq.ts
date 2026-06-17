// api/groq.js — Vercel serverless Groq proxy with retry on 429
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.GROQ_KEY;
  if (!key) return res.status(500).json({ error: "GROQ_KEY not configured" });

  const { messages, system } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });

  const body = JSON.stringify({
    model: "llama-3.1-8b-instant",
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages,
    ],
    max_tokens: 1024,
    temperature: 0.7,
  });

  // Retry up to 3 times on 429 with exponential backoff
  const MAX_RETRIES = 3;
  let lastStatus = 500;
  let lastError  = "Unknown error";

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Wait 1s, 2s, 4s before retries
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }

    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body,
      });

      // Success
      if (groqRes.ok) {
        const data = await groqRes.json();
        const content = data.choices?.[0]?.message?.content ?? "";
        return res.status(200).json({ content });
      }

      lastStatus = groqRes.status;
      const errData = await groqRes.json().catch(() => ({}));
      lastError = errData.error?.message ?? `Groq ${groqRes.status}`;

      // Only retry on 429 (rate limit) — not on 400/401/500
      if (groqRes.status !== 429) break;

      console.warn(`Groq 429 rate limit — retry ${attempt + 1}/${MAX_RETRIES}`);

    } catch (err) {
      lastError = err.message ?? "Network error";
      // Retry on network errors too
    }
  }

  return res.status(lastStatus === 429 ? 429 : 502).json({ error: lastError });
}
