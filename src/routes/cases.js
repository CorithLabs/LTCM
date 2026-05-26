const express = require('express');
const router = express.Router({ mergeParams: true });
const { query, queryOne, run, transaction, newId, dbErr } = require('../db');
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const TEMPLATE_COLUMNS = ['Title', 'Preconditions', 'Steps (one per line)', 'Expected Result', 'Priority (high/medium/low)'];
const TEMPLATE_EXAMPLE = [
  'Login with valid credentials',
  'User has a registered account',
  'Open the login page\nEnter username and password\nClick the Login button',
  'User is redirected to the dashboard',
  'high',
];

// GET /api/v1/cases/import-template
router.get('/import-template', (_req, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS, TEMPLATE_EXAMPLE]);
  ws['!cols'] = [{ wch: 40 }, { wch: 30 }, { wch: 50 }, { wch: 40 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="ltcm-import-template.xlsx"');
  res.send(buf);
});

// GET /api/v1/suites/:suiteId/cases
router.get('/', async (req, res) => {
  try {
    const cases = await query(`
      SELECT tc.*,
        lr.status  AS last_run_status,
        lr.run_id  AS last_run_id,
        lr.run_number AS last_run_number,
        lr.project_id AS last_run_project_id,
        cu.username AS created_by_username,
        uu.username AS updated_by_username
      FROM test_cases tc
      LEFT JOIN LATERAL (
        SELECT rc.status, rc.run_id, r.run_number, r.project_id
        FROM run_cases rc
        JOIN runs r ON r.id = rc.run_id
        WHERE rc.case_id = tc.id
        ORDER BY r.created_at DESC LIMIT 1
      ) lr ON true
      LEFT JOIN users cu ON cu.id = tc.created_by
      LEFT JOIN users uu ON uu.id = tc.updated_by
      WHERE tc.suite_id = $1
      ORDER BY tc.sort_order ASC, tc.created_at ASC
    `, [req.params.suiteId]);
    res.json(cases.map(c => ({ ...c, steps: JSON.parse(c.steps) })));
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/suites/:suiteId/cases
router.post('/', async (req, res) => {
  const { title, preconditions, steps, expected_result, priority, tags } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required', code: 'VALIDATION_ERROR' });
  if (title.trim().length > 100) return res.status(400).json({ error: 'Title must be 100 characters or fewer', code: 'VALIDATION_ERROR' });
  if (!expected_result || !expected_result.trim()) return res.status(400).json({ error: 'Expected result is required', code: 'VALIDATION_ERROR' });
  const cleanSteps = (steps || []).filter(s => s && s.trim());
  if (cleanSteps.length === 0) return res.status(400).json({ error: 'At least one step is required', code: 'VALIDATION_ERROR' });
  const cleanTags = Array.isArray(tags)
    ? tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim().toLowerCase().slice(0, 30)).slice(0, 20)
    : [];
  try {
    const maxRow = await queryOne('SELECT MAX(sort_order) AS m FROM test_cases WHERE suite_id = $1', [req.params.suiteId]);
    const order = (maxRow?.m ?? -1) + 1;
    const id = newId();
    const p = ['high', 'medium', 'low'].includes(priority) ? priority : 'medium';
    await run(
      'INSERT INTO test_cases (id, suite_id, title, preconditions, steps, expected_result, priority, sort_order, tags, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [id, req.params.suiteId, title.trim(), preconditions || null, JSON.stringify(cleanSteps), expected_result.trim(), p, order, cleanTags, req.session?.userId || null]
    );
    const tc = await queryOne(`
      SELECT tc.*, cu.username AS created_by_username FROM test_cases tc
      LEFT JOIN users cu ON cu.id = tc.created_by WHERE tc.id = $1
    `, [id]);
    res.status(201).json({ ...tc, steps: JSON.parse(tc.steps) });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// PATCH /api/v1/cases/:id
router.patch('/:id', async (req, res) => {
  try {
    const tc = await queryOne('SELECT * FROM test_cases WHERE id = $1', [req.params.id]);
    if (!tc) return res.status(404).json({ error: 'Test case not found', code: 'NOT_FOUND' });
    const { title, preconditions, steps, expected_result, priority, order, tags } = req.body;
    if (title !== undefined && !title.trim()) return res.status(400).json({ error: 'Title cannot be empty', code: 'VALIDATION_ERROR' });
    if (steps !== undefined) {
      const filtered = steps.filter(s => s && s.trim());
      if (filtered.length === 0) return res.status(400).json({ error: 'At least one step is required', code: 'VALIDATION_ERROR' });
    }

    const setClauses = [];
    const vals = [];
    let i = 1;
    if (title !== undefined)        { setClauses.push(`title = $${i++}`);         vals.push(title.trim()); }
    if (preconditions !== undefined){ setClauses.push(`preconditions = $${i++}`); vals.push(preconditions.trim() || null); }
    if (steps !== undefined)        { setClauses.push(`steps = $${i++}`);         vals.push(JSON.stringify(steps.filter(s => s && s.trim()))); }
    if (expected_result !== undefined){ setClauses.push(`expected_result = $${i++}`); vals.push(expected_result.trim()); }
    if (priority !== undefined && ['high', 'medium', 'low'].includes(priority)) { setClauses.push(`priority = $${i++}`); vals.push(priority); }
    if (order !== undefined)        { setClauses.push(`sort_order = $${i++}`);    vals.push(order); }
    if (tags !== undefined && Array.isArray(tags)) {
      const cleanTags = tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim().toLowerCase().slice(0, 30)).slice(0, 20);
      setClauses.push(`tags = $${i++}`);
      vals.push(cleanTags);
    }

    if (setClauses.length > 0) {
      setClauses.push(`updated_by = $${i++}`, `updated_at = NOW()`);
      vals.push(req.session?.userId || null, tc.id);
      await run(`UPDATE test_cases SET ${setClauses.join(', ')} WHERE id = $${i}`, vals);
    }
    const updated = await queryOne(`
      SELECT tc.*, cu.username AS created_by_username, uu.username AS updated_by_username
      FROM test_cases tc
      LEFT JOIN users cu ON cu.id = tc.created_by
      LEFT JOIN users uu ON uu.id = tc.updated_by
      WHERE tc.id = $1
    `, [req.params.id]);
    res.json({ ...updated, steps: JSON.parse(updated.steps) });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/cases/:id/last-run
router.get('/:id/last-run', async (req, res) => {
  try {
    const row = await queryOne(`
      SELECT rc.status, rc.run_id,
             r.name AS run_name, r.run_number,
             r.project_id
      FROM run_cases rc
      JOIN runs r ON r.id = rc.run_id
      WHERE rc.case_id = $1
      ORDER BY r.created_at DESC
      LIMIT 1
    `, [req.params.id]);
    res.json(row || null);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/cases/:id/duplicate
router.post('/:id/duplicate', async (req, res) => {
  try {
    const tc = await queryOne('SELECT * FROM test_cases WHERE id = $1', [req.params.id]);
    if (!tc) return res.status(404).json({ error: 'Test case not found', code: 'NOT_FOUND' });
    const rawTitle = 'Copy of ' + tc.title;
    const newTitle = rawTitle.length > 100 ? rawTitle.slice(0, 100) : rawTitle;
    const maxRow = await queryOne('SELECT MAX(sort_order) AS m FROM test_cases WHERE suite_id = $1', [tc.suite_id]);
    const order = (maxRow?.m ?? -1) + 1;
    const id = newId();
    await run(
      'INSERT INTO test_cases (id, suite_id, title, preconditions, steps, expected_result, priority, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [id, tc.suite_id, newTitle, tc.preconditions, tc.steps, tc.expected_result, tc.priority, order]
    );
    const copy = await queryOne('SELECT * FROM test_cases WHERE id = $1', [id]);
    res.status(201).json({ ...copy, steps: JSON.parse(copy.steps) });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// PATCH /api/v1/cases/:id/move
router.patch('/:id/move', async (req, res) => {
  try {
    const tc = await queryOne('SELECT * FROM test_cases WHERE id = $1', [req.params.id]);
    if (!tc) return res.status(404).json({ error: 'Test case not found', code: 'NOT_FOUND' });
    const { suite_id } = req.body;
    if (!suite_id) return res.status(400).json({ error: 'suite_id is required', code: 'VALIDATION_ERROR' });
    if (suite_id === tc.suite_id) return res.json({ ...tc, steps: JSON.parse(tc.steps) });
    const destSuite = await queryOne('SELECT * FROM suites WHERE id = $1', [suite_id]);
    if (!destSuite) return res.status(404).json({ error: 'Destination suite not found', code: 'NOT_FOUND' });
    const srcSuite = await queryOne('SELECT * FROM suites WHERE id = $1', [tc.suite_id]);
    if (srcSuite.project_id !== destSuite.project_id) return res.status(400).json({ error: 'Cannot move case to a different project', code: 'VALIDATION_ERROR' });
    const maxRow = await queryOne('SELECT MAX(sort_order) AS m FROM test_cases WHERE suite_id = $1', [suite_id]);
    const order = (maxRow?.m ?? -1) + 1;
    await run('UPDATE test_cases SET suite_id = $1, sort_order = $2 WHERE id = $3', [suite_id, order, req.params.id]);
    const updated = await queryOne('SELECT * FROM test_cases WHERE id = $1', [req.params.id]);
    res.json({ ...updated, steps: JSON.parse(updated.steps) });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/suites/:suiteId/cases/import
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded', code: 'NO_FILE' });
  let wb;
  try {
    wb = XLSX.read(req.file.buffer, { type: 'buffer', cellText: true, raw: false });
  } catch {
    return res.status(400).json({ error: 'Invalid Excel file', code: 'INVALID_FILE' });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return res.status(400).json({ error: 'File has no data rows (row 1 is the header)', code: 'NO_DATA' });

  const header = rows[0].map(h => String(h).toLowerCase().trim());
  const col = (keywords) => header.findIndex(h => keywords.some(k => h.includes(k)));
  const titleCol    = col(['title']);
  const preconCol   = col(['precondition']);
  const stepsCol    = col(['step']);
  const expectedCol = col(['expected']);
  const priorityCol = col(['priority']);

  if (titleCol === -1 || expectedCol === -1) return res.status(400).json({ error: 'Template must have Title and Expected Result columns', code: 'MISSING_COLUMNS' });

  try {
    const suite = await queryOne('SELECT * FROM suites WHERE id = $1', [req.params.suiteId]);
    if (!suite) return res.status(404).json({ error: 'Suite not found', code: 'NOT_FOUND' });

    const maxRow = await queryOne('SELECT MAX(sort_order) AS m FROM test_cases WHERE suite_id = $1', [req.params.suiteId]);
    let maxOrder = maxRow?.m ?? -1;

    let imported = 0;
    const skipped = [];

    await transaction(async (tx) => {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const title = String(row[titleCol] ?? '').trim();
        const expected = String(row[expectedCol] ?? '').trim();
        if (!title || !expected) {
          skipped.push({ row: i + 1, reason: !title ? 'Missing title' : 'Missing expected result' });
          continue;
        }
        const truncatedTitle = title.slice(0, 100);
        const preconditions = preconCol !== -1 ? String(row[preconCol] ?? '').trim() || null : null;
        const priority = (() => {
          if (priorityCol === -1) return 'medium';
          const p = String(row[priorityCol] ?? '').trim().toLowerCase();
          return ['high', 'medium', 'low'].includes(p) ? p : 'medium';
        })();
        const stepsRaw = stepsCol !== -1 ? String(row[stepsCol] ?? '') : '';
        const steps = stepsRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const cleanSteps = steps.length > 0 ? steps : ['(no steps provided)'];
        await tx.run(
          'INSERT INTO test_cases (id, suite_id, title, preconditions, steps, expected_result, priority, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [newId(), req.params.suiteId, truncatedTitle, preconditions, JSON.stringify(cleanSteps), expected, priority, ++maxOrder]
        );
        imported++;
      }
    });

    res.status(201).json({ imported, skipped, total: rows.length - 1 });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/cases/:id/history
router.get('/:id/history', async (req, res) => {
  try {
    const rows = await query(`
      SELECT rc.id, rc.run_id, rc.status, rc.note,
             r.name AS run_name, r.run_number, r.created_at, r.completed_at, r.status AS run_status
      FROM run_cases rc
      JOIN runs r ON r.id = rc.run_id
      WHERE rc.case_id = $1
      ORDER BY r.created_at DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// DELETE /api/v1/cases/:id
router.delete('/:id', async (req, res) => {
  try {
    const tc = await queryOne('SELECT * FROM test_cases WHERE id = $1', [req.params.id]);
    if (!tc) return res.status(404).json({ error: 'Test case not found', code: 'NOT_FOUND' });
    await run('DELETE FROM test_cases WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

module.exports = router;
