const { buildTestApp } = require('./helpers');

// Set a deterministic encryption key for tests
process.env.JIRA_ENCRYPTION_KEY = 'a'.repeat(64);

let request, cleanup;

beforeAll(() => {
  ({ request, cleanup } = buildTestApp());
});
afterAll(() => cleanup());

// Helper: create a project + suite + case, return caseId
async function createTestCase() {
  const proj = await request.post('/api/v1/projects').send({ name: 'JiraProj' });
  const suite = await request.post(`/api/v1/projects/${proj.body.id}/suites`).send({ name: 'Suite' });
  const tc = await request.post(`/api/v1/suites/${suite.body.id}/cases`)
    .send({ title: 'Case', steps: ['step'], expected_result: 'result' });
  return tc.body.id;
}

const VALID_CONFIG = {
  baseUrl: 'https://example.atlassian.net',
  email: 'tester@example.com',
  apiToken: 'tok_secret',
  projectKey: 'MYAPP',
};

// ---- Config CRUD ----
describe('GET /api/v1/jira/config', () => {
  test('returns connected: false when no config', async () => {
    const res = await request.get('/api/v1/jira/config');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });
});

describe('POST /api/v1/jira/config', () => {
  test('400 when missing fields', async () => {
    const res = await request.post('/api/v1/jira/config').send({ baseUrl: 'https://x.atlassian.net' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('400 when baseUrl is not a valid URL', async () => {
    const res = await request.post('/api/v1/jira/config').send({ ...VALID_CONFIG, baseUrl: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('201 on valid config — normalises URL and uppercases projectKey', async () => {
    const res = await request.post('/api/v1/jira/config').send({ ...VALID_CONFIG, projectKey: 'myapp' });
    expect(res.status).toBe(201);
    expect(res.body.connected).toBe(true);
    expect(res.body.baseUrl).toBe('https://example.atlassian.net');
    expect(res.body.projectKey).toBe('MYAPP');
    expect(res.body.email).toBe(VALID_CONFIG.email);
    // token never returned
    expect(res.body.apiToken).toBeUndefined();
  });

  test('GET /config returns connected: true after save', async () => {
    const res = await request.get('/api/v1/jira/config');
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.baseUrl).toBe('https://example.atlassian.net');
    expect(res.body.email).toBe(VALID_CONFIG.email);
  });
});

describe('DELETE /api/v1/jira/config', () => {
  test('204 removes config', async () => {
    const res = await request.delete('/api/v1/jira/config');
    expect(res.status).toBe(204);
    const check = await request.get('/api/v1/jira/config');
    expect(check.body.connected).toBe(false);
  });
});

// ---- Test connectivity ----
describe('POST /api/v1/jira/test', () => {
  test('400 when no config saved', async () => {
    const res = await request.post('/api/v1/jira/test');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_CONFIGURED');
  });

  test('200 when Jira responds ok (mocked fetch)', async () => {
    await request.post('/api/v1/jira/config').send(VALID_CONFIG);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ displayName: 'Test User' }),
    });

    const res = await request.post('/api/v1/jira/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.displayName).toBe('Test User');

    global.fetch = undefined;
  });

  test('400 auth failed when Jira returns 401 (mocked)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    const res = await request.post('/api/v1/jira/test');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('JIRA_AUTH_FAILED');
    global.fetch = undefined;
  });
});

// ---- Issues lookup ----
describe('GET /api/v1/jira/issues', () => {
  test('400 when no config', async () => {
    await request.delete('/api/v1/jira/config');
    const res = await request.get('/api/v1/jira/issues?key=PROJ-1');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_CONFIGURED');
  });

  test('400 when key missing', async () => {
    await request.post('/api/v1/jira/config').send(VALID_CONFIG);
    const res = await request.get('/api/v1/jira/issues');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('200 with issue data (mocked fetch)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ key: 'MYAPP-42', fields: { summary: 'Fix login bug', status: { name: 'Open' }, issuetype: { name: 'Bug' } } }),
    });
    const res = await request.get('/api/v1/jira/issues?key=MYAPP-42');
    expect(res.status).toBe(200);
    expect(res.body.key).toBe('MYAPP-42');
    expect(res.body.summary).toBe('Fix login bug');
    expect(res.body.status).toBe('Open');
    global.fetch = undefined;
  });
});

// ---- Versions ----
describe('GET /api/v1/jira/versions', () => {
  test('400 when no config', async () => {
    await request.delete('/api/v1/jira/config');
    const res = await request.get('/api/v1/jira/versions');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_CONFIGURED');
  });

  test('200 with sorted versions (mocked fetch)', async () => {
    await request.post('/api/v1/jira/config').send(VALID_CONFIG);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => [
        { id: '1', name: 'v1.0', released: true, releaseDate: '2024-01-01' },
        { id: '2', name: 'v2.0', released: false, releaseDate: null },
      ],
    });
    const res = await request.get('/api/v1/jira/versions');
    expect(res.status).toBe(200);
    // unreleased first
    expect(res.body[0].released).toBe(false);
    expect(res.body[1].released).toBe(true);
    global.fetch = undefined;
  });
});

