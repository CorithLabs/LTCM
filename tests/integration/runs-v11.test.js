const { buildTestApp } = require('./helpers');

const { request, cleanup } = buildTestApp();
afterAll(cleanup);

async function scaffold(projectName = 'DiffProject') {
  const p = await request.post('/api/v1/projects').send({ name: projectName });
  const pid = p.body.id;
  const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'Suite A' });
  const sid = s.body.id;
  const cases = [];
  for (let i = 1; i <= 3; i++) {
    const c = await request.post(`/api/v1/suites/${sid}/cases`).send({
      title: `Case ${i}`, steps: [`Step ${i}`], expected_result: `Result ${i}`,
    });
    cases.push(c.body);
  }
  return { pid, sid, cases };
}

async function createAndCompleteRun(pid, statuses) {
  // statuses: array of 'pass'|'fail'|'skip'|null for each case
  const runRes = await request.post(`/api/v1/projects/${pid}/runs`).send({});
  const run = runRes.body;
  const casesRes = await request.get(`/api/v1/runs/${run.id}/cases`);
  const runCases = casesRes.body;
  for (let i = 0; i < statuses.length; i++) {
    if (statuses[i]) {
      await request.patch(`/api/v1/runs/${run.id}/cases/${runCases[i].id}`).send({ status: statuses[i] });
    }
  }
  await request.patch(`/api/v1/runs/${run.id}`).send({ status: 'completed', force_complete: true });
  return run.id;
}

describe('Run Summary Diff (SONG-84)', () => {
  it('diff is null when no previous completed run exists', async () => {
    const { pid } = await scaffold('NoPrevRun');
    const runId = await createAndCompleteRun(pid, ['pass', 'fail', 'skip']);
    const res = await request.get(`/api/v1/runs/${runId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.diff).toBeNull();
  });

  it('diff includes regressions (pass→fail)', async () => {
    const { pid } = await scaffold('RegressionProject');
    await createAndCompleteRun(pid, ['pass', 'pass', 'pass']);
    const run2Id = await createAndCompleteRun(pid, ['fail', 'pass', 'pass']);
    const res = await request.get(`/api/v1/runs/${run2Id}/summary`);
    expect(res.body.diff).not.toBeNull();
    expect(res.body.diff.regressions.length).toBe(1);
    expect(res.body.diff.regressions[0].title).toBe('Case 1');
    expect(res.body.diff.fixes.length).toBe(0);
  });

  it('diff includes fixes (fail→pass)', async () => {
    const { pid } = await scaffold('FixProject');
    await createAndCompleteRun(pid, ['fail', 'fail', 'pass']);
    const run2Id = await createAndCompleteRun(pid, ['pass', 'fail', 'pass']);
    const res = await request.get(`/api/v1/runs/${run2Id}/summary`);
    expect(res.body.diff.fixes.length).toBe(1);
    expect(res.body.diff.fixes[0].title).toBe('Case 1');
    expect(res.body.diff.regressions.length).toBe(0);
  });

  it('diff includes new cases not in previous run (subset scope)', async () => {
    const p = await request.post('/api/v1/projects').send({ name: 'NewCasesProject' });
    const pid = p.body.id;
    const s1 = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'Suite 1' });
    const s2 = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'Suite 2' });
    await request.post(`/api/v1/suites/${s1.body.id}/cases`).send({ title: 'Case A', steps: ['s'], expected_result: 'r' });
    await request.post(`/api/v1/suites/${s2.body.id}/cases`).send({ title: 'Case B', steps: ['s'], expected_result: 'r' });

    // First run only covers Suite 1
    const r1 = await request.post(`/api/v1/projects/${pid}/runs`).send({ suite_ids: [s1.body.id] });
    const r1Cases = await request.get(`/api/v1/runs/${r1.body.id}/cases`);
    await request.patch(`/api/v1/runs/${r1.body.id}/cases/${r1Cases.body[0].id}`).send({ status: 'pass' });
    await request.patch(`/api/v1/runs/${r1.body.id}`).send({ status: 'completed', force_complete: true });

    // Second run covers all suites — Case B is new
    const r2 = await request.post(`/api/v1/projects/${pid}/runs`).send({});
    const r2Cases = await request.get(`/api/v1/runs/${r2.body.id}/cases`);
    for (const rc of r2Cases.body) {
      await request.patch(`/api/v1/runs/${r2.body.id}/cases/${rc.id}`).send({ status: 'pass' });
    }
    await request.patch(`/api/v1/runs/${r2.body.id}`).send({ status: 'completed', force_complete: true });

    const res = await request.get(`/api/v1/runs/${r2.body.id}/summary`);
    expect(res.body.diff.newCases.length).toBeGreaterThanOrEqual(1);
    const newTitles = res.body.diff.newCases.map(c => c.title);
    expect(newTitles).toContain('Case B');
  });

  it('cases skipped in both runs are excluded from diff', async () => {
    const { pid } = await scaffold('BothSkipProject');
    await createAndCompleteRun(pid, ['skip', 'pass', 'fail']);
    const run2Id = await createAndCompleteRun(pid, ['skip', 'pass', 'pass']);
    const res = await request.get(`/api/v1/runs/${run2Id}/summary`);
    // Case 1 skipped in both — should not appear in regressions, fixes, or newCases
    const allDiffIds = [
      ...res.body.diff.regressions,
      ...res.body.diff.fixes,
      ...res.body.diff.newCases,
    ].map(e => e.title);
    expect(allDiffIds).not.toContain('Case 1');
    // Case 3 went fail→pass — should be a fix
    expect(res.body.diff.fixes.some(e => e.title === 'Case 3')).toBe(true);
  });

  it('diff has previousRunId pointing to the correct run', async () => {
    const { pid } = await scaffold('PrevIdProject');
    const run1Id = await createAndCompleteRun(pid, ['pass', 'pass', 'pass']);
    const run2Id = await createAndCompleteRun(pid, ['pass', 'pass', 'pass']);
    const res = await request.get(`/api/v1/runs/${run2Id}/summary`);
    expect(res.body.diff.previousRunId).toBe(run1Id);
  });
});
