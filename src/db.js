const { Pool, types } = require('pg');
const fs = require('fs');
const path = require('path');
const { loadDbConfig } = require('./dbConfig');

// Return timestamps as ISO strings (not JS Date objects) for API compatibility
types.setTypeParser(1114, v => v); // TIMESTAMP
types.setTypeParser(1184, v => v); // TIMESTAMPTZ

let pool = null;

function newId() {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

/**
 * Translate a pg/internal error into a user-friendly { status, error, code } response object.
 * Call res.status(e.status).json(e) in route catch blocks.
 */
function dbErr(err) {
  // Our own sentinel
  if (err.code === 'DB_NOT_CONNECTED') {
    return { status: 503, error: 'Database is not connected. Go to Settings → Database to configure the connection.', code: 'DB_NOT_CONNECTED' };
  }
  // Postgres error codes
  switch (err.code) {
    case '23505': return { status: 409, error: 'A record with that value already exists.', code: 'DUPLICATE' };
    case '23503': return { status: 409, error: 'Cannot complete this action — a related record is missing or in use.', code: 'FOREIGN_KEY' };
    case '23502': return { status: 400, error: `A required field is missing: ${err.column || 'unknown'}.`, code: 'NOT_NULL' };
    case '42P01': return { status: 500, error: 'A required database table does not exist. Run migrations.', code: 'MISSING_TABLE' };
    case '42P18': return { status: 500, error: 'Internal query error: ambiguous parameter type. This is a bug — please report it.', code: 'QUERY_ERROR' };
    case '08006':
    case '08001':
    case '08004': return { status: 503, error: 'Lost connection to the database.', code: 'DB_CONNECTION_LOST' };
    default:
      console.error(`[DB] Unhandled error code=${err.code} message=${err.message}`);
      return { status: 500, error: 'An unexpected database error occurred. Check server logs.', code: 'INTERNAL_ERROR' };
  }
}

function isConnected() {
  return pool !== null;
}

/**
 * Execute a SQL query. Returns rows array.
 */
async function query(sql, params = []) {
  if (!pool) throw Object.assign(new Error('Database not connected. Configure DB in Settings → Database.'), { code: 'DB_NOT_CONNECTED' });
  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Execute a SQL query. Returns first row or null.
 */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * Execute a SQL mutation (INSERT/UPDATE/DELETE). Returns nothing.
 */
async function run(sql, params = []) {
  if (!pool) throw Object.assign(new Error('Database not connected. Configure DB in Settings → Database.'), { code: 'DB_NOT_CONNECTED' });
  await pool.query(sql, params);
}

/**
 * Run a function inside a transaction. Rolls back on error.
 * fn receives a tx object with query/queryOne/run bound to the client.
 */
async function transaction(fn) {
  if (!pool) throw new Error('DB not initialised. Call initDb() first.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      query:    async (sql, p = []) => { const { rows } = await client.query(sql, p); return rows; },
      queryOne: async (sql, p = []) => { const { rows } = await client.query(sql, p); return rows[0] || null; },
      run:      async (sql, p = []) => { await client.query(sql, p); },
    };
    await fn(tx);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Ensure schema_version exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: appliedRows } = await pool.query('SELECT version FROM schema_version');
  const applied = new Set(appliedRows.map(r => r.version));

  let count = 0;
  for (const file of files) {
    const version = parseInt(file.split('_')[0], 10);
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      // Use a client for multi-statement SQL (simple query protocol)
      const client = await pool.connect();
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_version(version) VALUES ($1) ON CONFLICT DO NOTHING',
          [version]
        );
      } finally {
        client.release();
      }
      console.log(`  ✓ Migration ${file} applied`);
      count++;
    } catch (err) {
      console.error(`  ❌ Migration ${file} failed: ${err.message}`);
      throw err;
    }
  }

  if (count === 0) console.log('  ✓ Schema up to date');
}

async function initDb(config) {
  const cfg = config || loadDbConfig();
  console.log(`  DB: ${cfg.host}:${cfg.port}/${cfg.database}`);

  pool = new Pool({
    host:     cfg.host,
    port:     cfg.port,
    user:     cfg.user,
    password: cfg.password,
    database: cfg.database,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Test connection
  try {
    const client = await pool.connect();
    client.release();
  } catch (err) {
    console.warn(`\n  ⚠  DB connection failed: ${err.message}`);
    console.warn(`     Host: ${cfg.host}:${cfg.port}, DB: ${cfg.database}`);
    console.warn(`     App will start — configure DB via Settings → Database.\n`);
    return null;
  }

  try {
    await runMigrations();
  } catch (err) {
    console.error(`\n  ❌ Migration failed: ${err.message}`);
    console.warn(`     App will start but data operations will fail.\n`);
    return null;
  }

  return pool;
}

/**
 * Reinitialise the pool with new config (used by Settings DB tab).
 * Returns { ok, error } — does NOT exit the process on failure.
 */
async function reinitDb(config) {
  const oldPool = pool;
  try {
    const newPool = new Pool({
      host:     config.host,
      port:     config.port,
      user:     config.user,
      password: config.password,
      database: config.database,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    const client = await newPool.connect();
    client.release();
    pool = newPool;
    await runMigrations();
    if (oldPool) oldPool.end().catch(() => {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function testConnection(config) {
  const testPool = new Pool({
    host:     config.host,
    port:     config.port,
    user:     config.user,
    password: config.password,
    database: config.database,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const client = await testPool.connect();
    client.release();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    testPool.end().catch(() => {});
  }
}

function closeDb() {
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }
}

function getPool() { return pool; }

module.exports = { initDb, reinitDb, testConnection, closeDb, query, queryOne, run, transaction, newId, isConnected, dbErr, getPool };
