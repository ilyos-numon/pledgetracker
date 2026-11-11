import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PROD_URL;
if (!baseURL) throw new Error('PROD_URL 환경변수가 필요합니다 (운영 주소)');

export default defineConfig({
  testDir: 'tests/e2e/prod',
  testMatch: '*.prod.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
