const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Creates an isolated Express app backed by a fresh temp SQLite DB.
 * Call once per test file (module scope) so that Jest's per-file module
 * isolation keeps the DB singleton clean.
 */
function buildTestApp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltcm-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  process.env.DATA_PATH = dbPath;

  const { initDb, closeDb } = require('../../src/db');
  initDb(dbPath);

  const { createApp } = require('../../src/app');
  const supertest = require('supertest');
  const app = createApp();

  return {
    request: supertest(app),
    cleanup: () => {
      closeDb(); // release file lock before deleting on Windows
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    },
  };
}

module.exports = { buildTestApp };
