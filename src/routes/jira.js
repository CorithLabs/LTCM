const express = require('express');
const router = express.Router();
const { query, queryOne, run, transaction, newId, dbErr } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const {
  ensureEncryptionKey, encrypt,
  getConfig, getDecryptedConfigForUser, jiraFetch,
  addJiraRemoteLink, removeJiraRemoteLink,
} = require('../jiraClient');

ensureEncryptionKey();

// GET /api/v1/jira/config — base URL only (admin reads this to see if Jira is configured)
router.get('/config', async (req, res) => {
  try {
    const cfg = await getConfig();
    if (!cfg) return res.json({ connected: false });
    res.json({ connected: true, baseUrl: cfg.base_url, ltcmBaseUrl: cfg.ltcm_base_url || null });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/jira/config — admin only; saves global base URL and optional LTCM base URL
router.post('/config', requireAdmin, async (req, res) => {
  const { baseUrl, ltcmBaseUrl } = req.body;
  if (!baseUrl) {
    return res.status(400).json({ error: 'baseUrl is required', code: 'VALIDATION_ERROR' });
  }
  let normalised;
  try {
    normalised = new URL(baseUrl).origin;
  } catch {
    return res.status(400).json({ error: 'Invalid Jira base URL format', code: 'VALIDATION_ERROR' });
  }
  let normalisedLtcm = null;
  if (ltcmBaseUrl) {
    try { normalisedLtcm = new URL(ltcmBaseUrl).origin; } catch {
      return res.status(400).json({ error: 'Invalid LTCM base URL format', code: 'VALIDATION_ERROR' });
    }
  }
  try {
    await run('DELETE FROM jira_config');
    await run('INSERT INTO jira_config (id, base_url, ltcm_base_url) VALUES ($1, $2, $3)', [newId(), normalised, normalisedLtcm]);
    res.status(201).json({ connected: true, baseUrl: normalised, ltcmBaseUrl: normalisedLtcm });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// PATCH /api/v1/jira/config — admin only; update base URL and/or LTCM base URL
router.patch('/config', requireAdmin, async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM jira_config LIMIT 1');
    if (!existing) return res.status(404).json({ error: 'No Jira config saved', code: 'NOT_CONFIGURED' });
    const { baseUrl, ltcmBaseUrl } = req.body;
    if (!baseUrl) return res.status(400).json({ error: 'baseUrl is required', code: 'VALIDATION_ERROR' });
    let normalised;
    try {
      normalised = new URL(baseUrl).origin;
    } catch {
      return res.status(400).json({ error: 'Invalid Jira base URL format', code: 'VALIDATION_ERROR' });
    }
    let normalisedLtcm = existing.ltcm_base_url;
    if (ltcmBaseUrl !== undefined) {
      if (ltcmBaseUrl === null || ltcmBaseUrl === '') {
        normalisedLtcm = null;
      } else {
        try { normalisedLtcm = new URL(ltcmBaseUrl).origin; } catch {
          return res.status(400).json({ error: 'Invalid LTCM base URL format', code: 'VALIDATION_ERROR' });
        }
      }
    }
    await run('UPDATE jira_config SET base_url = $1, ltcm_base_url = $2 WHERE id = $3', [normalised, normalisedLtcm, existing.id]);
    res.json({ connected: true, baseUrl: normalised, ltcmBaseUrl: normalisedLtcm || null });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// DELETE /api/v1/jira/config — admin only
router.delete('/config', requireAdmin, async (req, res) => {
  try {
    await run('DELETE FROM jira_config');
    res.status(204).send();
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/jira/my-credentials — returns current user's Jira credentials (token masked)
router.get('/my-credentials', async (req, res) => {
  try {
    const cred = await queryOne(
      'SELECT email FROM jira_user_credentials WHERE user_id = $1',
      [req.session.userId]
    );
    if (!cred) return res.json({ hasCredentials: false });
    res.json({ hasCredentials: true, email: cred.email });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/jira/my-credentials — upsert current user's email + API token
router.post('/my-credentials', async (req, res) => {
  const { email, apiToken } = req.body;
  if (!email || !apiToken) {
    return res.status(400).json({ error: 'email and apiToken are required', code: 'VALIDATION_ERROR' });
  }
  let encrypted;
  try {
    encrypted = encrypt(apiToken.trim());
  } catch (err) {
    return res.status(500).json({ error: err.message, code: 'ENCRYPTION_ERROR' });
  }
  try {
    const existing = await queryOne(
      'SELECT id FROM jira_user_credentials WHERE user_id = $1',
      [req.session.userId]
    );
    if (existing) {
      await run(
        'UPDATE jira_user_credentials SET email = $1, api_token_encrypted = $2 WHERE user_id = $3',
        [email.trim(), encrypted, req.session.userId]
      );
    } else {
      await run(
        'INSERT INTO jira_user_credentials (id, user_id, email, api_token_encrypted) VALUES ($1, $2, $3, $4)',
        [newId(), req.session.userId, email.trim(), encrypted]
      );
    }
    res.json({ hasCredentials: true, email: email.trim() });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// DELETE /api/v1/jira/my-credentials — remove current user's credentials
router.delete('/my-credentials', async (req, res) => {
  try {
    await run('DELETE FROM jira_user_credentials WHERE user_id = $1', [req.session.userId]);
    res.status(204).send();
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/jira/test — test current user's credentials
router.post('/test', async (req, res) => {
  try {
    const cfg = await getDecryptedConfigForUser(req.session.userId);
    if (!cfg) return res.status(400).json({ error: 'No Jira config saved', code: 'NOT_CONFIGURED' });
    if (!cfg.api_token) return res.status(400).json({ error: 'No Jira credentials configured for your account', code: 'NO_CREDENTIALS' });
    const jRes = await jiraFetch(cfg.base_url, cfg.email, cfg.api_token, '/myself');
    if (jRes.status === 401 || jRes.status === 403) return res.status(400).json({ error: 'Authentication failed — check email and API token', code: 'JIRA_AUTH_FAILED' });
    if (!jRes.ok) return res.status(400).json({ error: `Jira returned ${jRes.status}`, code: 'JIRA_ERROR' });
    const data = await jRes.json();
    res.json({ ok: true, displayName: data.displayName || data.name || cfg.email });
  } catch (err) {
    if (err.code === 'JIRA_UNREACHABLE') return res.status(400).json({ error: 'Could not reach Jira', code: 'JIRA_UNREACHABLE' });
    res.status(500).json({ error: err.message, code: 'JIRA_ERROR' });
  }
});

// GET /api/v1/jira/issues?key=PROJ-123
router.get('/issues', async (req, res) => {
  try {
    const cfg = await getDecryptedConfigForUser(req.session.userId);
    if (!cfg) return res.status(400).json({ error: 'No Jira config saved', code: 'NOT_CONFIGURED' });
    if (!cfg.api_token) return res.status(400).json({ error: 'No Jira credentials configured for your account', code: 'NO_CREDENTIALS' });
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: 'key query parameter is required', code: 'VALIDATION_ERROR' });
    const jRes = await jiraFetch(cfg.base_url, cfg.email, cfg.api_token, `/issue/${encodeURIComponent(key)}?fields=summary,status,issuetype`);
    if (jRes.status === 404) return res.status(404).json({ error: 'Issue not found', code: 'NOT_FOUND' });
    if (jRes.status === 401 || jRes.status === 403) return res.status(400).json({ error: 'Authentication failed', code: 'JIRA_AUTH_FAILED' });
    if (!jRes.ok) return res.status(400).json({ error: `Jira returned ${jRes.status}`, code: 'JIRA_ERROR' });
    const data = await jRes.json();
    res.json({ key: data.key, summary: data.fields.summary, status: data.fields.status?.name || null, type: data.fields.issuetype?.name || null });
  } catch (err) {
    if (err.code === 'JIRA_UNREACHABLE') return res.status(400).json({ error: 'Could not reach Jira', code: 'JIRA_UNREACHABLE' });
    res.status(500).json({ error: err.message, code: 'JIRA_ERROR' });
  }
});

// GET /api/v1/jira/versions?projectKey=PROJ
router.get('/versions', async (req, res) => {
  try {
    const cfg = await getDecryptedConfigForUser(req.session.userId);
    if (!cfg) return res.status(400).json({ error: 'No Jira config saved', code: 'NOT_CONFIGURED' });
    if (!cfg.api_token) return res.status(400).json({ error: 'No Jira credentials configured for your account', code: 'NO_CREDENTIALS' });
    const projectKey = req.query.projectKey || cfg.project_key;
    if (!projectKey) return res.status(400).json({ error: 'projectKey query parameter is required', code: 'VALIDATION_ERROR' });
    const jRes = await jiraFetch(cfg.base_url, cfg.email, cfg.api_token, `/project/${encodeURIComponent(projectKey)}/versions`);
    if (jRes.status === 404) return res.status(404).json({ error: 'Project not found in Jira', code: 'NOT_FOUND' });
    if (jRes.status === 401 || jRes.status === 403) return res.status(400).json({ error: 'Authentication failed', code: 'JIRA_AUTH_FAILED' });
    if (!jRes.ok) return res.status(400).json({ error: `Jira returned ${jRes.status}`, code: 'JIRA_ERROR' });
    const data = await jRes.json();
    const versions = data
      .map(v => ({ id: v.id, name: v.name, released: v.released || false, releaseDate: v.releaseDate || null }))
      .sort((a, b) => (a.released === b.released ? 0 : a.released ? 1 : -1));
    res.json(versions);
  } catch (err) {
    if (err.code === 'JIRA_UNREACHABLE') return res.status(400).json({ error: 'Could not reach Jira', code: 'JIRA_UNREACHABLE' });
    res.status(500).json({ error: err.message, code: 'JIRA_ERROR' });
  }
});

// GET /api/v1/jira/statuses — admin only; returns distinct status names from Jira for mapping config
router.get('/statuses', requireAdmin, async (req, res) => {
  try {
    const cfg = await getDecryptedConfigForUser(req.session.userId);
    if (!cfg) return res.status(400).json({ error: 'No Jira config saved', code: 'NOT_CONFIGURED' });
    if (!cfg.api_token) return res.status(400).json({ error: 'No Jira credentials configured for your account', code: 'NO_CREDENTIALS' });
    const jRes = await jiraFetch(cfg.base_url, cfg.email, cfg.api_token, '/status');
    if (jRes.status === 401 || jRes.status === 403) return res.status(400).json({ error: 'Authentication failed', code: 'JIRA_AUTH_FAILED' });
    if (!jRes.ok) return res.status(400).json({ error: `Jira returned ${jRes.status}`, code: 'JIRA_ERROR' });
    const data = await jRes.json();
    const names = [...new Set(data.map(s => s.name))].sort();
    res.json(names);
  } catch (err) {
    if (err.code === 'JIRA_UNREACHABLE') return res.status(400).json({ error: 'Could not reach Jira', code: 'JIRA_UNREACHABLE' });
    res.status(500).json({ error: err.message, code: 'JIRA_ERROR' });
  }
});

// GET /api/v1/jira/status-mapping — admin only; return current LTCM→Jira status mapping
router.get('/status-mapping', requireAdmin, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM jira_status_mapping');
    const mapping = { pass: null, fail: null, in_progress: null };
    for (const r of rows) mapping[r.ltcm_event] = r.jira_status_name;
    res.json(mapping);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// PUT /api/v1/jira/status-mapping — admin only; upsert all 3 mappings (null clears a mapping)
router.put('/status-mapping', requireAdmin, async (req, res) => {
  const entries = [
    ['pass', req.body.pass],
    ['fail', req.body.fail],
    ['in_progress', req.body.in_progress],
  ];
  try {
    await transaction(async (tx) => {
      for (const [event, statusName] of entries) {
        if (statusName === undefined) continue;
        if (!statusName) {
          await tx.run('DELETE FROM jira_status_mapping WHERE ltcm_event = $1', [event]);
        } else {
          await tx.run(
            'INSERT INTO jira_status_mapping (ltcm_event, jira_status_name) VALUES ($1, $2) ON CONFLICT (ltcm_event) DO UPDATE SET jira_status_name = EXCLUDED.jira_status_name',
            [event, statusName]
          );
        }
      }
    });
    const rows = await query('SELECT * FROM jira_status_mapping');
    const mapping = { pass: null, fail: null, in_progress: null };
    for (const r of rows) mapping[r.ltcm_event] = r.jira_status_name;
    res.json(mapping);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/jira/cases/:id/jira-links
router.get('/cases/:id/jira-links', async (req, res) => {
  try {
    const tc = await queryOne('SELECT id FROM test_cases WHERE id = $1', [req.params.id]);
    if (!tc) return res.status(404).json({ error: 'Test case not found', code: 'NOT_FOUND' });
    const links = await query('SELECT * FROM case_jira_links WHERE case_id = $1 ORDER BY created_at ASC', [req.params.id]);
    res.json(links);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/jira/cases/:id/jira-links
// Works with or without Jira configured. When Jira credentials exist, enriches the
// link with the issue summary and URL. When not, stores the key only.
router.post('/cases/:id/jira-links', async (req, res) => {
  try {
    const tc = await queryOne('SELECT id FROM test_cases WHERE id = $1', [req.params.id]);
    if (!tc) return res.status(404).json({ error: 'Test case not found', code: 'NOT_FOUND' });
    const rawKey = req.body.jiraIssueKey;
    if (!rawKey || !rawKey.trim()) return res.status(400).json({ error: 'jiraIssueKey is required', code: 'VALIDATION_ERROR' });
    const issueKey = rawKey.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(issueKey)) return res.status(400).json({ error: 'Invalid Jira issue key format (e.g. PROJ-123)', code: 'VALIDATION_ERROR' });
    const existing = await queryOne('SELECT id FROM case_jira_links WHERE case_id = $1 AND jira_issue_key = $2', [req.params.id, issueKey]);
    if (existing) return res.status(409).json({ error: 'Issue already linked to this case', code: 'DUPLICATE_LINK' });

    let issueSummary = null;
    let issueUrl = null;

    // Try to enrich via Jira — degrade gracefully if not configured or unreachable (NFR-08)
    try {
      const cfg = await getDecryptedConfigForUser(req.session.userId);
      if (cfg) {
        issueUrl = `${cfg.base_url}/browse/${issueKey}`;
        if (cfg.api_token) {
          const jRes = await jiraFetch(cfg.base_url, cfg.email, cfg.api_token, `/issue/${encodeURIComponent(issueKey)}?fields=summary`);
          if (jRes.status === 404) return res.status(404).json({ error: 'Jira issue not found', code: 'NOT_FOUND' });
          if (jRes.status === 401 || jRes.status === 403) return res.status(400).json({ error: 'Authentication failed', code: 'JIRA_AUTH_FAILED' });
          if (jRes.ok) {
            const data = await jRes.json();
            issueSummary = data.fields?.summary || null;
          }
        }
      }
    } catch (err) {
      if (err.code !== 'JIRA_UNREACHABLE') throw err;
      // Jira unreachable — save key without enrichment
    }

    const id = newId();
    await run('INSERT INTO case_jira_links (id, case_id, jira_issue_key, jira_issue_summary, jira_issue_url, link_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, req.params.id, issueKey, issueSummary, issueUrl, 'manual']);

    // Fire-and-forget: add a remote link on the Jira issue pointing back to this test case
    setImmediate(async () => {
      try {
        const cfg = await getDecryptedConfigForUser(req.session.userId);
        const ltcmBase = cfg?.ltcm_base_url;
        if (!ltcmBase || !cfg?.api_token) return;
        // Fetch suite and project IDs for building the URL
        const caseRow = await queryOne(
          'SELECT tc.title, tc.suite_id, s.project_id FROM test_cases tc JOIN suites s ON s.id = tc.suite_id WHERE tc.id = $1',
          [req.params.id]
        );
        if (!caseRow) return;
        const caseUrl = `${ltcmBase}/projects/${caseRow.project_id}/suites/${caseRow.suite_id}/cases/${req.params.id}`;
        const remoteLinkId = await addJiraRemoteLink(issueKey, id, caseRow.title, ltcmBase, caseUrl, cfg);
        if (remoteLinkId) {
          await run('UPDATE case_jira_links SET jira_remote_link_id = $1 WHERE id = $2', [remoteLinkId, id]);
        }
      } catch (err) {
        console.warn(`[jira-remotelink] post-insert silent fail: ${err.message}`);
      }
    });

    res.status(201).json(await queryOne('SELECT * FROM case_jira_links WHERE id = $1', [id]));
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// DELETE /api/v1/jira/cases/:id/jira-links/:linkId
router.delete('/cases/:id/jira-links/:linkId', async (req, res) => {
  try {
    const link = await queryOne('SELECT * FROM case_jira_links WHERE id = $1 AND case_id = $2', [req.params.linkId, req.params.id]);
    if (!link) return res.status(404).json({ error: 'Link not found', code: 'NOT_FOUND' });
    await run('DELETE FROM case_jira_links WHERE id = $1', [req.params.linkId]);

    // Fire-and-forget: remove the remote link from Jira
    if (link.jira_remote_link_id) {
      setImmediate(async () => {
        try {
          const cfg = await getDecryptedConfigForUser(req.session.userId);
          if (!cfg?.api_token) return;
          await removeJiraRemoteLink(link.jira_issue_key, link.jira_remote_link_id, cfg);
        } catch (err) {
          console.warn(`[jira-remotelink] delete silent fail: ${err.message}`);
        }
      });
    }

    res.status(204).send();
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

module.exports = router;
