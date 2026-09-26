import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  fullyParallel: true,
  // Web-first assertions default to a 5s timeout, which the wallet modal and
  // first page hydration can both exceed on a loaded machine. The per-test
  // budget above is 120s, so a longer assertion bound keeps every check
  // meaningful while stopping machine load from reading as a regression.
  expect: { timeout: 15000 },
  // Run the suite through ./scripts/e2e.sh. It clears the ports first, because
  // Playwright aborts at webServer launch if one is still held, and that happens
  // before any globalSetup would run. `reuseExistingServer` is false below so a
  // leftover dev server can never be adopted and serve a stale bundle.
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
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: 'npx next dev --port 3010 --hostname 127.0.0.1',
      cwd: '.',
      // both the browser client and the /api rewrite must hit the same fresh server,
      // otherwise the suite silently exercises whatever host the default proxy names
      // Its own distDir: this dev server must never write into the .next that
      // the deployed `next start` reads from.
      env: {
        NEXT_PUBLIC_MICROCOSM_API: 'http://127.0.0.1:8788',
        MICROCOSM_API_PROXY: 'http://127.0.0.1:8788',
        NEXT_DIST_DIR: '.next-e2e',
      },
      url: 'http://127.0.0.1:3010/app/onboarding',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
