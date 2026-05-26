const express = require('express');
const bcrypt = require('bcrypt');
const { query, queryOne, newId, dbErr } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All user management routes require admin
router.use(requireAdmin);

// GET /api/v1/users — list all users
router.get('/', async (_req, res) => {
  try {
    const users = await query(
      `SELECT id, username, email, role, must_change_password, is_active, require_jira_creds, created_at
       FROM users ORDER BY created_at ASC`
    );
    res.json(users);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json(e);
  }
});

// POST /api/v1/users — create tester
router.post('/', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required', code: 'VALIDATION' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters', code: 'VALIDATION' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const id = newId();
    const user = await queryOne(
      `INSERT INTO users (id, username, email, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, $4, 'tester', TRUE)
       RETURNING id, username, email, role, must_change_password, is_active, created_at`,
      [id, username, email || null, hash]
    );
    res.status(201).json(user);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json(e);
  }
});

// PATCH /api/v1/users/:id — update username/email/active status
router.patch('/:id', async (req, res) => {
  const { username, email, is_active, password, require_jira_creds } = req.body;
  const sets = [];
  const params = [];
  let i = 1;
  if (username !== undefined)           { sets.push(`username = $${i++}`);           params.push(username); }
  if (email !== undefined)              { sets.push(`email = $${i++}`);              params.push(email); }
  if (is_active !== undefined)          { sets.push(`is_active = $${i++}`);          params.push(is_active); }
  if (require_jira_creds !== undefined) { sets.push(`require_jira_creds = $${i++}`); params.push(!!require_jira_creds); }
  if (password !== undefined) {
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters', code: 'VALIDATION' });
    const hash = await bcrypt.hash(password, 12);
    sets.push(`password_hash = $${i++}`);
    params.push(hash);
    sets.push(`must_change_password = $${i++}`);
    params.push(true);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update', code: 'VALIDATION' });
  params.push(req.params.id);
  try {
    const user = await queryOne(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, username, email, role, must_change_password, is_active, require_jira_creds, created_at`,
      params
    );
    if (!user) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    res.json(user);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json(e);
  }
});

// DELETE /api/v1/users/:id — deactivate (soft delete)
router.delete('/:id', async (req, res) => {
  // Prevent deleting yourself
  if (req.params.id === req.session.userId) {
    return res.status(400).json({ error: 'Cannot deactivate your own account', code: 'SELF_DELETE' });
  }
  try {
    const user = await queryOne(
      `UPDATE users SET is_active = FALSE WHERE id = $1
       RETURNING id`,
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    res.status(204).end();
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json(e);
  }
});

// GET /api/v1/users/:id/projects — get project assignments for a user
router.get('/:id/projects', async (req, res) => {
  try {
    const rows = await query(
      `SELECT p.id, p.name, pm.assigned_at
       FROM project_members pm JOIN projects p ON p.id = pm.project_id
       WHERE pm.user_id = $1 ORDER BY p.name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json(e);
  }
});

// PUT /api/v1/users/:id/projects — replace project assignments
router.put('/:id/projects', async (req, res) => {
  const { projectIds } = req.body;
  if (!Array.isArray(projectIds)) {
    return res.status(400).json({ error: 'projectIds must be an array', code: 'VALIDATION' });
  }
  try {
    await query('DELETE FROM project_members WHERE user_id = $1', [req.params.id]);
    if (projectIds.length > 0) {
      const values = projectIds.map((pid, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
      const params = projectIds.flatMap(pid => [pid, req.params.id]);
      await query(`INSERT INTO project_members (project_id, user_id) VALUES ${values}`, params);
    }
    res.json({ ok: true });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json(e);
  }
});

module.exports = router;
