/**
 * MockChannel：实现 SnapshotChannel 的隔离开发通道（**不得用于验收**）。
 *
 * 与未来正式适配器实现同一接口，因此视图和 store 不需要知道数据真伪。
 * 行为按场景脚本驱动：初始化延迟、请求失败、断线、增量更新、重连补齐。
 */

import type {
  ChannelEvent,
  ConnectionState,
  DetailResult,
  ObjectRef,
  RecoveryRequest,
  SnapshotChannel,
  SnapshotDelta,
  WorkspaceSnapshot,
} from '../contract';
import { CONTRACT_VERSION, detailDenied, detailNotFound, validateSnapshot } from '../contract';
import { applyDelta } from '../contract/apply';
import { asEdgeId, asIssueId, asRunId } from '../contract';
import { MOCK_HIDDEN_AGENT_ID, MOCK_MISSING_ISSUE_ID } from './fixtures';
import { MOCK_SCENARIOS, type MockScenarioId } from './scenarios';

interface MockChannelOptions {
  readonly scenario: MockScenarioId;
  readonly now?: () => number;
  /** 是否启用脚本化增量（默认按场景 plan） */
  readonly autoPlay?: boolean;
}

type Timer = ReturnType<typeof setTimeout>;

export class MockChannel implements SnapshotChannel {
  readonly kind = 'mock' as const;

  private readonly scenario: MockScenarioId;
  private readonly now: () => number;
  private readonly listeners = new Set<(event: ChannelEvent) => void>();
  private readonly timers = new Set<Timer>();
  private state: ConnectionState = 'idle';
  /** 当前基准快照（通道侧真值，用于生成增量与恢复） */
  private base: WorkspaceSnapshot | null = null;
  private sequence = 0;
  private version = 1;
  private scriptedStep = 0;
  private readonly autoPlay: boolean;

