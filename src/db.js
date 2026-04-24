import { Pool } from "pg";

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Postgres is not configured. Set DATABASE_URL or one of the Vercel Postgres connection variables.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

const globalStore = globalThis.__jobfinderDbStore ?? {
  pool: null,
  connectionUrl: "",
  schemaReady: null,
};

globalThis.__jobfinderDbStore = globalStore;

export function getPool(config) {
  const connectionUrl = config.database.url;

  if (!connectionUrl) {
    throw new DatabaseNotConfiguredError();
  }

  if (!globalStore.pool || globalStore.connectionUrl !== connectionUrl) {
    globalStore.connectionUrl = connectionUrl;
    globalStore.schemaReady = null;
    globalStore.pool = new Pool({
      connectionString: connectionUrl,
      max: 5,
      ssl: shouldUseSsl(connectionUrl) ? { rejectUnauthorized: false } : undefined,
    });
  }

  return globalStore.pool;
}

export async function ensureDatabase(config) {
  const pool = getPool(config);

  if (!globalStore.schemaReady) {
    globalStore.schemaReady = initializeSchema(pool);
  }

  await globalStore.schemaReady;
  return pool;
}

export async function query(config, text, values = []) {
  const pool = await ensureDatabase(config);
  return pool.query(text, values);
}

export async function withTransaction(config, work) {
  const pool = await ensureDatabase(config);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function initializeSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS disabled_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT ''
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reporter_email TEXT NOT NULL,
      reporter_name TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      affected_url TEXT NOT NULL DEFAULT '',
      happened TEXT NOT NULL,
      reproduce_steps TEXT NOT NULL,
      expected_behavior TEXT NOT NULL DEFAULT '',
      extra_details TEXT NOT NULL DEFAULT '',
      client_context JSONB NOT NULL DEFAULT '{}'::jsonb,
      source TEXT NOT NULL DEFAULT 'jobfinder-beta-bug-form',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE bug_reports
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
  `);

  await pool.query(`
    ALTER TABLE bug_reports
    ADD COLUMN IF NOT EXISTS resolved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS password_reset_tokens_token_hash_idx
    ON password_reset_tokens(token_hash);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS bug_reports_user_created_idx
    ON bug_reports(user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS bug_reports_resolved_created_idx
    ON bug_reports(resolved_at, created_at DESC);
  `);
}

function shouldUseSsl(connectionUrl) {
  try {
    const parsed = new URL(connectionUrl);
    return !["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch {
    return true;
  }
}
