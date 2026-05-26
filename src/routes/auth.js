const express = require('express');
const bcrypt = require('bcrypt');
const { query, queryOne } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function computeJiraCredsRequired(userId) {
  const row = await queryOne(`
    SELECT u.require_jira_creds,
           EXISTS(SELECT 1 FROM jira_user_credentials juc WHERE juc.user_id = u.id) AS has_jira_creds,
           EXISTS(SELECT 1 FROM jira_config) AS jira_configured
    FROM users u WHERE u.id = $1
  `, [userId]);
  return !!(row?.require_jira_creds && row?.jira_configured && !row?.has_jira_creds);
}

// GET /api/v1/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const jiraCredsRequired = await computeJiraCredsRequired(req.session.userId);
    res.json({
      id: req.session.userId,
      username: req.session.username,
      role: req.session.role,
      mustChangePassword: req.session.mustChangePassword,
      jiraCredsRequired,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required', code: 'VALIDATION' });
  }
  try {
    const user = await queryOne(
      'SELECT id, username, password_hash, role, must_change_password, is_active FROM users WHERE username = $1',
      [username]
    );
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid username or password', code: 'INVALID_CREDENTIALS' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password', code: 'INVALID_CREDENTIALS' });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.mustChangePassword = user.must_change_password;
    const jiraCredsRequired = await computeJiraCredsRequired(user.id);
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.must_change_password,
      jiraCredsRequired,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// POST /api/v1/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters', code: 'VALIDATION' });
  }
  try {
    const user = await queryOne('SELECT password_hash, must_change_password FROM users WHERE id = $1', [req.session.userId]);
    if (!user) return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });

    // Skip current password check only on forced first-change
    if (!user.must_change_password) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required', code: 'VALIDATION' });
      }
      const match = await bcrypt.compare(currentPassword, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Current password is incorrect', code: 'INVALID_CREDENTIALS' });
      }
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2', [hash, req.session.userId]);
    req.session.mustChangePassword = false;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'SERVER_ERROR' });
  }
});

module.exports = router;