const express = require('express');
const router = express.Router({ mergeParams: true });
const { query, queryOne, run, transaction, newId, dbErr } = require('../db');
const multer = require('multer');
const { getDecryptedConfigForUser, jiraFetch, jiraUploadAttachment, buildRunComment, fireJiraTransitions } = require('../jiraClient');

const defectUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const VALID_STATUSES = ['pass', 'fail', 'skip', 'blocked', 'na'];

// GET /api/v1/projects/:projectId/runs
router.get('/', async (req, res) => {
  try {
    const runs = await query(`
      SELECT r.*,
        COUNT(rc.id)::int AS case_count,
        COALESCE(SUM(CASE WHEN rc.status = 'pass'    THEN 1 ELSE 0 END), 0)::int AS passed,
        COALESCE(SUM(CASE WHEN rc.status = 'fail'    THEN 1 ELSE 0 END), 0)::int AS failed,
        COALESCE(SUM(CASE WHEN rc.status = 'skip'    THEN 1 ELSE 0 END), 0)::int AS skipped,
        COALESCE(SUM(CASE WHEN rc.status = 'blocked' THEN 1 ELSE 0 END), 0)::int AS blocked,
        COALESCE(SUM(CASE WHEN rc.status = 'na'      THEN 1 ELSE 0 END), 0)::int AS na,
        u.username AS created_by_username
      FROM runs r
      LEFT JOIN run_cases rc ON rc.run_id = r.id
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.project_id = $1
      GROUP BY r.id, u.username
      ORDER BY r.created_at DESC
    `, [req.params.projectId]);
    res.json(runs);
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/projects/:projectId/runs
router.post('/', async (req, res) => {
  try {
    const existing = await queryOne("SELECT id FROM runs WHERE project_id = $1 AND status = 'in_progress'", [req.params.projectId]);
    if (existing) return res.status(409).json({ error: 'An in-progress run already exists for this project', code: 'RUN_IN_PROGRESS', runId: existing.id });

    const { name, suite_ids, jiraVersionId, jiraVersionName, environment } = req.body;

    let cases;
    if (suite_ids && suite_ids.length > 0) {
      cases = await query(`
        SELECT tc.*, s.name AS suite_name
        FROM test_cases tc
        JOIN suites s ON s.id = tc.suite_id
        WHERE tc.suite_id = ANY($1::text[]) AND s.project_id = $2
        ORDER BY s.sort_order, tc.sort_order
      `, [suite_ids, req.params.projectId]);
    } else {
      cases = await query(`
        SELECT tc.*, s.name AS suite_name
        FROM test_cases tc
        JOIN suites s ON s.id = tc.suite_id
        WHERE s.project_id = $1
        ORDER BY s.sort_order, tc.sort_order
      `, [req.params.projectId]);
    }

    if (cases.length === 0) return res.status(400).json({ error: 'No test cases found for selected suites', code: 'NO_CASES' });

    const runId = newId();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const runName = name && name.trim() ? name.trim() : `Run ${now.slice(0, 10)} ${now.slice(11, 16)}`;
    const envVal = environment && environment.trim() ? environment.trim().slice(0, 100) : null;

    await transaction(async (tx) => {
      await tx.run(
        'INSERT INTO runs (id, project_id, name, jira_version_id, jira_version_name, environment, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [runId, req.params.projectId, runName, jiraVersionId || null, jiraVersionName || null, envVal, req.session?.userId || null]
      );
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i];
        await tx.run(
          'INSERT INTO run_cases (id, run_id, case_id, title, preconditions, steps, expected_result, priority, suite_name, sort_order, case_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          [newId(), runId, c.id, c.title, c.preconditions, c.steps, c.expected_result, c.priority, c.suite_name, i, c.case_number || null]
        );
      }
      await tx.run("UPDATE projects SET last_run_status = 'in_progress', last_run_at = NOW() WHERE id = $1", [req.params.projectId]);
    });

    res.status(201).json({ id: runId, name: runName, status: 'in_progress', created_at: now, case_count: cases.length, jira_version_id: jiraVersionId || null, jira_version_name: jiraVersionName || null, environment: envVal });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/runs/:runId/cases
router.get('/:runId/cases', async (req, res) => {
  try {
    const cases = await query('SELECT * FROM run_cases WHERE run_id = $1 ORDER BY sort_order ASC', [req.params.runId]);
    res.json(cases.map(c => ({
      ...c,
      steps: JSON.parse(c.steps),
      step_results: c.step_results ? JSON.parse(c.step_results) : null,
    })));
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// PATCH /api/v1/runs/:runId/cases/:caseId
router.patch('/:runId/cases/:caseId', async (req, res) => {
  try {
    const runRow = await queryOne('SELECT * FROM runs WHERE id = $1', [req.params.runId]);
    if (!runRow) return res.status(404).json({ error: 'Run not found', code: 'NOT_FOUND' });
    if (runRow.status === 'completed') return res.status(409).json({ error: 'Run is completed', code: 'RUN_COMPLETED' });

    const rc = await queryOne('SELECT * FROM run_cases WHERE run_id = $1 AND id = $2', [req.params.runId, req.params.caseId]);
    if (!rc) return res.status(404).json({ error: 'Run case not found', code: 'RUN_CASE_NOT_FOUND' });

    const { status, note, stepResults } = req.body;
    if (status !== undefined && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}.`, code: 'VALIDATION_ERROR' });
    if (stepResults !== undefined && !Array.isArray(stepResults)) return res.status(400).json({ error: 'stepResults must be an array.', code: 'VALIDATION_ERROR' });

    const setClauses = [];
    const vals = [];
    let i = 1;
    if (status !== undefined)      { setClauses.push(`status = $${i++}`);       vals.push(status); }
    if (note !== undefined)        { setClauses.push(`note = $${i++}`);         vals.push(note || null); }
    if (stepResults !== undefined) { setClauses.push(`step_results = $${i++}`); vals.push(JSON.stringify(stepResults)); }

    if (setClauses.length > 0) {
      vals.push(rc.id);
      await run(`UPDATE run_cases SET ${setClauses.join(', ')} WHERE id = $${i}`, vals);
    }

    const updated = await queryOne('SELECT * FROM run_cases WHERE id = $1', [rc.id]);
    res.json({
      ...updated,
      steps: JSON.parse(updated.steps),
      step_results: updated.step_results ? JSON.parse(updated.step_results) : null,
    });

    // Fire Jira transition asynchronously — silent fail, never blocks response
    if (status !== undefined && status !== rc.status) {
      const jiraEvent = status === 'pass' ? 'pass'
        : status === 'fail' ? 'fail'
        : rc.status === null ? 'in_progress'
        : null;
      if (jiraEvent) {
        fireJiraTransitions(rc.case_id, jiraEvent, req.session?.userId, req.session?.username).catch(() => {});
      }
    }
  } catch (err) {
    const e = dbErr(err);
    res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/runs/:runId/cases/:caseId/defect
router.post('/:runId/cases/:caseId/defect', defectUpload.array('attachments', 10), async (req, res) => {
  try {
    const rc = await queryOne('SELECT * FROM run_cases WHERE run_id = $1 AND id = $2', [req.params.runId, req.params.caseId]);
    if (!rc) return res.status(404).json({ error: 'Run case not found', code: 'RUN_CASE_NOT_FOUND' });

    let cfg;
    try { cfg = await getDecryptedConfigForUser(req.session.userId); } catch (_) {}
    if (!cfg) return res.status(400).json({ error: 'Jira not configured', code: 'JIRA_NOT_CONFIGURED' });
    if (!cfg.api_token) return res.status(400).json({ error: 'No Jira credentials configured for your account', code: 'NO_CREDENTIALS' });

    // Get jira_project_key from the run's project
    const runRow = await queryOne('SELECT project_id FROM runs WHERE id = $1', [req.params.runId]);
    const project = runRow ? await queryOne('SELECT jira_project_key FROM projects WHERE id = $1', [runRow.project_id]) : null;
    const projectKey = project?.jira_project_key || cfg.project_key;
    if (!projectKey) return res.status(400).json({ error: 'No Jira project key configured for this project', code: 'NO_PROJECT_KEY' });

    const steps = JSON.parse(rc.steps || '[]');
    const stepsText = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    const summary = (req.body.summary || rc.title).trim();
    const description = req.body.description || [
      `*Steps:*\n${stepsText}`,
      `*Expected Result:*\n${rc.expected_result}`,
      rc.note ? `*Tester Note:*\n${rc.note}` : null,
    ].filter(Boolean).join('\n\n');
    const issueType = req.body.issueType || 'Bug';

    const createRes = await jiraFetch(
      cfg.base_url, cfg.email, cfg.api_token, '/issue',
      {
        method: 'POST',
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary,
            description: {
              type: 'doc', version: 1,
              content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }]
            },
            issuetype: { name: issueType },
          }
        })
      }
    );

    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({}));
      return res.status(502).json({ error: body.errorMessages?.[0] || 'Jira request failed', code: 'JIRA_ERROR' });
    }

    const issue = await createRes.json();
    const jiraIssueKey = issue.key;
    const jiraIssueUrl = `${cfg.base_url}/browse/${jiraIssueKey}`;

    // Upload attachments to Jira (best-effort — failures don't block the response)
    const attachmentResults = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const attRes = await jiraUploadAttachment(
            cfg.base_url, cfg.email, cfg.api_token,
            jiraIssueKey, file.buffer, file.originalname, file.mimetype
          );
          attachmentResults.push({ name: file.originalname, ok: attRes.ok, status: attRes.status });
        } catch (e) {
          attachmentResults.push({ name: file.originalname, ok: false, error: e.message });
        }
      }
    }

    try {
      await run(
        'INSERT INTO case_jira_links (id, case_id, jira_issue_key, jira_issue_summary, jira_issue_url, source_run_id, link_type) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING',
        [newId(), rc.case_id, jiraIssueKey, summary, jiraIssueUrl, req.params.runId, 'created']
      );
    } catch (_) {}

    res.status(201).json({ jiraIssueKey, jiraIssueUrl, attachments: attachmentResults });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Jira request failed', code: 'JIRA_ERROR' });
  }
});

// POST /api/v1/runs/:runId/cases/:caseId/jira-comment
router.post('/:runId/cases/:caseId/jira-comment', async (req, res) => {
  try {
    const rc = await queryOne('SELECT * FROM run_cases WHERE run_id = $1 AND id = $2', [req.params.runId, req.params.caseId]);
    if (!rc) return res.status(404).json({ error: 'Run case not found', code: 'RUN_CASE_NOT_FOUND' });

    const { issueKey } = req.body;
    if (!issueKey) return res.status(400).json({ error: 'issueKey is required', code: 'BAD_REQUEST' });

    let cfg;
    try { cfg = await getDecryptedConfigForUser(req.session.userId); } catch (_) {}
    if (!cfg) return res.status(400).json({ error: 'Jira not configured', code: 'JIRA_NOT_CONFIGURED' });
    if (!cfg.api_token) return res.status(400).json({ error: 'No Jira credentials configured for your account', code: 'NO_CREDENTIALS' });

    const commentBody = buildRunComment(rc);
    const commentRes = await jiraFetch(
      cfg.base_url, cfg.email, cfg.api_token,
      `/issue/${issueKey}/comment`,
      { method: 'POST', body: JSON.stringify({ body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: commentBody }] }] } }) }
    );
    if (!commentRes.ok) {
      const body = await commentRes.json().catch(() => ({}));
      return res.status(502).json({ error: body.errorMessages?.[0] || 'Jira comment failed', code: 'JIRA_ERROR' });
    }
    const issueUrl = `${cfg.base_url}/browse/${issueKey}`;
    // Also save the link in case_jira_links if not already there
    try {
      const issue = await jiraFetch(cfg.base_url, cfg.email, cfg.api_token, `/issue/${issueKey}?fields=summary`);
      const issueData = issue.ok ? await issue.json().catch(() => ({})) : {};
      const issueSummary = issueData.fields?.summary || null;
      await run(
        'INSERT INTO case_jira_links (id, case_id, jira_issue_key, jira_issue_summary, jira_issue_url, source_run_id, link_type) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING',
        [newId(), rc.case_id, issueKey, issueSummary, issueUrl, req.params.runId, 'comment']
      );
    } catch (_) {}
    res.json({ ok: true, issueKey, issueUrl });
  } catch (err) {
    res.status(502).json({ error: err.message || 'Jira request failed', code: 'JIRA_ERROR' });
  }
});

// PATCH /api/v1/runs/:runId — complete a run
router.patch('/:runId', async (req, res) => {
  try {
    const runRow = await queryOne('SELECT * FROM runs WHERE id = $1', [req.params.runId]);
    if (!runRow) return res.status(404).json({ error: 'Run not found', code: 'NOT_FOUND' });
    if (runRow.status === 'completed') return res.status(400).json({ error: 'Run already completed', code: 'ALREADY_COMPLETED' });

    const { status, force_complete } = req.body;
    if (status !== 'completed') return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR' });

    await transaction(async (tx) => {
      if (force_complete) {
        await tx.run("UPDATE run_cases SET status = 'skip' WHERE run_id = $1 AND status IS NULL", [runRow.id]);
      }
      await tx.run("UPDATE runs SET status = 'completed', completed_at = NOW() WHERE id = $1", [runRow.id]);
      await tx.run("UPDATE projects SET last_run_status = 'completed', last_run_at = NOW() WHERE id = $1", [runRow.project_id]);
    });

    const updated = await queryOne(`
      SELECT r.*,
        COALESCE(SUM(CASE WHEN rc.status = 'pass'    THEN 1 ELSE 0 END), 0)::int AS passed,
        COALESCE(SUM(CASE WHEN rc.status = 'fail'    THEN 1 ELSE 0 END), 0)::int AS failed,
        COALESCE(SUM(CASE WHEN rc.status = 'skip'    THEN 1 ELSE 0 END), 0)::int AS skipped,
        COALESCE(SUM(CASE WHEN rc.status = 'blocked' THEN 1 ELSE 0 END), 0)::int AS blocked,
        COALESCE(SUM(CASE WHEN rc.status = 'na'      THEN 1 ELSE 0 END), 0)::int AS na
      FROM runs r LEFT JOIN run_cases rc ON rc.run_id = r.id
      WHERE r.id = $1 GROUP BY r.id
    `, [runRow.id]);

    // Post Jira comments best-effort
    let jiraComments = [];
    try {
      const cfg = await getDecryptedConfigForUser(req.session.userId);
      if (cfg) {
        const links = await query(`
          SELECT cjl.jira_issue_key, rc.title, rc.status, rc.note, rc.suite_name
          FROM run_cases rc
          JOIN case_jira_links cjl ON cjl.case_id = rc.case_id
          WHERE rc.run_id = $1
          ORDER BY cjl.jira_issue_key, rc.sort_order
        `, [runRow.id]);

        if (links.length > 0) {
          const grouped = {};
          for (const link of links) {
            if (!grouped[link.jira_issue_key]) grouped[link.jira_issue_key] = [];
            grouped[link.jira_issue_key].push(link);
          }
          const runName = updated.name || runRow.id;
          for (const [issueKey, cases] of Object.entries(grouped)) {
            try {
              const body = buildRunComment(runName, cases);
              const jRes = await jiraFetch(cfg.base_url, cfg.email, cfg.api_token, `/issue/${encodeURIComponent(issueKey)}/comment`, { method: 'POST', body: JSON.stringify({ body }) });
              jiraComments.push({ issueKey, ok: jRes.ok, status: jRes.status });
            } catch (e) {
              jiraComments.push({ issueKey, ok: false, error: e.message });
            }
          }
        }
      }
    } catch (_) {}

    res.json({ ...updated, jiraComments });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/runs/:runId/summary
router.get('/:runId/summary', async (req, res) => {
  try {
    const runRow = await queryOne(`
      SELECT r.*,
        COUNT(rc.id)::int AS total,
        COALESCE(SUM(CASE WHEN rc.status = 'pass'    THEN 1 ELSE 0 END), 0)::int AS passed,
        COALESCE(SUM(CASE WHEN rc.status = 'fail'    THEN 1 ELSE 0 END), 0)::int AS failed,
        COALESCE(SUM(CASE WHEN rc.status = 'skip'    THEN 1 ELSE 0 END), 0)::int AS skipped,
        COALESCE(SUM(CASE WHEN rc.status = 'blocked' THEN 1 ELSE 0 END), 0)::int AS blocked,
        COALESCE(SUM(CASE WHEN rc.status = 'na'      THEN 1 ELSE 0 END), 0)::int AS na,
        u.username AS created_by_username
      FROM runs r
      LEFT JOIN run_cases rc ON rc.run_id = r.id
      LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = $1 GROUP BY r.id, u.username
    `, [req.params.runId]);
    if (!runRow) return res.status(404).json({ error: 'Run not found', code: 'NOT_FOUND' });

    const cases = await query(`
      SELECT * FROM run_cases WHERE run_id = $1
      ORDER BY CASE status WHEN 'fail' THEN 0 WHEN 'blocked' THEN 1 WHEN 'pass' THEN 2 WHEN 'skip' THEN 3 WHEN 'na' THEN 4 ELSE 5 END, sort_order ASC
    `, [req.params.runId]);

    let duration_ms = null;
    if (runRow.created_at && runRow.completed_at) {
      duration_ms = new Date(runRow.completed_at).getTime() - new Date(runRow.created_at).getTime();
    }

    let diff = null;
    const prevRun = await queryOne(`
      SELECT id FROM runs
      WHERE project_id = $1 AND status = 'completed' AND id != $2
      ORDER BY completed_at DESC LIMIT 1
    `, [runRow.project_id, runRow.id]);

    if (prevRun) {
      const prevCases = await query('SELECT case_id, status FROM run_cases WHERE run_id = $1', [prevRun.id]);
      const prevMap = new Map(prevCases.map(c => [c.case_id, c.status]));
      const regressions = [], fixes = [], newCases = [];
      for (const rc of cases) {
        const prevStatus = prevMap.get(rc.case_id);
        if (prevStatus === undefined) {
          newCases.push({ caseId: rc.case_id, title: rc.title, suiteName: rc.suite_name });
        } else if (prevStatus === 'pass' && rc.status === 'fail') {
          regressions.push({ caseId: rc.case_id, title: rc.title, suiteName: rc.suite_name });
        } else if (prevStatus === 'fail' && rc.status === 'pass') {
          fixes.push({ caseId: rc.case_id, title: rc.title, suiteName: rc.suite_name });
        }
      }
      diff = { regressions, fixes, newCases, previousRunId: prevRun.id };
    }

    const defects = await query(`
      SELECT cjl.jira_issue_key, cjl.jira_issue_url, cjl.jira_issue_summary,
             rc.title AS case_title, rc.suite_name
      FROM case_jira_links cjl
      JOIN run_cases rc ON rc.case_id = cjl.case_id AND rc.run_id = $1
      WHERE cjl.source_run_id = $2
      ORDER BY cjl.created_at ASC
    `, [req.params.runId, req.params.runId]);

    res.json({
      ...runRow,
      duration_ms,
      diff,
      defects,
      cases: cases.map(c => ({
        ...c,
        steps: JSON.parse(c.steps),
        step_results: c.step_results ? JSON.parse(c.step_results) : null,
      }))
    });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/runs/:runId/cancel
router.post('/:runId/cancel', async (req, res) => {
  try {
    const runRow = await queryOne('SELECT * FROM runs WHERE id = $1', [req.params.runId]);
    if (!runRow) return res.status(404).json({ error: 'Run not found', code: 'NOT_FOUND' });
    if (runRow.status !== 'in_progress') return res.status(400).json({ error: 'Only in-progress runs can be cancelled', code: 'INVALID_STATUS' });

    await transaction(async (tx) => {
      await tx.run("UPDATE runs SET status = 'cancelled', completed_at = NOW() WHERE id = $1", [runRow.id]);
      // Restore project last_run_status to last completed run, or null
      const lastCompleted = await tx.queryOne(
        "SELECT id FROM runs WHERE project_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 1",
        [runRow.project_id]
      );
      const newStatus = lastCompleted ? 'completed' : null;
      await tx.run('UPDATE projects SET last_run_status = $1, last_run_at = NOW() WHERE id = $2', [newStatus, runRow.project_id]);
    });

    res.json({ ok: true });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/runs/:runId/clone — clone a run with fresh statuses
router.post('/:runId/clone', async (req, res) => {
  try {
    const sourceRun = await queryOne('SELECT * FROM runs WHERE id = $1', [req.params.runId]);
    if (!sourceRun) return res.status(404).json({ error: 'Run not found', code: 'NOT_FOUND' });

    const existing = await queryOne("SELECT id FROM runs WHERE project_id = $1 AND status = 'in_progress'", [sourceRun.project_id]);
    if (existing) return res.status(409).json({ error: 'An in-progress run already exists for this project', code: 'RUN_IN_PROGRESS', runId: existing.id });

    const sourceCases = await query(
      'SELECT * FROM run_cases WHERE run_id = $1 ORDER BY sort_order ASC',
      [sourceRun.id]
    );
    if (sourceCases.length === 0) return res.status(400).json({ error: 'Source run has no cases', code: 'NO_CASES' });

    const runId = newId();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const runName = req.body.name?.trim() || `Clone of ${sourceRun.name}`.slice(0, 255);

    await transaction(async (tx) => {
      await tx.run(
        'INSERT INTO runs (id, project_id, name, jira_version_id, jira_version_name, environment, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [runId, sourceRun.project_id, runName, sourceRun.jira_version_id || null, sourceRun.jira_version_name || null, sourceRun.environment || null, req.session?.userId || null]
      );
      for (let i = 0; i < sourceCases.length; i++) {
        const c = sourceCases[i];
        await tx.run(
          'INSERT INTO run_cases (id, run_id, case_id, title, preconditions, steps, expected_result, priority, suite_name, sort_order, case_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          [newId(), runId, c.case_id, c.title, c.preconditions, c.steps, c.expected_result, c.priority, c.suite_name, i, c.case_number || null]
        );
      }
      await tx.run("UPDATE projects SET last_run_status = 'in_progress', last_run_at = NOW() WHERE id = $1", [sourceRun.project_id]);
    });

    res.status(201).json({ id: runId, name: runName, status: 'in_progress', created_at: now, case_count: sourceCases.length });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// POST /api/v1/runs/:runId/rerun — create new run from non-passing cases
router.post('/:runId/rerun', async (req, res) => {
  try {
    const sourceRun = await queryOne('SELECT * FROM runs WHERE id = $1', [req.params.runId]);
    if (!sourceRun) return res.status(404).json({ error: 'Run not found', code: 'NOT_FOUND' });
    if (sourceRun.status !== 'completed') return res.status(400).json({ error: 'Can only re-run completed runs', code: 'RUN_NOT_COMPLETED' });

    const existing = await queryOne("SELECT id FROM runs WHERE project_id = $1 AND status = 'in_progress'", [sourceRun.project_id]);
    if (existing) return res.status(409).json({ error: 'An in-progress run already exists for this project', code: 'RUN_IN_PROGRESS', runId: existing.id });

    // Cases that didn't pass: fail, blocked, skip (not pass, na)
    const { statuses } = req.body;
    const rerunStatuses = (statuses && statuses.length > 0)
      ? statuses.filter(s => VALID_STATUSES.includes(s))
      : ['fail', 'blocked', 'skip'];

    const sourceCases = await query(
      `SELECT * FROM run_cases WHERE run_id = $1 AND status = ANY($2::text[]) ORDER BY sort_order ASC`,
      [sourceRun.id, rerunStatuses]
    );
    if (sourceCases.length === 0) return res.status(400).json({ error: 'No cases match the selected statuses', code: 'NO_CASES' });

    const runId = newId();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const runName = req.body.name?.trim() || `Re-run ${now.slice(0, 10)} ${now.slice(11, 16)}`;
    const envVal = sourceRun.environment || null;

    await transaction(async (tx) => {
      await tx.run(
        'INSERT INTO runs (id, project_id, name, jira_version_id, jira_version_name, environment, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [runId, sourceRun.project_id, runName, sourceRun.jira_version_id || null, sourceRun.jira_version_name || null, envVal, req.session?.userId || null]
      );
      for (let i = 0; i < sourceCases.length; i++) {
        const c = sourceCases[i];
        await tx.run(
          'INSERT INTO run_cases (id, run_id, case_id, title, preconditions, steps, expected_result, priority, suite_name, sort_order, case_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          [newId(), runId, c.case_id, c.title, c.preconditions, c.steps, c.expected_result, c.priority, c.suite_name, i, c.case_number || null]
        );
      }
      await tx.run("UPDATE projects SET last_run_status = 'in_progress', last_run_at = NOW() WHERE id = $1", [sourceRun.project_id]);
    });

    res.status(201).json({ id: runId, name: runName, status: 'in_progress', created_at: now, case_count: sourceCases.length });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

module.exports = router;
