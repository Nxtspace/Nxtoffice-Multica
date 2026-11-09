/**
 * mock 层行为单测：MockChannel × SnapshotStore 的端到端编排（假时钟）。
 *
 * 验证 ADR-01 客户端语义在场景矩阵下的表现：
 * 首次全量、脚本化增量（版本/顺序推进）、断线保留+冻结、
 * 错误态与恢复、加载态、详情按单对象重新鉴权（403/404）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockChannel, auditMockScenarios } from './channel';
import { DEMO_THRESHOLDS, MOCK_SCENARIOS, type MockScenarioId } from './scenarios';
import { MOCK_HIDDEN_AGENT_ID, MOCK_MISSING_ISSUE_ID } from './fixtures';
import { SnapshotStore, asAgentId, buildSceneModel } from '../contract';

const T0 = Date.parse('2026-11-06T08:00:00Z');

interface Harness {
  readonly channel: MockChannel;
  readonly store: SnapshotStore;
  /** 推进假时钟（先跑定时器，再推进注入时钟，保证回调见到确定性的 now） */
  readonly advance: (ms: number) => Promise<void>;
}

function harnessFor(scenario: MockScenarioId): Harness {
  let clock = T0;
  const now = (): number => clock;
  const channel = new MockChannel({ scenario, now });
  const store = new SnapshotStore({ thresholds: DEMO_THRESHOLDS, now });
  store.attach(channel);
  channel.connect();
  return {
    channel,
    store,
    advance: async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      clock += ms;
    },
  };
}