  constructor(options: MockChannelOptions) {
    this.scenario = options.scenario;
    this.now = options.now ?? Date.now;
    this.autoPlay = options.autoPlay ?? MOCK_SCENARIOS[options.scenario].plan.playScriptedUpdates;
  }

  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') return;
    const plan = MOCK_SCENARIOS[this.scenario].plan;
    this.emitConnection('connecting');
    this.later(() => {
      if (plan.failInitial) {
        this.emit({ type: 'error', message: '模拟错误：快照请求失败（mock，非真实故障）' });
        this.emitConnection('disconnected');
        return;
      }
      this.emitConnection('connected');
      const snapshot = MOCK_SCENARIOS[this.scenario].build(this.now());
      if (snapshot) {
        this.base = snapshot;
        this.version = snapshot.snapshotVersion;
        this.sequence = snapshot.snapshotVersion;
        this.emit({ type: 'update', update: { kind: 'full', snapshot } });
      }
      if (plan.disconnectAfterMs != null) {
        this.later(() => this.simulateDrop(), plan.disconnectAfterMs);
      }
      if (this.autoPlay) this.scheduleScriptedUpdates();
    }, plan.initialDelayMs);
  }

  disconnect(): void {
    this.clearTimers();
    this.emitConnection('disconnected');
  }

  /**
   * 断线恢复：补齐（重放缺口增量）或全量重取。
   * mock 策略：基线与请求版本一致时补发脚本增量；否则直接全量。
   */
  requestRecovery(_request: RecoveryRequest): void {
    if (!this.base) {
      this.requestFullRefetch();
      return;
    }
    this.emitConnection('reconnecting');
    this.later(() => {
      this.emitConnection('connected');
      // v0 mock：无论请求的缺口为何，都重发当前真值全量（等价于全量重取）
      this.emit({ type: 'update', update: { kind: 'full', snapshot: this.base! } });
    }, 500);
  }

  requestFullRefetch(): void {
    this.emitConnection('reconnecting');
    this.later(() => {
      this.emitConnection('connected');
      const snapshot = MOCK_SCENARIOS[this.scenario].build(this.now());
      if (snapshot) {
        this.base = snapshot;
        this.version = snapshot.snapshotVersion;
        this.emit({ type: 'update', update: { kind: 'full', snapshot } });
      }
    }, 400);
  }

  /**
   * 详情按单对象重新鉴权。
   * - 快照内存在 → 返回对象（metadata 级对象照常返回，由视图显示「内容不可见」）；
   * - mock 已知但当前用户无权 → 403；
   * - 完全不存在 → 404。
   */
  async fetchDetail(ref: ObjectRef): Promise<DetailResult> {
    await Promise.resolve();
    if (!this.base) return detailNotFound();
    const find = () => {
      switch (ref.kind) {
        case 'agent':
          return this.base!.agents.find((x) => x.id === ref.id);
        case 'squad':
          return this.base!.squads.find((x) => x.id === ref.id);
        case 'issue':
          return this.base!.issues.find((x) => x.id === ref.id);
        case 'run':
          return this.base!.runs.find((x) => x.id === ref.id);
      }
    };
    const found = find();
    if (found) return { ok: true, object: found };

    // 不在快照内：区分「存在但无权」（403）与「确实不存在」（404）
    if (ref.kind === 'agent' && ref.id === MOCK_HIDDEN_AGENT_ID) return detailDenied();
    if (ref.kind === 'issue' && ref.id === asIssueId('mock-issue-hidden-01')) return detailDenied();
    if (ref.kind === 'issue' && ref.id === MOCK_MISSING_ISSUE_ID) return detailNotFound();
    if (ref.kind === 'run' && ref.id === asRunId('mock-run-hidden-01')) return detailDenied();
    return detailNotFound();
  }

  subscribe(listener: (event: ChannelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.clearTimers();
    this.listeners.clear();
    this.state = 'idle';
  }

  // ---- 内部 ----

  private emit(event: ChannelEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private emitConnection(state: ConnectionState): void {
    this.state = state;
    this.emit({ type: 'connection', state });
  }

  private later(fn: () => void, ms: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  /** 模拟断线：连接掉线并停止后续更新（不伪造新数据） */
  private simulateDrop(): void {
    this.clearTimers();
    this.emitConnection('disconnected');
  }

  /**
   * 脚本化增量：演示「分派→运行→完成」的状态推进与版本/顺序语义。
   * 每步基于上一版本生成 delta（baseSnapshotVersion = 当前版本），
   * 触发 store 的 apply 路径；断线后不再发（真值不再前进）。
   */
  private scheduleScriptedUpdates(): void {
    this.later(() => this.stepStartRun(), 3_000);
    this.later(() => this.stepCompleteRun(), 7_000);
  }

  private stepStartRun(): void {
    const base = this.base;
    if (!base || base.dataSource.kind !== 'mock') return;
    if (this.scenario !== 'normal' && this.scenario !== 'disconnected') return;
    this.scriptedStep = 1;
    const issue = base.issues.find((i) => i.id === 'mock-issue-04');
    if (!issue) return;
    this.version += 1;
    this.sequence += 1;
    const nowIso = new Date(this.now()).toISOString();
    const delta: SnapshotDelta = {
      contractVersion: CONTRACT_VERSION,
      baseSnapshotVersion: this.version - 1,
      snapshotVersion: this.version,
      sequence: this.sequence,
      capturedAt: nowIso,
      sourceUpdatedAt: nowIso,
      freshness: 'fresh',
      dataSource: base.dataSource,
      upserts: {
        issues: [{ ...issue, status: 'in_progress', updatedAt: nowIso }],
        runs: [
          {
            id: asRunId('mock-run-13'),
            issueId: asIssueId('mock-issue-04'),
            agentId: base.agents.find((a) => a.id === 'mock-agent-06')!.id,
            status: 'running',
            startedAt: nowIso,
            completedAt: null,
            source: { system: 'multica', objectType: 'run' },
            visibility: { level: 'full' },
          },
        ],
        edges: [
          {
            id: asEdgeId('run-association:mock-run-13'),
            kind: 'run-association',
            runId: asRunId('mock-run-13'),
            issueId: asIssueId('mock-issue-04'),
            agentId: base.agents.find((a) => a.id === 'mock-agent-06')!.id,
            source: { system: 'multica', objectType: 'run' },
            visibility: { level: 'full' },
          },
        ],
      },
      removals: {},
    };
    this.base = applyMockDelta(base, delta);
    this.emit({ type: 'update', update: { kind: 'delta', delta } });
  }

  private stepCompleteRun(): void {
    const base = this.base;
    if (!base || this.scriptedStep !== 1) return;
    this.scriptedStep = 2;
    const issue = base.issues.find((i) => i.id === 'mock-issue-04');
    const run = base.runs.find((r) => r.id === 'mock-run-13');
    if (!issue || !run) return;
    this.version += 1;
    this.sequence += 1;
    const nowIso = new Date(this.now()).toISOString();
    const delta: SnapshotDelta = {
      contractVersion: CONTRACT_VERSION,
      baseSnapshotVersion: this.version - 1,
      snapshotVersion: this.version,
      sequence: this.sequence,
      capturedAt: nowIso,
      sourceUpdatedAt: nowIso,
      freshness: 'fresh',
      dataSource: base.dataSource,
      upserts: {
        issues: [{ ...issue, status: 'done', updatedAt: nowIso }],
        runs: [{ ...run, status: 'completed', completedAt: nowIso }],
      },
      removals: {},
    };
    this.base = applyMockDelta(base, delta);
    this.emit({ type: 'update', update: { kind: 'delta', delta } });
  }
}

/** 通道侧维护自己的真值（与客户端 applyDelta 同构；复用共享实现避免双份语义） */
const applyMockDelta = (base: WorkspaceSnapshot, delta: SnapshotDelta): WorkspaceSnapshot =>
  applyDelta({ snapshot: base, lastSequence: delta.sequence - 1 }, delta).snapshot;

/**
 * 场景产物的契约自检（测试与开发期调用）。
 * 返回各场景的校验结果；有失败即 mock 数据缺陷。
 */
export function auditMockScenarios(nowMs: number) {
  return (Object.keys(MOCK_SCENARIOS) as MockScenarioId[]).map((id) => {
    const snapshot = MOCK_SCENARIOS[id].build(nowMs);
    if (!snapshot) return { id, ok: true, issues: [] };
    const result = validateSnapshot(snapshot);
    return { id, ok: result.ok, issues: result.issues };
  });
}
