// api/tts.js — Vercel serverless ElevenLabs TTS proxy

const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });

  const { text, voiceId } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "text is required" });

  const voice = voiceId || DEFAULT_VOICE_ID;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text.substring(0, 500),
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.42,
            similarity_boost: 0.82,
            style: 0.18,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error(`ElevenLabs ${response.status}:`, errText);
      return res.status(502).json({
        error: `ElevenLabs ${response.status}`,
        detail: errText,
        key_prefix: apiKey.substring(0, 8) + "...",
      });
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return res.status(200).json({ audio: base64, mimeType: "audio/mpeg" });

  } catch (err) {
    console.error("TTS proxy error:", err.message);
    return res.status(502).json({ error: err.message });
  }
}
