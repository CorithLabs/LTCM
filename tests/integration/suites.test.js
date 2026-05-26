const { buildTestApp } = require('./helpers');

const { request, cleanup } = buildTestApp();
afterAll(cleanup);

let projectId;

beforeAll(async () => {
  const res = await request.post('/api/v1/projects').send({ name: 'SuiteProject' });
  projectId = res.body.id;
});

describe('Suites API', () => {
  describe('GET /api/v1/projects/:projectId/suites', () => {
    it('returns empty array for new project', async () => {
      const res = await request.get(`/api/v1/projects/${projectId}/suites`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/v1/projects/:projectId/suites', () => {
    it('creates a suite with name only', async () => {
      const res = await request
        .post(`/api/v1/projects/${projectId}/suites`)
        .send({ name: 'Login Flow' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Login Flow');
      expect(res.body.description).toBeNull();
      expect(res.body.case_count).toBe(0);
      expect(typeof res.body.id).toBe('string');
    });

    it('creates a suite with name and description', async () => {
      const res = await request
        .post(`/api/v1/projects/${projectId}/suites`)
        .send({ name: 'Checkout', description: 'Payment flow' });
      expect(res.status).toBe(201);
      expect(res.body.description).toBe('Payment flow');
    });

    it('400 when name is missing', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/suites`).send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('400 when name is empty string', async () => {
      const res = await request.post(`/api/v1/projects/${projectId}/suites`).send({ name: '' });
      expect(res.status).toBe(400);
    });

    it('assigns incrementing sort_order', async () => {
      const a = await request.post(`/api/v1/projects/${projectId}/suites`).send({ name: 'S-A' });
      const b = await request.post(`/api/v1/projects/${projectId}/suites`).send({ name: 'S-B' });
      expect(b.body.sort_order).toBeGreaterThan(a.body.sort_order);
    });
  });

  describe('GET /api/v1/projects/:projectId/suites — case_count', () => {
    it('reflects actual test case count', async () => {
      const p = await request.post('/api/v1/projects').send({ name: 'CountProject' });
      const pid = p.body.id;
      const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'S' });
      const sid = s.body.id;

      await request.post(`/api/v1/suites/${sid}/cases`).send({
        title: 'Case 1', steps: ['do this'], expected_result: 'see that',
      });
      await request.post(`/api/v1/suites/${sid}/cases`).send({
        title: 'Case 2', steps: ['do other'], expected_result: 'see other',
      });

      const list = await request.get(`/api/v1/projects/${pid}/suites`);
      const suite = list.body.find(s => s.id === sid);
      expect(suite.case_count).toBe(2);
    });
  });

  describe('PATCH /api/v1/suites/:id', () => {
    let suiteId;

    beforeAll(async () => {
      const res = await request
        .post(`/api/v1/projects/${projectId}/suites`)
        .send({ name: 'PatchMe' });
      suiteId = res.body.id;
    });

    it('renames a suite', async () => {
      const res = await request.patch(`/api/v1/suites/${suiteId}`).send({ name: 'Renamed Suite' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed Suite');
    });

    it('updates description', async () => {
      const res = await request.patch(`/api/v1/suites/${suiteId}`).send({ description: 'New desc' });
      expect(res.status).toBe(200);
      expect(res.body.description).toBe('New desc');
    });

    it('400 on empty name', async () => {
      const res = await request.patch(`/api/v1/suites/${suiteId}`).send({ name: '' });
      expect(res.status).toBe(400);
    });

    it('404 on unknown suite', async () => {
      const res = await request.patch('/api/v1/suites/unknown').send({ name: 'X' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/suites/:id', () => {
    it('deletes a suite and returns 204', async () => {
      const s = await request.post(`/api/v1/projects/${projectId}/suites`).send({ name: 'ToDelete' });
      const sid = s.body.id;
      const del = await request.delete(`/api/v1/suites/${sid}`);
      expect(del.status).toBe(204);
      const list = await request.get(`/api/v1/projects/${projectId}/suites`);
      expect(list.body.find(x => x.id === sid)).toBeUndefined();
    });

    it('cascades — test cases deleted with suite', async () => {
      const s = await request.post(`/api/v1/projects/${projectId}/suites`).send({ name: 'CascadeSuite' });
      const sid = s.body.id;
      await request.post(`/api/v1/suites/${sid}/cases`).send({
        title: 'C', steps: ['s'], expected_result: 'r',
      });
      await request.delete(`/api/v1/suites/${sid}`);
      const cases = await request.get(`/api/v1/suites/${sid}/cases`);
      expect(cases.body).toEqual([]);
    });

    it('404 on unknown suite', async () => {
      const res = await request.delete('/api/v1/suites/unknown');
      expect(res.status).toBe(404);
    });
  });
});
