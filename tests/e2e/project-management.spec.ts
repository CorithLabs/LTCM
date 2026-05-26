import { test, expect, Page } from '@playwright/test';

const uid = () => `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function deleteProjectViaApi(page: Page, projectName: string) {
  const res = await page.request.get('http://localhost:3000/api/v1/projects');
  const projects = await res.json();
  const match = projects.find((p: { name: string; id: string }) => p.name === projectName);
  if (match) {
    await page.request.delete(`http://localhost:3000/api/v1/projects/${match.id}`);
  }
}

test.describe('Project Management', () => {
  test('home screen has a New Project button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'New Project' }).first()).toBeVisible();
  });

  test('can create a project and see it in the list', async ({ page }) => {
    const name = uid();
    await page.goto('/');
    await page.getByRole('button', { name: 'New Project' }).first().click();

    // Form opens with autofocus on name field
    await page.getByPlaceholder('e.g. Mobile App v2').fill(name);
    await page.getByRole('button', { name: 'Create Project' }).click();

    await expect(page.getByText(name)).toBeVisible({ timeout: 5000 });
    await deleteProjectViaApi(page, name);
  });

  test('can create a project with a description', async ({ page }) => {
    const name = uid();
    await page.goto('/');
    await page.getByRole('button', { name: 'New Project' }).first().click();

    await page.getByPlaceholder('e.g. Mobile App v2').fill(name);
    await page.getByPlaceholder('What are you testing?').fill('A test description');
    await page.getByRole('button', { name: 'Create Project' }).click();

    await expect(page.getByText(name)).toBeVisible({ timeout: 5000 });
    await deleteProjectViaApi(page, name);
  });

  test('clicking a project navigates to project detail', async ({ page }) => {
    const name = uid();
    const res = await page.request.post('http://localhost:3000/api/v1/projects', {
      data: { name },
    });
    const { id } = await res.json();

    await page.goto('/');
    await page.getByText(name).click();
    await expect(page.url()).toContain(`/projects/${id}`);
    await page.request.delete(`http://localhost:3000/api/v1/projects/${id}`);
  });

  test('can delete a project with confirmation', async ({ page }) => {
    const name = uid();
    const res = await page.request.post('http://localhost:3000/api/v1/projects', {
      data: { name },
    });
    const { id } = await res.json();

    await page.goto('/');
    await expect(page.getByText(name)).toBeVisible();

    // Hover the card to reveal opacity-0 action buttons
    const card = page.locator('.card').filter({ hasText: name });
    await card.hover();
    await card.getByTitle('Delete').click({ force: true });

    // Confirm delete in modal
    await page.getByRole('button', { name: 'Delete' }).last().click();

    // Use card count to avoid strict mode — name appears in both card and modal <strong>
    await expect(page.locator('.card').filter({ hasText: name })).toHaveCount(0, { timeout: 5000 });
    // Safety cleanup
    await page.request.delete(`http://localhost:3000/api/v1/projects/${id}`).catch(() => {});
  });

  test('can rename a project inline', async ({ page }) => {
    const name = uid();
    const newName = uid();
    const res = await page.request.post('http://localhost:3000/api/v1/projects', {
      data: { name },
    });
    const { id } = await res.json();

    await page.goto('/');
    await expect(page.getByText(name)).toBeVisible();

    const card = page.locator('.card').filter({ hasText: name });
    await card.hover();
    // Use force:true to click opacity-0 button without actionability check
    await card.getByTitle('Rename').click({ force: true });

    // Inline edit input appears — can't use card.locator('input') because after clicking Rename,
    // the card's visible text changes (name goes into input value) so hasText filter stops matching
    const editInput = page.locator('.card input').first();
    await editInput.clear();
    await editInput.fill(newName);
    await editInput.press('Enter');

    await expect(page.getByText(newName)).toBeVisible({ timeout: 5000 });
    await page.request.delete(`http://localhost:3000/api/v1/projects/${id}`);
  });

  test('form stays open if name is empty on submit', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Project' }).first().click();
    // Button is disabled when name is empty — form should stay open
    await expect(page.getByRole('button', { name: 'Create Project' })).toBeDisabled();
    await expect(page.getByPlaceholder('e.g. Mobile App v2')).toBeVisible();
  });
});
