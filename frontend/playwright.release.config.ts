import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './release-tests',
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:5179',
    viewport: { width: 1280, height: 900 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-webgl',
            '--disable-software-rasterizer',
            '--in-process-gpu',
            '--no-zygote',
            '--single-process',
          ],
        }
      : {},
  },
  webServer: {
    command: 'npm run preview -- --port 5179',
    url: 'http://127.0.0.1:5179',
    reuseExistingServer: false,
  },
});
