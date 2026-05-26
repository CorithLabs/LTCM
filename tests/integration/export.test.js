const { buildTestApp } = require('./helpers');

const { request, cleanup } = buildTestApp();
afterAll(cleanup);

// Build a completed run to export
let runId;

beforeAll(async () => {
  const p = await request.post('/api/v1/projects').send({ name: 'ExportProject' });
  const pid = p.body.id;
  const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'Auth Suite' });
  const sid = s.body.id;

  await request.post(`/api/v1/suites/${sid}/cases`).send({
    title: 'Login success',
    steps: ['Open page', 'Enter creds', 'Click submit'],
    expected_result: 'Dashboard shown',
    priority: 'high',
  });
  await request.post(`/api/v1/suites/${sid}/cases`).send({
    title: 'Login fail — bad creds',
    steps: ['Open page', 'Enter wrong creds'],
    expected_result: 'Error message shown',
    priority: 'medium',
  });
  // Case with a note containing commas and double quotes (CSV edge case)
  await request.post(`/api/v1/suites/${sid}/cases`).send({
    title: 'Edge case, tricky "note"',
    steps: ['Do it'],
    expected_result: 'Works',
    priority: 'low',
  });

  const run = await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'Export Run' });
  runId = run.body.id;
  const cases = await request.get(`/api/v1/runs/${runId}/cases`);

  await request.patch(`/api/v1/runs/${runId}/cases/${cases.body[0].id}`).send({ status: 'pass' });
  await request.patch(`/api/v1/runs/${runId}/cases/${cases.body[1].id}`).send({
    status: 'fail',
    note: 'Error code: 401, message: "Unauthorized"',
  });
  await request.patch(`/api/v1/runs/${runId}`).send({ status: 'completed', force_complete: true });
});

describe('Export API', () => {
  describe('CSV export', () => {
    it('returns 200 with text/csv content type', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/export?format=csv`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
    });

    it('sets Content-Disposition attachment header', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/export?format=csv`);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.headers['content-disposition']).toMatch(/\.csv/);
    });

    it('includes correct header row', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/export?format=csv`);
      const lines = res.text.split('\r\n');
      expect(lines[0]).toBe('Case Title,Suite,Priority,Status,Note');
    });

    it('has one data row per case', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/export?format=csv`);
      const lines = res.text.split('\r\n').filter(l => l.length > 0);
      expect(lines.length).toBe(4); // header + 3 cases
    });

    it('properly quotes fields containing commas', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/export?format=csv`);
      // The note "Error code: 401, message: "Unauthorized"" contains a comma and quotes
      expect(res.text).toContain('"Error code: 401, message: ""Unauthorized"""');
    });

    it('400 when run is in progress', async () => {
      const p = await request.post('/api/v1/projects').send({ name: 'InProgressExport' });
      const s = await request.post(`/api/v1/projects/${p.body.id}/suites`).send({ name: 'S' });
      await request.post(`/api/v1/suites/${s.body.id}/cases`).send({ title: 'T', steps: ['s'], expected_result: 'r' });
      const run = await request.post(`/api/v1/projects/${p.body.id}/runs`).send({});
      const res = await request.get(`/api/v1/runs/${run.body.id}/export?format=csv`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('RUN_NOT_COMPLETED');
    });

    it('404 on unknown run', async () => {
      const res = await request.get('/api/v1/runs/unknown/export?format=csv');
      expect(res.status).toBe(404);
    });
  });

  describe('HTML/PDF export', () => {
    it('returns 200 with text/html content type for format=html', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/export?format=html`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('HTML contains run name and project name', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/export?format=html`);
      expect(res.text).toContain('Export Run');
      expect(res.text).toContain('ExportProject');
    });

    it('HTML contains pass/fail/skip summary stats', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/export?format=html`);
      expect(res.text).toContain('Passed');
      expect(res.text).toContain('Failed');
      expect(res.text).toContain('Skipped');
    });

    it('returns 200 for format=pdf (same HTML response)', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/export?format=pdf`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });
  });

  describe('Unsupported format', () => {
    it('400 for unknown format', async () => {
      const res = await request.get(`/api/v1/runs/${runId}/export?format=xlsx`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_FORMAT');
    });
  });
});
