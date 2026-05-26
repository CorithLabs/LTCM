import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'node server.js',
    port: 3000,
    reuseExistingServer: true,
    timeout: 15000,
  },
});
