import { test, expect, Page } from '@playwright/test';

const uid = () => `E2E-V3-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function scaffoldRunWithSteps(page: Page) {
  const pRes = await page.request.post('http://localhost:3000/api/v1/projects', {
    data: { name: uid() },
  });
  const project = await pRes.json();

  const sRes = await page.request.post(
    `http://localhost:3000/api/v1/projects/${project.id}/suites`,
    { data: { name: 'Feature Suite' } },
  );
  const suite = await sRes.json();

  await page.request.post(`http://localhost:3000/api/v1/suites/${suite.id}/cases`, {
    data: {
      title: 'Login case',
      steps: ['Open login page', 'Enter credentials', 'Click Submit'],
      expected_result: 'User is logged in',
      priority: 'high',
    },
  });
  await page.request.post(`http://localhost:3000/api/v1/suites/${suite.id}/cases`, {
    data: {
      title: 'Logout case',
      steps: ['Click logout'],
      expected_result: 'User is logged out',
      priority: 'medium',
    },
  });

  return { projectId: project.id, suiteId: suite.id };
}

async function startRun(page: Page, projectId: string, environment?: string) {
  const body: Record<string, unknown> = { name: 'V3 Run' };
  if (environment) body.environment = environment;
  const runRes = await page.request.post(
    `http://localhost:3000/api/v1/projects/${projectId}/runs`,
    { data: body },
  );
  const run = await runRes.json();
  await page.goto(`http://localhost:3000/projects/${projectId}/runs/${run.id}/execute`);
  await page.waitForLoadState('networkidle');
  return run.id;
}

async function cleanup(page: Page, projectId: string) {
  await page.request.delete(`http://localhost:3000/api/v1/projects/${projectId}`).catch(() => {});
}

// ---- SONG-103: Per-step pass/fail ----
test.describe('SONG-103: Per-step execution', () => {
  test('step pass/fail toggles are visible for each step', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId);

    // Case 1 has 3 steps — each should show pass and fail buttons
    await expect(page.locator('li').first()).toBeVisible();
    const stepPassBtns = page.locator('ol li button[title="Step pass"]');
    const stepFailBtns = page.locator('ol li button[title="Step fail"]');
    await expect(stepPassBtns).toHaveCount(3);
    await expect(stepFailBtns).toHaveCount(3);

    await cleanup(page, projectId);
  });

  test('marking a step as fail reveals actual result input', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId);

    const firstStepFail = page.locator('ol li button[title="Step fail"]').first();
    await firstStepFail.click();

    await expect(page.locator('input[placeholder="Actual result…"]').first()).toBeVisible();

    await cleanup(page, projectId);
  });

  test('all steps pass → overall status auto-suggests Pass', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId);

    const stepPassBtns = page.locator('ol li button[title="Step pass"]');
    const count = await stepPassBtns.count();
    for (let i = 0; i < count; i++) {
      await stepPassBtns.nth(i).click();
      await page.waitForTimeout(200);
    }

    // Overall Pass button should be active (highlighted)
    const passBtn = page.getByRole('button', { name: 'Pass' }).first();
    await expect(passBtn).toHaveClass(/bg-pass/);

    await cleanup(page, projectId);
  });

  test('any step fail → overall status auto-suggests Fail', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId);

    const stepPassBtns = page.locator('ol li button[title="Step pass"]');
    const stepFailBtns = page.locator('ol li button[title="Step fail"]');
    const count = await stepPassBtns.count();
    // Mark first 2 as pass, last as fail
    for (let i = 0; i < count - 1; i++) {
      await stepPassBtns.nth(i).click();
      await page.waitForTimeout(150);
    }
    await stepFailBtns.nth(count - 1).click();
    await page.waitForTimeout(150);

    const failBtn = page.getByRole('button', { name: 'Fail' }).first();
    await expect(failBtn).toHaveClass(/bg-fail/);

    await cleanup(page, projectId);
  });

  test('can override auto-suggested status', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId);

    // All steps pass (auto → Pass), then manually click Fail
    const stepPassBtns = page.locator('ol li button[title="Step pass"]');
    const count = await stepPassBtns.count();
    for (let i = 0; i < count; i++) {
      await stepPassBtns.nth(i).click();
      await page.waitForTimeout(150);
    }

    const failBtn = page.getByRole('button', { name: 'Fail' }).first();
    await failBtn.click();
    await expect(failBtn).toHaveClass(/bg-fail/);

    await cleanup(page, projectId);
  });

  test('step results persist after navigation away and back', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    const runId = await startRun(page, projectId);

    // Mark step 1 as fail with actual result
    await page.locator('ol li button[title="Step fail"]').first().click();
    await page.waitForTimeout(200);
    const actualInput = page.locator('input[placeholder="Actual result…"]').first();
    await actualInput.fill('Button was missing');
    await page.waitForTimeout(600); // debounce

    // Navigate to case 2 and back
    await page.locator('button[title="Logout case"]').click().catch(() =>
      page.locator('.font-mono').nth(1).click()
    );
    await page.waitForTimeout(300);
    // Navigate back to case 1
    await page.locator('.font-mono').first().click();
    await page.waitForTimeout(500);

    // Check API persisted step_results
    const cases = await page.request.get(`http://localhost:3000/api/v1/runs/${runId}/cases`);
    const casesBody = await cases.json();
    const stepResults = casesBody[0].step_results;
    expect(stepResults).not.toBeNull();
    const failStep = stepResults?.find((s: any) => s.status === 'fail');
    expect(failStep).toBeDefined();

    await cleanup(page, projectId);
  });
});