describe('MockChannel × SnapshotStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normal：延迟后下发全量快照，连接态/标记/计数正确', async () => {
    const { store } = harnessFor('normal');
    expect(store.getState().snapshot).toBeNull();

    await vi.advanceTimersByTimeAsync(300);
    const state = store.getState();
    expect(state.presentation.connection).toBe('connected');
    expect(state.presentation.dataLabel).toBe('live');
    expect(state.presentation.mock).toBe(true);
    expect(state.presentation.animationsFrozen).toBe(false);
    expect(state.snapshot).not.toBeNull();
    expect(state.snapshot?.snapshotVersion).toBe(1);
    expect(state.snapshot?.dataSource.kind).toBe('mock');
    const model = buildSceneModel(state.snapshot!);
    expect(model.agents.length).toBe(8);
    expect(model.counts.working + model.counts.idle + model.counts.unknown).toBe(8);
  });

  it('脚本化增量：分派→运行→完成，版本与顺序逐级推进', async () => {
    const { store } = harnessFor('normal');
    await vi.advanceTimersByTimeAsync(300);

    // 第一步：issue-04 进入 in_progress，新 run-13running，版本 2
    await vi.advanceTimersByTimeAsync(3_000);
    const afterStart = store.getState().snapshot!;
    expect(afterStart.snapshotVersion).toBe(2);
    expect(afterStart.issues.find((i) => i.id === 'mock-issue-04')?.status).toBe('in_progress');
    const run = afterStart.runs.find((r) => r.id === 'mock-run-13');
    expect(run?.status).toBe('running');
    expect(run?.agentId).toBe('mock-agent-06');
    expect(afterStart.edges.some((e) => e.kind === 'run-association' && e.runId === 'mock-run-13')).toBe(true);
    const modelStart = buildSceneModel(afterStart);
    expect(modelStart.agents.find((a) => a.agent.id === 'mock-agent-06')?.displayState).toBe('working');

    // 第二步：run 完成、issue done，版本 3（agent-06 仍有 run-09 running，保持 working）
    await vi.advanceTimersByTimeAsync(4_000);
    const afterDone = store.getState().snapshot!;
    expect(afterDone.snapshotVersion).toBe(3);
    expect(afterDone.issues.find((i) => i.id === 'mock-issue-04')?.status).toBe('done');
    expect(afterDone.runs.find((r) => r.id === 'mock-run-13')?.status).toBe('completed');
  });

  it('disconnected：断线后保留最后快照、冻结动效；自动重连补齐后离开断线态', async () => {
    const { store } = harnessFor('disconnected');
    await vi.advanceTimersByTimeAsync(200);
    expect(store.getState().snapshot).not.toBeNull();

    // 断线发生在 4.2s；第一步脚本增量（3.2s）已应用，断线后真值不再前进
    await vi.advanceTimersByTimeAsync(4_500);
    const dropped = store.getState();
    expect(dropped.presentation.connection).toBe('disconnected');
    expect(dropped.presentation.dataLabel).toBe('offline');
    expect(dropped.presentation.animationsFrozen).toBe(true);
    expect(dropped.presentation.lastUpdatedAt).not.toBeNull();
    expect(dropped.snapshot).not.toBeNull();
    // 断线后未收到第二步（7.2s 的完成事件被 clearTimers 取消）
    expect(dropped.snapshot?.snapshotVersion).toBe(2);

    // 3.5s 后自动重连补齐（7.7s 触发、8.2s 完成）：瞬态断线离开，恢复最后真值
    await vi.advanceTimersByTimeAsync(3_500);
    const recovered = store.getState();
    expect(recovered.presentation.connection).toBe('connected');
    expect(recovered.presentation.dataLabel).toBe('live');
    expect(recovered.snapshot?.snapshotVersion).toBe(2);
  });

  it('error：首次请求失败置 loadError；全量重取成功后清除错误并下发数据', async () => {
    const { store, channel } = harnessFor('error');
    await vi.advanceTimersByTimeAsync(400);
    const failed = store.getState();
    expect(failed.snapshot).toBeNull();
    expect(failed.presentation.loadError).not.toBeNull();
    expect(failed.presentation.connection).toBe('disconnected');

    store.requestFullRefetch();
    await vi.advanceTimersByTimeAsync(400);
    const recovered = store.getState();
    expect(recovered.presentation.connection).toBe('connected');
    expect(recovered.presentation.loadError).toBeNull();
    expect(recovered.snapshot).not.toBeNull();
    expect(channel.kind).toBe('mock');
  });

  it('loading：长时间不下发快照，持续处于加载态', async () => {
    const { store } = harnessFor('loading');
    await vi.advanceTimersByTimeAsync(5_000);
    const state = store.getState();
    expect(state.snapshot).toBeNull();
    expect(state.presentation.dataLabel).toBe('not-connected');
    expect(state.presentation.animationsFrozen).toBe(true);
  });

  it('empty / stale / expired：空态与新鲜度三态的呈现许可', async () => {
    const empty = harnessFor('empty');
    await empty.advance(200);
    expect(buildSceneModel(empty.store.getState().snapshot!).agents).toEqual([]);
    expect(empty.store.getState().presentation.dataLabel).toBe('live');

    const stale = harnessFor('stale');
    await stale.advance(200);
    expect(stale.store.getState().presentation.dataLabel).toBe('lagging');
    expect(stale.store.getState().presentation.animationsFrozen).toBe(false);

    const expired = harnessFor('expired');
    await expired.advance(200);
    expect(expired.store.getState().presentation.dataLabel).toBe('expired');
    expect(expired.store.getState().presentation.animationsFrozen).toBe(true);
    expect(expired.store.getState().presentation.freshness?.status).toBe('expired');
  });

  it('详情按单对象重新鉴权：可见对象返回、无权 403、不存在 404', async () => {
    const { channel } = harnessFor('forbidden');
    await vi.advanceTimersByTimeAsync(250);

    const visible = await channel.fetchDetail({ kind: 'agent', id: asAgentId('mock-agent-01') });
    expect(visible.ok).toBe(true);

    const denied = await channel.fetchDetail({ kind: 'agent', id: MOCK_HIDDEN_AGENT_ID });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.failure.code).toBe(403);
      expect(denied.failure.reason).toBe('permission-denied');
    }

    const missing = await channel.fetchDetail({ kind: 'issue', id: MOCK_MISSING_ISSUE_ID });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.failure.code).toBe(404);
      expect(missing.failure.reason).toBe('not-found');
    }
  });

  it('requestRecovery：重连并重发当前真值全量（等价补齐）', async () => {
    const { store, channel } = harnessFor('normal');
    await vi.advanceTimersByTimeAsync(300);
    const before = store.getState();

    channel.requestRecovery({ fromSnapshotVersion: before.snapshot!.snapshotVersion, lastSequence: 1 });
    await vi.advanceTimersByTimeAsync(500);
    const after = store.getState();
    expect(after.presentation.connection).toBe('connected');
    expect(after.snapshot).not.toBeNull();
    expect(after.snapshot?.snapshotVersion).toBe(1);
  });
});

