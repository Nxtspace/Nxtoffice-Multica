/**
 * US-5 六态视觉矩阵单测（唯一推导处 deriveVisualState）+ store 对
 * ADR-0004 结构化信号的落地（终态不随快照自愈、429 退避后自动重取）。
 *
 * 可证伪重点：
 * - 空列表不推断 no-permission，非结构化错误不推断终态；
 * - 瞬态（429、断线）在退避/重连后必须能离开，不沉淀为终态；
 * - expired 优先级：终态会话过期与数据过期在视觉层合并。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelEvent, SnapshotChannel } from './channel';
import type { SnapshotUpdate } from './updates';
import { CONTRACT_VERSION, type WorkspaceSnapshot } from './envelope';
import { DEMO_THRESHOLDS } from '../mock/scenarios';
import { buildNormalFixtures, MOCK_PROJECT_ID, MOCK_WORKSPACE_ID } from '../mock/fixtures';
import { SnapshotStore, type PresentationState } from './store';
import { deriveVisualState, type VisualStateInput } from './visual-state';

const T0 = Date.parse('2026-11-06T08:00:00Z');

const input = (over: Partial<VisualStateInput>): VisualStateInput => ({
  sessionState: 'active',
  connection: 'connected',
  dataLabel: 'live',
  hasSnapshot: true,
  visibleAgentCount: 8,
  loadError: null,
  retryAfterMs: null,
  ...over,
});

describe('deriveVisualState（六态矩阵）', () => {
  it('基线：有快照、有可见对象、已连接、会话正常 → normal', () => {
    expect(deriveVisualState(input({}))).toBe('normal');
  });

  it('无快照 → loading（含错误可重试与限流退避两个瞬态子形态）', () => {
    expect(deriveVisualState(input({ hasSnapshot: false }))).toBe('loading');
    expect(deriveVisualState(input({ hasSnapshot: false, loadError: '请求失败（非结构化）' }))).toBe('loading');
    expect(deriveVisualState(input({ hasSnapshot: false, retryAfterMs: 3_000 }))).toBe('loading');
  });

  it('有快照但无可见对象 → empty（不是 no-permission）', () => {
    expect(deriveVisualState(input({ visibleAgentCount: 0 }))).toBe('empty');
    // 空列表不推断终态——即使同时存在非结构化错误
    expect(deriveVisualState(input({ visibleAgentCount: 0, loadError: '随便什么文本' }))).toBe('empty');
  });

  it('断线/重连中 → disconnected（瞬态，先于 loading 判定）', () => {
    expect(deriveVisualState(input({ connection: 'disconnected' }))).toBe('disconnected');
    expect(deriveVisualState(input({ connection: 'reconnecting', hasSnapshot: false }))).toBe('disconnected');
  });

  it('数据过期（freshness 阈值跨越）→ expired（与断线比较优先）', () => {
    expect(deriveVisualState(input({ dataLabel: 'expired' }))).toBe('expired');
    expect(deriveVisualState(input({ dataLabel: 'expired', connection: 'disconnected' }))).toBe('expired');
  });

  it('会话过期（结构化 401）→ expired：与数据过期在视觉层合并为同一态', () => {
    expect(deriveVisualState(input({ sessionState: 'session-expired' }))).toBe('expired');
    // 数据未过期也会话过期 → expired
    expect(deriveVisualState(input({ sessionState: 'session-expired', dataLabel: 'live' }))).toBe('expired');
  });

  it('会话越权（结构化 403）→ no-permission：优先一切，且不从空列表推断', () => {
    expect(deriveVisualState(input({ sessionState: 'no-permission' }))).toBe('no-permission');
    // 反证：无快照、无可见对象、有错误文本时，只要没有结构化终态就不是 no-permission
    expect(
      deriveVisualState(
        input({ sessionState: 'active', hasSnapshot: false, visibleAgentCount: 0, loadError: '403 Forbidden（非结构化文本）' }),
      ),
    ).toBe('loading');
  });

  it('终态优先于瞬态：会话过期叠加断线/限流仍为 expired', () => {
    expect(
      deriveVisualState(input({ sessionState: 'session-expired', connection: 'reconnecting', retryAfterMs: 3_000 })),
    ).toBe('expired');
  });
});

// ---- store 对结构化信号的落地 ----

/** 最小通道桩：发事件、记录主动请求 */
class StubChannel implements SnapshotChannel {
  readonly kind = 'mock' as const;
  public readonly calls: string[] = [];
  private readonly listeners = new Set<(event: ChannelEvent) => void>();

