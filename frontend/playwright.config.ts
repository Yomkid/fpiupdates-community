import { defineConfig } from '@playwright/test';
if (!process.env.E2E_DATABASE_URL) throw new Error('Set E2E_DATABASE_URL to an isolated, migrated test database. Never use production.');
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 60000,
  use: { baseURL: process.env.E2E_BASE_URL??'http://localhost:5173', viewport: { width: 1440, height: 1000 }, launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-webgl', '--in-process-gpu', '--no-zygote', '--single-process'] } : {} },
  webServer: { command: 'node ../scripts/start.mjs', url: 'http://localhost:5173', timeout: 60000, reuseExistingServer: process.env.E2E_REUSE_SERVER === '1', env: { DATABASE_URL: process.env.E2E_DATABASE_URL, FRONTEND_ORIGINS: 'http://localhost:5173' } },
  reporter: 'list',
});
