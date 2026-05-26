import { test, expect } from '@playwright/test';

test.describe('Settings — Jira & API Docs tabs (SONG-87 to SONG-90)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
  });

  test('Settings page has four tabs: Info, Backup, Jira, API Docs', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Info' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Backup' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jira' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'API Docs' })).toBeVisible();
  });

  test('Info tab shows version and DB path', async ({ page }) => {
    await expect(page.getByText('Version')).toBeVisible();
    await expect(page.getByText('DB Path')).toBeVisible();
  });

  test('Backup tab shows Export and Import buttons', async ({ page }) => {
    await page.getByRole('button', { name: 'Backup' }).click();
    await expect(page.getByRole('button', { name: /Export Backup/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Import Backup/i })).toBeVisible();
  });

  test('Jira tab shows connect form when no config saved', async ({ page }) => {
    // Remove any existing config first
    await page.request.delete('http://localhost:3000/api/v1/jira/config').catch(() => {});
    await page.reload();

    await page.getByRole('button', { name: 'Jira' }).click();
    await expect(page.getByText('Connect to Jira')).toBeVisible();
    await expect(page.getByPlaceholder('https://your-org.atlassian.net')).toBeVisible();
    await expect(page.getByPlaceholder('Atlassian API token')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save & Connect/i })).toBeVisible();
  });

  test('Jira tab Save & Connect button is disabled when fields are empty', async ({ page }) => {
    await page.request.delete('http://localhost:3000/api/v1/jira/config').catch(() => {});
    await page.reload();

    await page.getByRole('button', { name: 'Jira' }).click();
    const saveBtn = page.getByRole('button', { name: /Save & Connect/i });
    await expect(saveBtn).toBeDisabled();
  });

  test('API Docs tab shows endpoint sections', async ({ page }) => {
    await page.getByRole('button', { name: 'API Docs' }).click();
    await expect(page.getByText('Projects').first()).toBeVisible();
    await expect(page.getByText('Test Cases').first()).toBeVisible();
    await expect(page.getByText('Jira Integration').first()).toBeVisible();
    await expect(page.getByText('/api/v1/jira/config').first()).toBeVisible();
  });
});
