-- ============================================================================
-- Fix Changelog Schema
-- Deployment: 2026-05-21
-- Purpose: Fix the changelog table schema conflict
-- ============================================================================

-- Drop the problematic index if it exists
DROP INDEX IF EXISTS idx_changelog_entity_id;

-- Ensure changelog table has the correct schema
ALTER TABLE IF EXISTS changelog
ADD COLUMN IF NOT EXISTS entity_id UUID;

ALTER TABLE IF EXISTS changelog
ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100);

ALTER TABLE IF EXISTS changelog
ADD COLUMN IF NOT EXISTS change_type VARCHAR(50);

ALTER TABLE IF EXISTS changelog
ADD COLUMN IF NOT EXISTS old_values JSONB;

ALTER TABLE IF EXISTS changelog
ADD COLUMN IF NOT EXISTS new_values JSONB;

ALTER TABLE IF EXISTS changelog
ADD COLUMN IF NOT EXISTS changed_by VARCHAR(100);

-- Recreate the index on the correct column
CREATE INDEX IF NOT EXISTS idx_changelog_entity_id ON changelog(entity_id);
CREATE INDEX IF NOT EXISTS idx_changelog_entity_type ON changelog(entity_type);
CREATE INDEX IF NOT EXISTS idx_changelog_changed_by ON changelog(changed_by);
CREATE INDEX IF NOT EXISTS idx_changelog_created_at ON changelog(created_at DESC);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
