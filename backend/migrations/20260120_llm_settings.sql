-- Migration: add allowed_models table and LLM settings to chat_sessions
-- Run this manually or via your migration tool

-- 1. Create allowed_models table
CREATE TABLE IF NOT EXISTS allowed_models (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL,          -- 'gemini', 'openrouter', 'openai'
    model_id TEXT NOT NULL UNIQUE,   -- 'gemini-2.0-flash-exp'
    display_name TEXT NOT NULL,      -- 'Gemini 2.0 Flash'
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add LLM settings columns to chat_sessions
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS llm_temperature DECIMAL(3,2);
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS llm_top_p DECIMAL(3,2);

-- Note: llm_model column should already exist in chat_sessions
-- If not, uncomment:
-- ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS llm_model TEXT;

-- 3. (Optional) Seed some initial models
-- INSERT INTO allowed_models (provider, model_id, display_name, is_default) VALUES
--     ('gemini', 'gemini-2.0-flash-exp', 'Gemini 2.0 Flash', true),
--     ('openrouter', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet', false);
