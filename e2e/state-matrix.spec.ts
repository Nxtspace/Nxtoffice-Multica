import { test, expect, type Page } from '@playwright/test';

/**
 * US-5 六态视觉矩阵 e2e（ADR-0004 五类场景 × 2D/3D 双视图）。
 *
 * 对应验收可证伪点：
 * - 五类场景（会话过期 / 越权 / 限流 / 断线 / 数据过期）在 2D 与 3D 都能呈现；
 * - 终态（expired / no-permission）冻结动效并展示最后更新时间，不伪造实时；
 * - 瞬态（429 / 断线）在退避/重连后离开，不沉淀为终态；
 * - 越权路径不泄露任何可见对象信息（场景/计数/详情均不渲染）。
 * mock 场景驱动，真实时钟；本脚本同样适用于未来正式通道（同一接口）。
 */

const SESSION_EXPIRED = '会话过期（401）';
const ACCESS_DENIED = '越权（403）';
const RATE_LIMITED = '限流（429）';
const DISCONNECTED = '断线（模拟）';
const DATA_EXPIRED = '数据过期';

async function selectScenario(page: Page, label: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('场景').selectOption(label);
}

/** 切到 3D 并等待懒加载 Canvas 挂载 */
async function switchTo3D(page: Page): Promise<void> {
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByTestId('scene-3d')).toBeVisible();
}

/** 六态徽标文本（唯一推导结果的呈现锚点） */
const sixState = (page: Page) => page.locator('.badge', { hasText: '六态：' });

test.describe('US-5 状态矩阵 × 双视图', () => {
  test('会话过期（401+session_expired）：终态 expired，冻结动效并保留最后快照；重新鉴权后离开', async ({ page }) => {
    await selectScenario(page, SESSION_EXPIRED);

    // 先收到正常快照
    await expect(page.getByTestId('scene-2d')).toBeVisible();
    await expect(sixState(page)).toHaveText('六态：normal');

    // ~4.3s 后终态到来：六态合并为 expired，冻结条出现，场景仍保留（最后已知快照）
    await expect(sixState(page)).toHaveText('六态：expired', { timeout: 10_000 });
    await expect(page.getByTestId('freeze-banner')).toBeVisible();
    await expect(page.getByTestId('overlay-session-expired')).toBeVisible();
    await expect(page.getByTestId('scene-2d')).toBeVisible();

    // 重新鉴权：终态只能显式复位
    await page.getByRole('button', { name: '重新鉴权' }).click();
    await expect(sixState(page)).toHaveText('六态：normal', { timeout: 5_000 });
    await expect(page.getByTestId('overlay-session-expired')).toBeHidden();

    // 3D 同一呈现
    await switchTo3D(page);
    await expect(sixState(page)).toHaveText('六态：normal');
  });

  test('会话过期：3D 视图同样进入终态并冻结', async ({ page }) => {
    await selectScenario(page, SESSION_EXPIRED);
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.getByTestId('scene-3d')).toBeVisible();

    await expect(sixState(page)).toHaveText('六态：expired', { timeout: 10_000 });
    await expect(page.getByTestId('freeze-banner')).toBeVisible();
    await expect(page.getByTestId('overlay-session-expired')).toBeVisible();
    await expect(page.getByTestId('scene-3d')).toBeVisible();
  });

  test('越权（403+access_denied）：终态 no-permission，零存在性泄露', async ({ page }) => {
    await selectScenario(page, ACCESS_DENIED);

    await expect(page.getByTestId('overlay-no-permission')).toBeVisible({ timeout: 5_000 });
    await expect(sixState(page)).toHaveText('六态：no-permission');

    // 不渲染场景、计数与详情对象（列表/边/详情均无可见对象信息）
    await expect(page.getByTestId('scene-2d')).toBeHidden();
    await expect(page.locator('.counts')).toBeHidden();
    await expect(page.getByText(/工作 \d/)).toBeHidden();
    await expect(page.getByTestId('detail-panel')).toContainText('未请求任何对象详情');

    // 3D 同样不渲染场景
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.getByTestId('overlay-no-permission')).toBeVisible();
    await expect(page.getByTestId('scene-3d')).toBeHidden();
  });

  test('限流（429+Retry-After）：loading 带退避；退避结束后自动重取恢复，不沉淀终态', async ({ page }) => {
    test.setTimeout(30_000);
    await selectScenario(page, RATE_LIMITED);

    // 进入 loading 退避子形态（有退避提示，不是错误终态）
    await expect(page.getByTestId('overlay-loading')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('backoff-note')).toBeVisible();
    await expect(page.getByTestId('backoff-badge')).toBeVisible();

    // ~3.8s 后退避结束自动重取：离开 loading，无终态
    await expect(sixState(page)).toHaveText('六态：normal', { timeout: 10_000 });
    await expect(page.getByTestId('scene-2d')).toBeVisible();
    await expect(page.getByTestId('overlay-loading')).toBeHidden();
    await expect(page.getByTestId('backoff-badge')).toBeHidden();

    await switchTo3D(page);
    await expect(sixState(page)).toHaveText('六态：normal');
  });

  test('断线：保留最后快照并冻结；自动重连补齐后离开断线态', async ({ page }) => {
    test.setTimeout(30_000);
    await selectScenario(page, DISCONNECTED);

    await expect(page.getByTestId('scene-2d')).toBeVisible();

    // ~4.2s 断线：冻结条 + 离线，场景保留
    await expect(page.getByTestId('freeze-banner')).toBeVisible({ timeout: 10_000 });
    await expect(sixState(page)).toHaveText('六态：disconnected');
    await expect(page.getByTestId('scene-2d')).toBeVisible();

    // ~8.2s 自动重连补齐：离开断线态，恢复实时
    await expect(page.getByTestId('freeze-banner')).toBeHidden({ timeout: 10_000 });
    await expect(sixState(page)).toHaveText('六态：normal');

    await switchTo3D(page);
    await expect(sixState(page)).toHaveText('六态：normal');
  });

  test('数据过期（新鲜度阈值跨越）：视觉层 expired，冻结动效并显示最后更新时间', async ({ page }) => {
    await selectScenario(page, DATA_EXPIRED);

    await expect(sixState(page)).toHaveText('六态：expired', { timeout: 5_000 });
    await expect(page.getByTestId('freeze-banner')).toBeVisible();
    await expect(page.getByTestId('freeze-banner')).toContainText('最后更新');
    await expect(page.getByTestId('scene-2d')).toBeVisible();
    // 会话仍正常：视觉层把「数据过期」与「会话过期」合并为同一 expired
    await expect(page.locator('.badge', { hasText: '会话正常' })).toBeVisible();

    await switchTo3D(page);
    await expect(sixState(page)).toHaveText('六态：expired');
    await expect(page.getByTestId('scene-3d')).toBeVisible();
  });
});
