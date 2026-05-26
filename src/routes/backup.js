const express = require('express');
const router = express.Router();
const multer = require('multer');
const { query, transaction, dbErr } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const { version } = require('../../package.json');

router.get('/backup', requireAdmin, async (req, res) => {
  try {
    const [projects, suites, test_cases, runs, run_cases] = await Promise.all([
      query('SELECT * FROM projects'),
      query('SELECT * FROM suites'),
      query('SELECT * FROM test_cases'),
      query('SELECT * FROM runs'),
      query('SELECT * FROM run_cases'),
    ]);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ltcm-backup-${date}.json"`);
    res.json({ schemaVersion: 1, appVersion: version, exportedAt: new Date().toISOString(), projects, suites, test_cases, runs, run_cases });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

router.post('/restore', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded', code: 'NO_FILE' });
  let data;
  try {
    data = JSON.parse(req.file.buffer.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid backup file — not valid JSON', code: 'INVALID_BACKUP' });
  }
  if (!data.schemaVersion || data.schemaVersion !== 1) {
    return res.status(400).json({ error: 'Schema version mismatch', code: 'SCHEMA_MISMATCH' });
  }
  try {
    await transaction(async (tx) => {
      // Delete in FK-safe order
      await tx.run('DELETE FROM run_cases');
      await tx.run('DELETE FROM runs');
      await tx.run('DELETE FROM test_cases');
      await tx.run('DELETE FROM suites');
      await tx.run('DELETE FROM projects');

      for (const r of (data.projects || [])) {
        await tx.run('INSERT INTO projects (id, name, description, created_at, last_run_at, last_run_status) VALUES ($1,$2,$3,$4,$5,$6)',
          [r.id, r.name, r.description, r.created_at, r.last_run_at, r.last_run_status]);
      }
      for (const r of (data.suites || [])) {
        await tx.run('INSERT INTO suites (id, project_id, name, description, sort_order, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [r.id, r.project_id, r.name, r.description, r.sort_order, r.created_at]);
      }
      for (const r of (data.test_cases || [])) {
        await tx.run('INSERT INTO test_cases (id, suite_id, title, preconditions, steps, expected_result, priority, sort_order, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [r.id, r.suite_id, r.title, r.preconditions, r.steps, r.expected_result, r.priority, r.sort_order, r.created_at]);
      }
      for (const r of (data.runs || [])) {
        await tx.run('INSERT INTO runs (id, project_id, name, status, created_at, completed_at, jira_version_id, jira_version_name, environment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [r.id, r.project_id, r.name, r.status, r.created_at, r.completed_at, r.jira_version_id || null, r.jira_version_name || null, r.environment || null]);
      }
      for (const r of (data.run_cases || [])) {
        await tx.run('INSERT INTO run_cases (id, run_id, case_id, title, preconditions, steps, expected_result, priority, suite_name, sort_order, status, note, step_results) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
          [r.id, r.run_id, r.case_id, r.title, r.preconditions, r.steps, r.expected_result, r.priority, r.suite_name, r.sort_order, r.status, r.note, r.step_results || null]);
      }
    });
    res.json({ restored: true });
  } catch (err) {
    res.status(500).json({ error: 'Restore failed: ' + err.message, code: 'RESTORE_ERROR' });
  }
});

module.exports = router;
