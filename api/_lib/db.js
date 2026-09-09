// Precisely backend — data layer. Uses Postgres when DATABASE_URL is set; otherwise an
// in-memory store (dev/demo only — data is per-instance and NOT persisted).
import pg from "pg";

let pool = null;
let ensured = false;
const mem = { users: new Map(), data: new Map(), shares: new Map(), usage: new Map(), recordings: new Map() };

export const hasDb = () => !!process.env.DATABASE_URL;

function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

async function ensureSchema() {
  if (ensured || !hasDb()) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      sub text PRIMARY KEY, email text, name text, picture text,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS user_data (
      sub text PRIMARY KEY REFERENCES users(sub) ON DELETE CASCADE,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS shares (
      token text PRIMARY KEY, sub text REFERENCES users(sub) ON DELETE CASCADE,
      created_at timestamptz DEFAULT now()
    );
    -- Seconds of audio actually sent to the paid speech vendor. This is the only
    -- place a speaking quota can be enforced honestly: the client cannot be trusted
    -- to count, and every second here is real money (~10đ/second).
    -- No FK to users: anonymous sandbox usage is keyed by hashed IP ("ip:<hash>").
    CREATE TABLE IF NOT EXISTS speech_usage (
      sub        text NOT NULL,
      period     text NOT NULL,          -- 'trial' | 'YYYY-MM' | 'YYYY-MM-DD'
      seconds    integer NOT NULL DEFAULT 0,
      updated_at timestamptz DEFAULT now(),
      PRIMARY KEY (sub, period)
    );
    -- Recordings the learner explicitly chose to keep. Storing is opt-in per clip, so a
    -- missing row means "not kept", not "lost". The audio lives in the bucket; this table
    -- holds only the pointer and the numbers we want to chart later.
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
    CREATE INDEX IF NOT EXISTS recordings_sub_idx ON recordings (sub, created_at DESC);`);
  ensured = true;
}

/**
 * Seconds of paid speech, grouped by period.
 *
 * Careful with the sandbox rows: `sandbox:all` is a convenience running total of every
 * `ip:*` row, so summing the table blindly counts anonymous usage twice. It is excluded
 * here and the `ip:*` rows are summed instead.
 */
export async function usageSummary() {
  if (!hasDb()) {
    const out = new Map();
    for (const [key, seconds] of mem.usage) {
      const [sub, period] = key.split("|");
      if (sub === "sandbox:all") continue;
      const row = out.get(period) || { period, sandboxSeconds: 0, accountSeconds: 0, accounts: 0 };
      if (sub.startsWith("ip:")) row.sandboxSeconds += seconds;
      else { row.accountSeconds += seconds; row.accounts += 1; }
      out.set(period, row);
    }
    return [...out.values()].sort((a, b) => b.period.localeCompare(a.period));
  }
  await ensureSchema();
  const r = await getPool().query(`
    SELECT period,
      COALESCE(SUM(seconds) FILTER (WHERE sub LIKE 'ip:%'), 0)::int AS sandbox_seconds,
      COALESCE(SUM(seconds) FILTER (WHERE sub NOT LIKE 'ip:%' AND sub <> 'sandbox:all'), 0)::int AS account_seconds,
      COUNT(*) FILTER (WHERE sub NOT LIKE 'ip:%' AND sub <> 'sandbox:all')::int AS accounts
    FROM speech_usage GROUP BY period ORDER BY period DESC`);
  return r.rows.map(x => ({
    period: x.period, sandboxSeconds: x.sandbox_seconds,
    accountSeconds: x.account_seconds, accounts: x.accounts,
  }));
}

export async function addRecording(r) {
  if (!hasDb()) { mem.recordings.set(r.id, { ...r, created_at: new Date().toISOString() }); return; }
  await ensureSchema();
  await getPool().query(
    `INSERT INTO recordings (id,sub,object_key,prompt_id,prompt_text,duration_sec,transcript,wpm,pron_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
    [r.id, r.sub, r.objectKey, r.promptId || null, r.promptText || null,
     r.durationSec || null, r.transcript || null, r.wpm || null, r.pronScore || null]
  );
}

export async function listRecordings(sub, limit = 50) {
  if (!hasDb()) {
    return [...mem.recordings.values()].filter(r => r.sub === sub)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit);
  }
  await ensureSchema();
  const r = await getPool().query(
    `SELECT id, object_key, prompt_id, prompt_text, duration_sec, transcript, wpm, pron_score, created_at
     FROM recordings WHERE sub=$1 ORDER BY created_at DESC LIMIT $2`, [sub, limit]);
  return r.rows;
}

