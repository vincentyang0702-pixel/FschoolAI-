-- supabase-files-storage-migration.sql
-- Enables binary file storage for the browser extension's file-capture pipeline.
--
-- What this does:
--   1. Adds storage_path column to public.files (missing from the initial migration).
--   2. Creates the private `course-files` bucket in Supabase Storage.
--   3. Grants the extension's anon/publishable key permission to upload (INSERT +
--      UPDATE) into that bucket — reads stay server-only via signed URLs.
--
-- Background:
--   The extension fetches file bytes via the student's LMS session (only it can —
--   the URLs are cookie-gated), then uploads the raw bytes here so students can open
--   the real document later (api/file-url.js mints short-lived signed URLs with the
--   service key). The bucket is PRIVATE: no object is world-readable. Downloads only
--   happen through those server-minted signed links.
--
-- Run once in: Supabase Dashboard → SQL Editor → Run.
-- Idempotent — safe to re-run.
--
-- IMPORTANT: targets public schema only (our live schema). The neuroagi schema is
-- dead and ignored. Johan's original version targeted neuroagi by mistake.

-- ── 1. storage_path column ──────────────────────────────────────────────────────
-- Stores the bucket-relative path ("<userId>/<lms_file_id>.pdf") written by the
-- extension after a successful upload. NULL until the extension uploads the file.
ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- ── 2. Private course-files bucket ─────────────────────────────────────────────
-- 25 MB file_size_limit matches the extension's MAX_FILE_BYTES guard (25_000_000).
-- public = false: no object is directly downloadable — only via signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('course-files', 'course-files', false, 26214400)
ON CONFLICT (id) DO UPDATE
  SET public          = false,
      file_size_limit = 26214400;

-- ── 3. Anon write policies ──────────────────────────────────────────────────────
-- The extension ships only the publishable (anon) key — it cannot carry a service
-- key. So anon needs INSERT + UPDATE on objects in this bucket. SELECT is NOT
-- granted: downloads go through api/file-url.js which uses the service key.
--
-- Note: this app uses custom auth (users.id TEXT in localStorage), NOT Supabase
-- Auth. auth.uid() is always NULL here, so role-based policies must use
-- `TO anon, authenticated` (not `TO authenticated` alone).

DROP POLICY IF EXISTS "course-files anon insert" ON storage.objects;
CREATE POLICY "course-files anon insert" ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'course-files');

DROP POLICY IF EXISTS "course-files anon update" ON storage.objects;
CREATE POLICY "course-files anon update" ON storage.objects
  FOR UPDATE
  TO anon, authenticated
  USING      (bucket_id = 'course-files')
  WITH CHECK (bucket_id = 'course-files');
