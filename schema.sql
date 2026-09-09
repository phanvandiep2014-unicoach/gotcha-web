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

-- Seconds of audio actually sent to the paid speech vendor (~11đ per second). This is
-- the only place a speaking quota can be enforced honestly: the client cannot be trusted
-- to count. No FK to users, because anonymous sandbox usage is keyed by hashed IP.
--   sub    'lms:1234' | Google sub | 'ip:<hmac>' | 'sandbox:all'
--   period 'trial' (one-off allowance) | 'YYYY-MM' (monthly) | 'YYYY-MM-DD' (sandbox)
CREATE TABLE IF NOT EXISTS speech_usage (
  sub        text NOT NULL,
  period     text NOT NULL,
  seconds    integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (sub, period)
);

-- Recordings the learner explicitly chose to keep. Storing is opt-in per clip, so a
-- missing row means "not kept", not "lost". The audio itself lives in the S3/R2 bucket
-- under object_key; this table holds only the pointer and the numbers we chart later.
-- No FK to users: an LMS learner exists here before any Google account does.
CREATE TABLE IF NOT EXISTS recordings (
  id           text PRIMARY KEY,
  sub          text NOT NULL,
  object_key   text NOT NULL,
  prompt_id    text,
  prompt_text  text,
  duration_sec integer,
  transcript   text,
  wpm          integer,
  pron_score   integer,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recordings_sub_idx ON recordings (sub, created_at DESC);
