-- RLS for SERVER-ONLY tables — the safe subset.
-- These are never queried by the browser (verified: 0 references in src/). They're read/
-- written only by service-key API endpoints, and the service_role key BYPASSES RLS — so
-- enabling RLS here denies the public anon key (real protection) while every server path
-- keeps working. No policies needed: "RLS on + no policy" = deny-by-default for anon, which
-- is exactly what we want for a table the client should never reach.
--
-- ⚠️ Do NOT add the client-facing tables here (users, courses, assignments, chat_logs,
-- chat_conversations, flashcards, canvas_data, notifications, files, study_rooms,
-- room_members, room_sessions, schools, srs_reviews, rag_documents, nudges, course_content,
-- tutor_impressions, tutor_mind, beta_sessions). Enabling RLS on those now would block the
-- current legacy anon-key client — they need the Supabase Auth migration finished first.

-- RAG internals (api/rag.ts)
alter table public.rag_chunks   enable row level security;
alter table public.rag_sections enable row level security;

-- Async transcription jobs (api/transcribe.ts)
alter table public.media_jobs   enable row level security;

-- Brain / graph layer (server-only; not wired to the client yet)
alter table public.brain_nodes        enable row level security;
alter table public.brain_edges        enable row level security;
alter table public.brain_node_sources enable row level security;

-- Likely server-only too, but CONFIRM first: the whiteboard syncs over Supabase Broadcast
-- (not this table), and room chat shows 0 client refs — verify those features don't read
-- these from the browser, then uncomment:
-- alter table public.room_messages      enable row level security;
-- alter table public.whiteboard_strokes enable row level security;

notify pgrst, 'reload schema';
