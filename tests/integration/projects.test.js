const { buildTestApp } = require('./helpers');

const { request, cleanup } = buildTestApp();
afterAll(cleanup);

describe('Projects API', () => {
  describe('GET /api/v1/projects', () => {
    it('returns empty array initially', async () => {
      const res = await request.get('/api/v1/projects');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/v1/projects', () => {
    it('creates a project with name only', async () => {
      const res = await request.post('/api/v1/projects').send({ name: 'Alpha' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Alpha');
      expect(res.body.description).toBeNull();
      expect(typeof res.body.id).toBe('string');
      expect(typeof res.body.created_at).toBe('string');
    });

    it('creates a project with name and description', async () => {
      const res = await request.post('/api/v1/projects').send({ name: 'Beta', description: 'B desc' });
      expect(res.status).toBe(201);
      expect(res.body.description).toBe('B desc');
    });

    it('400 when name is missing', async () => {
      const res = await request.post('/api/v1/projects').send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('400 when name is empty string', async () => {
      const res = await request.post('/api/v1/projects').send({ name: '' });
      expect(res.status).toBe(400);
    });

    it('400 when name is whitespace only', async () => {
      const res = await request.post('/api/v1/projects').send({ name: '   ' });
      expect(res.status).toBe(400);
    });

    it('400 when name exceeds 100 characters', async () => {
      const res = await request.post('/api/v1/projects').send({ name: 'x'.repeat(101) });
      expect(res.status).toBe(400);
    });

    it('trims name before saving', async () => {
      const res = await request.post('/api/v1/projects').send({ name: '  Gamma  ' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Gamma');
    });
  });

  describe('GET /api/v1/projects — list after creation', () => {
    it('includes lastRunStatus fields', async () => {
      const res = await request.get('/api/v1/projects');
      expect(res.status).toBe(200);
      const project = res.body.find(p => p.name === 'Alpha');
      expect(project).toBeDefined();
      expect('last_run_status' in project).toBe(true);
      expect('last_run_at' in project).toBe(true);
    });
  });

  describe('PATCH /api/v1/projects/:id', () => {
    let projectId;

    beforeAll(async () => {
      const res = await request.post('/api/v1/projects').send({ name: 'ToRename' });
      projectId = res.body.id;
    });

    it('renames a project', async () => {
      const res = await request.patch(`/api/v1/projects/${projectId}`).send({ name: 'Renamed' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed');
    });

    it('400 when name is empty', async () => {
      const res = await request.patch(`/api/v1/projects/${projectId}`).send({ name: '' });
      expect(res.status).toBe(400);
    });

    it('404 on unknown project', async () => {
      const res = await request.patch('/api/v1/projects/doesnotexist').send({ name: 'X' });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('DELETE /api/v1/projects/:id', () => {
    it('deletes a project and returns 204', async () => {
      const create = await request.post('/api/v1/projects').send({ name: 'ToDelete' });
      const id = create.body.id;
      const del = await request.delete(`/api/v1/projects/${id}`);
      expect(del.status).toBe(204);
      const list = await request.get('/api/v1/projects');
      expect(list.body.find(p => p.id === id)).toBeUndefined();
    });

    it('404 on unknown project', async () => {
      const res = await request.delete('/api/v1/projects/doesnotexist');
      expect(res.status).toBe(404);
    });

    it('409 when project has an in-progress run', async () => {
      // Create project → suite → case → run
      const p = await request.post('/api/v1/projects').send({ name: 'HasRun' });
      const pid = p.body.id;
      const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'S1' });
      await request.post(`/api/v1/suites/${s.body.id}/cases`).send({
        title: 'C1', steps: ['step'], expected_result: 'result',
      });
      await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'R1' });
      const del = await request.delete(`/api/v1/projects/${pid}`);
      expect(del.status).toBe(409);
      expect(del.body.code).toBe('RUN_IN_PROGRESS');
    });

    it('cascades — suites and cases are gone after project delete', async () => {
      const p = await request.post('/api/v1/projects').send({ name: 'CascadeP' });
      const pid = p.body.id;
      const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'CS1' });
      const sid = s.body.id;
      await request.post(`/api/v1/suites/${sid}/cases`).send({
        title: 'CC1', steps: ['s'], expected_result: 'r',
      });
      await request.delete(`/api/v1/projects/${pid}`);
      const cases = await request.get(`/api/v1/suites/${sid}/cases`);
      // Suite is gone → cases should be empty (suite no longer exists)
      expect(cases.body).toEqual([]);
    });
  });
});
