import { test, expect, Page } from '@playwright/test';

const uid = () => `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function scaffoldProject(page: Page) {
  const name = uid();
  const pRes = await page.request.post('http://localhost:3000/api/v1/projects', {
    data: { name },
  });
  const project = await pRes.json();
  return { projectId: project.id, projectName: name };
}

async function cleanupProject(page: Page, projectId: string) {
  await page.request.delete(`http://localhost:3000/api/v1/projects/${projectId}`).catch(() => {});
}

test.describe('Test Case Authoring', () => {
  test('can create a suite within a project', async ({ page }) => {
    const { projectId } = await scaffoldProject(page);

    await page.goto(`/projects/${projectId}`);
    // Use exact:true — "Suite" would otherwise also match "Create Suite" button
    await page.getByRole('button', { name: 'Suite', exact: true }).click();

    await page.getByPlaceholder('e.g. Login Flow, Checkout').fill('Login Flow');
    // Use first() — when no suites exist, EmptyState also shows a "Create Suite" button
    await page.getByRole('button', { name: 'Create Suite' }).first().click();

    await expect(page.getByText('Login Flow')).toBeVisible({ timeout: 5000 });
    await cleanupProject(page, projectId);
  });

  test('suite shows test case count', async ({ page }) => {
    const { projectId } = await scaffoldProject(page);
    const sRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/suites`,
      { data: { name: 'Count Suite' } },
    );
    const suite = await sRes.json();
    await page.request.post(`http://localhost:3000/api/v1/suites/${suite.id}/cases`, {
      data: { title: 'Case A', steps: ['s'], expected_result: 'r' },
    });
    await page.request.post(`http://localhost:3000/api/v1/suites/${suite.id}/cases`, {
      data: { title: 'Case B', steps: ['s'], expected_result: 'r' },
    });

    await page.goto(`/projects/${projectId}`);
    // Use exact:true — subtitle shows "1 suite · 2 cases" which also contains "2 cases"
    await expect(page.getByText('2 cases', { exact: true })).toBeVisible();
    await cleanupProject(page, projectId);
  });

  test('can create a test case with title, steps, and expected result', async ({ page }) => {
    const { projectId } = await scaffoldProject(page);
    const sRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/suites`,
      { data: { name: 'Auth Suite' } },
    );
    const suite = await sRes.json();

    await page.goto(`/projects/${projectId}`);
    // "Add" button opens the case editor (navigates)
    await page.getByRole('button', { name: 'Add' }).first().click();
    await page.waitForURL(/\/cases\/new/);

    await page.getByPlaceholder('As a user I can...').fill('Login with valid credentials');
    await page.getByPlaceholder('Step 1').fill('Open the login page');

    await page.getByRole('button', { name: 'Add Step' }).click();
    await page.getByPlaceholder('Step 2').fill('Enter valid credentials');

    await page.getByPlaceholder('What should happen after completing all steps?').fill('User is logged in');

    await page.getByRole('button', { name: 'Create Test Case' }).click();

    // Navigates back to project page, case is visible
    await expect(page.getByText('Login with valid credentials')).toBeVisible({ timeout: 5000 });
    await cleanupProject(page, projectId);
  });

  test('can set priority on a test case', async ({ page }) => {
    const { projectId } = await scaffoldProject(page);
    await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/suites`,
      { data: { name: 'Suite' } },
    );

    await page.goto(`/projects/${projectId}`);
    await page.getByRole('button', { name: 'Add' }).first().click();
    await page.waitForURL(/\/cases\/new/);

    await page.getByPlaceholder('As a user I can...').fill('Priority Test Case');
    await page.getByPlaceholder('Step 1').fill('Do something');
    await page.getByPlaceholder('What should happen after completing all steps?').fill('Something happens');

    // Click the "high" priority button
    await page.getByRole('button', { name: 'high' }).click();

    await page.getByRole('button', { name: 'Create Test Case' }).click();
    await expect(page.getByText('Priority Test Case')).toBeVisible({ timeout: 5000 });
    await cleanupProject(page, projectId);
  });

  test('cannot save case with empty title — validation shown', async ({ page }) => {
    const { projectId } = await scaffoldProject(page);
    await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/suites`,
      { data: { name: 'Suite' } },
    );

    await page.goto(`/projects/${projectId}`);
    await page.getByRole('button', { name: 'Add' }).first().click();
    await page.waitForURL(/\/cases\/new/);

    // Don't fill title, fill everything else
    await page.getByPlaceholder('Step 1').fill('A step');
    await page.getByPlaceholder('What should happen after completing all steps?').fill('A result');
    await page.getByRole('button', { name: 'Create Test Case' }).click();

    // Form should show validation error and stay on the page
    await expect(page.getByText('Title is required')).toBeVisible();
    await cleanupProject(page, projectId);
  });

  test('can edit an existing test case', async ({ page }) => {
    const { projectId } = await scaffoldProject(page);
    const sRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/suites`,
      { data: { name: 'Edit Suite' } },
    );
    const suite = await sRes.json();
    const cRes = await page.request.post(`http://localhost:3000/api/v1/suites/${suite.id}/cases`, {
      data: { title: 'Original Title', steps: ['Do this'], expected_result: 'See that' },
    });
    const tc = await cRes.json();

    // Visit project page first so navigate(-1) has history to go back to
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Original Title')).toBeVisible({ timeout: 5000 });

    // Navigate to edit URL
    await page.goto(`/projects/${projectId}/cases/${tc.id}/edit`);
    await expect(page.getByPlaceholder('As a user I can...')).toHaveValue('Original Title');

    await page.getByPlaceholder('As a user I can...').clear();
    await page.getByPlaceholder('As a user I can...').fill('Updated Title');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Wait for mutation to complete, then navigate to project page to verify
    // (navigate(-1) in React Router is unreliable with page.goto() history)
    await page.waitForTimeout(500);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Updated Title')).toBeVisible({ timeout: 5000 });
    await cleanupProject(page, projectId);
  });

  test('can delete a test case', async ({ page }) => {
    const { projectId } = await scaffoldProject(page);
    const sRes = await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/suites`,
      { data: { name: 'Delete Suite' } },
    );
    const suite = await sRes.json();
    await page.request.post(`http://localhost:3000/api/v1/suites/${suite.id}/cases`, {
      data: { title: 'DeleteMe Case', steps: ['step'], expected_result: 'result' },
    });

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('DeleteMe Case')).toBeVisible();

    // Hover the case row to reveal opacity-0 action buttons, then delete
    const caseRow = page.locator('text=DeleteMe Case').locator('../..');
    await caseRow.hover();
    // Delete is the last button in the row actions
    await caseRow.locator('button').last().click({ force: true });

    // Confirm delete in modal
    await page.getByRole('button', { name: 'Delete' }).last().click();

    await expect(page.getByText('DeleteMe Case')).not.toBeVisible({ timeout: 5000 });
    await cleanupProject(page, projectId);
  });

  test('can delete a suite', async ({ page }) => {
    const { projectId } = await scaffoldProject(page);
    await page.request.post(
      `http://localhost:3000/api/v1/projects/${projectId}/suites`,
      { data: { name: 'Deleteable Suite' } },
    );

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Deleteable Suite')).toBeVisible();

    // Suite header delete button is always visible (no opacity-0)
    const suiteHeader = page.locator('.card').filter({ hasText: 'Deleteable Suite' });
    await suiteHeader.getByTitle('Delete').click();

    // Confirm in modal
    await page.getByRole('button', { name: 'Delete' }).last().click();

    await expect(page.getByText('Deleteable Suite')).not.toBeVisible({ timeout: 5000 });
    await cleanupProject(page, projectId);
  });
});
