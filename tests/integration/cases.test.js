const { buildTestApp } = require('./helpers');

const { request, cleanup } = buildTestApp();
afterAll(cleanup);

let suiteId;

beforeAll(async () => {
  const p = await request.post('/api/v1/projects').send({ name: 'CasesProject' });
  const s = await request.post(`/api/v1/projects/${p.body.id}/suites`).send({ name: 'CasesSuite' });
  suiteId = s.body.id;
});

const validCase = {
  title: 'Login with valid credentials',
  preconditions: 'User exists in the system',
  steps: ['Open login page', 'Enter credentials', 'Click submit'],
  expected_result: 'User is redirected to dashboard',
  priority: 'high',
};

describe('Cases API', () => {
  describe('POST /api/v1/suites/:suiteId/cases', () => {
    it('creates a case with all fields', async () => {
      const res = await request.post(`/api/v1/suites/${suiteId}/cases`).send(validCase);
      expect(res.status).toBe(201);
      expect(res.body.title).toBe(validCase.title);
      expect(res.body.priority).toBe('high');
      expect(Array.isArray(res.body.steps)).toBe(true);
      expect(res.body.steps).toEqual(validCase.steps);
      expect(typeof res.body.id).toBe('string');
    });

    it('defaults priority to medium when omitted', async () => {
      const res = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
        title: 'No priority', steps: ['step'], expected_result: 'result',
      });
      expect(res.status).toBe(201);
      expect(res.body.priority).toBe('medium');
    });

    it('defaults priority to medium for invalid priority value', async () => {
      const res = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
        title: 'Bad priority', steps: ['step'], expected_result: 'result', priority: 'critical',
      });
      expect(res.status).toBe(201);
      expect(res.body.priority).toBe('medium');
    });

    it('400 when title is missing', async () => {
      const res = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
        steps: ['step'], expected_result: 'result',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('400 when expected_result is missing', async () => {
      const res = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
        title: 'T', steps: ['step'],
      });
      expect(res.status).toBe(400);
    });

    it('400 when steps is empty array', async () => {
      const res = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
        title: 'T', steps: [], expected_result: 'r',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('400 when steps contains only whitespace strings', async () => {
      const res = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
        title: 'T', steps: ['   ', '  '], expected_result: 'r',
      });
      expect(res.status).toBe(400);
    });

    it('400 when title exceeds 100 chars', async () => {
      const res = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
        title: 'x'.repeat(101), steps: ['s'], expected_result: 'r',
      });
      expect(res.status).toBe(400);
    });

    it('filters blank steps before saving', async () => {
      const res = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
        title: 'FilterTest', steps: ['real step', '  ', 'another step'], expected_result: 'r',
      });
      expect(res.status).toBe(201);
      expect(res.body.steps).toEqual(['real step', 'another step']);
    });
  });

  describe('GET /api/v1/suites/:suiteId/cases', () => {
    it('returns cases with parsed steps array', async () => {
      const res = await request.get(`/api/v1/suites/${suiteId}/cases`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      res.body.forEach(c => {
        expect(Array.isArray(c.steps)).toBe(true);
      });
    });
  });

  describe('PATCH /api/v1/cases/:id', () => {
    let caseId;

    beforeAll(async () => {
      const res = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
        title: 'PatchCase', steps: ['original step'], expected_result: 'original result',
      });
      caseId = res.body.id;
    });

    it('updates title', async () => {
      const res = await request.patch(`/api/v1/cases/${caseId}`).send({ title: 'Updated Title' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title');
    });

    it('updates steps', async () => {
      const res = await request.patch(`/api/v1/cases/${caseId}`).send({
        steps: ['new step 1', 'new step 2'],
      });
      expect(res.status).toBe(200);
      expect(res.body.steps).toEqual(['new step 1', 'new step 2']);
    });

    it('updates priority', async () => {
      const res = await request.patch(`/api/v1/cases/${caseId}`).send({ priority: 'low' });
      expect(res.status).toBe(200);
      expect(res.body.priority).toBe('low');
    });

    it('400 when updating to empty steps', async () => {
      const res = await request.patch(`/api/v1/cases/${caseId}`).send({ steps: [] });
      expect(res.status).toBe(400);
    });

    it('400 when updating to empty title', async () => {
      const res = await request.patch(`/api/v1/cases/${caseId}`).send({ title: '' });
      expect(res.status).toBe(400);
    });

    it('404 on unknown case', async () => {
      const res = await request.patch('/api/v1/cases/unknown').send({ title: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/cases/:id', () => {
    it('deletes a case and returns 204', async () => {
      const c = await request.post(`/api/v1/suites/${suiteId}/cases`).send({
        title: 'ToDelete', steps: ['s'], expected_result: 'r',
      });
      const res = await request.delete(`/api/v1/cases/${c.body.id}`);
      expect(res.status).toBe(204);
    });

    it('404 on unknown case', async () => {
      const res = await request.delete('/api/v1/cases/unknown');
      expect(res.status).toBe(404);
    });
  });
});
