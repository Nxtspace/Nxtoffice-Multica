import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 验证位（U1 骨架）。
 *
 * ADR-01/ADR-02 约定：2D / 3D 双视图在同一真实数据快照上跑同一验收脚本。
 * 本配置先提供可跑通的占位用例（e2e/app.smoke.spec.ts）；契约冻结后，
 * 断线 / 过期 / 越权与双视图一致性脚本在同目录扩展，不改本配置结构。
 */
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
