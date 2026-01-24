-- Migration: add is_fallback column to allowed_models  наверное не надо применять вообще
-- Date: 2026-01-24
-- Description: Adds global fallback model support for LLM error handling

ALTER TABLE allowed_models ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN DEFAULT FALSE;

-- Ensure only one fallback model exists (can be enforced in application logic)
COMMENT ON COLUMN allowed_models.is_fallback IS 'Global fallback model for LLM errors. Only one model should have this set to TRUE.';
