// chat.ts — client wrappers for the Phase 2 in-room chat RPCs.
// All writes go through post_room_message (SECURITY DEFINER); direct inserts
// on room_messages are revoked for the anon key.

import { supabase } from "./supabase";

export type ChatMessage = {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  body: string;
  created_at: string;
};

/**
 * Load the last N messages for a room, oldest-first.
 * Goes through list_room_messages (SECURITY DEFINER) — a plain table SELECT is
 * blocked by RLS / would leak other rooms, so the RPC is the only correct read path.
 */
export async function loadRecentMessages(
  userId: string, roomId: string, limit = 100
): Promise<ChatMessage[]> {
  const { data, error } = await supabase.rpc("list_room_messages", {
    p_user: userId, p_room: roomId, p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

/** Post a message. Server verifies the sender is a joined member. */
export async function postRoomMessage(
  userId: string, roomId: string, name: string, body: string
): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc("post_room_message", {
    p_user: userId, p_room: roomId, p_name: name, p_body: body,
  });
  if (error) throw error;
  return data as ChatMessage;
}
