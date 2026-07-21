-- Gotcha backend schema (Postgres). The API also creates these automatically on first
-- call, but you can run this manually when provisioning the database.

CREATE TABLE IF NOT EXISTS users (
  sub        text PRIMARY KEY,       -- Google account id (stable)
  email      text,
  name       text,
  picture    text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_data (
  sub        text PRIMARY KEY REFERENCES users(sub) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- synced blob: progress, prefs, duke, lasteval, lexicon
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shares (
  token      text PRIMARY KEY,       -- capability token for read-only teacher view
  sub        text REFERENCES users(sub) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
