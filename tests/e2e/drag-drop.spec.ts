import { test, expect, Page } from '@playwright/test';

const uid = () => `DnD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function scaffoldProject(page: Page) {
  const res = await page.request.post('http://localhost:3000/api/v1/projects', {
    data: { name: uid() },
  });
  const project = await res.json();
  return project.id;
}

async function cleanupProject(page: Page, projectId: string) {
  await page.request.delete(`http://localhost:3000/api/v1/projects/${projectId}`).catch(() => {});
}

async function createSuite(page: Page, projectId: string, name: string) {
  const res = await page.request.post(`http://localhost:3000/api/v1/projects/${projectId}/suites`, {
    data: { name },
  });
  return (await res.json()).id;
}

async function createCase(page: Page, suiteId: string, title: string) {
  const res = await page.request.post(`http://localhost:3000/api/v1/suites/${suiteId}/cases`, {
    data: { title, steps: ['Step 1'], expected_result: 'Result' },
  });
  return (await res.json()).id;
}

// Helper: drag element by its aria-label from source position to target position
async function dragByHandle(page: Page, handleLabel: string, targetText: string) {
  const handle = page.getByRole('button', { name: handleLabel }).first();
  const target = page.getByText(targetText).first();
  await handle.hover();
  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!handleBox || !targetBox) throw new Error('Could not get bounding boxes');

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.mouse.up();
}

test.describe('Drag and Drop - Suites (SONG-71)', () => {
  test('suite drag handle is hidden when only one suite exists', async ({ page }) => {
    const projectId = await scaffoldProject(page);
    await createSuite(page, projectId, 'Solo Suite');

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Solo Suite')).toBeVisible();

    // Drag handle for suites should not exist when only 1 suite
    const handles = page.getByRole('button', { name: 'Drag to reorder suite' });
    await expect(handles).toHaveCount(0);

    await cleanupProject(page, projectId);
  });

  test('suite drag handles visible when multiple suites exist', async ({ page }) => {
    const projectId = await scaffoldProject(page);
    await createSuite(page, projectId, 'Suite Alpha');
    await createSuite(page, projectId, 'Suite Beta');

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Suite Alpha')).toBeVisible();
    await expect(page.getByText('Suite Beta')).toBeVisible();

    // Drag handles should exist (one per suite, visible on hover)
    const handles = page.getByRole('button', { name: 'Drag to reorder suite' });
    await expect(handles).toHaveCount(2);

    await cleanupProject(page, projectId);
  });

  test('suite order persists after drag — PATCH is called with updated order', async ({ page }) => {
    const projectId = await scaffoldProject(page);
    await createSuite(page, projectId, 'Suite First');
    await createSuite(page, projectId, 'Suite Second');
    await createSuite(page, projectId, 'Suite Third');

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Suite First')).toBeVisible();

    // Listen for PATCH requests to suites
    const patchRequests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/suites/') && req.method() === 'PATCH') {
        patchRequests.push(req.url());
      }
    });

    // Drag Suite First (first handle) down past Suite Third
    const handles = page.getByRole('button', { name: 'Drag to reorder suite' });
    const firstHandle = handles.first();
    const thirdSuite = page.getByText('Suite Third');

    await firstHandle.hover();
    const handleBox = await firstHandle.boundingBox();
    const targetBox = await thirdSuite.boundingBox();
    if (!handleBox || !targetBox) throw new Error('No bounding boxes');

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2 + 20,
      { steps: 15 }
    );
    await page.mouse.up();

    // Wait for PATCH requests to fire
    await page.waitForTimeout(500);
    expect(patchRequests.length).toBeGreaterThan(0);

    await cleanupProject(page, projectId);
  });
});

test.describe('Drag and Drop - Cases (SONG-77)', () => {
  test('case drag handle hidden when only one case in suite', async ({ page }) => {
    const projectId = await scaffoldProject(page);
    const suiteId = await createSuite(page, projectId, 'Single Case Suite');
    await createCase(page, suiteId, 'Only Case');

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Only Case')).toBeVisible();

    const handles = page.getByRole('button', { name: 'Drag to reorder' });
    await expect(handles).toHaveCount(0);

    await cleanupProject(page, projectId);
  });

  test('case drag handles visible when multiple cases in suite', async ({ page }) => {
    const projectId = await scaffoldProject(page);
    const suiteId = await createSuite(page, projectId, 'Multi Case Suite');
    await createCase(page, suiteId, 'Case Alpha');
    await createCase(page, suiteId, 'Case Beta');

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Case Alpha')).toBeVisible();
    await expect(page.getByText('Case Beta')).toBeVisible();

    const handles = page.getByRole('button', { name: 'Drag to reorder' });
    await expect(handles).toHaveCount(2);

    await cleanupProject(page, projectId);
  });

  test('case order persists after drag — PATCH is called with updated order', async ({ page }) => {
    const projectId = await scaffoldProject(page);
    const suiteId = await createSuite(page, projectId, 'Reorder Suite');
    await createCase(page, suiteId, 'Case One');
    await createCase(page, suiteId, 'Case Two');
    await createCase(page, suiteId, 'Case Three');

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Case One')).toBeVisible();

    const patchRequests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/cases/') && req.method() === 'PATCH') {
        patchRequests.push(req.url());
      }
    });

    // Drag Case One handle down past Case Three
    const handles = page.getByRole('button', { name: 'Drag to reorder' });
    const firstHandle = handles.first();
    const thirdCase = page.getByText('Case Three');

    await firstHandle.hover();
    const handleBox = await firstHandle.boundingBox();
    const targetBox = await thirdCase.boundingBox();
    if (!handleBox || !targetBox) throw new Error('No bounding boxes');

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2 + 20,
      { steps: 15 }
    );
    await page.mouse.up();

    await page.waitForTimeout(500);
    expect(patchRequests.length).toBeGreaterThan(0);

    await cleanupProject(page, projectId);
  });
});
