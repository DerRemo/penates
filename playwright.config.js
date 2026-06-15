import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:3334',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: 'tests/.auth-state.json',
  },

  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',

  webServer: {
    // PENATES_HOME points the test server at an isolated state dir so E2E
    // never touches the real ~/.penates (board.json, sessions.json, settings.json).
    command: 'PORT=3334 PENATES_HOME=/tmp/penates-e2e-home node server.js',
    url: 'http://localhost:3334/healthz',
    reuseExistingServer: false,
    timeout: 60_000,
  },

  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'laptop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['iPad (gen 7)'],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 15'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'mobile-small',
      use: {
        ...devices['iPhone SE'],
        viewport: { width: 320, height: 568 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
