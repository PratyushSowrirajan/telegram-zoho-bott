-- Create the oauth_tokens table in your Supabase database
-- Run this SQL in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS oauth_tokens (
    id BIGSERIAL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique index for telegram_user_id to enable ON CONFLICT clause
CREATE UNIQUE INDEX IF NOT EXISTS uq_tokens_chat ON oauth_tokens (telegram_user_id);

-- Optional: Add an index on expires_at for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON oauth_tokens (expires_at);
