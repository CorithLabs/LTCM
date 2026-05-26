const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, queryOne, run, newId, dbErr } = require('../db');

const ATTACHMENTS_DIR = path.join(__dirname, '..', '..', 'data', 'attachments');
fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ATTACHMENTS_DIR),
  filename: (_req, file, cb) => {
    const id = newId();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB

// GET /api/v1/run-cases/:runCaseId/attachments
router.get('/', async (req, res) => {
  try {
    const rows = await query(
      'SELECT * FROM run_case_attachments WHERE run_case_id = $1 ORDER BY created_at ASC',
      [req.params.runCaseId]
    );
    res.json(rows);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/run-cases/:runCaseId/attachments
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded', code: 'NO_FILE' });
  try {
    const rc = await queryOne('SELECT id FROM run_cases WHERE id = $1', [req.params.runCaseId]);
    if (!rc) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Run case not found', code: 'NOT_FOUND' });
    }
    const id = newId();
    await run(
      'INSERT INTO run_case_attachments (id, run_case_id, filename, original_name, mime_type, size) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, req.params.runCaseId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size]
    );
    const row = await queryOne('SELECT * FROM run_case_attachments WHERE id = $1', [id]);
    res.status(201).json(row);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/attachments/:id/file
router.get('/:id/file', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM run_case_attachments WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Attachment not found', code: 'NOT_FOUND' });
    const filePath = path.join(ATTACHMENTS_DIR, row.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk', code: 'NOT_FOUND' });
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.original_name)}"`);
    res.sendFile(filePath);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// DELETE /api/v1/attachments/:id
router.delete('/:id', async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM run_case_attachments WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Attachment not found', code: 'NOT_FOUND' });
    await run('DELETE FROM run_case_attachments WHERE id = $1', [req.params.id]);
    const filePath = path.join(ATTACHMENTS_DIR, row.filename);
    fs.unlink(filePath, () => {});
    res.status(204).send();
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

module.exports = router;
