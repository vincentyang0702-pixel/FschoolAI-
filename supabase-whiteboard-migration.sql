-- supabase-whiteboard-migration.sql
-- Phase 3: Session-only collaborative whiteboard.
-- Run in Supabase Dashboard → SQL Editor → Run. Idempotent — safe to re-run.
--
-- MODEL: strokes are append-only rows. They live only for the duration of a
-- session — when the LAST present member leaves, the client calls clear_whiteboard
-- and the rows are deleted. While anyone is still online, strokes persist so a
-- member returning from a break sees the board intact.
--
-- All reads + writes go through SECURITY DEFINER RPCs (same trust model as chat):
-- only a joined member can read, draw on, or clear a room's board. Direct table
-- access is fully revoked.

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whiteboard_strokes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID        NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  mode       TEXT        NOT NULL DEFAULT 'pen' CHECK (mode IN ('pen', 'erase')),
  color      TEXT        NOT NULL,
  width      INT         NOT NULL CHECK (width BETWEEN 1 AND 64),
  points     JSONB       NOT NULL,   -- [{ "x": <0..1000>, "y": <0..600> }, ...]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whiteboard_strokes_room_created
  ON public.whiteboard_strokes (room_id, created_at);

-- ── 2. RPC: add a stroke (verifies sender is a joined member) ─────────────────
CREATE OR REPLACE FUNCTION public.add_whiteboard_stroke(
  p_user text, p_room uuid, p_mode text, p_color text, p_width int, p_points jsonb
)
RETURNS public.whiteboard_strokes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  stroke public.whiteboard_strokes;
  uname  text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room AND user_id = p_user AND status = 'joined'
  ) THEN
    RAISE EXCEPTION 'not a joined member';
  END IF;

  SELECT name INTO uname FROM public.users WHERE id = p_user;

  INSERT INTO public.whiteboard_strokes(room_id, user_id, name, mode, color, width, points)
  VALUES (p_room, p_user, COALESCE(uname, 'Anonymous'), p_mode, p_color, p_width, p_points)
  RETURNING * INTO stroke;

  RETURN stroke;
END;
$$;

-- ── 3. RPC: load the board (verifies caller is a joined member) ───────────────
CREATE OR REPLACE FUNCTION public.load_whiteboard(
  p_user text, p_room uuid
)
RETURNS SETOF public.whiteboard_strokes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room AND user_id = p_user AND status = 'joined'
  ) THEN
    RAISE EXCEPTION 'not a joined member';
  END IF;

  RETURN QUERY
    SELECT * FROM public.whiteboard_strokes
    WHERE room_id = p_room
    ORDER BY created_at ASC;
END;
$$;

-- ── 4. RPC: clear the board (any joined member; called by the last to leave) ──
CREATE OR REPLACE FUNCTION public.clear_whiteboard(
  p_user text, p_room uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room AND user_id = p_user AND status = 'joined'
  ) THEN
    RAISE EXCEPTION 'not a joined member';
  END IF;

  DELETE FROM public.whiteboard_strokes WHERE room_id = p_room;
END;
$$;

-- ── 5. Grants + lockdown ──────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.add_whiteboard_stroke(text, uuid, text, text, int, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_whiteboard(text, uuid)                                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_whiteboard(text, uuid)                               TO anon, authenticated;

-- RPC-only access. The functions above are the sole access path.
REVOKE INSERT, UPDATE, DELETE, SELECT ON public.whiteboard_strokes FROM anon, authenticated;
