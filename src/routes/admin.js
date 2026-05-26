const express = require('express');
const router = express.Router();
const { query, queryOne, run, transaction, newId } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const DEMO_PROJECT_NAME = 'Demo — E-Commerce Platform';

// Helper: build and insert runs 3–12 for a demo project
async function addExtraRuns(projectId, allCases, adminId, testerId) {
  // Build case ID arrays by suite
  const authIds = allCases.filter(c => c.suiteName === 'User Authentication').map(c => c.id);
  const cartIds = allCases.filter(c => c.suiteName === 'Shopping Cart').map(c => c.id);
  const checkoutIds = allCases.filter(c => c.suiteName === 'Checkout Flow').map(c => c.id);

  const now = Date.now();
  const runDefs = [
    // Runs 3–7: failing period
    { offset: 4 * 86400000, name: 'Sprint 24 Regression',    failSet: new Set([authIds[1], authIds[3], cartIds[2], cartIds[3], checkoutIds[0]]),           addDefects: true, by: testerId },
    { offset: 3 * 86400000, name: 'Sprint 24 Smoke Test',    failSet: new Set([authIds[1], authIds[3], cartIds[2], cartIds[3], checkoutIds[0]]), by: adminId },
    { offset: 2.5 * 86400000, name: 'Sprint 25 Regression',  failSet: new Set([authIds[1], authIds[3], cartIds[2], cartIds[3], checkoutIds[0]]), by: testerId },
    { offset: 2 * 86400000, name: 'Sprint 25 Smoke',         failSet: new Set([authIds[1], authIds[3], cartIds[2], cartIds[3], checkoutIds[0]]), by: adminId },
    { offset: 1.5 * 86400000, name: 'Sprint 25.1 Hotfix',    failSet: new Set([authIds[1], cartIds[3]]), by: testerId },
    // Runs 8–12: all passing
    { offset: 1 * 86400000,     name: 'Sprint 26 Regression',  by: testerId },
    { offset: 20 * 3600000,     name: 'Sprint 26 Smoke Test',  by: adminId },
    { offset: 16 * 3600000,     name: 'Sprint 26.1 Hotfix',    by: testerId },
    { offset: 12 * 3600000,     name: 'Sprint 27 Regression',  by: adminId },
    { offset: 6 * 3600000,      name: 'Sprint 27 Smoke',       by: testerId },
  ];

  let lastCompletedAt = null;

  await transaction(async (tx) => {
    for (const def of runDefs) {
      const runId = newId();
      const created = new Date(now - def.offset).toISOString();
      const completed = new Date(now - def.offset + 3600000).toISOString();
      lastCompletedAt = completed;

      await tx.run(
        'INSERT INTO runs (id, project_id, name, status, created_at, completed_at, environment, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [runId, projectId, def.name, 'completed', created, completed, 'staging', def.by || null]
      );

      for (let i = 0; i < allCases.length; i++) {
        const c = allCases[i];
        const status = def.failSet?.has(c.id) ? 'fail' : 'pass';
        await tx.run(
          'INSERT INTO run_cases (id, run_id, case_id, title, preconditions, steps, expected_result, priority, suite_name, sort_order, status, case_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
          [newId(), runId, c.id, c.title, c.preconditions, JSON.stringify(c.steps), c.expected_result, c.priority, c.suiteName, i, status, c.case_number || null]
        );
      }

      if (def.addDefects) {
        const defectLinks = [
          { caseId: authIds[1],    key: 'DEMO-50', summary: 'Login error persists in Firefox after v2.2 deploy', url: 'https://demo.atlassian.net/browse/DEMO-50' },
          { caseId: cartIds[3],    key: 'DEMO-51', summary: 'Cart not persisting after reload on Safari 17', url: 'https://demo.atlassian.net/browse/DEMO-51' },
          { caseId: checkoutIds[0], key: 'DEMO-52', summary: 'Confirmation email missing in staging — SMTP config', url: 'https://demo.atlassian.net/browse/DEMO-52' },
        ];
        for (const d of defectLinks) {
          await tx.run(
            'INSERT INTO case_jira_links (id, case_id, jira_issue_key, jira_issue_summary, jira_issue_url, source_run_id, link_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [newId(), d.caseId, d.key, d.summary, d.url, runId, 'created']
          );
        }
      }
    }

    // Update project to most recent run
    await tx.run(
      "UPDATE projects SET last_run_status = 'completed', last_run_at = $1 WHERE id = $2",
      [lastCompletedAt, projectId]
    );
  });
}

