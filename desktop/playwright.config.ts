import { defineConfig } from '@playwright/test';

export default defineConfig({
  globalSetup: './tests/global-setup.ts',
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'cd ../hub-v2 && ORCHESTRA_DATABASE_URL=sqlite:///./orchestra-test.db venv/bin/uvicorn app.main:app --port 8010',
      url: 'http://localhost:8010/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:1420',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_HUB_URL: 'http://localhost:8010',
      },
    },
  ],
});
