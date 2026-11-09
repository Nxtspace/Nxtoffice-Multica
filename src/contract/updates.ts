/**
 * 增量更新与断线重连语义（ADR-01）：
 * - 增量更新须带版本与顺序；
 * - 断线重连先补齐（backfill）或全量重取（full refetch）；
 * - 旧版本事件不得覆盖新版本（对齐测试用例 T06）。
 *
 * 本文件只定义数据形状与**纯判定函数**；编排（何时发 recovery 请求）
 * 在 store.ts，传输在 channel 实现（mock 或未来的正式适配器）。
 */

import type { RelationEdge } from './edges';
import type { WorkspaceSnapshot } from './envelope';
import type { AgentNode, IssueNode, RunNode, SquadNode } from './objects';
import type { DataSourceMarker, FreshnessAtCapture } from './envelope';
import type { ContractVersion } from './envelope';

/** 一次更新：全量快照，或基于某版本的增量 */
export type SnapshotUpdate =
  | { readonly kind: 'full'; readonly snapshot: WorkspaceSnapshot }
  | { readonly kind: 'delta'; readonly delta: SnapshotDelta };

/** 增量（upsert + removal；含权限撤销导致的对象移除） */
export interface SnapshotDelta {
  readonly contractVersion: ContractVersion;
  /** 基于的快照版本（必须等于客户端当前版本才能直接应用） */
  readonly baseSnapshotVersion: number;
  /** 本增量产生的快照版本（= base + 1；v0 中与 sequence 同步递增） */
  readonly snapshotVersion: number;
  /** 通道内单调递增的顺序号；客户端要求连续（lastSequence + 1）才能应用 */
  readonly sequence: number;
  readonly capturedAt: string;
  readonly sourceUpdatedAt: string;
  readonly freshness: FreshnessAtCapture;
  readonly dataSource: DataSourceMarker;

  readonly upserts: {
    readonly agents?: readonly AgentNode[];
    readonly squads?: readonly SquadNode[];
    readonly issues?: readonly IssueNode[];
    readonly runs?: readonly RunNode[];
    readonly edges?: readonly RelationEdge[];
  };
  readonly removals: {
    readonly agentIds?: readonly string[];
    readonly squadIds?: readonly string[];
    readonly issueIds?: readonly string[];
    readonly runIds?: readonly string[];
    readonly edgeIds?: readonly string[];
  };
}

/** 客户端对一条更新的处置判定（纯函数结果，store 据此编排） */
export type UpdateDecision =
  | { readonly action: 'apply' }
  /** 版本不新于当前：丢弃，绝不回退（旧事件不覆盖新版本） */
  | { readonly action: 'ignore-stale' }
  /** 顺序或版本出现缺口：需要向通道请求补齐或全量重取 */
  | { readonly action: 'needs-recovery' };

export interface UpdateGuardState {
  readonly snapshotVersion: number;
  readonly lastSequence: number;
}

/**
 * 判定一条更新相对当前状态应如何处置。
 *
 * - full：snapshotVersion >= 当前版本 → apply；否则 ignore-stale。
 * - delta：base == 当前版本 且 sequence == lastSequence + 1 → apply；
 *   base < 当前版本但 sequence 衔接 → apply（乱序迟到但内容仍新）；
 *   其余（版本跳变、顺序空洞）→ needs-recovery。
 */
export function classifyUpdate(
  current: UpdateGuardState,
  update: SnapshotUpdate,
): UpdateDecision {
  if (update.kind === 'full') {
    return update.snapshot.snapshotVersion >= current.snapshotVersion
      ? { action: 'apply' }
      : { action: 'ignore-stale' };
  }
  const delta = update.delta;
  if (delta.baseSnapshotVersion === current.snapshotVersion) {
    return delta.sequence === current.lastSequence + 1
      ? { action: 'apply' }
      : { action: 'needs-recovery' };
  }
  if (delta.baseSnapshotVersion < current.snapshotVersion) {
    // 迟到的增量：若顺序仍衔接，内容等价于已应用过 → 按新版本推进应用
    return delta.sequence === current.lastSequence + 1
      ? { action: 'apply' }
      : { action: 'ignore-stale' };
  }
  // base > 当前版本：中间有缺口
  return { action: 'needs-recovery' };
}

/** recovery 请求：断线重连后向通道索取缺口（通道决定补齐或全量重取） */
export interface RecoveryRequest {
  readonly fromSnapshotVersion: number;
  readonly lastSequence: number;
}
