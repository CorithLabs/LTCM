const { buildTestApp } = require('./helpers');

const { request, cleanup } = buildTestApp();
afterAll(cleanup);

describe('GET /api/v1/health', () => {
  it('returns status ok with dbPath and version', async () => {
    const res = await request.get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.dbPath).toBe('string');
    expect(typeof res.body.version).toBe('string');
  });
});
