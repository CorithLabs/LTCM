const { buildTestApp } = require('./helpers');

const { request, cleanup } = buildTestApp();
afterAll(cleanup);

// Helper: create project → suite → N cases → return ids
async function scaffold(projectName, caseCount = 2) {
  const p = await request.post('/api/v1/projects').send({ name: projectName });
  const pid = p.body.id;
  const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'Suite A' });
  const sid = s.body.id;
  const caseIds = [];
  for (let i = 0; i < caseCount; i++) {
    const c = await request.post(`/api/v1/suites/${sid}/cases`).send({
      title: `Case ${i + 1}`,
      steps: [`Step ${i + 1}`],
      expected_result: `Result ${i + 1}`,
    });
    caseIds.push(c.body.id);
  }
  return { pid, sid, caseIds };
}

describe('Runs API', () => {
  describe('POST /api/v1/projects/:projectId/runs', () => {
    it('creates a run and snapshots cases', async () => {
      const { pid } = await scaffold('CreateRun');
      const res = await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'Sprint 1' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Sprint 1');
      expect(res.body.status).toBe('in_progress');
      expect(res.body.case_count).toBe(2);
      expect(typeof res.body.id).toBe('string');
    });

    it('generates a default date-stamped name when name is omitted', async () => {
      const { pid } = await scaffold('DefaultName');
      const res = await request.post(`/api/v1/projects/${pid}/runs`).send({});
      expect(res.status).toBe(201);
      expect(res.body.name).toMatch(/^Run \d{4}-\d{2}-\d{2}/);
    });

    it('400 when project has no test cases', async () => {
      const p = await request.post('/api/v1/projects').send({ name: 'EmptyProject' });
      await request.post(`/api/v1/projects/${p.body.id}/suites`).send({ name: 'Empty Suite' });
      const res = await request.post(`/api/v1/projects/${p.body.id}/runs`).send({ name: 'R' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NO_CASES');
    });

    it('409 when an in-progress run already exists', async () => {
      const { pid } = await scaffold('DoubleRun');
      await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'First' });
      const res = await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'Second' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('RUN_IN_PROGRESS');
    });

    it('scopes snapshot to selected suite_ids', async () => {
      const p = await request.post('/api/v1/projects').send({ name: 'ScopedRun' });
      const pid = p.body.id;
      const s1 = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'Suite 1' });
      const s2 = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'Suite 2' });
      await request.post(`/api/v1/suites/${s1.body.id}/cases`).send({ title: 'C-S1', steps: ['s'], expected_result: 'r' });
      await request.post(`/api/v1/suites/${s2.body.id}/cases`).send({ title: 'C-S2', steps: ['s'], expected_result: 'r' });

      const res = await request.post(`/api/v1/projects/${pid}/runs`).send({ suite_ids: [s1.body.id] });
      expect(res.status).toBe(201);
      expect(res.body.case_count).toBe(1);

      const cases = await request.get(`/api/v1/runs/${res.body.id}/cases`);
      expect(cases.body[0].title).toBe('C-S1');
    });

    it('updates project last_run_status to in_progress', async () => {
      const { pid } = await scaffold('StatusUpdate');
      await request.post(`/api/v1/projects/${pid}/runs`).send({});
      const list = await request.get('/api/v1/projects');
      const project = list.body.find(p => p.id === pid);
      expect(project.last_run_status).toBe('in_progress');
    });
  });

  describe('GET /api/v1/runs/:runId/cases', () => {
    it('returns snapshotted cases with parsed steps', async () => {
      const { pid } = await scaffold('SnapshotRead');
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({});
      const cases = await request.get(`/api/v1/runs/${run.body.id}/cases`);
      expect(cases.status).toBe(200);
      expect(cases.body).toHaveLength(2);
      cases.body.forEach(c => {
        expect(Array.isArray(c.steps)).toBe(true);
        expect(c.status).toBeNull();
        expect(c.note).toBeNull();
      });
    });

    it('snapshot is isolated from live case edits', async () => {
      const { pid, caseIds } = await scaffold('IsolationTest');
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({});
      const runId = run.body.id;

      // Edit the live case
      await request.patch(`/api/v1/cases/${caseIds[0]}`).send({ title: 'EDITED TITLE' });

      const snapshot = await request.get(`/api/v1/runs/${runId}/cases`);
      // Snapshot should still have original title
      const titles = snapshot.body.map(c => c.title);
      expect(titles).not.toContain('EDITED TITLE');
      expect(titles).toContain('Case 1');
    });
  });

  describe('PATCH /api/v1/runs/:runId/cases/:caseId', () => {
    let runId, runCaseId;

    beforeAll(async () => {
      const { pid } = await scaffold('PatchCases');
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({});
      runId = run.body.id;
      const cases = await request.get(`/api/v1/runs/${runId}/cases`);
      runCaseId = cases.body[0].id;
    });

    it('marks a case as pass', async () => {
      const res = await request.patch(`/api/v1/runs/${runId}/cases/${runCaseId}`).send({ status: 'pass' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pass');
    });

    it('marks a case as fail with a note', async () => {
      const res = await request.patch(`/api/v1/runs/${runId}/cases/${runCaseId}`).send({ status: 'fail', note: 'Button is broken' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('fail');
      expect(res.body.note).toBe('Button is broken');
    });

    it('overwrites a previous status cleanly', async () => {
      await request.patch(`/api/v1/runs/${runId}/cases/${runCaseId}`).send({ status: 'skip' });
      const res = await request.patch(`/api/v1/runs/${runId}/cases/${runCaseId}`).send({ status: 'pass' });
      expect(res.body.status).toBe('pass');
    });

    it('400 on invalid status value', async () => {
      const res = await request.patch(`/api/v1/runs/${runId}/cases/${runCaseId}`).send({ status: 'maybe' });
      expect(res.status).toBe(400);
    });

    it('404 on unknown run case', async () => {
      const res = await request.patch(`/api/v1/runs/${runId}/cases/unknown`).send({ status: 'pass' });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/runs/:runId — complete', () => {
    it('completes a run and records completedAt', async () => {
      const { pid } = await scaffold('CompleteRun');
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({});
      const res = await request.patch(`/api/v1/runs/${run.body.id}`).send({ status: 'completed' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.completed_at).not.toBeNull();
    });

    it('force_complete sets null-status cases to skip', async () => {
      const { pid } = await scaffold('ForceComplete');
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({});
      const runId = run.body.id;
      // Leave all cases unresolved, force-complete
      await request.patch(`/api/v1/runs/${runId}`).send({ status: 'completed', force_complete: true });
      const cases = await request.get(`/api/v1/runs/${runId}/cases`);
      cases.body.forEach(c => expect(c.status).toBe('skip'));
    });

    it('updates project last_run_status to completed', async () => {
      const { pid } = await scaffold('StatusComplete');
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({});
      await request.patch(`/api/v1/runs/${run.body.id}`).send({ status: 'completed', force_complete: true });
      const list = await request.get('/api/v1/projects');
      const project = list.body.find(p => p.id === pid);
      expect(project.last_run_status).toBe('completed');
    });

    it('400 on invalid status', async () => {
      const { pid } = await scaffold('BadStatus');
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({});
      const res = await request.patch(`/api/v1/runs/${run.body.id}`).send({ status: 'in_progress' });
      expect(res.status).toBe(400);
    });

    it('400 when run is already completed', async () => {
      const { pid } = await scaffold('AlreadyDone');
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({});
      await request.patch(`/api/v1/runs/${run.body.id}`).send({ status: 'completed', force_complete: true });
      const res = await request.patch(`/api/v1/runs/${run.body.id}`).send({ status: 'completed' });
      expect(res.status).toBe(400);
    });

    it('409 when patching a case on a completed run', async () => {
      const { pid } = await scaffold('LockedRun');
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({});
      const runId = run.body.id;
      const cases = await request.get(`/api/v1/runs/${runId}/cases`);
      await request.patch(`/api/v1/runs/${runId}`).send({ status: 'completed', force_complete: true });
      const res = await request.patch(`/api/v1/runs/${runId}/cases/${cases.body[0].id}`).send({ status: 'pass' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('RUN_COMPLETED');
    });
  });

  describe('GET /api/v1/runs/:runId/summary', () => {
    let runId, pid;

    beforeAll(async () => {
      const scaffolded = await scaffold('SummaryProject', 3);
      pid = scaffolded.pid;
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'Summary Run' });
      runId = run.body.id;
      const cases = await request.get(`/api/v1/runs/${runId}/cases`);
      await request.patch(`/api/v1/runs/${runId}/cases/${cases.body[0].id}`).send({ status: 'pass' });
      await request.patch(`/api/v1/runs/${runId}/cases/${cases.body[1].id}`).send({ status: 'fail', note: 'Broken' });
      await request.patch(`/api/v1/runs/${runId}`).send({ status: 'completed', force_complete: true });
    });

    it('returns pass/fail/skip counts', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/summary`);
      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(1);
      expect(res.body.failed).toBe(1);
      expect(res.body.skipped).toBe(1); // auto-skipped by force_complete
      expect(res.body.total).toBe(3);
    });

    it('orders cases: fail first', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/summary`);
      expect(res.body.cases[0].status).toBe('fail');
    });

    it('includes duration_ms', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/summary`);
      expect(typeof res.body.duration_ms).toBe('number');
      expect(res.body.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('includes case notes', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/summary`);
      const failed = res.body.cases.find(c => c.status === 'fail');
      expect(failed.note).toBe('Broken');
    });

    it('includes steps as array', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/summary`);
      res.body.cases.forEach(c => expect(Array.isArray(c.steps)).toBe(true));
    });

    it('404 on unknown run', async () => {
      const res = await request.get('/api/v1/runs/unknown/summary');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/projects/:projectId/runs', () => {
    it('lists runs with pass/fail/skip counts', async () => {
      const { pid } = await scaffold('ListRuns');
      const run = await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'Listed' });
      await request.patch(`/api/v1/runs/${run.body.id}`).send({ status: 'completed', force_complete: true });
      const res = await request.get(`/api/v1/projects/${pid}/runs`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(typeof res.body[0].passed).toBe('number');
    });
  });
});