// ---- SONG-104: Blocked / N/A in UI ----
test.describe('SONG-104: Blocked and N/A statuses in UI', () => {
  test('Blocked button is visible in the status row', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId);

    await expect(page.getByRole('button', { name: 'Blocked' })).toBeVisible();

    await cleanup(page, projectId);
  });

  test('Not Applicable button is visible as secondary option', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId);

    await expect(page.getByRole('button', { name: 'Not Applicable' })).toBeVisible();

    await cleanup(page, projectId);
  });

  test('clicking Blocked highlights the button', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId);

    const blockedBtn = page.getByRole('button', { name: 'Blocked' });
    await blockedBtn.click();
    await expect(blockedBtn).toHaveClass(/bg-orange-500/);

    await cleanup(page, projectId);
  });

  test('clicking N/A highlights the button', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId);

    const naBtn = page.getByRole('button', { name: 'Not Applicable' });
    await naBtn.click();
    await expect(naBtn).toHaveClass(/bg-slate-500/);

    await cleanup(page, projectId);
  });

  test('progress bar and counter reflect blocked cases', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId);

    await page.getByRole('button', { name: 'Blocked' }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=/blocked/i').first()).toBeVisible();

    await cleanup(page, projectId);
  });
});

// ---- SONG-106: Environment label in run setup and execution ----
test.describe('SONG-106: Environment tagging', () => {
  test('environment field is present on Start Run page', async ({ page }) => {
    const pRes = await page.request.post('http://localhost:3000/api/v1/projects', {
      data: { name: uid() },
    });
    const project = await pRes.json();
    const sRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${project.id}/suites`,
      { data: { name: 'S' } },
    );
    await page.request.post(`http://localhost:3000/api/v1/suites/${sRes.json().then ? (await sRes.json()).id : ''}/cases`, {
      data: { title: 'C', steps: ['s'], expected_result: 'e' },
    }).catch(() => {});

    await page.goto(`http://localhost:3000/projects/${project.id}/runs/new`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('input[list="env-suggestions"]')).toBeVisible();

    await cleanup(page, project.id);
  });

  test('environment label appears in run header during execution', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    await startRun(page, projectId, 'Staging');

    await expect(page.locator('text=Staging').first()).toBeVisible();

    await cleanup(page, projectId);
  });

  test('environment label appears in run summary', async ({ page }) => {
    const { projectId } = await scaffoldRunWithSteps(page);
    const runId = await startRun(page, projectId, 'Production');

    // Complete the run via API
    const cases = await page.request.get(`http://localhost:3000/api/v1/runs/${runId}/cases`);
    const casesBody = await cases.json();
    for (const c of casesBody) {
      await page.request.patch(`http://localhost:3000/api/v1/runs/${runId}/cases/${c.id}`, {
        data: { status: 'pass' },
      });
    }
    await page.request.patch(`http://localhost:3000/api/v1/runs/${runId}`, {
      data: { status: 'completed' },
    });

    await page.goto(`http://localhost:3000/projects/${projectId}/runs/${runId}/summary`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Production').first()).toBeVisible();

    await cleanup(page, projectId);
  });
});
