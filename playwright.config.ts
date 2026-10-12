import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173/Ship-It/', trace: 'retain-on-failure' },
  webServer: { command: 'pnpm --filter @ship-it/web dev --port 5173', url: 'http://127.0.0.1:5173/Ship-It/', reuseExistingServer: !process.env.CI }
});
