// whiteboard.ts — client wrappers for the Phase 3 session-only whiteboard RPCs.
// All reads + writes go through SECURITY DEFINER functions (add/load/clear);
// direct table access on whiteboard_strokes is revoked for the anon key.

import { supabase } from "./supabase";

export type Point = { x: number; y: number };

export type Stroke = {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  mode: "pen" | "erase";
  color: string;
  width: number;
  points: Point[];
  created_at: string;
};

/** Load every stroke for a room, oldest-first. Caller must be a joined member. */
export async function loadStrokes(userId: string, roomId: string): Promise<Stroke[]> {
  const { data, error } = await supabase.rpc("load_whiteboard", {
    p_user: userId, p_room: roomId,
  });
  if (error) throw error;
  return (data ?? []) as Stroke[];
}

/** Persist one completed stroke. Server verifies the sender is a joined member. */
export async function addStroke(
  userId: string, roomId: string,
  mode: "pen" | "erase", color: string, width: number, points: Point[]
): Promise<Stroke> {
  const { data, error } = await supabase.rpc("add_whiteboard_stroke", {
    p_user: userId, p_room: roomId,
    p_mode: mode, p_color: color, p_width: width, p_points: points,
  });
  if (error) throw error;
  return data as Stroke;
}

/** Wipe the board. Called manually, or automatically by the last member to leave. */
export async function clearBoard(userId: string, roomId: string): Promise<void> {
  const { error } = await supabase.rpc("clear_whiteboard", {
    p_user: userId, p_room: roomId,
  });
  if (error) throw error;
}
