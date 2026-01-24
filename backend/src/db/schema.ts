import { query } from './pool.js';

const schemaSql = `
-- =====================================================
-- ENUM TYPES
-- =====================================================

DO $$ BEGIN
    CREATE TYPE access_type AS ENUM ('free', 'premium');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE dialog_role AS ENUM ('user', 'assistant');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('active', 'expired');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'success', 'canceled', 'error');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;



DO $$ BEGIN
    CREATE TYPE relationship_type AS ENUM ('negative', 'stranger', 'neutral', 'friend', 'partner');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Migration: add new values to existing enum if needed
DO $$ BEGIN
    ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'negative' BEFORE 'neutral';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'stranger' BEFORE 'neutral';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE mood_type AS ENUM ('neutral', 'sweet', 'sarcastic', 'formal', 'playful');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Users table MUST be created first (referenced by characters.created_by)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,
    username TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users: new columns for profile & onboarding
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'ru';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_adult_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_person INTEGER DEFAULT 3;

CREATE TABLE IF NOT EXISTS characters (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description_long TEXT NOT NULL,
    avatar_url TEXT,
    system_prompt TEXT NOT NULL,
    access_type access_type NOT NULL DEFAULT 'free',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Characters: new columns for Mini App catalog features
ALTER TABLE characters ADD COLUMN IF NOT EXISTS genre TEXT;
ALTER TABLE characters DROP COLUMN IF EXISTS content_rating;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS grammatical_gender TEXT DEFAULT 'female';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS popularity_score INTEGER DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS messages_count INTEGER DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS unique_users_count INTEGER DEFAULT 0;

-- Characters: LLM parameter overrides (NULL = use global config defaults)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS llm_provider TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS llm_model TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS llm_temperature DECIMAL(3,2);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS llm_top_p DECIMAL(3,2);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS llm_repetition_penalty DECIMAL(4,2);

-- Characters: Initial relationship values (used when creating new user-character state)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS initial_attraction INTEGER DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS initial_trust INTEGER DEFAULT 10;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS initial_affection INTEGER DEFAULT 5;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS initial_dominance INTEGER DEFAULT 0;

-- Character author (references users table - now safe because users exists)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

-- Cross-reference: users.last_character_id
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_character_id INTEGER REFERENCES characters(id);



CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status subscription_status NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id, status);

CREATE TABLE IF NOT EXISTS dialogs (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    role dialog_role NOT NULL,
    message_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dialogs: new columns for chat management
ALTER TABLE dialogs ADD COLUMN IF NOT EXISTS is_regenerated BOOLEAN DEFAULT FALSE;
ALTER TABLE dialogs ADD COLUMN IF NOT EXISTS tokens_used INTEGER;
ALTER TABLE dialogs ADD COLUMN IF NOT EXISTS model_used TEXT;

CREATE INDEX IF NOT EXISTS idx_dialogs_user_character ON dialogs(user_id, character_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dialogs_user_role ON dialogs(user_id, role, created_at);
CREATE INDEX IF NOT EXISTS idx_dialogs_created_at ON dialogs(created_at);
CREATE INDEX IF NOT EXISTS idx_dialogs_character_role ON dialogs(character_id, role);

CREATE TABLE IF NOT EXISTS dialog_summaries (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, character_id)
);

-- Track how many messages have been summarized for incremental summarization
ALTER TABLE dialog_summaries ADD COLUMN IF NOT EXISTS summarized_message_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_stars INTEGER NOT NULL,
    telegram_payment_id TEXT,
    status payment_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- NEW TABLES FOR MINI APP
-- =====================================================

-- Tags system for character catalog filtering
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: drop category column if exists
ALTER TABLE tags DROP COLUMN IF EXISTS category;

CREATE TABLE IF NOT EXISTS character_tags (
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (character_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_character_tags_character ON character_tags(character_id);
CREATE INDEX IF NOT EXISTS idx_character_tags_tag ON character_tags(tag_id);

-- Chat sessions for relationship/mood settings
CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

    last_message_at TIMESTAMPTZ,
    messages_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, character_id)
);

-- Drop legacy columns
DO $$ BEGIN
    ALTER TABLE chat_sessions DROP COLUMN IF EXISTS relationship_score;
    ALTER TABLE chat_sessions DROP COLUMN IF EXISTS relationship;
    ALTER TABLE chat_sessions DROP COLUMN IF EXISTS mood;
    ALTER TABLE characters DROP COLUMN IF EXISTS default_relationship_score;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
-- Add user-specified model override
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS llm_model TEXT;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS llm_temperature DECIMAL(3,2);
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS llm_top_p DECIMAL(3,2);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_character ON chat_sessions(user_id, character_id);

-- =====================================================
-- ALLOWED LLM MODELS (admin-managed)
-- =====================================================

CREATE TABLE IF NOT EXISTS allowed_models (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL,          -- 'gemini', 'openrouter', 'openai'
    model_id TEXT NOT NULL UNIQUE,   -- 'gemini-2.0-flash-exp'
    display_name TEXT NOT NULL,      -- 'Gemini 2.0 Flash'
    is_default BOOLEAN DEFAULT FALSE,
    is_fallback BOOLEAN DEFAULT FALSE, -- Global fallback model for errors
    is_recommended BOOLEAN DEFAULT FALSE, -- Recommended for user-created characters
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: add is_fallback column if missing
ALTER TABLE allowed_models ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN DEFAULT FALSE;
-- Migration: add is_recommended column if missing
ALTER TABLE allowed_models ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT FALSE;

-- Character memories for long-term memory system
CREATE TABLE IF NOT EXISTS character_memories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    importance INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: drop memory_category column if exists
ALTER TABLE character_memories DROP COLUMN IF EXISTS memory_category;

CREATE INDEX IF NOT EXISTS idx_memories_user_character ON character_memories(user_id, character_id);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON character_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_user_char_importance ON character_memories(user_id, character_id, importance DESC);

-- =====================================================
-- USER-CHARACTER EMOTIONAL STATE
-- Multi-dimensional relationship system
-- =====================================================

CREATE TABLE IF NOT EXISTS user_character_state (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    -- Emotional dimensions: -50 to +50
    attraction INTEGER DEFAULT 0,      -- влечение
    trust INTEGER DEFAULT 10,          -- доверие (базовое)
    affection INTEGER DEFAULT 5,       -- Привязанность
    dominance INTEGER DEFAULT 0,       -- -50=пользователь доминирует, +50=персонаж доминирует
    -- Character mood (JSONB): {"primary": "jealous", "secondary": "aroused", "intensity": 7}
    mood JSONB DEFAULT '{"primary": "neutral", "intensity": 5}'::jsonb,
    -- Metadata
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_user_character_state ON user_character_state(user_id, character_id);

-- =====================================================
-- CHARACTER RATINGS (LIKE/DISLIKE)
-- =====================================================

CREATE TABLE IF NOT EXISTS character_ratings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating IN (-1, 1)), -- -1=dislike, 1=like
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_character_ratings_character ON character_ratings(character_id);

-- =====================================================
-- CHARACTER COMMENTS (with nested replies)
-- =====================================================

CREATE TABLE IF NOT EXISTS character_comments (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES character_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_character ON character_comments(character_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON character_comments(parent_id);

-- =====================================================
-- UGC MODERATION
-- =====================================================

-- Add is_approved column for user-generated characters
ALTER TABLE characters ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE;

-- =====================================================
-- SEED DATA
-- =====================================================

-- Default tags
INSERT INTO tags (name) VALUES
    ('romance'),
    ('anime'),
    ('fantasy'),
    ('mentor'),
    ('friendly'),
    ('flirty'),
    ('mysterious'),
    ('playful')
ON CONFLICT (name) DO NOTHING;

-- Characters are seeded from backend/src/data/popular_characters.ts
-- No hardcoded characters here



-- =====================================================
-- GLOBAL APP SETTINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default summary settings
INSERT INTO app_settings (key, value) VALUES
    ('summary_provider', 'openrouter'),
    ('summary_model', '')
ON CONFLICT (key) DO NOTHING;


`;

export const ensureSchema = async () => {
    await query(schemaSql);
};
