const express = require('express');
const router = express.Router();
const { query, queryOne, run, newId, dbErr } = require('../db');

// GET /api/v1/projects
router.get('/', async (req, res) => {
  try {
    const rows = await query(`
      SELECT p.*,
        (SELECT status FROM runs WHERE project_id = p.id ORDER BY created_at DESC LIMIT 1) AS last_run_status,
        (SELECT created_at FROM runs WHERE project_id = p.id ORDER BY created_at DESC LIMIT 1) AS last_run_at
      FROM projects p
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/projects
router.post('/', async (req, res) => {
  const { name, description, jiraProjectKey, userIds } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required', code: 'VALIDATION_ERROR' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Name must be 100 characters or fewer', code: 'VALIDATION_ERROR' });
  try {
    const id = newId();
    await run(
      'INSERT INTO projects (id, name, description, jira_project_key) VALUES ($1, $2, $3, $4)',
      [id, name.trim(), description || null, jiraProjectKey ? jiraProjectKey.trim().toUpperCase() : null]
    );
    if (Array.isArray(userIds) && userIds.length > 0) {
      const values = userIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
      const params = userIds.flatMap(uid => [id, uid]);
      await run(`INSERT INTO project_members (project_id, user_id) VALUES ${values}`, params);
    }
    const project = await queryOne('SELECT * FROM projects WHERE id = $1', [id]);
    res.status(201).json(project);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// PATCH /api/v1/projects/:id
router.patch('/:id', async (req, res) => {
  try {
    const project = await queryOne('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!project) return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
    const { name, description, jiraProjectKey } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty', code: 'VALIDATION_ERROR' });
      if (name.trim().length > 100) return res.status(400).json({ error: 'Name must be 100 characters or fewer', code: 'VALIDATION_ERROR' });
    }
    const sets = [];
    const params = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); params.push(name.trim()); }
    if (description !== undefined) { sets.push(`description = $${i++}`); params.push(description || null); }
    if (jiraProjectKey !== undefined) {
      sets.push(`jira_project_key = $${i++}`);
      params.push(jiraProjectKey ? jiraProjectKey.trim().toUpperCase() : null);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update', code: 'VALIDATION_ERROR' });
    params.push(req.params.id);
    await run(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${i}`, params);
    res.json(await queryOne('SELECT * FROM projects WHERE id = $1', [req.params.id]));
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// DELETE /api/v1/projects/:id
router.delete('/:id', async (req, res) => {
  try {
    const project = await queryOne('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    if (!project) return res.status(404).json({ error: 'Project not found', code: 'NOT_FOUND' });
    const inProgress = await queryOne("SELECT id FROM runs WHERE project_id = $1 AND status = 'in_progress'", [req.params.id]);
    if (inProgress) return res.status(409).json({ error: 'Cannot delete project with an in-progress run', code: 'RUN_IN_PROGRESS' });
    await run('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/projects/:id/bugs
router.get('/:id/bugs', async (req, res) => {
  try {
    const bugs = await query(`
      SELECT cjl.id, cjl.jira_issue_key, cjl.jira_issue_url, cjl.jira_issue_summary,
        cjl.link_type, cjl.created_at,
        tc.id AS case_id, tc.title AS case_title, tc.case_number,
        s.id AS suite_id, s.name AS suite_name,
        r.id AS run_id, r.name AS run_name, r.run_number
      FROM case_jira_links cjl
      JOIN test_cases tc ON tc.id = cjl.case_id
      JOIN suites s ON s.id = tc.suite_id
      LEFT JOIN runs r ON r.id = cjl.source_run_id
      WHERE s.project_id = $1
      ORDER BY cjl.created_at DESC
    `, [req.params.id]);
    res.json(bugs);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/projects/:id/members
router.get('/:id/members', async (req, res) => {
  try {
    const rows = await query(
      `SELECT u.id, u.username, u.email, u.role, pm.assigned_at
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1 ORDER BY u.username`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// PUT /api/v1/projects/:id/members — replace member list
router.put('/:id/members', async (req, res) => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds)) return res.status(400).json({ error: 'userIds must be an array', code: 'VALIDATION_ERROR' });
  try {
    await run('DELETE FROM project_members WHERE project_id = $1', [req.params.id]);
    if (userIds.length > 0) {
      const values = userIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
      const params = userIds.flatMap(uid => [req.params.id, uid]);
      await run(`INSERT INTO project_members (project_id, user_id) VALUES ${values}`, params);
    }
    res.json({ ok: true });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

module.exports = router;
