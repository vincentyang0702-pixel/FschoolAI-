import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";

// Canvas proxy plugin — forwards /api/canvas?base=...&path=...&token=... to the
// real Canvas API from the dev server, bypassing browser CORS restrictions.
// Identical endpoint to the Vercel function in /api/canvas.js so the same
// VITE_CANVAS_PROXY_URL env var ("/api/canvas") works in both environments.
const canvasProxyPlugin = {
  name: "canvas-proxy",
  configureServer(server) {
    server.middlewares.use("/api/canvas", async (req, res) => {
      const { searchParams } = new URL(req.url, "http://localhost");
      const base  = searchParams.get("base");
      const path  = searchParams.get("path");
      const token = searchParams.get("token");

      if (!base || !path || !token) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing base, path, or token" }));
        return;
      }

      // Reconstruct the full Canvas URL from the parts the client sent
      const clean = base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
      // Preserve any extra query params that were on the original path
      const separator = clean.includes("?") ? "&" : "?";
      const target = `${clean}${separator}per_page=50`;

      try {
        const upstream = await fetch(target, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        const body       = await upstream.text();
        const linkHeader = upstream.headers.get("Link");

        res.statusCode = upstream.status;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        if (linkHeader) res.setHeader("Link", linkHeader);
        res.end(body);
      } catch (err) {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  },
};

// Groq proxy plugin — forwards /api/groq POST to Groq from dev server.
// Uses GROQ_KEY from .env (no VITE_ prefix → never bundled into the browser).
import { readFileSync } from "fs";
import { resolve }      from "path";
import tutorContextHandler from "./api/tutor-context.js";
import extractHandler from "./api/extract.js";
import fileUrlHandler from "./api/file-url.js";

function loadEnvKey(key) {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    const match = raw.match(new RegExp(`^${key}=(.+)$`, "m"));
    return match?.[1]?.trim() ?? process.env[key];
  } catch { return process.env[key]; }
}

const groqProxyPlugin = {
  name: "groq-proxy",
  configureServer(server) {
    server.middlewares.use("/api/groq", async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") { res.statusCode = 200; res.end(); return; }

      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", async () => {
        const GROQ_KEY = loadEnvKey("GROQ_KEY");
        if (!GROQ_KEY) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "GROQ_KEY not set in .env" }));
          return;
        }

        try {
          const { messages, system } = JSON.parse(body);
          const msgs = system
            ? [{ role: "system", content: system }, ...messages]
            : messages;

          const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method:  "POST",
            headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body:    JSON.stringify({ model: "llama-3.1-8b-instant", messages: msgs, max_tokens: 1500 }),
          });

          const data = await upstream.json();
          res.statusCode = upstream.ok ? 200 : upstream.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(
            upstream.ok
              ? { content: data.choices?.[0]?.message?.content ?? "" }
              : { error: data.error?.message ?? `Groq error ${upstream.status}` }
          ));
        } catch (err) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });
  },
};

// Claude proxy plugin — forwards /api/claude POST to Anthropic from dev server.
const claudeProxyPlugin = {
  name: "claude-proxy",
  configureServer(server) {
    server.middlewares.use("/api/claude", async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") { res.statusCode = 200; res.end(); return; }
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", async () => {
        const ANTHROPIC_KEY = loadEnvKey("ANTHROPIC_API_KEY");
        if (!ANTHROPIC_KEY) {
          res.statusCode = 500; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY not set in .env" })); return;
        }
        try {
          const { messages, system, max_tokens = 1024, tools } = JSON.parse(body);
          const upstream = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens, ...(system ? { system } : {}), ...(Array.isArray(tools) && tools.length ? { tools } : {}), messages }),
          });
          const data = await upstream.json();
          res.statusCode = upstream.ok ? 200 : upstream.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(upstream.ok ? { content: (data.content ?? []).map(b => b.text ?? "").join(""), contentBlocks: data.content ?? [], stop_reason: data.stop_reason ?? null, usage: data.usage ?? null } : { error: data.error?.message }));
        } catch (err) {
          res.statusCode = 502; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });
  },
};

// TTS proxy plugin — forwards /api/tts POST to ElevenLabs from dev server.
const ttsProxyPlugin = {
  name: "tts-proxy",
  configureServer(server) {
    server.middlewares.use("/api/tts", async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") { res.statusCode = 200; res.end(); return; }
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", async () => {
        const ELEVEN_KEY = loadEnvKey("ELEVENLABS_API_KEY");
        if (!ELEVEN_KEY) {
          res.statusCode = 500; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "ELEVENLABS_API_KEY not set in .env" })); return;
        }
        try {
          const { text, voiceId } = JSON.parse(body);
          const voice = voiceId || "JBFqnCBsd6RMkjVDRZzb";
          const upstream = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({
                text: text.substring(0, 500),
                model_id: "eleven_turbo_v2_5",
                voice_settings: { stability: 0.42, similarity_boost: 0.82, style: 0.18, use_speaker_boost: true },
              }),
            }
          );
          if (!upstream.ok) {
            const err = await upstream.text();
            res.statusCode = 502; res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: `ElevenLabs ${upstream.status}`, detail: err })); return;
          }
          const buffer = await upstream.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          res.statusCode = 200; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ audio: base64, mimeType: "audio/mpeg" }));
        } catch (err) {
          res.statusCode = 502; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });
  },
};