// ---- Case Jira Links ----
describe('Case Jira Links', () => {
  let caseId;

  beforeAll(async () => {
    caseId = await createTestCase();
    // Ensure config is present
    await request.post('/api/v1/jira/config').send(VALID_CONFIG);
  });

  test('GET /jira/cases/:id/jira-links — 404 when case not found', async () => {
    const res = await request.get('/api/v1/jira/cases/nonexistent/jira-links');
    expect(res.status).toBe(404);
  });

  test('GET /jira/cases/:id/jira-links — empty array initially', async () => {
    const res = await request.get(`/api/v1/jira/cases/${caseId}/jira-links`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST /jira/cases/:id/jira-links — 400 missing jiraIssueKey', async () => {
    const res = await request.post(`/api/v1/jira/cases/${caseId}/jira-links`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('POST /jira/cases/:id/jira-links — 404 when case not found', async () => {
    const res = await request.post('/api/v1/jira/cases/nonexistent/jira-links').send({ jiraIssueKey: 'X-1' });
    expect(res.status).toBe(404);
  });

  test('POST /jira/cases/:id/jira-links — 201 with mocked Jira', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ key: 'MYAPP-10', fields: { summary: 'Auth bug' } }),
    });
    const res = await request.post(`/api/v1/jira/cases/${caseId}/jira-links`).send({ jiraIssueKey: 'myapp-10' });
    expect(res.status).toBe(201);
    expect(res.body.jira_issue_key).toBe('MYAPP-10');
    expect(res.body.jira_issue_summary).toBe('Auth bug');
    expect(res.body.case_id).toBe(caseId);
    global.fetch = undefined;
  });

  test('POST /jira/cases/:id/jira-links — 409 on duplicate', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ key: 'MYAPP-10', fields: { summary: 'Auth bug' } }),
    });
    const res = await request.post(`/api/v1/jira/cases/${caseId}/jira-links`).send({ jiraIssueKey: 'MYAPP-10' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_LINK');
    global.fetch = undefined;
  });

  test('GET shows the newly linked issue', async () => {
    const res = await request.get(`/api/v1/jira/cases/${caseId}/jira-links`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].jira_issue_key).toBe('MYAPP-10');
  });

  test('DELETE /jira/cases/:id/jira-links/:linkId — 204 removes link', async () => {
    const links = await request.get(`/api/v1/jira/cases/${caseId}/jira-links`);
    const linkId = links.body[0].id;

    const del = await request.delete(`/api/v1/jira/cases/${caseId}/jira-links/${linkId}`);
    expect(del.status).toBe(204);

    const after = await request.get(`/api/v1/jira/cases/${caseId}/jira-links`);
    expect(after.body).toEqual([]);
  });

  test('DELETE /jira/cases/:id/jira-links/:linkId — 404 when not found', async () => {
    const res = await request.delete(`/api/v1/jira/cases/${caseId}/jira-links/nonexistent`);
    expect(res.status).toBe(404);
  });
});

// ---- Run with Jira Fix Version ----
describe('POST /api/v1/projects/:projectId/runs — jira version', () => {
  test('stores jiraVersionId and jiraVersionName on run', async () => {
    const proj = await request.post('/api/v1/projects').send({ name: 'ProjRun' });
    const suite = await request.post(`/api/v1/projects/${proj.body.id}/suites`).send({ name: 'Suite' });
    await request.post(`/api/v1/suites/${suite.body.id}/cases`)
      .send({ title: 'Case', steps: ['step'], expected_result: 'result' });

    const res = await request.post(`/api/v1/projects/${proj.body.id}/runs`).send({
      name: 'v2.0 Run',
      jiraVersionId: 'jira-ver-id-123',
      jiraVersionName: 'v2.0',
    });
    expect(res.status).toBe(201);
    expect(res.body.jira_version_id).toBe('jira-ver-id-123');
    expect(res.body.jira_version_name).toBe('v2.0');
  });
});
