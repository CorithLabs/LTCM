const express = require('express');
const router = express.Router();
const { query, dbErr } = require('../db');

// Detect JQL-like syntax: at least one field=value token with a known field name
const JQL_FIELD_RE = /\b(project|suite|ts|tc|case|priority|status|runstatus|run|jira|epic|version)\s*=/i;
function isJQL(q) {
  return JQL_FIELD_RE.test(q);
}

// Parse "field = value" OR "field = 'value'" OR "field = \"value\"" tokens joined by AND
function parseJQL(q) {
  const tokens = [];
  const parts = q.split(/\bAND\b/i);
  for (const part of parts) {
    const m = part.trim().match(/^(\w+)\s*=\s*(?:["'](.+?)["']|(\S+))$/);
    if (m) tokens.push({ field: m[1].toLowerCase(), value: (m[2] || m[3]).trim() });
  }
  return tokens;
}

// Lateral join to get the most recent run result for each test case
const LAST_STATUS_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT rc.status FROM run_cases rc
    JOIN runs r ON r.id = rc.run_id
    WHERE rc.case_id = tc.id
    ORDER BY r.created_at DESC LIMIT 1
  ) last_status ON true
`;

// GET /api/v1/search?q=...
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ mode: 'keyword', cases: [], suites: [], projects: [], runs: [], total: 0 });

    if (isJQL(q)) {
      const tokens = parseJQL(q);
      if (tokens.length === 0) return res.status(400).json({ error: 'Could not parse query. Use: field = "value" AND field2 = "value2"', code: 'PARSE_ERROR' });

      const caseConditions = [];
      const caseParams = [];
      let ci = 1;

      let epicFilter = null;
      let versionFilter = null;

      for (const { field, value } of tokens) {
        switch (field) {
          case 'project':
            caseConditions.push(`p.name ILIKE $${ci++}`);
            caseParams.push(`%${value}%`);
            break;
          case 'suite':
          case 'ts': {
            const m = value.match(/^TS-(\d+)$/i);
            if (m) { caseConditions.push(`s.suite_number = $${ci++}`); caseParams.push(parseInt(m[1], 10)); }
            else    { caseConditions.push(`s.name ILIKE $${ci++}`);    caseParams.push(`%${value}%`); }
            break;
          }
          case 'tc':
          case 'case': {
            const m = value.match(/^TC-(\d+)$/i);
            if (m) { caseConditions.push(`tc.case_number = $${ci++}`); caseParams.push(parseInt(m[1], 10)); }
            else    { caseConditions.push(`tc.title ILIKE $${ci++}`);  caseParams.push(`%${value}%`); }
            break;
          }
          case 'priority':
            caseConditions.push(`tc.priority = $${ci++}`);
            caseParams.push(value.toLowerCase());
            break;
          case 'status':
          case 'runstatus':
            caseConditions.push(`last_status.status = $${ci++}`);
            caseParams.push(value.toLowerCase());
            break;
          case 'run': {
            const m = value.match(/^RUN-(\d+)$/i);
            if (m) { caseConditions.push(`r_filter.run_number = $${ci++}`); caseParams.push(parseInt(m[1], 10)); }
            else    { caseConditions.push(`r_filter.name ILIKE $${ci++}`);  caseParams.push(`%${value}%`); }
            break;
          }
          // Reverse lookup: cases linked to a Jira issue key
          case 'jira':
            caseConditions.push(`tc.id IN (SELECT case_id FROM case_jira_links WHERE jira_issue_key ILIKE $${ci++})`);
            caseParams.push(value);
            break;
          // Reverse lookup: suites linked to a Jira epic key
          case 'epic':
            epicFilter = value;
            break;
          // Reverse lookup: runs tagged with a Jira version name
          case 'version':
            versionFilter = value;
            break;
        }
      }

      const hasRunFilter = tokens.some(t => t.field === 'run');
      const runJoin = hasRunFilter
        ? `JOIN run_cases rcf ON rcf.case_id = tc.id JOIN runs r_filter ON r_filter.id = rcf.run_id`
        : '';

      const whereClause = caseConditions.length > 0 ? `WHERE ${caseConditions.join(' AND ')}` : '';

      // Fetch cases (when there are case-level filters or no filters at all)
      const hasCaseFilters = caseConditions.length > 0 || hasRunFilter;
      const cases = hasCaseFilters ? await query(`
        SELECT DISTINCT tc.id, tc.title, tc.priority, tc.case_number,
               s.id AS suite_id, s.name AS suite_name, s.suite_number,
               p.id AS project_id, p.name AS project_name,
               last_status.status AS last_run_status
        FROM test_cases tc
        JOIN suites s ON s.id = tc.suite_id
        JOIN projects p ON p.id = s.project_id
        ${LAST_STATUS_LATERAL}
        ${runJoin}
        ${whereClause}
        ORDER BY tc.case_number
        LIMIT 200
      `, caseParams) : [];

      // Reverse lookup: suites by epic key
      const suites = epicFilter ? await query(`
        SELECT s.id, s.name, s.suite_number,
               (SELECT COUNT(*)::int FROM test_cases WHERE suite_id = s.id) AS case_count,
               s.jira_epic_key, s.jira_epic_name, s.jira_epic_url,
               p.id AS project_id, p.name AS project_name
        FROM suites s
        JOIN projects p ON p.id = s.project_id
        WHERE s.jira_epic_key ILIKE $1
        ORDER BY s.suite_number
        LIMIT 50
      `, [epicFilter]) : [];

      // Reverse lookup: runs by Jira version name
      const runs = versionFilter ? await query(`
        SELECT r.id, r.name, r.run_number, r.status, r.created_at, r.environment,
               r.jira_version_name,
               p.id AS project_id, p.name AS project_name
        FROM runs r
        JOIN projects p ON p.id = r.project_id
        WHERE r.jira_version_name ILIKE $1
        ORDER BY r.created_at DESC
        LIMIT 50
      `, [`%${versionFilter}%`]) : [];

      const total = cases.length + suites.length + runs.length;
      return res.json({ mode: 'structured', cases, suites, projects: [], runs, total });
    }

    // --- Keyword search ---
    const term = `%${q}%`;
    const [cases, suites, projects, runs] = await Promise.all([
      query(`
        SELECT tc.id, tc.title, tc.priority, tc.case_number,
               s.id AS suite_id, s.name AS suite_name, s.suite_number,
               p.id AS project_id, p.name AS project_name,
               last_status.status AS last_run_status
        FROM test_cases tc
        JOIN suites s ON s.id = tc.suite_id
        JOIN projects p ON p.id = s.project_id
        ${LAST_STATUS_LATERAL}
        WHERE tc.title ILIKE $1
           OR tc.expected_result ILIKE $1
           OR tc.preconditions ILIKE $1
           OR tc.steps::text ILIKE $1
        ORDER BY tc.case_number LIMIT 50
      `, [term]),
      query(`
        SELECT s.id, s.name, s.suite_number,
               (SELECT COUNT(*)::int FROM test_cases WHERE suite_id = s.id) AS case_count,
               s.jira_epic_key, s.jira_epic_name, s.jira_epic_url,
               p.id AS project_id, p.name AS project_name
        FROM suites s
        JOIN projects p ON p.id = s.project_id
        WHERE s.name ILIKE $1
        ORDER BY s.suite_number LIMIT 20
      `, [term]),
      query(`
        SELECT id, name, description, last_run_status
        FROM projects
        WHERE name ILIKE $1 OR description ILIKE $1
        ORDER BY name LIMIT 10
      `, [term]),
      query(`
        SELECT r.id, r.name, r.run_number, r.status, r.created_at, r.environment,
               r.jira_version_name,
               p.id AS project_id, p.name AS project_name
        FROM runs r
        JOIN projects p ON p.id = r.project_id
        WHERE r.name ILIKE $1 OR r.jira_version_name ILIKE $1
        ORDER BY r.created_at DESC LIMIT 20
      `, [term]),
    ]);

    res.json({
      mode: 'keyword',
      cases, suites, projects, runs,
      total: cases.length + suites.length + projects.length + runs.length,
    });
  } catch (err) {
    const e = dbErr(err);
    res.status(e.status).json({ error: e.error, code: e.code });
  }
});

module.exports = router;