// iTunes proxy plugin — forwards /itunes-search to itunes.apple.com from dev server.
// iTunes doesn't send CORS headers in local dev, so this proxies it transparently.
// In production (Vercel), ShareCard.jsx hits itunes.apple.com directly — it works fine there.
const itunesProxyPlugin = {
  name: "itunes-proxy",
  configureServer(server) {
    server.middlewares.use("/itunes-search", async (req, res) => {
      const { search } = new URL(req.url, "http://localhost");
      const target = `https://itunes.apple.com/search${search}`;

      try {
        const upstream = await fetch(target);
        const body = await upstream.text();
        res.statusCode = upstream.status;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(body);
      } catch (err) {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  },
};

// Tutor-context proxy — runs the REAL serverless handler (api/tutor-context.js)
// under the dev server so the agent's live DB lookups (grades, missing work,
// FILE lookups) work with `npm run dev`, not just on Vercel. The handler reads
// keys from process.env, so we inject them from .env before invoking it, and
// shim Node's res into the Vercel-style res.status().json() the handler expects.
const tutorContextProxyPlugin = {
  name: "tutor-context-proxy",
  configureServer(server) {
    server.middlewares.use("/api/tutor-context", async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") { res.statusCode = 200; res.end(); return; }

      process.env.ANTHROPIC_API_KEY    = loadEnvKey("ANTHROPIC_API_KEY");
      process.env.SUPABASE_URL         = loadEnvKey("SUPABASE_URL");
      process.env.SUPABASE_SERVICE_KEY = loadEnvKey("SUPABASE_SERVICE_KEY");

      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", async () => {
        try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
        res.status = (code) => { res.statusCode = code; return res; };
        res.json   = (obj)  => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
        try { await tutorContextHandler(req, res); }
        catch (err) {
          res.statusCode = 502; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ context: null, error: err.message }));
        }
      });
    });
  },
};

// Extract proxy — runs the real api/extract.js handler (PDF/text → plain text)
// under the dev server so file-content extraction works with `npm run dev`.
const extractProxyPlugin = {
  name: "extract-proxy",
  configureServer(server) {
    server.middlewares.use("/api/extract", async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") { res.statusCode = 200; res.end(); return; }
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", async () => {
        try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
        res.status = (code) => { res.statusCode = code; return res; };
        res.json   = (obj)  => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
        try { await extractHandler(req, res); }
        catch (err) {
          res.statusCode = 502; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ text: "", error: err.message }));
        }
      });
    });
  },
};

// File-URL proxy — runs the real api/file-url.js handler (mints signed URLs for
// stored course files) under the dev server so "open file" works with `npm run dev`.
const fileUrlProxyPlugin = {
  name: "file-url-proxy",
  configureServer(server) {
    server.middlewares.use("/api/file-url", async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") { res.statusCode = 200; res.end(); return; }
      process.env.SUPABASE_URL         = loadEnvKey("SUPABASE_URL");
      process.env.SUPABASE_SERVICE_KEY = loadEnvKey("SUPABASE_SERVICE_KEY");
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", async () => {
        try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
        res.status = (code) => { res.statusCode = code; return res; };
        res.json   = (obj)  => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
        try { await fileUrlHandler(req, res); }
        catch (err) {
          res.statusCode = 502; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });
  },
};

// Auth-migrate proxy — runs the real serverless handler under the dev server so
// signup / login lazy-migration / password reset work with `npm run dev`. The
// handler builds its Supabase client at MODULE LOAD using process.env, so we set
// env first and DYNAMICALLY import it per-request (a static import would evaluate
// before env is injected and throw "supabaseUrl is required"). It reads ?action=.
const authMigrateProxyPlugin = {
  name: "auth-migrate-proxy",
  configureServer(server) {
    server.middlewares.use("/api/auth-migrate", async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") { res.statusCode = 200; res.end(); return; }
      process.env.SUPABASE_URL         = loadEnvKey("SUPABASE_URL");
      process.env.SUPABASE_SERVICE_KEY = loadEnvKey("SUPABASE_SERVICE_KEY");
      const url = new URL(req.url, "http://localhost");
      req.query = Object.fromEntries(url.searchParams.entries());
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", async () => {
        try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = {}; }
        res.status = (code) => { res.statusCode = code; return res; };
        res.json   = (obj)  => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
        try {
          const { default: handler } = await import("./api/auth-migrate.js");
          await handler(req, res);
        } catch (err) {
          res.statusCode = 502; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });
  },
};

export default defineConfig({
  plugins: [react(), canvasProxyPlugin, groqProxyPlugin, claudeProxyPlugin, ttsProxyPlugin, itunesProxyPlugin, tutorContextProxyPlugin, extractProxyPlugin, fileUrlProxyPlugin, authMigrateProxyPlugin],
  server:  { port: 5173, host: "0.0.0.0", allowedHosts: true },
});
