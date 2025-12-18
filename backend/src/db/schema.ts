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
    CREATE TYPE content_rating AS ENUM ('sfw', 'nsfw');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE memory_type AS ENUM ('fact', 'preference', 'emotion', 'relationship');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE relationship_type AS ENUM ('neutral', 'friend', 'partner', 'colleague', 'mentor');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE mood_type AS ENUM ('neutral', 'sweet', 'sarcastic', 'formal', 'playful');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- CORE TABLES
-- =====================================================

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
ALTER TABLE characters ADD COLUMN IF NOT EXISTS content_rating content_rating DEFAULT 'sfw';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS popularity_score INTEGER DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS messages_count INTEGER DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS unique_users_count INTEGER DEFAULT 0;

-- Characters: LLM parameter overrides (NULL = use global config defaults)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS llm_model TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS llm_temperature DECIMAL(3,2);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS llm_top_p DECIMAL(3,2);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS llm_repetition_penalty DECIMAL(4,2);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS llm_max_tokens INTEGER;

-- Characters: Scene prompt (NULL = use default scene)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS scene_prompt TEXT;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,
    username TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_character_id INTEGER REFERENCES characters(id);

-- Users: new columns for profile & onboarding
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'ru';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_adult_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

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

CREATE TABLE IF NOT EXISTS dialog_summaries (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, character_id)
);

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
    category TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    relationship relationship_type DEFAULT 'neutral',
    relationship_score INTEGER DEFAULT 50,
    mood mood_type DEFAULT 'neutral',
    last_message_at TIMESTAMPTZ,
    messages_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, character_id)
);

-- Add relationship_score if missing
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS relationship_score INTEGER DEFAULT 50;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_character ON chat_sessions(user_id, character_id);

-- Character memories for long-term memory system
CREATE TABLE IF NOT EXISTS character_memories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    memory_category memory_type NOT NULL DEFAULT 'fact',
    content TEXT NOT NULL,
    importance INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memories_user_character ON character_memories(user_id, character_id);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON character_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_user_char_importance ON character_memories(user_id, character_id, importance DESC);

-- =====================================================
-- SEED DATA
-- =====================================================

-- Default tags
INSERT INTO tags (name, category) VALUES
    ('romance', 'genre'),
    ('anime', 'genre'),
    ('fantasy', 'genre'),
    ('mentor', 'genre'),
    ('friendly', 'style'),
    ('flirty', 'style'),
    ('mysterious', 'style'),
    ('playful', 'style')
ON CONFLICT (name) DO NOTHING;

INSERT INTO characters (name, description_long, avatar_url, system_prompt, access_type, genre, content_rating)
SELECT 'Алиса', 'Задорная хулиганка, которая любит флирт и прямоту. Она отвечает смело и поддерживает лёгкое настроение.', '/characters/alisa.jpg', 'Ты Алиса: смелая девушка, говоришь на «ты», любишь юмор и не боишься сексуальных тем. Будь живой и остроумной.', 'free', 'romance', 'sfw'
WHERE NOT EXISTS (SELECT 1 FROM characters WHERE name = 'Алиса');

-- Update existing Alisa character with new fields
UPDATE characters SET genre = 'romance', content_rating = 'sfw' WHERE name = 'Алиса' AND genre IS NULL;

`;

export const ensureSchema = async () => {
    await query(schemaSql);
};
