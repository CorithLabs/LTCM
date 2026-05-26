const { buildTestApp } = require('./helpers');

const { request, cleanup } = buildTestApp();
afterAll(cleanup);

async function scaffold(name, steps = ['Step A']) {
  const p = await request.post('/api/v1/projects').send({ name });
  const pid = p.body.id;
  const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'Suite A' });
  const sid = s.body.id;
  for (let i = 0; i < 2; i++) {
    await request.post(`/api/v1/suites/${sid}/cases`).send({
      title: `Case ${i + 1}`,
      steps,
      expected_result: `Expected ${i + 1}`,
    });
  }
  const run = await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'R1' });
  const cases = await request.get(`/api/v1/runs/${run.body.id}/cases`);
  return { pid, runId: run.body.id, rcIds: cases.body.map(c => c.id) };
}

// ---- SONG-104: Blocked / N/A statuses ----
describe('SONG-104: Blocked and N/A statuses', () => {
  it('accepts blocked status on a run case', async () => {
    const { runId, rcIds } = await scaffold('Blocked1');
    const res = await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[0]}`).send({ status: 'blocked' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('blocked');
  });

  it('accepts na status on a run case', async () => {
    const { runId, rcIds } = await scaffold('NA1');
    const res = await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[0]}`).send({ status: 'na' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('na');
  });

  it('rejects unknown status', async () => {
    const { runId, rcIds } = await scaffold('BadStatus');
    const res = await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[0]}`).send({ status: 'unknown' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('summary includes blocked and na counts', async () => {
    const { pid, runId, rcIds } = await scaffold('SummaryCounts');
    await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[0]}`).send({ status: 'blocked' });
    await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[1]}`).send({ status: 'na' });
    await request.patch(`/api/v1/runs/${runId}`).send({ status: 'completed' });

    const res = await request.get(`/api/v1/runs/${runId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.blocked).toBe(1);
    expect(res.body.na).toBe(1);
    expect(res.body.passed).toBe(0);
  });

  it('force-complete leaves blocked cases as blocked (only skips null)', async () => {
    const { runId, rcIds } = await scaffold('ForceBlocked');
    await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[0]}`).send({ status: 'blocked' });
    // rcIds[1] has no status
    await request.patch(`/api/v1/runs/${runId}`).send({ status: 'completed', force_complete: true });

    const res = await request.get(`/api/v1/runs/${runId}/summary`);
    expect(res.body.blocked).toBe(1);
    expect(res.body.skipped).toBe(1); // null → skip
  });

  it('run history list includes blocked and na columns', async () => {
    const { pid, runId, rcIds } = await scaffold('HistoryList');
    await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[0]}`).send({ status: 'blocked' });
    await request.patch(`/api/v1/runs/${runId}`).send({ status: 'completed', force_complete: true });

    const res = await request.get(`/api/v1/projects/${pid}/runs`);
    expect(res.status).toBe(200);
    const run = res.body.find(r => r.id === runId);
    expect(run.blocked).toBe(1);
  });
});

// ---- SONG-103: Step results ----
describe('SONG-103: Step-level results', () => {
  it('stores and returns stepResults on a run case', async () => {
    const { runId, rcIds } = await scaffold('StepResults', ['Step 1', 'Step 2']);
    const stepResults = [
      { stepIndex: 0, status: 'pass', actualResult: '' },
      { stepIndex: 1, status: 'fail', actualResult: 'Button missing' },
    ];
    const res = await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[0]}`).send({ stepResults });
    expect(res.status).toBe(200);
    expect(res.body.step_results).toHaveLength(2);
    expect(res.body.step_results[1].actualResult).toBe('Button missing');
  });

  it('step_results is null for cases with no step results', async () => {
    const { runId, rcIds } = await scaffold('NoStepResults');
    const res = await request.get(`/api/v1/runs/${runId}/cases`);
    expect(res.body[0].step_results).toBeNull();
  });

  it('rejects stepResults that is not an array', async () => {
    const { runId, rcIds } = await scaffold('BadStepResults');
    const res = await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[0]}`).send({ stepResults: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('summary includes step_results on cases', async () => {
    const { runId, rcIds } = await scaffold('SummarySteps', ['Step A']);
    const stepResults = [{ stepIndex: 0, status: 'pass', actualResult: '' }];
    await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[0]}`).send({ status: 'pass', stepResults });
    await request.patch(`/api/v1/runs/${runId}/cases/${rcIds[1]}`).send({ status: 'pass' });
    await request.patch(`/api/v1/runs/${runId}`).send({ status: 'completed' });

    const res = await request.get(`/api/v1/runs/${runId}/summary`);
    const caseWithSteps = res.body.cases.find(c => c.id === rcIds[0]);
    expect(caseWithSteps.step_results).toHaveLength(1);
    expect(caseWithSteps.step_results[0].status).toBe('pass');
  });
});

// ---- SONG-106: Environment tagging ----
describe('SONG-106: Environment tagging', () => {
  it('creates a run with an environment label', async () => {
    const p = await request.post('/api/v1/projects').send({ name: 'EnvProject' });
    const pid = p.body.id;
    const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'S' });
    await request.post(`/api/v1/suites/${s.body.id}/cases`).send({ title: 'C', steps: ['s'], expected_result: 'e' });

    const res = await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'Env Run', environment: 'Staging' });
    expect(res.status).toBe(201);
    expect(res.body.environment).toBe('Staging');
  });

  it('environment is null when not provided', async () => {
    const { pid } = await scaffold('NoEnv');
    const runs = await request.get(`/api/v1/projects/${pid}/runs`);
    expect(runs.body[0].environment).toBeNull();
  });

  it('environment appears in run list', async () => {
    const p = await request.post('/api/v1/projects').send({ name: 'EnvList' });
    const pid = p.body.id;
    const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'S' });
    await request.post(`/api/v1/suites/${s.body.id}/cases`).send({ title: 'C', steps: ['s'], expected_result: 'e' });
    await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'R', environment: 'Production' });

    const res = await request.get(`/api/v1/projects/${pid}/runs`);
    expect(res.body[0].environment).toBe('Production');
  });

  it('environment appears in run summary', async () => {
    const p = await request.post('/api/v1/projects').send({ name: 'EnvSummary' });
    const pid = p.body.id;
    const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'S' });
    await request.post(`/api/v1/suites/${s.body.id}/cases`).send({ title: 'C', steps: ['s'], expected_result: 'e' });
    const run = await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'R', environment: 'QA' });
    const cases = await request.get(`/api/v1/runs/${run.body.id}/cases`);
    await request.patch(`/api/v1/runs/${run.body.id}/cases/${cases.body[0].id}`).send({ status: 'pass' });
    await request.patch(`/api/v1/runs/${run.body.id}`).send({ status: 'completed' });

    const res = await request.get(`/api/v1/runs/${run.body.id}/summary`);
    expect(res.body.environment).toBe('QA');
  });

  it('environment is truncated to 100 chars', async () => {
    const p = await request.post('/api/v1/projects').send({ name: 'EnvTrunc' });
    const pid = p.body.id;
    const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'S' });
    await request.post(`/api/v1/suites/${s.body.id}/cases`).send({ title: 'C', steps: ['s'], expected_result: 'e' });
    const longEnv = 'x'.repeat(120);
    const res = await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'R', environment: longEnv });
    expect(res.status).toBe(201);
    expect(res.body.environment.length).toBe(100);
  });
});