/** Looks a recording up WITH its owner, so a caller can check ownership before acting. */
export async function getRecording(id) {
  if (!hasDb()) return mem.recordings.get(id) || null;
  await ensureSchema();
  const r = await getPool().query(`SELECT id, sub, object_key FROM recordings WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

export async function removeRecording(id) {
  if (!hasDb()) { mem.recordings.delete(id); return; }
  await ensureSchema();
  await getPool().query(`DELETE FROM recordings WHERE id=$1`, [id]);
}

/** Seconds already spent by `sub` in `period`. Never throws — a broken meter must not
 *  block a paying learner, so callers treat an error as "unknown" and fail open. */
export async function getUsageSeconds(sub, period) {
  if (!hasDb()) return mem.usage.get(`${sub}|${period}`) || 0;
  await ensureSchema();
  const r = await getPool().query(`SELECT seconds FROM speech_usage WHERE sub=$1 AND period=$2`, [sub, period]);
  return r.rows[0] ? Number(r.rows[0].seconds) : 0;
}

/** Adds `seconds` to the meter and returns the new total. */
export async function addUsageSeconds(sub, period, seconds) {
  const key = `${sub}|${period}`;
  if (!hasDb()) { const n = (mem.usage.get(key) || 0) + seconds; mem.usage.set(key, n); return n; }
  await ensureSchema();
  const r = await getPool().query(
    `INSERT INTO speech_usage (sub,period,seconds,updated_at) VALUES ($1,$2,$3,now())
     ON CONFLICT (sub,period) DO UPDATE SET seconds = speech_usage.seconds + $3, updated_at = now()
     RETURNING seconds`,
    [sub, period, seconds]
  );
  return Number(r.rows[0].seconds);
}

export async function upsertUser(u) {
  if (!hasDb()) { mem.users.set(u.sub, { ...mem.users.get(u.sub), ...u }); return; }
  await ensureSchema();
  await getPool().query(
    `INSERT INTO users (sub,email,name,picture,updated_at) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (sub) DO UPDATE SET email=$2,name=$3,picture=$4,updated_at=now()`,
    [u.sub, u.email || null, u.name || null, u.picture || null]
  );
}

export async function getData(sub) {
  if (!hasDb()) return mem.data.get(sub) || null;
  await ensureSchema();
  const r = await getPool().query(`SELECT data, updated_at FROM user_data WHERE sub=$1`, [sub]);
  return r.rows[0] ? { data: r.rows[0].data, updatedAt: r.rows[0].updated_at } : null;
}

export async function putData(sub, data) {
  const updatedAt = new Date().toISOString();
  if (!hasDb()) { mem.data.set(sub, { data, updatedAt }); return { updatedAt }; }
  await ensureSchema();
  await getPool().query(
    `INSERT INTO user_data (sub,data,updated_at) VALUES ($1,$2,now())
     ON CONFLICT (sub) DO UPDATE SET data=$2, updated_at=now()`,
    [sub, data]
  );
  return { updatedAt };
}

export async function createShare(sub, token) {
  if (!hasDb()) { mem.shares.set(token, sub); return; }
  await ensureSchema();
  await getPool().query(`INSERT INTO shares (token,sub) VALUES ($1,$2) ON CONFLICT (token) DO NOTHING`, [token, sub]);
}

export async function resolveShare(token) {
  if (!hasDb()) {
    const sub = mem.shares.get(token); if (!sub) return null;
    return { user: mem.users.get(sub), data: (mem.data.get(sub) || {}).data };
  }
  await ensureSchema();
  const r = await getPool().query(
    `SELECT u.name, u.picture, d.data FROM shares s
     JOIN users u ON u.sub=s.sub LEFT JOIN user_data d ON d.sub=s.sub WHERE s.token=$1`, [token]);
  if (!r.rows[0]) return null;
  return { user: { name: r.rows[0].name, picture: r.rows[0].picture }, data: r.rows[0].data || {} };
}
