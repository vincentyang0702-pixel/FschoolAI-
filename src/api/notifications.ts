// src/api/notifications.ts — client-side notification helpers.
// fetchNotifications / markRead use the anon key (RLS is DISABLED on the table).
// createNotification() also uses the anon key — inserting works because RLS is off.
// Heavy work (email fallback, guaranteed delivery) stays in api/_notify.ts.
import { supabase } from "./supabase";

export type NotifType =
  | "friend_request"
  | "request_accepted"
  | "nudge"
  | "room_invite"
  | "assignment_due"
  | "milestone"
  | "ranking";

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotifType;
  title: string | null;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export async function fetchNotifications(
  userId: string,
  limit = 30
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { console.error("[notifications] fetch:", error.message); return []; }
  return (data ?? []) as AppNotification[];
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) return 0;
  return count ?? 0;
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await supabase.from("notifications").update({ read: true }).in("id", ids);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
}

/** Client-side insert — works because notifications table has RLS disabled.
 *  Use for events that originate in the browser (friend requests, accepts).
 *  Events that originate server-side use api/_notify.ts instead. */
export async function createNotification(
  userId: string,
  type: NotifType,
  opts: { title?: string; body?: string; data?: Record<string, unknown> } = {}
): Promise<void> {
  const { title = null, body = null, data = null } = opts;
  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: userId, type, title, body, data });
  if (error) console.error("[notifications] createNotification:", error.message);
}
