const { buildTestApp } = require('./helpers');

const { request, cleanup } = buildTestApp();
afterAll(cleanup);

async function scaffold() {
  const p = await request.post('/api/v1/projects').send({ name: 'BackupProject' });
  const pid = p.body.id;
  const s = await request.post(`/api/v1/projects/${pid}/suites`).send({ name: 'Suite A' });
  const sid = s.body.id;
  await request.post(`/api/v1/suites/${sid}/cases`).send({
    title: 'Case 1', steps: ['Step 1'], expected_result: 'Result 1',
  });
  const run = await request.post(`/api/v1/projects/${pid}/runs`).send({ name: 'Run 1' });
  return { pid, sid, runId: run.body.id };
}

describe('Backup & Restore API', () => {
  describe('GET /api/v1/backup', () => {
    it('returns 200 with application/json content type', async () => {
      const res = await request.get('/api/v1/backup');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('sets Content-Disposition with ltcm-backup-YYYY-MM-DD.json filename', async () => {
      const res = await request.get('/api/v1/backup');
      expect(res.headers['content-disposition']).toMatch(/filename="ltcm-backup-\d{4}-\d{2}-\d{2}\.json"/);
    });

    it('includes schemaVersion field', async () => {
      const res = await request.get('/api/v1/backup');
      expect(res.body.schemaVersion).toBeDefined();
      expect(typeof res.body.schemaVersion).toBe('number');
    });

    it('includes all entity arrays', async () => {
      const res = await request.get('/api/v1/backup');
      expect(Array.isArray(res.body.projects)).toBe(true);
      expect(Array.isArray(res.body.suites)).toBe(true);
      expect(Array.isArray(res.body.test_cases)).toBe(true);
      expect(Array.isArray(res.body.runs)).toBe(true);
      expect(Array.isArray(res.body.run_cases)).toBe(true);
    });

    it('export succeeds on empty DB (before scaffold)', async () => {
      // Already passes on any DB state — just verify valid JSON shell
      const res = await request.get('/api/v1/backup');
      expect(res.status).toBe(200);
      expect(res.body).toBeTruthy();
    });

    it('exports data after scaffold', async () => {
      await scaffold();
      const res = await request.get('/api/v1/backup');
      expect(res.status).toBe(200);
      expect(res.body.projects.length).toBeGreaterThan(0);
      expect(res.body.suites.length).toBeGreaterThan(0);
      expect(res.body.test_cases.length).toBeGreaterThan(0);
      expect(res.body.runs.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/restore', () => {
    it('400 when no file is uploaded', async () => {
      const res = await request.post('/api/v1/restore');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('NO_FILE');
    });

    it('400 when file is not valid JSON', async () => {
      const res = await request
        .post('/api/v1/restore')
        .attach('file', Buffer.from('not json at all'), { filename: 'bad.json', contentType: 'application/json' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_BACKUP');
    });

    it('400 when schemaVersion is missing', async () => {
      const bad = JSON.stringify({ projects: [], suites: [] });
      const res = await request
        .post('/api/v1/restore')
        .attach('file', Buffer.from(bad), { filename: 'bad.json', contentType: 'application/json' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SCHEMA_MISMATCH');
    });

    it('400 when schemaVersion is wrong', async () => {
      const bad = JSON.stringify({ schemaVersion: 999, projects: [] });
      const res = await request
        .post('/api/v1/restore')
        .attach('file', Buffer.from(bad), { filename: 'bad.json', contentType: 'application/json' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SCHEMA_MISMATCH');
    });

    it('restores from a valid backup and overwrites existing data', async () => {
      // First export current state
      const exportRes = await request.get('/api/v1/backup');
      expect(exportRes.status).toBe(200);
      const backup = exportRes.body;

      // Add extra data that should be overwritten
      await request.post('/api/v1/projects').send({ name: 'ExtraProject' });

      // Restore the backup (which did not include ExtraProject)
      const backupBuf = Buffer.from(JSON.stringify(backup));
      const restoreRes = await request
        .post('/api/v1/restore')
        .attach('file', backupBuf, { filename: 'ltcm-backup.json', contentType: 'application/json' });
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.restored).toBe(true);

      // ExtraProject should be gone
      const projectsRes = await request.get('/api/v1/projects');
      const names = projectsRes.body.map(p => p.name);
      expect(names).not.toContain('ExtraProject');
    });

    it('restored data matches original export', async () => {
      const exportRes = await request.get('/api/v1/backup');
      const backup = exportRes.body;

      const backupBuf = Buffer.from(JSON.stringify(backup));
      await request
        .post('/api/v1/restore')
        .attach('file', backupBuf, { filename: 'ltcm-backup.json', contentType: 'application/json' });

      // Project names should match
      const projectsRes = await request.get('/api/v1/projects');
      const restoredNames = projectsRes.body.map(p => p.name).sort();
      const backupNames = backup.projects.map(p => p.name).sort();
      expect(restoredNames).toEqual(backupNames);
    });
  });
});
