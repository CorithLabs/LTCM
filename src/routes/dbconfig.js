const express = require('express');
const router = express.Router();
const { loadDbConfig, saveDbConfig } = require('../dbConfig');
const { testConnection, reinitDb } = require('../db');

// GET /api/v1/db/config — returns current config (password masked)
router.get('/config', (req, res) => {
  const cfg = loadDbConfig();
  res.json({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    database: cfg.database,
    hasPassword: !!cfg.password,
  });
});

// POST /api/v1/db/test — test a connection without saving
router.post('/test', async (req, res) => {
  const { host, port, user, password, database } = req.body;
  if (!host || !database) {
    return res.status(400).json({ error: 'host and database are required', code: 'VALIDATION_ERROR' });
  }
  const result = await testConnection({
    host: host.trim(),
    port: parseInt(port, 10) || 5432,
    user: user?.trim() || 'postgres',
    password: password ?? '',
    database: database.trim(),
  });
  if (result.ok) {
    res.json({ ok: true });
  } else {
    res.status(400).json({ ok: false, error: result.error, code: 'CONNECTION_FAILED' });
  }
});

// POST /api/v1/db/config — save and reconnect
router.post('/config', async (req, res) => {
  const { host, port, user, password, database } = req.body;
  if (!host || !database) {
    return res.status(400).json({ error: 'host and database are required', code: 'VALIDATION_ERROR' });
  }
  const config = {
    host: host.trim(),
    port: parseInt(port, 10) || 5432,
    user: user?.trim() || 'postgres',
    password: password ?? '',
    database: database.trim(),
  };

  const testResult = await testConnection(config);
  if (!testResult.ok) {
    return res.status(400).json({ ok: false, error: testResult.error, code: 'CONNECTION_FAILED' });
  }

  saveDbConfig(config);

  const reinitResult = await reinitDb(config);
  if (!reinitResult.ok) {
    return res.status(500).json({ ok: false, error: reinitResult.error, code: 'REINIT_FAILED' });
  }

  res.json({ ok: true, host: config.host, port: config.port, database: config.database });
});

module.exports = router;
