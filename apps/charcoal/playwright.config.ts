import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3010',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev --workspace=@microcosm/server -- --port 8788',
      cwd: '../..',
      env: { CORS_ORIGIN: 'http://127.0.0.1:3010' },
      url: 'http://127.0.0.1:8788/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'npx next dev --port 3010 --hostname 127.0.0.1',
      cwd: '.',
      env: { NEXT_PUBLIC_MICROCOSM_API: 'http://127.0.0.1:8788' },
      url: 'http://127.0.0.1:3010/app/onboarding',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
