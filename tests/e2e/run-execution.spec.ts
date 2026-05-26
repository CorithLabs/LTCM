import { test, expect, Page } from '@playwright/test';

const uid = () => `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function scaffoldRun(page: Page) {
  const pRes = await page.request.post('http://localhost:3000/api/v1/projects', {
    data: { name: uid() },
  });
  const project = await pRes.json();

  const sRes = await page.request.post(
    `http://localhost:3000/api/v1/projects/${project.id}/suites`,
    { data: { name: 'Feature Suite' } },
  );
  const suite = await sRes.json();

  for (let i = 1; i <= 3; i++) {
    await page.request.post(`http://localhost:3000/api/v1/suites/${suite.id}/cases`, {
      data: {
        title: `Case ${i}`,
        steps: [`Open screen ${i}`, `Click button ${i}`],
        expected_result: `Screen ${i} loads correctly`,
        priority: i === 1 ? 'high' : 'medium',
      },
    });
  }

  return { projectId: project.id, suiteId: suite.id };
}

async function cleanupProject(page: Page, projectId: string) {
  const runsRes = await page.request.get(
    `http://localhost:3000/api/v1/projects/${projectId}/runs`,
  );
  const runs = await runsRes.json();
  for (const run of runs) {
    if (run.status === 'in_progress') {
      await page.request.patch(`http://localhost:3000/api/v1/runs/${run.id}`, {
        data: { status: 'completed', force_complete: true },
      });
    }
  }
  await page.request.delete(`http://localhost:3000/api/v1/projects/${projectId}`).catch(() => {});
}