describe('ADR-0004 结构化信号场景（U5）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('session-expired：先快照后终态；冻结动效保留最后快照，终态不随重取自愈', async () => {
    const { store } = harnessFor('session-expired');
    await vi.advanceTimersByTimeAsync(300);
    // 先下发正常快照：会话仍 active
    expect(store.getState().snapshot).not.toBeNull();
    expect(store.getState().presentation.sessionState).toBe('active');

    // 4.3s：通道下发 401 + session_expired → 终态，冻结动效，保留最后快照
    await vi.advanceTimersByTimeAsync(4_000);
    const terminal = store.getState();
    expect(terminal.presentation.sessionState).toBe('session-expired');
    expect(terminal.presentation.animationsFrozen).toBe(true);
    expect(terminal.snapshot).not.toBeNull();
    expect(terminal.presentation.lastUpdatedAt).not.toBeNull();
    // 终态确立后不再处于限流退避
    expect(terminal.presentation.retryAfterMs).toBeNull();

    // 铁律：后续快照不能让终态自愈（须重新鉴权显式复位）
    store.requestFullRefetch();
    await vi.advanceTimersByTimeAsync(400);
    expect(store.getState().snapshot).not.toBeNull();
    expect(store.getState().presentation.sessionState).toBe('session-expired');

    // 重新鉴权（显式复位）后回到 active
    store.resetSessionState();
    expect(store.getState().presentation.sessionState).toBe('active');
  });

  it('access-denied：连接后立即 403，从不下发任何快照（零存在性泄露）', async () => {
    const { store, channel } = harnessFor('access-denied');
    await vi.advanceTimersByTimeAsync(300);
    const state = store.getState();
    expect(state.presentation.sessionState).toBe('no-permission');
    expect(state.snapshot).toBeNull();
    expect(state.presentation.loadError).toBeNull(); // 终态不是「可重试错误」
    expect(state.presentation.connection).toBe('connected');

    // 工作区级越权：详情按单对象重新鉴权一律 403，不泄露对象存在性
    const denied = await channel.fetchDetail({ kind: 'agent', id: asAgentId('mock-agent-01') });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.failure.code).toBe(403);
      expect(denied.failure.reason).toBe('permission-denied');
    }
  });

  it('rate-limited：429 进入 loading 退避；退避结束后自动重取并恢复，不沉淀终态', async () => {
    const { store } = harnessFor('rate-limited');
    await vi.advanceTimersByTimeAsync(400); // 连接后立即下发 429
    const limited = store.getState();
    expect(limited.presentation.retryAfterMs).toBe(3_000);
    expect(limited.presentation.loadError).not.toBeNull();
    expect(limited.presentation.sessionState).toBe('active'); // 瞬态，非终态
    expect(limited.snapshot).toBeNull();

    // 3.4s：退避结束自动全量重取 → 离开 loading，错误与退避标记清除
    await vi.advanceTimersByTimeAsync(3_400);
    const recovered = store.getState();
    expect(recovered.presentation.retryAfterMs).toBeNull();
    expect(recovered.presentation.loadError).toBeNull();
    expect(recovered.snapshot).not.toBeNull();
    expect(recovered.presentation.connection).toBe('connected');
    expect(recovered.presentation.sessionState).toBe('active');
  });
});

describe('mock 场景产物审计', () => {
  it('auditMockScenarios：全部场景通过契约校验', () => {
    const results = auditMockScenarios(T0);
    expect(results.length).toBe(Object.keys(MOCK_SCENARIOS).length);
    for (const result of results) {
      if (!result.ok) console.error(result.id, result.issues);
      expect(result.ok).toBe(true);
    }
  });
});