  emit(event: ChannelEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  emitUpdate(update: SnapshotUpdate): void {
    this.emit({ type: 'update', update });
  }

  connect(): void { this.calls.push('connect'); }
  disconnect(): void { this.calls.push('disconnect'); }
  requestRecovery(): void { this.calls.push('requestRecovery'); }
  requestFullRefetch(): void { this.calls.push('requestFullRefetch'); }
  fetchDetail(): Promise<never> { return Promise.reject(new Error('桩不实现')); }
  subscribe(listener: (event: ChannelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  dispose(): void { this.calls.push('dispose'); }
}

const snapshotWith = (sourceUpdatedAt: string, version = 1): WorkspaceSnapshot => ({
  contractVersion: CONTRACT_VERSION,
  scope: {
    workspaceId: MOCK_WORKSPACE_ID,
    project: {
      id: MOCK_PROJECT_ID,
      name: '示例项目（mock）',
      source: { system: 'multica', objectType: 'project' },
      visibility: { level: 'full' },
    },
  },
  snapshotVersion: version,
  capturedAt: new Date(T0).toISOString(),
  sourceUpdatedAt,
  freshness: 'fresh',
  dataSource: { kind: 'mock', generator: 'test', note: '单测构造' },
  viewer: { scope: 'full' },
  ...buildNormalFixtures(T0),
});

describe('SnapshotStore × ADR-0004 结构化信号', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('401+session_expired：终态确立并冻结动效；后续快照不能自愈，resetSessionState 才能复位', () => {
    const channel = new StubChannel();
    const store = new SnapshotStore({ thresholds: DEMO_THRESHOLDS, now: () => T0 });
    store.attach(channel);
    channel.emit({ type: 'connection', state: 'connected' });
    channel.emitUpdate({ kind: 'full', snapshot: snapshotWith(new Date(T0).toISOString()) });
    expect(store.getState().presentation.animationsFrozen).toBe(false);

    channel.emit({
      type: 'error',
      message: '会话已过期',
      structured: { status: 401, code: 'session_expired' },
    });
    const terminal = store.getState().presentation;
    expect(terminal.sessionState).toBe('session-expired');
    expect(terminal.animationsFrozen).toBe(true);
    expect(terminal.retryAfterMs).toBeNull();

    // 后续快照不清除终态（只能显式复位）
    channel.emitUpdate({ kind: 'full', snapshot: snapshotWith(new Date(T0).toISOString(), 2) });
    expect(store.getState().presentation.sessionState).toBe('session-expired');

    store.resetSessionState();
    expect(store.getState().presentation.sessionState).toBe('active');
    store.dispose();
  });

  it('403+access_denied：终态 no-permission，loadError 不设（终态不是可重试错误）', () => {
    const channel = new StubChannel();
    const store = new SnapshotStore({ thresholds: DEMO_THRESHOLDS, now: () => T0 });
    store.attach(channel);
    channel.emit({ type: 'connection', state: 'connected' });
    channel.emit({
      type: 'error',
      message: '无权访问',
      structured: { status: 403, code: 'access_denied' },
    });
    expect(store.getState().presentation.sessionState).toBe('no-permission');
    expect(store.getState().presentation.loadError).toBeNull();
    store.dispose();
  });

  it('429：进入退避（retryAfterMs 可见），退避结束后自动 requestFullRefetch 并清除标记', () => {
    const channel = new StubChannel();
    const store = new SnapshotStore({ thresholds: DEMO_THRESHOLDS, now: () => T0 });
    store.attach(channel);
    channel.emit({ type: 'connection', state: 'connected' });
    channel.emit({
      type: 'error',
      message: '限流',
      structured: { status: 429, code: 'rate_limited', retryAfterMs: 1_500 },
    });
    const limited = store.getState().presentation;
    expect(limited.sessionState).toBe('active'); // 瞬态，非终态
    expect(limited.retryAfterMs).toBe(1_500);

    vi.advanceTimersByTime(1_500);
    expect(channel.calls).toEqual(['requestFullRefetch']);
    expect(store.getState().presentation.retryAfterMs).toBeNull();
    store.dispose();
  });

  it('非结构化错误（无 structured）：只走 loadError 可重试路径，不派生终态', () => {
    const channel = new StubChannel();
    const store = new SnapshotStore({ thresholds: DEMO_THRESHOLDS, now: () => T0 });
    store.attach(channel);
    channel.emit({ type: 'connection', state: 'connected' });
    channel.emit({ type: 'error', message: '网关 502，请重试' });
    const presentation: PresentationState = store.getState().presentation;
    expect(presentation.sessionState).toBe('active');
    expect(presentation.loadError).toBe('网关 502，请重试');
    expect(presentation.retryAfterMs).toBeNull();
    store.dispose();
  });
});