// POST /api/v1/admin/demo — create demo project or return existing one
router.post('/demo', requireAdmin, async (req, res) => {
  try {
    const existing = await queryOne('SELECT id FROM projects WHERE name = $1', [DEMO_PROJECT_NAME]);
    if (existing) {
      const runCount = await queryOne('SELECT COUNT(*) AS cnt FROM runs WHERE project_id = $1', [existing.id]);
      if (parseInt(runCount.cnt) >= 12) return res.json({ projectId: existing.id, created: false });
      // Fetch existing cases to add runs
      const caseRows = await query(`
        SELECT tc.id, tc.title, tc.preconditions, tc.steps, tc.expected_result, tc.priority, tc.case_number,
               s.name AS suiteName
        FROM test_cases tc
        JOIN suites s ON s.id = tc.suite_id
        WHERE s.project_id = $1
        ORDER BY tc.sort_order ASC
      `, [existing.id]);
      const allCases = caseRows.map(c => ({ ...c, steps: JSON.parse(c.steps) }));
      const adminUser  = await queryOne("SELECT id FROM users WHERE role = 'admin'  AND is_active = true ORDER BY created_at ASC LIMIT 1");
      const testerUser = await queryOne("SELECT id FROM users WHERE role = 'tester' AND is_active = true ORDER BY created_at ASC LIMIT 1");
      await addExtraRuns(existing.id, allCases, adminUser?.id || null, testerUser?.id || null);
      return res.json({ projectId: existing.id, created: false, runsAdded: true });
    }

    // Fetch real user IDs for authorship data
    const adminUser  = await queryOne("SELECT id FROM users WHERE role = 'admin'  AND is_active = true ORDER BY created_at ASC LIMIT 1");
    const testerUser = await queryOne("SELECT id FROM users WHERE role = 'tester' AND is_active = true ORDER BY created_at ASC LIMIT 1");
    const adminId  = adminUser?.id  || null;
    const testerId = testerUser?.id || null;

    const projectId = newId();
    const s1 = newId(), s2 = newId(), s3 = newId();

    // 4 + 4 + 3 = 11 test cases
    const authIds    = [newId(), newId(), newId(), newId()];
    const cartIds    = [newId(), newId(), newId(), newId()];
    const checkoutIds = [newId(), newId(), newId()];

    const run1Id = newId(), run2Id = newId();

    const authCases = [
      {
        id: authIds[0], title: 'Login with valid credentials', priority: 'high',
        preconditions: 'User account registered and confirmed.',
        steps: ['Navigate to /login', 'Enter valid email and password', 'Click Sign In'],
        expected_result: 'User is redirected to the dashboard with a welcome message.',
      },
      {
        id: authIds[1], title: 'Login with invalid password', priority: 'high',
        preconditions: 'User account registered.',
        steps: ['Navigate to /login', 'Enter valid email but wrong password', 'Click Sign In'],
        expected_result: "Error message 'Invalid credentials' shown. User stays on the login page.",
      },
      {
        id: authIds[2], title: 'Password reset via email', priority: 'medium',
        preconditions: 'User has a registered email address.',
        steps: ["Click 'Forgot Password'", 'Enter registered email', "Click 'Send Reset Link'", 'Open link from email', 'Set a new password and submit'],
        expected_result: 'Confirmation email sent. New password works on next login.',
      },
      {
        id: authIds[3], title: 'Session expiry after inactivity', priority: 'low',
        preconditions: 'User is logged in.',
        steps: ['Log in as a valid user', 'Leave the app idle for 30+ minutes', 'Attempt any action'],
        expected_result: "User is redirected to login with a 'Session expired' message.",
      },
    ];

    const cartCases = [
      {
        id: cartIds[0], title: 'Add product to cart', priority: 'high',
        preconditions: null,
        steps: ['Browse to a product page', "Click 'Add to Cart'", 'Open the cart panel'],
        expected_result: 'Product appears in cart with correct name, price, and quantity 1.',
      },
      {
        id: cartIds[1], title: 'Remove item from cart', priority: 'medium',
        preconditions: 'At least one item is in the cart.',
        steps: ['Open cart panel', 'Click the remove icon next to the item'],
        expected_result: 'Item removed from cart. Cart shows updated total.',
      },
      {
        id: cartIds[2], title: 'Update item quantity', priority: 'medium',
        preconditions: 'Product is in the cart.',
        steps: ['Open cart panel', 'Change quantity to 3', 'Press Enter or click away'],
        expected_result: 'Cart total updates to reflect 3 units. Quantity field shows 3.',
      },
      {
        id: cartIds[3], title: 'Cart persists after page reload', priority: 'medium',
        preconditions: null,
        steps: ['Add at least two products to cart', 'Reload the browser page', 'Open cart panel'],
        expected_result: 'Previously added items are still in the cart with correct quantities.',
      },
    ];

    const checkoutCases = [
      {
        id: checkoutIds[0], title: 'Complete purchase with valid payment', priority: 'high',
        preconditions: 'At least one item in cart. User logged in.',
        steps: ["Click 'Checkout'", 'Enter valid shipping address', 'Enter card 4242 4242 4242 4242', "Click 'Place Order'"],
        expected_result: 'Order confirmation page shown with order number. Confirmation email sent.',
      },
      {
        id: checkoutIds[1], title: 'Payment declined for invalid card', priority: 'high',
        preconditions: 'At least one item in cart. User logged in.',
        steps: ["Click 'Checkout'", 'Enter valid shipping address', 'Enter declined card 4000 0000 0000 0002', "Click 'Place Order'"],
        expected_result: "'Payment declined' error shown. Order not created. User can retry.",
      },
      {
        id: checkoutIds[2], title: 'Apply valid discount code', priority: 'medium',
        preconditions: 'Items in cart.',
        steps: ["Click 'Checkout'", "Enter promo code 'SAVE10'", "Click 'Apply'"],
        expected_result: '10% discount applied. Updated total shown. Code listed in order summary.',
      },
    ];

    const allCases = [
      ...authCases.map(c => ({ ...c, suiteId: s1, suiteName: 'User Authentication' })),
      ...cartCases.map(c => ({ ...c, suiteId: s2, suiteName: 'Shopping Cart' })),
      ...checkoutCases.map(c => ({ ...c, suiteId: s3, suiteName: 'Checkout Flow' })),
    ];

    const run1Created   = new Date(Date.now() - 14 * 86400000).toISOString();
    const run1Completed = new Date(Date.now() - 14 * 86400000 + 3 * 3600000).toISOString();
    const run2Created   = new Date(Date.now() - 5 * 86400000).toISOString();
    const run2Completed = new Date(Date.now() - 5 * 86400000 + 3600000).toISOString();

    // status per run: [run1, run2]
    const caseResults = {
      [authIds[0]]:    ['pass',    'pass',    null, null],
      [authIds[1]]:    ['fail',    'pass',    'Error message not shown in Firefox 115. Reproduced 3/3.', 'Fixed in v2.1.0 — DEMO-42.'],
      [authIds[2]]:    ['skip',    'pass',    'Email service unavailable in staging.', null],
      [authIds[3]]:    ['pass',    'pass',    null, null],
      [cartIds[0]]:    ['pass',    'pass',    null, null],
      [cartIds[1]]:    ['pass',    'pass',    null, null],
      [cartIds[2]]:    ['pass',    'pass',    null, null],
      [cartIds[3]]:    ['pass',    'blocked', null, 'Flaky in Safari 17 — investigating with #safari-team.'],
      [checkoutIds[0]]:['fail',    'pass',    'Confirmation email not sent in 2 of 5 attempts. Intermittent.', null],
      [checkoutIds[1]]:['pass',    'pass',    null, null],
      [checkoutIds[2]]:['pass',    'pass',    null, null],
    };

    await transaction(async (tx) => {
      // Project
      await tx.run(
        'INSERT INTO projects (id, name, description, jira_project_key, is_demo) VALUES ($1, $2, $3, $4, true)',
        [projectId, DEMO_PROJECT_NAME, 'Sample project showcasing LTCM features — safe to delete.', 'DEMO']
      );

      // Suites
      for (const [i, [sid, name]] of [[s1, 'User Authentication'], [s2, 'Shopping Cart'], [s3, 'Checkout Flow']].entries()) {
        await tx.run('INSERT INTO suites (id, project_id, name, sort_order) VALUES ($1, $2, $3, $4)', [sid, projectId, name, i]);
      }

      // Test cases — mix of admin and tester authorship
      // Auth suite: admin wrote cases 0,1 / tester wrote 2,3
      // Cart suite: tester wrote all
      // Checkout suite: admin wrote all
      const caseAuthorMap = {
        [authIds[0]]: adminId,  [authIds[1]]: adminId,
        [authIds[2]]: testerId, [authIds[3]]: testerId,
        [cartIds[0]]: testerId, [cartIds[1]]: testerId, [cartIds[2]]: testerId, [cartIds[3]]: testerId,
        [checkoutIds[0]]: adminId, [checkoutIds[1]]: adminId, [checkoutIds[2]]: adminId,
      };
      // A few cases were edited after creation
      const caseEditMap = {
        [authIds[2]]:    { by: adminId,  at: new Date(Date.now() - 8  * 86400000).toISOString() },
        [cartIds[3]]:    { by: testerId, at: new Date(Date.now() - 3  * 86400000).toISOString() },
        [checkoutIds[0]]:{ by: adminId,  at: new Date(Date.now() - 1  * 86400000).toISOString() },
      };

      let caseOrder = 0;
      for (const c of allCases) {
        const edit = caseEditMap[c.id];
        await tx.run(
          'INSERT INTO test_cases (id, suite_id, title, preconditions, steps, expected_result, priority, sort_order, created_by, updated_by, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          [c.id, c.suiteId, c.title, c.preconditions, JSON.stringify(c.steps), c.expected_result, c.priority, caseOrder++, caseAuthorMap[c.id] || null, edit?.by || null, edit?.at || null]
        );
      }

      // Fetch case_numbers after insert (auto-generated by sequence)
      const caseRows = await tx.query(
        'SELECT id, case_number FROM test_cases WHERE id = ANY($1::text[])',
        [allCases.map(c => c.id)]
      );
      const caseNumMap = Object.fromEntries(caseRows.map(r => [r.id, r.case_number]));

      // Runs — run1 executed by tester, run2 by admin
      await tx.run(
        'INSERT INTO runs (id, project_id, name, status, created_at, completed_at, environment, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [run1Id, projectId, 'Sprint 23 Regression', 'completed', run1Created, run1Completed, 'staging', testerId]
      );
      await tx.run(
        'INSERT INTO runs (id, project_id, name, status, created_at, completed_at, environment, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [run2Id, projectId, 'Smoke Test — v2.1.0', 'completed', run2Created, run2Completed, 'staging', adminId]
      );

      // Run cases
      for (let i = 0; i < allCases.length; i++) {
        const c = allCases[i];
        const [s1status, , s1note] = caseResults[c.id];
        await tx.run(
          'INSERT INTO run_cases (id, run_id, case_id, title, preconditions, steps, expected_result, priority, suite_name, sort_order, status, note, case_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
          [newId(), run1Id, c.id, c.title, c.preconditions, JSON.stringify(c.steps), c.expected_result, c.priority, c.suiteName, i, s1status, s1note || null, caseNumMap[c.id] || null]
        );
        const [, s2status, , s2note] = caseResults[c.id];
        await tx.run(
          'INSERT INTO run_cases (id, run_id, case_id, title, preconditions, steps, expected_result, priority, suite_name, sort_order, status, note, case_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
          [newId(), run2Id, c.id, c.title, c.preconditions, JSON.stringify(c.steps), c.expected_result, c.priority, c.suiteName, i, s2status, s2note || null, caseNumMap[c.id] || null]
        );
      }

      // Update project last run status
      await tx.run(
        "UPDATE projects SET last_run_status = 'completed', last_run_at = $1 WHERE id = $2",
        [run2Completed, projectId]
      );

      // Jira links (dummy — realistic keys, fake URLs)
      await tx.run(
        'INSERT INTO case_jira_links (id, case_id, jira_issue_key, jira_issue_summary, jira_issue_url, source_run_id, link_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [newId(), authIds[1], 'DEMO-42', 'Login error message missing in Firefox', 'https://demo.atlassian.net/browse/DEMO-42', run1Id, 'created']
      );
      await tx.run(
        'INSERT INTO case_jira_links (id, case_id, jira_issue_key, jira_issue_summary, jira_issue_url, source_run_id, link_type) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [newId(), checkoutIds[0], 'DEMO-45', 'Order confirmation email not sent intermittently', 'https://demo.atlassian.net/browse/DEMO-45', run1Id, 'created']
      );
      await tx.run(
        'INSERT INTO case_jira_links (id, case_id, jira_issue_key, jira_issue_summary, jira_issue_url, link_type) VALUES ($1, $2, $3, $4, $5, $6)',
        [newId(), cartIds[2], 'DEMO-12', 'Cart quantity validation — edge case with decimal input', 'https://demo.atlassian.net/browse/DEMO-12', 'manual']
      );
    });

    // Add extra runs 3–12 (with case_number from DB)
    const allCasesForExtra = allCases.map(c => ({ ...c, case_number: null }));
    await addExtraRuns(projectId, allCasesForExtra, adminId, testerId);

    res.status(201).json({ projectId, created: true });
  } catch (err) {
    console.error('[Demo] Error:', err);
    res.status(500).json({ error: err.message || 'Demo creation failed', code: 'DEMO_ERROR' });
  }
});

module.exports = router;
