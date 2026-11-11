import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PW_PORT ?? 8861);
const URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  // 모든 spec 이 같은 로컬 Supabase 스택을 쓴다 — 직렬 실행
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: URL,
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: false,
  },
});
