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
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY not set in .env" }));
          return;
        }

        try {
          const { messages, system } = JSON.parse(body);

          const upstream = await fetch("https://api.anthropic.com/v1/messages", {
            method:  "POST",
            headers: {
              "x-api-key":         ANTHROPIC_KEY,
              "anthropic-version": "2023-06-01",
              "content-type":      "application/json",
            },
            body: JSON.stringify({
              model:      "claude-haiku-4-5-20251001",
              max_tokens: 4096,
              ...(system ? { system } : {}),
              messages,
            }),
          });

          const data = await upstream.json();
          res.statusCode = upstream.ok ? 200 : upstream.status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(
            upstream.ok
              ? { content: data.content?.[0]?.text ?? "" }
              : { error: data.error?.message ?? `Claude error ${upstream.status}` }
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

export default defineConfig({
  plugins: [react(), canvasProxyPlugin, groqProxyPlugin, claudeProxyPlugin],
  server:  { port: 5173 },
});
