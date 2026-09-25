-- Database schema for TLDR Bot
--
-- Idempotent: every statement is CREATE IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS, or a guarded migration. The bot applies this file on every start.

-- Groups table: stores group chat information and encrypted API keys
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    telegram_chat_id BIGINT UNIQUE NOT NULL,
    gemini_api_key_encrypted TEXT,
    enabled BOOLEAN DEFAULT true,
    setup_by_user_id BIGINT,
    -- Public @username and display title, cached at setup so background jobs
    -- can build correct message links without a getChat round trip.
    username TEXT,
    title TEXT,
    setup_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Migrations for databases created before these columns existed.
ALTER TABLE groups ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS title TEXT;

-- Messages table: caches recent messages for summarization
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    telegram_chat_id BIGINT NOT NULL REFERENCES groups(telegram_chat_id) ON DELETE CASCADE,
    message_id BIGINT NOT NULL,
    user_id BIGINT,
    username TEXT,
    first_name TEXT,
    content TEXT,
    is_bot BOOLEAN DEFAULT false,
    is_channel BOOLEAN DEFAULT false,
    -- When Telegram says the message was sent, not when the bot received it.
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(telegram_chat_id, message_id)
);

-- Index for faster message retrieval
CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp
ON messages(telegram_chat_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_messages_chat_message
ON messages(telegram_chat_id, message_id);

-- Supports case-insensitive /tldr @username lookups
CREATE INDEX IF NOT EXISTS idx_messages_chat_username_lower
ON messages(telegram_chat_id, LOWER(username));

-- Summaries table: stores auto-generated summaries of messages before deletion
CREATE TABLE IF NOT EXISTS summaries (
    id SERIAL PRIMARY KEY,
    telegram_chat_id BIGINT NOT NULL REFERENCES groups(telegram_chat_id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    message_count INTEGER NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(telegram_chat_id, period_start, period_end)
);

-- Index for faster summary retrieval and cleanup
CREATE INDEX IF NOT EXISTS idx_summaries_chat_created
ON summaries(telegram_chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_summaries_created_at
ON summaries(created_at);

-- Group settings table: stores customization and scheduling settings
CREATE TABLE IF NOT EXISTS group_settings (
    id SERIAL PRIMARY KEY,
    telegram_chat_id BIGINT UNIQUE NOT NULL REFERENCES groups(telegram_chat_id) ON DELETE CASCADE,
    summary_style TEXT DEFAULT 'default',
    custom_prompt TEXT,
    exclude_bot_messages BOOLEAN DEFAULT false,
    exclude_commands BOOLEAN DEFAULT true,
    excluded_user_ids BIGINT[] DEFAULT '{}',
    scheduled_enabled BOOLEAN DEFAULT false,
    schedule_frequency TEXT DEFAULT 'daily', -- 'daily' or 'weekly'
    schedule_time TIME DEFAULT '09:00:00',
    schedule_timezone TEXT DEFAULT 'UTC',
    last_scheduled_summary TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for scheduled summaries
CREATE INDEX IF NOT EXISTS idx_group_settings_scheduled
ON group_settings(telegram_chat_id, scheduled_enabled, schedule_frequency);

-- Migration: timestamp columns used to be TIMESTAMP WITHOUT TIME ZONE, which
-- takes the session time zone at face value. Range queries then shifted by the
-- host's UTC offset, and Date parameters from Node were stored with their
-- offset dropped. Existing values were written by CURRENT_TIMESTAMP on hosts
-- whose session zone is UTC (the default on managed Postgres), so they are
-- reinterpreted as UTC. Runs once per column; a no-op afterwards.
DO $$
DECLARE
    col RECORD;
BEGIN
    FOR col IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('groups', 'messages', 'summaries', 'group_settings')
          AND data_type = 'timestamp without time zone'
    LOOP
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''',
            col.table_name, col.column_name, col.column_name
        );
        RAISE NOTICE 'Migrated %.% to TIMESTAMPTZ', col.table_name, col.column_name;
    END LOOP;
END $$;

-- Note: Messages are cached for 48 hours before automatic deletion and summarization
-- Summaries are kept for 2 weeks before permanent deletion
