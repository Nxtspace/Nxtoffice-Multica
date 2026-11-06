import { test, expect } from '@playwright/test';

/**
 * 冒烟占位（U1 骨架）：验证构建产物可启动、外壳可渲染。
 * 契约冻结后，双视图一致性 / 断线 / 过期 / 越权脚本在此目录同模式扩展，
 * 用例矩阵由 NXTLAB-14 测试工程师 T01–T16 定义，不在 U1 提前实现。
 */
test('应用外壳渲染并保留双视图落位', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Nxtoffice' })).toBeVisible();
  await expect(page.getByLabel('2D 等距视图')).toBeVisible();
  await expect(page.getByLabel('3D 沉浸视图')).toBeVisible();
});
