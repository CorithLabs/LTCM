const express = require('express');
const router = express.Router({ mergeParams: true });
const { query, queryOne, run, newId, dbErr } = require('../db');
const { getDecryptedConfigForUser, jiraFetch } = require('../jiraClient');

async function fetchEpicDetails(userId, epicKey) {
  try {
    const cfg = await getDecryptedConfigForUser(userId);
    if (!cfg) return { name: null, url: null };
    const url = `${cfg.base_url}/browse/${epicKey}`;
    if (!cfg.api_token) return { name: null, url };
    const jRes = await jiraFetch(cfg.base_url, cfg.email, cfg.api_token, `/issue/${encodeURIComponent(epicKey)}?fields=summary`);
    if (jRes.ok) {
      const data = await jRes.json();
      return { name: data.fields?.summary || null, url };
    }
    return { name: null, url };
  } catch {
    return { name: null, url: null };
  }
}

// GET /api/v1/projects/:projectId/suites
router.get('/', async (req, res) => {
  try {
    const suites = await query(`
      SELECT s.*, COUNT(tc.id)::int AS case_count
      FROM suites s
      LEFT JOIN test_cases tc ON tc.suite_id = s.id
      WHERE s.project_id = $1
      GROUP BY s.id
      ORDER BY s.sort_order ASC, s.created_at ASC
    `, [req.params.projectId]);
    res.json(suites);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/projects/:projectId/suites
router.post('/', async (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required', code: 'VALIDATION_ERROR' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Name must be 100 characters or fewer', code: 'VALIDATION_ERROR' });
  try {
    const maxRow = await queryOne('SELECT MAX(sort_order) AS m FROM suites WHERE project_id = $1', [req.params.projectId]);
    const order = (maxRow?.m ?? -1) + 1;
    const id = newId();
    await run('INSERT INTO suites (id, project_id, name, description, sort_order) VALUES ($1, $2, $3, $4, $5)',
      [id, req.params.projectId, name.trim(), description || null, order]);
    const suite = await queryOne('SELECT *, 0 AS case_count FROM suites WHERE id = $1', [id]);
    res.status(201).json(suite);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// PATCH /api/v1/suites/:id
router.patch('/:id', async (req, res) => {
  try {
    const suite = await queryOne('SELECT * FROM suites WHERE id = $1', [req.params.id]);
    if (!suite) return res.status(404).json({ error: 'Suite not found', code: 'NOT_FOUND' });
    const { name, description, order } = req.body;
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Name cannot be empty', code: 'VALIDATION_ERROR' });
    const descVal = description !== undefined ? description : null;

    // Epic key update: present in body means update (null/'' = clear; string = set)
    let epicKey = suite.jira_epic_key;
    let epicName = suite.jira_epic_name;
    let epicUrl = suite.jira_epic_url;
    if ('jiraEpicKey' in req.body) {
      const raw = req.body.jiraEpicKey;
      if (!raw || !raw.trim()) {
        epicKey = null; epicName = null; epicUrl = null;
      } else {
        epicKey = raw.trim().toUpperCase();
        const details = await fetchEpicDetails(req.session.userId, epicKey);
        epicName = details.name;
        epicUrl = details.url;
      }
    }

    await run(`
      UPDATE suites SET
        name = COALESCE($1, name),
        description = CASE WHEN $2 IS NOT NULL THEN $2 ELSE description END,
        sort_order = COALESCE($3, sort_order),
        jira_epic_key = $5,
        jira_epic_name = $6,
        jira_epic_url = $7
      WHERE id = $4
    `, [name ? name.trim() : null, descVal, order ?? null, req.params.id, epicKey, epicName, epicUrl]);
    res.json(await queryOne('SELECT *, (SELECT COUNT(*)::int FROM test_cases WHERE suite_id = $1) AS case_count FROM suites WHERE id = $1', [req.params.id]));
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/suites/:id/bugs — all Jira links for cases in this suite
router.get('/:id/bugs', async (req, res) => {
  try {
    const suite = await queryOne('SELECT id FROM suites WHERE id = $1', [req.params.id]);
    if (!suite) return res.status(404).json({ error: 'Suite not found', code: 'NOT_FOUND' });
    const bugs = await query(`
      SELECT
        cjl.id, cjl.jira_issue_key, cjl.jira_issue_url, cjl.jira_issue_summary,
        cjl.link_type, cjl.created_at,
        tc.id AS case_id, tc.title AS case_title,
        r.id AS run_id, r.name AS run_name, r.run_number
      FROM case_jira_links cjl
      JOIN test_cases tc ON tc.id = cjl.case_id
      LEFT JOIN runs r ON r.id = cjl.source_run_id
      WHERE tc.suite_id = $1
      ORDER BY cjl.created_at DESC
    `, [req.params.id]);
    res.json(bugs);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// DELETE /api/v1/suites/:id
router.delete('/:id', async (req, res) => {
  try {
    const suite = await queryOne('SELECT * FROM suites WHERE id = $1', [req.params.id]);
    if (!suite) return res.status(404).json({ error: 'Suite not found', code: 'NOT_FOUND' });
    await run('DELETE FROM suites WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

module.exports = router;
