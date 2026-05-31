// api/tts.js — Vercel serverless ElevenLabs TTS proxy
// Mirrors the architecture from reggie-tts.js (grademaxing)
// POST { text: string, voiceId?: string } → { audio: base64, mimeType: "audio/mpeg" }
// Set ELEVENLABS_API_KEY in Vercel env vars

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Default voice ID — set ELEVENLABS_VOICE_ID in Vercel env to override
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(204).set(CORS).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
  }

  const { text, voiceId } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "text is required" });
  }

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
          text: text.substring(0, 500), // cap at 500 chars like Reggie
          model_id: "eleven_turbo_v2_5", // fastest model
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
      const err = await response.text();
      console.error("ElevenLabs error:", response.status, err);
      return res.status(response.status).json({ error: err });
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    return res.status(200).set(CORS).json({
      audio: base64,
      mimeType: "audio/mpeg",
    });

  } catch (err) {
    console.error("TTS proxy error:", err.message);
    return res.status(502).json({ error: err.message });
  }
}