test.describe('Test Run Execution', () => {
  test('Start Run button is visible on project page', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('button', { name: 'Start Run' })).toBeVisible();
    await cleanupProject(page, projectId);
  });

  test('can start a new test run from the project page', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);
    await page.goto(`/projects/${projectId}`);

    await page.getByRole('button', { name: 'Start Run' }).click();
    await page.waitForURL(/\/runs\/new/);

    // Wait for case count to load so Start Run button becomes enabled
    await expect(page.getByText(/test case/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'Start Run' }).click();
    await page.waitForURL(/\/runs\/.*\/execute/, { timeout: 10000 });

    await expect(page.url()).toMatch(/\/runs\/.*\/execute/);
    await cleanupProject(page, projectId);
  });

  test('execution view shows test case title and steps', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);

    const runRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/runs`,
      { data: {} },
    );
    const run = await runRes.json();

    await page.goto(`/projects/${projectId}/runs/${run.id}/execute`);
    await expect(page.getByText('Case 1')).toBeVisible();
    await expect(page.getByText(/Open screen 1/)).toBeVisible();
    await cleanupProject(page, projectId);
  });

  test('shows Pass, Fail, and Skip buttons', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);
    const runRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/runs`,
      { data: {} },
    );
    const run = await runRes.json();

    await page.goto(`/projects/${projectId}/runs/${run.id}/execute`);
    await expect(page.getByRole('button', { name: 'Pass' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fail' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
    await cleanupProject(page, projectId);
  });

  test('can mark a case as Pass and progress updates', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);
    const runRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/runs`,
      { data: {} },
    );
    const run = await runRes.json();

    await page.goto(`/projects/${projectId}/runs/${run.id}/execute`);

    // Wait for the PATCH request to complete before asserting progress text
    const patchDone = page.waitForResponse(
      resp => resp.url().includes('/cases/') && resp.request().method() === 'PATCH',
      { timeout: 5000 },
    );
    await page.getByRole('button', { name: 'Pass' }).click();
    const patchResp = await patchDone;

    // Verify PATCH succeeded (non-200 means the mutation errored; toast shows then disappears after 4s)
    expect(patchResp.status()).toBe(200);

    // Wait for React Query to refetch and update the DOM
    // Use waitForFunction for reliable DOM-level checking (avoids Playwright getByText regex issues)
    await page.waitForFunction(
      () => document.body.textContent?.includes('1 of 3 marked'),
      { timeout: 5000 },
    );
    await cleanupProject(page, projectId);
  });

  test('can mark a case as Fail and add a note', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);
    const runRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/runs`,
      { data: {} },
    );
    const run = await runRes.json();

    await page.goto(`/projects/${projectId}/runs/${run.id}/execute`);
    await page.getByRole('button', { name: 'Fail' }).click();

    const noteArea = page.getByPlaceholder('Observations, bug details, repro steps…');
    await expect(noteArea).toBeVisible({ timeout: 3000 });
    await noteArea.fill('Button does not respond on mobile');

    // Wait for debounced save (500ms debounce + margin)
    await page.waitForTimeout(700);
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 3000 });
    await cleanupProject(page, projectId);
  });

  test('can navigate between cases using number pills', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);
    const runRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/runs`,
      { data: {} },
    );
    const run = await runRes.json();

    await page.goto(`/projects/${projectId}/runs/${run.id}/execute`);
    await expect(page.getByText('Case 1')).toBeVisible();

    // Case navigation pills show numbers 1, 2, 3
    await page.locator('button').filter({ hasText: /^2$/ }).click();
    await expect(page.getByText('Case 2')).toBeVisible({ timeout: 3000 });
    await cleanupProject(page, projectId);
  });

  test('Complete Run button is visible', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);
    const runRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/runs`,
      { data: {} },
    );
    const run = await runRes.json();

    await page.goto(`/projects/${projectId}/runs/${run.id}/execute`);
    await expect(page.getByRole('button', { name: 'Complete Run' })).toBeVisible();
    await cleanupProject(page, projectId);
  });

  test('can complete a run after marking all cases', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);
    const runRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/runs`,
      { data: {} },
    );
    const run = await runRes.json();

    await page.goto(`/projects/${projectId}/runs/${run.id}/execute`);

    // Mark all 3 cases as Pass — wait 600ms between each to allow mutation + auto-advance
    for (let i = 0; i < 3; i++) {
      await expect(page.getByRole('button', { name: 'Pass' })).toBeVisible({ timeout: 3000 });
      await page.getByRole('button', { name: 'Pass' }).click();
      await page.waitForTimeout(600);
    }

    // Click header Complete Run button (use first() to avoid strict mode with modal button)
    await page.getByRole('button', { name: 'Complete Run' }).first().click();

    // Confirm modal — all cases marked so label is "Complete Run"; unmarked would be "Complete Anyway"
    await expect(page.getByRole('button', { name: /Complete (Run|Anyway)/ }).last()).toBeVisible({ timeout: 3000 });
    await page.getByRole('button', { name: /Complete (Run|Anyway)/ }).last().click();

    await page.waitForURL(/\/runs\/.*\/summary/, { timeout: 10000 });
    await expect(page.url()).toMatch(/\/summary/);
    await cleanupProject(page, projectId);
  });

  test('run summary shows Passed, Failed, Skipped stat cards', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);

    const runRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/runs`,
      { data: { name: 'Summary Run' } },
    );
    const run = await runRes.json();
    const casesRes = await page.request.get(
      `http://localhost:3000/api/v1/runs/${run.id}/cases`,
    );
    const cases = await casesRes.json();

    await page.request.patch(`http://localhost:3000/api/v1/runs/${run.id}/cases/${cases[0].id}`, {
      data: { status: 'pass' },
    });
    await page.request.patch(`http://localhost:3000/api/v1/runs/${run.id}/cases/${cases[1].id}`, {
      data: { status: 'fail', note: 'Broken link' },
    });
    await page.request.patch(`http://localhost:3000/api/v1/runs/${run.id}`, {
      data: { status: 'completed', force_complete: true },
    });

    await page.goto(`/projects/${projectId}/runs/${run.id}/summary`);

    // Stat cards show labels
    await expect(page.getByText('Passed')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Failed')).toBeVisible();
    await expect(page.getByText('Skipped')).toBeVisible();

    // Note appears in the case list
    await expect(page.getByText('Broken link')).toBeVisible();

    await cleanupProject(page, projectId);
  });

  test('can export run as CSV from summary page', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);

    const runRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/runs`,
      { data: { name: 'Export Test' } },
    );
    const run = await runRes.json();
    await page.request.patch(`http://localhost:3000/api/v1/runs/${run.id}`, {
      data: { status: 'completed', force_complete: true },
    });

    await page.goto(`/projects/${projectId}/runs/${run.id}/summary`);
    await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible();

    // Verify the export endpoint works (CSV button uses window.location.href)
    const exportRes = await page.request.get(
      `http://localhost:3000/api/v1/runs/${run.id}/export?format=csv`,
    );
    expect(exportRes.status()).toBe(200);
    expect(exportRes.headers()['content-type']).toMatch(/text\/csv/);

    await cleanupProject(page, projectId);
  });

  test('run history lists past runs with name and status', async ({ page }) => {
    const { projectId } = await scaffoldRun(page);

    const runRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/runs`,
      { data: { name: 'My History Run' } },
    );
    const run = await runRes.json();
    await page.request.patch(`http://localhost:3000/api/v1/runs/${run.id}`, {
      data: { status: 'completed', force_complete: true },
    });

    await page.goto(`/projects/${projectId}/runs`);
    await expect(page.getByText('My History Run')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('View Summary')).toBeVisible();

    await cleanupProject(page, projectId);
  });
});
