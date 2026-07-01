// api/lms-microsoft.ts — Microsoft OAuth + Graph API (Teams/OneDrive) file access
//
// GET  ?action=auth&userId=...          → 302 to Microsoft OAuth consent
// GET  ?action=callback&code=...&state= → exchange code, store refresh_token, 302 to /?lms=microsoft_connected
// GET  ?action=status&userId=...        → { connected: bool, connectedAt }
// GET  ?action=list&userId=...          → { classes: [...], onedrive: [...] }
// POST ?action=fetch                    → { userId, downloadUrl, name, mimeType?, courseId? } → { ok, documentId }
// POST ?action=disconnect               → { userId } → revoke + delete

import { createClient } from "@supabase/supabase-js";

let _sb: any = null;
function sb() {
  if (_sb) return _sb;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  _sb = createClient(url, key);
  return _sb;
}

const clientId     = () => process.env.MICROSOFT_CLIENT_ID ?? "";
const clientSecret = () => process.env.MICROSOFT_CLIENT_SECRET ?? "";
const redirectUri  = () =>
  process.env.MICROSOFT_REDIRECT_URI ?? "http://localhost:5173/api/lms-microsoft";
const tenantId     = () => process.env.MICROSOFT_TENANT_ID ?? "common";

const SCOPES = "Files.Read.All EduAssignments.ReadBasic offline_access";

const TOKEN_URL = () =>
  `https://login.microsoftonline.com/${tenantId()}/oauth2/v2.0/token`;
const AUTH_URL = () =>
  `https://login.microsoftonline.com/${tenantId()}/oauth2/v2.0/authorize`;

