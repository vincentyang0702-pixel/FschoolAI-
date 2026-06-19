// api/_notify.ts — server-side notification helper (underscore = not a Vercel function).
// Import this from api/* handlers to persist a notification row.
// Live delivery is handled client-side via postgres_changes on the notifications table.
import { createClient } from "@supabase/supabase-js";

const supaUrl = process.env.SUPABASE_URL ?? "";
const supaKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const db = createClient(supaUrl, supaKey, { db: { schema: "public" } });

export type NotifType =
  | "friend_request"
  | "request_accepted"
  | "nudge"
  | "room_invite"
  | "assignment_due"
  | "milestone"
  | "ranking";

export async function notify(
  userId: string,
  type: NotifType,
  opts: { title?: string; body?: string; data?: Record<string, unknown> } = {}
): Promise<void> {
  const { title = null, body = null, data = null } = opts;
  const { error } = await db
    .from("notifications")
    .insert({ user_id: userId, type, title, body, data });
  if (error) console.error("[notify] insert failed:", error.message);
  // The client's postgres_changes subscription on the notifications table
  // picks up this INSERT in real-time — no explicit broadcast needed.
}
