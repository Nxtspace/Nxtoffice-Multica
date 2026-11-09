/**
 * SnapshotStore：共享层的客户端状态机（框架无关）。
 *
 * 职责（ADR-01 客户端语义的唯一实现处）：
 * - 持有最后已知快照；断线/过期**保留**该快照但冻结动效并显示最后更新时间，
 *   绝不把旧快照冒充当前（对齐测试用例 T09/T10）；
 * - 对每条 update 用 classifyUpdate 守门：旧版本丢弃、缺口触发 recovery；
 * - 组合「连接态 × 新鲜度」得出视图统一的呈现许可（动效冻结、时态标签）。
 * - ADR-0004 终态会话（session-expired / no-permission）只来自结构化错误码，
 *   确立后不随后续快照自愈，需显式 resetSessionState() 复位；429 走瞬态退避。
 *
 * React 绑定在 src/app/hooks.ts（useSyncExternalStore）；
 * 本类不得 import 任何视图/框架代码——依赖方向恒为 views → contract。
 */

import type { ChannelEvent, ConnectionState, SnapshotChannel } from './channel';
import { evaluateFreshness, type FreshnessAssessment, type FreshnessThresholds } from './freshness';
import type { WorkspaceSnapshot } from './envelope';
import { applyDelta, applyFull, type AppliedState } from './apply';
import { classifyUpdate, type SnapshotUpdate } from './updates';
import { classifyStructuredError, type SessionState } from './error-signals';

export type DataLabel = 'not-connected' | 'live' | 'lagging' | 'expired' | 'offline';

export interface PresentationState {
  readonly connection: ConnectionState;
  readonly freshness: FreshnessAssessment | null;
  /** 冻结「正在工作」动效：断线、数据过期或会话过期（ADR-01 / ADR-0004） */
  readonly animationsFrozen: boolean;
  readonly dataLabel: DataLabel;
  /** 最后更新时间（断线/过期时展示，RFC3339） */
  readonly lastUpdatedAt: string | null;
  /** mock 徽标：dataSource.kind === 'mock' 时必须持续展示 */
  readonly mock: boolean;
  /** 请求错误（加载失败态；恢复后清除） */
  readonly loadError: string | null;
  /**
   * 会话终态（ADR-0004）：只能由结构化错误码派生（error-signals.ts），
   * 一旦确立不随下一次快照自愈——须重新鉴权（resetSessionState）。
   */
  readonly sessionState: SessionState;
  /** 429 限流退避剩余展示值（ms；null = 未在退避） */
  readonly retryAfterMs: number | null;
}

export interface StoreState {
  /** 最后已知快照；null = 尚未收到任何数据（首屏加载态） */
  readonly snapshot: WorkspaceSnapshot | null;
  readonly presentation: PresentationState;
}

export interface SnapshotStoreOptions {
  /** 新鲜度阈值（须由批准配置显式传入；mock 场景用演示阈值并标注） */
  readonly thresholds: FreshnessThresholds;
  /** 时钟注入（测试与演示用；默认 Date.now） */
  readonly now?: () => number;
  /** 时钟滴答间隔（ms），startClock 用 */
  readonly clockIntervalMs?: number;
}

const INITIAL_PRESENTATION: PresentationState = {
  connection: 'idle',
  freshness: null,
  animationsFrozen: true,
  dataLabel: 'not-connected',
  lastUpdatedAt: null,
  mock: false,
  loadError: null,
  sessionState: 'active',
  retryAfterMs: null,
};

export class SnapshotStore {
  private state: StoreState = { snapshot: null, presentation: INITIAL_PRESENTATION };
  private applied: AppliedState | null = null;
  private channel: SnapshotChannel | null = null;
  private unsubscribeChannel: (() => void) | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly options: SnapshotStoreOptions;

  constructor(options: SnapshotStoreOptions) {
    this.options = options;
  }

  /** 接管一个通道（同时只支持一个；重复调用先解绑旧的） */
  attach(channel: SnapshotChannel): void {
    this.detachChannel();
    this.channel = channel;
    this.unsubscribeChannel = channel.subscribe((event) => this.onChannelEvent(event));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): StoreState => this.state;

  /** 重新评估新鲜度（时钟推进或测试显式调用） */
  reevaluate(nowMs: number = this.now()): void {
    if (!this.state.snapshot) return;
    const presentation = this.derivePresentation(this.state.snapshot, this.state.presentation.connection, nowMs);
    this.setState({ ...this.state, presentation });
  }

  /** 启动本地时钟（外壳挂载时调用；间隔默认 1000ms） */
  startClock(): void {
    if (this.clockTimer != null) return;
    this.clockTimer = setInterval(() => this.reevaluate(), this.options.clockIntervalMs ?? 1000);
  }

  stopClock(): void {
    if (this.clockTimer != null) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  dispose(): void {
    this.stopClock();
    this.clearBackoff();
    this.detachChannel();
    this.listeners.clear();
  }

  /** 手动触发全量重取（状态栏「刷新」入口） */
  requestFullRefetch(): void {
    this.channel?.requestFullRefetch();
  }

  /**
   * 重新鉴权后清除会话终态（ADR-0004：终态不自愈，只能显式复位）。
   * 复位后由调用方重新 connect / requestFullRefetch 拉取数据。
   */
  resetSessionState(): void {
    this.clearBackoff();
    const presentation = this.derivePresentation(
      this.state.snapshot,
      this.state.presentation.connection,
      this.now(),
    );
    this.setState({
      ...this.state,
      presentation: {
        ...presentation,
        sessionState: 'active',
        retryAfterMs: null,
        loadError: null,
      },
    });
  }

  // ---- 内部 ----

  private clearBackoff(): void {
    if (this.backoffTimer != null) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }

  /** 429 退避：到了之后退出退避态并自动重取（瞬态，不沉淀为终态） */
  private scheduleBackoff(retryAfterMs: number): void {
    this.clearBackoff();
    const delay = Math.max(retryAfterMs, 0);
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      // 退避结束：先离开退避态，再触发重取；重取成功后 commitSnapshot 清 loadError
      const presentation = this.derivePresentation(
        this.state.snapshot,
        this.state.presentation.connection,
        this.now(),
      );
      this.setState({
        ...this.state,
        presentation: { ...presentation, retryAfterMs: null },
      });
      this.channel?.requestFullRefetch();
    }, delay);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private detachChannel(): void {
    this.unsubscribeChannel?.();
    this.unsubscribeChannel = null;
    this.channel = null;
  }