async function getAccessToken(userId: string): Promise<string> {
  const { data, error } = await sb()
    .from("user_oauth")
    .select("refresh_token")
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .maybeSingle();
  if (error || !data) throw new Error("Microsoft account not connected");

  const res = await fetch(TOKEN_URL(), {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      client_id:     clientId(),
      client_secret: clientSecret(),
      refresh_token: data.refresh_token,
      grant_type:    "refresh_token",
      scope:         SCOPES,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Microsoft token refresh failed (${res.status}): ${detail.slice(0, 100)}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("No access_token in Microsoft refresh response");

  // Rotate refresh token when Microsoft issues a new one
  if (json.refresh_token) {
    await sb().from("user_oauth").update({ refresh_token: json.refresh_token })
      .eq("user_id", userId).eq("provider", "microsoft");
  }

  return json.access_token;
}

function selfBase(): string {
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:5173";
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const action = req.query?.action;

  // ── auth ─────────────────────────────────────────────────────────────────
  if (action === "auth") {
    if (!clientId()) return res.status(500).json({ error: "MICROSOFT_CLIENT_ID not configured" });
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const url = new URL(AUTH_URL());
    url.searchParams.set("client_id",     clientId());
    url.searchParams.set("redirect_uri",  redirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope",         SCOPES);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("state",         userId);

    res.statusCode = 302;
    res.setHeader("Location", url.toString());
    return res.end();
  }

  // ── callback ──────────────────────────────────────────────────────────────
  if (action === "callback") {
    const { code, state: userId, error: oauthErr } = req.query;
    if (oauthErr || !code || !userId) {
      res.statusCode = 302;
      res.setHeader("Location", "/?lms=microsoft_error");
      return res.end();
    }

    let tokens: any;
    try {
      const tokenRes = await fetch(TOKEN_URL(), {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    new URLSearchParams({
          code,
          client_id:     clientId(),
          client_secret: clientSecret(),
          redirect_uri:  redirectUri(),
          grant_type:    "authorization_code",
          scope:         SCOPES,
        }),
      });
      tokens = await tokenRes.json();
    } catch {
      res.statusCode = 302;
      res.setHeader("Location", "/?lms=microsoft_error");
      return res.end();
    }

    if (!tokens.refresh_token) {
      res.statusCode = 302;
      res.setHeader("Location", "/?lms=microsoft_error&reason=no_refresh_token");
      return res.end();
    }

    await sb().from("user_oauth").upsert({
      user_id:       userId,
      provider:      "microsoft",
      refresh_token: tokens.refresh_token,
      scopes:        SCOPES.split(" "),
      connected_at:  new Date().toISOString(),
    }, { onConflict: "user_id,provider" });

    res.statusCode = 302;
    res.setHeader("Location", "/?lms=microsoft_connected");
    return res.end();
  }

  // ── status ────────────────────────────────────────────────────────────────
  if (action === "status") {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const { data } = await sb()
      .from("user_oauth")
      .select("connected_at")
      .eq("user_id", userId)
      .eq("provider", "microsoft")
      .maybeSingle();
    return res.status(200).json({ connected: !!data, connectedAt: data?.connected_at ?? null });
  }

  // ── list ──────────────────────────────────────────────────────────────────
  if (action === "list") {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });

    let accessToken: string;
    try { accessToken = await getAccessToken(userId); }
    catch (e: any) { return res.status(401).json({ error: e.message }); }

    const headers = { Authorization: `Bearer ${accessToken}` };
    const classes: any[] = [];
    const onedrive: any[] = [];

    // Education classes + assignments
    const classRes = await fetch(
      "https://graph.microsoft.com/v1.0/education/me/classes?$select=id,displayName",
      { headers },
    ).catch(() => null);

    if (classRes?.ok) {
      const { value: eduClasses = [] } = await classRes.json();

      for (const cls of eduClasses.slice(0, 20)) {
        const files: any[] = [];

        // Assignment file resources
        const asgRes = await fetch(
          `https://graph.microsoft.com/v1.0/education/classes/${cls.id}/assignments?$select=id,displayName,resources`,
          { headers },
        ).catch(() => null);

        if (asgRes?.ok) {
          const { value: assignments = [] } = await asgRes.json();
          for (const asg of assignments) {
            for (const r of (asg.resources ?? [])) {
              const fr = r.resource?.fileResource ?? r.fileResource;
              if (fr?.fileUrl || fr?.downloadUrl) {
                files.push({
                  downloadUrl: fr.downloadUrl ?? fr.fileUrl,
                  name:        fr.displayName ?? r.resource?.displayName ?? "File",
                  mimeType:    null,
                  source:      "assignment",
                });
              }
            }
          }
        }

        // Class team drive root
        const driveRes = await fetch(
          `https://graph.microsoft.com/v1.0/groups/${cls.id}/drive/root/children?$select=id,name,file,@microsoft.graph.downloadUrl`,
          { headers },
        ).catch(() => null);

        if (driveRes?.ok) {
          const { value: driveItems = [] } = await driveRes.json();
          for (const item of driveItems) {
            if (item.file) {
              files.push({
                downloadUrl: item["@microsoft.graph.downloadUrl"],
                name:        item.name,
                mimeType:    item.file?.mimeType ?? null,
                source:      "classDrive",
              });
            }
          }
        }

        if (files.length) classes.push({ classId: cls.id, className: cls.displayName, files });
      }
    }

    // Personal OneDrive root
    const odRes = await fetch(
      "https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,file,@microsoft.graph.downloadUrl&$top=50",
      { headers },
    ).catch(() => null);

    if (odRes?.ok) {
      const { value: odItems = [] } = await odRes.json();
      for (const item of odItems) {
        if (item.file) {
          onedrive.push({
            downloadUrl: item["@microsoft.graph.downloadUrl"],
            name:        item.name,
            mimeType:    item.file?.mimeType ?? null,
            source:      "onedrive",
          });
        }
      }
    }

    return res.status(200).json({ classes, onedrive });
  }

  // ── fetch ─────────────────────────────────────────────────────────────────
  if (action === "fetch" && req.method === "POST") {
    const { userId, downloadUrl, name, mimeType, courseId } = req.body ?? {};
    if (!userId || !downloadUrl) {
      return res.status(400).json({ error: "userId and downloadUrl required" });
    }

    let accessToken: string;
    try { accessToken = await getAccessToken(userId); }
    catch (e: any) { return res.status(401).json({ error: e.message }); }

    // @microsoft.graph.downloadUrl is pre-authorized — no auth header needed.
    // But some fileUrl values need Bearer auth, so we try both.
    let fileRes = await fetch(downloadUrl).catch(() => null);
    if (!fileRes?.ok) {
      fileRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => null);
    }
    if (!fileRes?.ok) {
      return res.status(502).json({ error: `Microsoft file download failed` });
    }

    const bytes = Buffer.from(await fileRes.arrayBuffer());
    if (bytes.length > 50 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (max 50 MB)" });
    }

    const ingestRes = await fetch(`${selfBase()}/api/lms-ingest`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        userId,
        courseId: courseId ?? null,
        file: {
          name:      name ?? "microsoft-file",
          mimeType:  mimeType ?? fileRes.headers.get("content-type") ?? "application/octet-stream",
          bytes:     bytes.toString("base64"),
          sourceUrl: downloadUrl,
          provider:  "microsoft",
        },
      }),
    });

    const ingestData = await ingestRes.json().catch(() => ({}));
    if (!ingestRes.ok) {
      return res.status(502).json({ error: ingestData.error ?? "lms-ingest failed" });
    }
    return res.status(200).json(ingestData);
  }

  // ── disconnect ────────────────────────────────────────────────────────────
  if (action === "disconnect" && req.method === "POST") {
    const { userId } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    await sb().from("user_oauth").delete().eq("user_id", userId).eq("provider", "microsoft");
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
