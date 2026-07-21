// Gotcha backend — data layer. Uses Postgres when DATABASE_URL is set; otherwise an
// in-memory store (dev/demo only — data is per-instance and NOT persisted).
import pg from "pg";

let pool = null;
let ensured = false;
const mem = { users: new Map(), data: new Map(), shares: new Map() };

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
    );`);
  ensured = true;
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