  private setState(next: StoreState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private onChannelEvent(event: ChannelEvent): void {
    switch (event.type) {
      case 'connection': {
        const presentation = this.derivePresentation(this.state.snapshot, event.state, this.now());
        this.setState({ ...this.state, presentation });
        return;
      }
      case 'error': {
        // ADR-0004：只有结构化错误码派生终态；非结构化 message 走既有可重试语义
        const structured = event.structured ? classifyStructuredError(event.structured) : null;
        if (structured?.kind === 'terminal') {
          this.clearBackoff();
          const prev = this.state.presentation;
          this.setState({
            ...this.state,
            presentation: {
              ...prev,
              sessionState: structured.terminal,
              loadError: null,
              retryAfterMs: null,
              // 会话过期与断线/数据过期同样冻结「正在工作」动效（no-permission 不涉及快照）
              animationsFrozen: prev.animationsFrozen || structured.terminal === 'session-expired',
            },
          });
          return;
        }
        if (structured?.kind === 'transient-rate-limited') {
          const retryAfterMs = structured.retryAfterMs ?? 0;
          this.setState({
            ...this.state,
            presentation: {
              ...this.state.presentation,
              retryAfterMs,
              loadError: event.message,
            },
          });
          this.scheduleBackoff(retryAfterMs);
          return;
        }
        // unmatched / 非结构化：可重试错误，不派生任何终态
        this.setState({
          ...this.state,
          presentation: { ...this.state.presentation, loadError: event.message },
        });
        return;
      }
      case 'update': {
        this.applyUpdate(event.update);
        return;
      }
    }
  }

  private applyUpdate(update: SnapshotUpdate): void {
    if (this.applied == null) {
      // 尚无任何状态：只接受 full（delta 无从应用）
      if (update.kind !== 'full') {
        this.requestRecoveryFromScratch();
        return;
      }
      this.applied = applyFull({ snapshot: update.snapshot, lastSequence: 0 }, update.snapshot);
      this.commitSnapshot();
      return;
    }

    const decision = classifyUpdate(
      { snapshotVersion: this.applied.snapshot.snapshotVersion, lastSequence: this.applied.lastSequence },
      update,
    );
    switch (decision.action) {
      case 'apply':
        this.applied =
          update.kind === 'full'
            ? applyFull(this.applied, update.snapshot)
            : applyDelta(this.applied, update.delta);
        this.commitSnapshot();
        return;
      case 'ignore-stale':
        return; // 旧事件不覆盖新版本（T06）
      case 'needs-recovery':
        this.requestRecoveryFromScratch();
        return;
    }
  }

  private requestRecoveryFromScratch(): void {
    if (!this.channel) return;
    if (this.applied == null) {
      this.channel.requestFullRefetch();
      return;
    }
    this.channel.requestRecovery({
      fromSnapshotVersion: this.applied.snapshot.snapshotVersion,
      lastSequence: this.applied.lastSequence,
    });
  }

  private commitSnapshot(): void {
    if (!this.applied) return;
    const snapshot = this.applied.snapshot;
    const presentation = this.derivePresentation(snapshot, this.state.presentation.connection, this.now());
    // 收到新数据即清除上一轮的请求错误与退避（恢复语义）；
    // 但 sessionState 终态不在此清除——ADR-0004 终态只能由 resetSessionState 复位。
    const loadError = null;
    const retryAfterMs = null;
    this.setState({ snapshot, presentation: { ...presentation, loadError, retryAfterMs } });
  }

  private derivePresentation(
    snapshot: WorkspaceSnapshot | null,
    connection: import('./channel').ConnectionState,
    nowMs: number,
  ): PresentationState {
    if (!snapshot) {
      return {
        connection,
        freshness: null,
        animationsFrozen: connection !== 'connected' || this.state.presentation.sessionState === 'session-expired',
        dataLabel: 'not-connected',
        lastUpdatedAt: null,
        mock: false,
        loadError: this.state.presentation.loadError,
        sessionState: this.state.presentation.sessionState,
        retryAfterMs: this.state.presentation.retryAfterMs,
      };
    }
    const freshness = evaluateFreshness(snapshot, nowMs, this.options.thresholds);
    const offline = connection === 'disconnected' || connection === 'reconnecting';
    const sessionExpired = this.state.presentation.sessionState === 'session-expired';
    const animationsFrozen = offline || freshness.status === 'expired' || sessionExpired;
    const dataLabel: DataLabel = offline
      ? 'offline'
      : freshness.status === 'expired'
        ? 'expired'
        : freshness.status === 'stale'
          ? 'lagging'
          : 'live';
    return {
      connection,
      freshness,
      animationsFrozen,
      dataLabel,
      lastUpdatedAt: snapshot.sourceUpdatedAt,
      mock: snapshot.dataSource.kind === 'mock',
      loadError: this.state.presentation.loadError,
      sessionState: this.state.presentation.sessionState,
      retryAfterMs: this.state.presentation.retryAfterMs,
    };
  }
}
