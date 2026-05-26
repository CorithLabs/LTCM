const express = require('express');
const router = express.Router();
const { query, queryOne, dbErr } = require('../db');

// GET /api/v1/projects/:projectId/stats
router.get('/projects/:projectId/stats', async (req, res) => {
  try {
    const totals = await queryOne(`
      SELECT
        COUNT(DISTINCT tc.id)::int                                                   AS total_cases,
        COUNT(DISTINCT r.id)::int                                                    AS total_runs,
        COALESCE(SUM(CASE WHEN rc.status = 'pass'    THEN 1 ELSE 0 END), 0)::int   AS passed,
        COALESCE(SUM(CASE WHEN rc.status = 'fail'    THEN 1 ELSE 0 END), 0)::int   AS failed,
        COALESCE(SUM(CASE WHEN rc.status = 'skip'    THEN 1 ELSE 0 END), 0)::int   AS skipped,
        COALESCE(SUM(CASE WHEN rc.status = 'blocked' THEN 1 ELSE 0 END), 0)::int   AS blocked,
        COALESCE(SUM(CASE WHEN rc.status = 'na'      THEN 1 ELSE 0 END), 0)::int   AS na
      FROM test_cases tc
      JOIN suites s ON s.id = tc.suite_id AND s.project_id = $1
      LEFT JOIN run_cases rc ON rc.case_id = tc.id
      LEFT JOIN runs r ON r.id = rc.run_id AND r.status = 'completed'
    `, [req.params.projectId]);

    const suiteStats = await query(`
      SELECT
        s.id, s.name, s.sort_order,
        COUNT(DISTINCT tc.id)::int                                                   AS total_cases,
        COUNT(DISTINCT r.id)::int                                                    AS total_runs,
        COALESCE(SUM(CASE WHEN rc.status = 'pass'    THEN 1 ELSE 0 END), 0)::int   AS passed,
        COALESCE(SUM(CASE WHEN rc.status = 'fail'    THEN 1 ELSE 0 END), 0)::int   AS failed,
        COALESCE(SUM(CASE WHEN rc.status = 'skip'    THEN 1 ELSE 0 END), 0)::int   AS skipped,
        COALESCE(SUM(CASE WHEN rc.status = 'blocked' THEN 1 ELSE 0 END), 0)::int   AS blocked,
        COALESCE(SUM(CASE WHEN rc.status = 'na'      THEN 1 ELSE 0 END), 0)::int   AS na
      FROM suites s
      LEFT JOIN test_cases tc ON tc.suite_id = s.id
      LEFT JOIN run_cases rc ON rc.case_id = tc.id
      LEFT JOIN runs r ON r.id = rc.run_id AND r.status = 'completed'
      WHERE s.project_id = $1
      GROUP BY s.id, s.name, s.sort_order
      ORDER BY s.sort_order
    `, [req.params.projectId]);

    const executed = totals.passed + totals.failed;
    const passRate = executed > 0 ? Math.round((totals.passed / executed) * 100) : null;
    res.json({ ...totals, passRate, suiteStats });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

// GET /api/v1/suites/:suiteId/stats
router.get('/suites/:suiteId/stats', async (req, res) => {
  try {
    const suite = await queryOne('SELECT * FROM suites WHERE id = $1', [req.params.suiteId]);
    if (!suite) return res.status(404).json({ error: 'Suite not found', code: 'NOT_FOUND' });

    const totals = await queryOne(`
      SELECT
        COUNT(DISTINCT tc.id)::int                                                   AS total_cases,
        COUNT(DISTINCT r.id)::int                                                    AS total_runs,
        COALESCE(SUM(CASE WHEN rc.status = 'pass'    THEN 1 ELSE 0 END), 0)::int   AS passed,
        COALESCE(SUM(CASE WHEN rc.status = 'fail'    THEN 1 ELSE 0 END), 0)::int   AS failed,
        COALESCE(SUM(CASE WHEN rc.status = 'skip'    THEN 1 ELSE 0 END), 0)::int   AS skipped,
        COALESCE(SUM(CASE WHEN rc.status = 'blocked' THEN 1 ELSE 0 END), 0)::int   AS blocked,
        COALESCE(SUM(CASE WHEN rc.status = 'na'      THEN 1 ELSE 0 END), 0)::int   AS na
      FROM test_cases tc
      LEFT JOIN run_cases rc ON rc.case_id = tc.id
      LEFT JOIN runs r ON r.id = rc.run_id AND r.status = 'completed'
      WHERE tc.suite_id = $1
    `, [req.params.suiteId]);

    const caseStats = await query(`
      SELECT
        tc.id AS case_id, tc.title, tc.priority, tc.sort_order,
        COUNT(DISTINCT r.id)::int                                                    AS total_runs,
        COALESCE(SUM(CASE WHEN rc.status = 'pass'    THEN 1 ELSE 0 END), 0)::int   AS passed,
        COALESCE(SUM(CASE WHEN rc.status = 'fail'    THEN 1 ELSE 0 END), 0)::int   AS failed,
        COALESCE(SUM(CASE WHEN rc.status = 'skip'    THEN 1 ELSE 0 END), 0)::int   AS skipped,
        COALESCE(SUM(CASE WHEN rc.status = 'blocked' THEN 1 ELSE 0 END), 0)::int   AS blocked,
        COALESCE(SUM(CASE WHEN rc.status = 'na'      THEN 1 ELSE 0 END), 0)::int   AS na,
        (SELECT rc2.status FROM run_cases rc2
         JOIN runs r2 ON r2.id = rc2.run_id AND r2.status = 'completed'
         WHERE rc2.case_id = tc.id
         ORDER BY r2.completed_at DESC LIMIT 1)                                     AS last_status
      FROM test_cases tc
      LEFT JOIN run_cases rc ON rc.case_id = tc.id
      LEFT JOIN runs r ON r.id = rc.run_id AND r.status = 'completed'
      WHERE tc.suite_id = $1
      GROUP BY tc.id, tc.title, tc.priority, tc.sort_order
      ORDER BY tc.sort_order
    `, [req.params.suiteId]);

    const executed = totals.passed + totals.failed;
    const passRate = executed > 0 ? Math.round((totals.passed / executed) * 100) : null;
    res.json({ suite, ...totals, passRate, caseStats });
  } catch (err) {
    const e = dbErr(err); res.status(e.status).json({ error: e.error, code: e.code });
  }
});

module.exports = router;
