const { buildTestApp } = require('./helpers');

const { request, cleanup } = buildTestApp();
afterAll(cleanup);

let projectId, suiteId, suite2Id, caseId;

beforeAll(async () => {
  const p = await request.post('/api/v1/projects').send({ name: 'V11CasesProject' });
  projectId = p.body.id;
  const s1 = await request.post(`/api/v1/projects/${projectId}/suites`).send({ name: 'Suite 1' });
  suiteId = s1.body.id;
  const s2 = await request.post(`/api/v1/projects/${projectId}/suites`).send({ name: 'Suite 2' });
  suite2Id = s2.body.id;
  const c = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
    title: 'Original Case',
    preconditions: 'Some pre',
    steps: ['Step A', 'Step B'],
    expected_result: 'Something happens',
    priority: 'high',
  });
  caseId = c.body.id;
});

describe('Duplicate Test Case (SONG-75)', () => {
  it('POST /api/v1/cases/:id/duplicate returns 201 with Copy of... prefix', async () => {
    const res = await request.post(`/api/v1/cases/${caseId}/duplicate`).send({});
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Copy of Original Case');
  });

  it('copies all fields from the original', async () => {
    const res = await request.post(`/api/v1/cases/${caseId}/duplicate`).send({});
    expect(res.body.steps).toEqual(['Step A', 'Step B']);
    expect(res.body.preconditions).toBe('Some pre');
    expect(res.body.expected_result).toBe('Something happens');
    expect(res.body.priority).toBe('high');
    expect(res.body.suite_id).toBe(suiteId);
  });

  it('duplicate has a new id', async () => {
    const res = await request.post(`/api/v1/cases/${caseId}/duplicate`).send({});
    expect(res.body.id).not.toBe(caseId);
  });

  it('truncates title to 100 chars when prefix would exceed limit', async () => {
    const longTitle = 'x'.repeat(97); // 'Copy of ' (8) + 97 = 105 > 100
    const c = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
      title: longTitle, steps: ['s'], expected_result: 'r',
    });
    const res = await request.post(`/api/v1/cases/${c.body.id}/duplicate`).send({});
    expect(res.status).toBe(201);
    expect(res.body.title.length).toBeLessThanOrEqual(100);
  });

  it('404 on unknown case', async () => {
    const res = await request.post('/api/v1/cases/nonexistent/duplicate').send({});
    expect(res.status).toBe(404);
  });

  it('duplicate appears in suite cases list', async () => {
    const res = await request.post(`/api/v1/cases/${caseId}/duplicate`).send({});
    const listRes = await request.get(`/api/v1/suites/${suiteId}/cases`);
    const ids = listRes.body.map(c => c.id);
    expect(ids).toContain(res.body.id);
  });
});

describe('Move Test Case (SONG-76)', () => {
  let moveCaseId;

  beforeAll(async () => {
    const c = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
      title: 'Case to Move', steps: ['step'], expected_result: 'result',
    });
    moveCaseId = c.body.id;
  });

  it('PATCH /api/v1/cases/:id/move moves case to destination suite', async () => {
    const res = await request.patch(`/api/v1/cases/${moveCaseId}/move`).send({ suite_id: suite2Id });
    expect(res.status).toBe(200);
    expect(res.body.suite_id).toBe(suite2Id);
  });

  it('case appears in destination suite', async () => {
    const listRes = await request.get(`/api/v1/suites/${suite2Id}/cases`);
    const ids = listRes.body.map(c => c.id);
    expect(ids).toContain(moveCaseId);
  });

  it('case no longer in source suite', async () => {
    const listRes = await request.get(`/api/v1/suites/${suiteId}/cases`);
    const ids = listRes.body.map(c => c.id);
    expect(ids).not.toContain(moveCaseId);
  });

  it('moving to same suite is a no-op', async () => {
    const res = await request.patch(`/api/v1/cases/${moveCaseId}/move`).send({ suite_id: suite2Id });
    expect(res.status).toBe(200);
    expect(res.body.suite_id).toBe(suite2Id);
  });

  it('400 when suite_id is missing', async () => {
    const c = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
      title: 'Another', steps: ['s'], expected_result: 'r',
    });
    const res = await request.patch(`/api/v1/cases/${c.body.id}/move`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('404 when destination suite does not exist', async () => {
    const c = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
      title: 'Another2', steps: ['s'], expected_result: 'r',
    });
    const res = await request.patch(`/api/v1/cases/${c.body.id}/move`).send({ suite_id: 'nonexistent' });
    expect(res.status).toBe(404);
  });

  it('404 on unknown case', async () => {
    const res = await request.patch('/api/v1/cases/unknown/move').send({ suite_id: suite2Id });
    expect(res.status).toBe(404);
  });
});
