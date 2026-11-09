import { test, expect } from '@playwright/test';

/**
 * 冒烟（U1 骨架 + U3 合入后对齐真实外壳）：验证构建产物可启动、外壳可渲染、
 * 双视图落位（2D 场景挂载、3D 视图懒加载挂载）。
 * 契约冻结后，双视图一致性 / 断线 / 过期 / 越权脚本在此目录同模式扩展，
 * 用例矩阵由 NXTLAB-14 测试工程师 T01–T16 定义，不在 U1 提前实现。
 */
test('应用外壳渲染并保留双视图落位', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Multica 虚拟办公室（占位）')).toBeVisible();
  await expect(page.getByLabel('场景')).toBeVisible();

  // 默认 normal 场景：300ms 后下发快照，2D 场景挂载
  await expect(page.getByTestId('scene-2d')).toBeVisible();

  // 切到 3D：OfficeScene 懒加载并挂载 Canvas（three-stack 独立分包）
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByTestId('scene-3d')).toBeVisible();

  // 切回 2D 仍可渲染
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await expect(page.getByTestId('scene-2d')).toBeVisible();
});
