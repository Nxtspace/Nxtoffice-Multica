/**
 * 视图外壳六态呈现单测（jsdom）。
 *
 * 重点（US-5 可证伪点在视图层的落点）：
 * - 外壳只呈现 deriveVisualState 的推导结果，不做任何状态推断；
 * - no-permission 终态不渲染场景/计数/详情对象（零存在性泄露）；
 * - 空列表是 empty，不是 no-permission（视图层反证）。
 * 3D 视图依赖 WebGL，不在此环境验证（双视图六态由 e2e/state-matrix.spec.ts 覆盖）。
 * 测试库仅用 react-dom/client + 原生事件（不引入 testing-library 依赖）。
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

/** 推进假时钟并让 React 完成渲染 */
const settle = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** 切换 mock 场景（按 option 文本找到对应 value，再派发原生 change） */
const chooseScenario = async (label: string): Promise<void> => {
  const select = container.querySelector('#scenario-select') as HTMLSelectElement;
  const option = Array.from(select.options).find((o) => o.textContent === label);
  expect(option).toBeTruthy();
  await act(async () => {
    select.value = option!.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const sixStateText = (): string | null => {
  const badge = Array.from(container.querySelectorAll('.badge')).find((b) =>
    b.textContent?.startsWith('六态：'),
  );
  return badge?.textContent ?? null;
};

const has = (testid: string): boolean => container.querySelector(`[data-testid="${testid}"]`) != null;

describe('App 六态呈现（2D）', () => {
  it('normal：快照下发后渲染 2D 场景与计数，六态为 normal', async () => {
    await act(async () => {
      root.render(<App />);
    });
    await settle(400);
    expect(sixStateText()).toBe('六态：normal');
    expect(has('scene-2d')).toBe(true);
    expect(container.textContent).toMatch(/工作 \d/);
    expect(has('overlay-loading')).toBe(false);
  });

  it('empty：空列表呈现空态遮罩，不是 no-permission', async () => {
    await act(async () => {
      root.render(<App />);
    });
    await chooseScenario('空');
    await settle(300);
    expect(sixStateText()).toBe('六态：empty');
    expect(has('overlay-empty')).toBe(true);
    // 反证：空态不是终态——没有越权遮罩
    expect(has('overlay-no-permission')).toBe(false);
  });

  it('access-denied：终态 no-permission，不渲染场景/计数/详情对象（零泄露）', async () => {
    await act(async () => {
      root.render(<App />);
    });
    await chooseScenario('越权（403）');
    await settle(400);
    expect(sixStateText()).toBe('六态：no-permission');
    expect(has('overlay-no-permission')).toBe(true);
    expect(has('scene-2d')).toBe(false);
    expect(container.textContent).not.toMatch(/工作 \d/);
    const detail = container.querySelector('[data-testid="detail-panel"]');
    expect(detail).not.toBeNull();
    expect(detail!.textContent).toContain('未请求任何对象详情');
    expect(detail!.textContent).not.toMatch(/对象 ID/);
  });

  it('session-expired：先正常后终态，冻结最后快照；重新鉴权后复位', async () => {
    await act(async () => {
      root.render(<App />);
    });
    await chooseScenario('会话过期（401）');
    await settle(400);
    expect(sixStateText()).toBe('六态：normal');
    await settle(4_500);
    expect(sixStateText()).toBe('六态：expired');
    expect(has('overlay-session-expired')).toBe(true);
    expect(has('freeze-banner')).toBe(true);
    // 终态保留最后快照（场景仍在，动效冻结）
    expect(has('scene-2d')).toBe(true);

    const reauth = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '重新鉴权');
    expect(reauth).toBeTruthy();
    await act(async () => {
      reauth!.click();
    });
    await settle(600);
    expect(sixStateText()).toBe('六态：normal');
    expect(has('overlay-session-expired')).toBe(false);
  });

  it('rate-limited：loading 带退避提示；退避结束后自动重取恢复（不沉淀终态）', async () => {
    await act(async () => {
      root.render(<App />);
    });
    await chooseScenario('限流（429）');
    await settle(500);
    expect(sixStateText()).toBe('六态：loading');
    expect(has('backoff-note')).toBe(true);
    // 瞬态不是终态：既不是错误遮罩，也不是 expired
    expect(has('overlay-error')).toBe(false);
    expect(has('overlay-session-expired')).toBe(false);
    await settle(3_500);
    expect(sixStateText()).toBe('六态：normal');
    expect(has('backoff-note')).toBe(false);
  });

  it('expired（数据过期）：视觉层 expired，冻结动效并展示最后更新时间', async () => {
    await act(async () => {
      root.render(<App />);
    });
    await chooseScenario('数据过期');
    await settle(300);
    expect(sixStateText()).toBe('六态：expired');
    const banner = container.querySelector('[data-testid="freeze-banner"]');
    expect(banner?.textContent).toContain('最后更新');
    expect(has('scene-2d')).toBe(true);
    // 数据过期不会沉淀为会话终态
    expect(has('overlay-session-expired')).toBe(false);
  });

  it('断线：保留最后快照并冻结；自动重连补齐后离开断线态', async () => {
    await act(async () => {
      root.render(<App />);
    });
    await chooseScenario('断线（模拟）');
    await settle(300);
    await settle(4_500);
    expect(sixStateText()).toBe('六态：disconnected');
    expect(has('freeze-banner')).toBe(true);
    expect(has('scene-2d')).toBe(true);
    await settle(4_000);
    expect(sixStateText()).toBe('六态：normal');
    expect(has('freeze-banner')).toBe(false);
  });
});
