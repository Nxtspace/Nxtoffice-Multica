/**
 * 快照信封（ADR-01 统一视图契约 v0）。
 *
 * 服务端授权适配器输出一份 WorkspaceSnapshot，2D/3D 两视图消费**同一版本**快照，
 * 各自只做投影；状态字典、版本/过期判断、可见性裁剪语义只在共享层（本包）实现。
 */

import type { RelationEdge } from './edges';
import type { AgentNode, IssueNode, RunNode, SnapshotScope, SquadNode } from './objects';

/** 契约版本（ADR-01 v0）。适配器契约变更需版本兼容（ADR-01 后果条款）。 */
export const CONTRACT_VERSION = 'v0' as const;
export type ContractVersion = typeof CONTRACT_VERSION;

/**
 * 数据来源标记。
 *
 * - mock：**必须**由 mock 生成器显式标记；UI 须持续展示不可关闭的 mock 徽标
 *   （仅限隔离开发，不得用于验收放行——见 mock/README.md）。
 * - live：正式服务端授权适配器（M2，待平台接口能力验证，当前未实现）。
 */
export type DataSourceMarker =
  | { readonly kind: 'mock'; readonly generator: string; readonly note: string }
  | { readonly kind: 'live' };

/** 当前观察者的授权范围提示（只告知其自身权限状态，不泄露不可见内容的存在性） */
export type ViewerScope = 'full' | 'restricted';

/**
 * 适配器在捕获时刻的新鲜度判定（ADR-01 信封字段 freshness）。
 * 客户端会随本地时钟用 freshness.ts 重新评估——信封值只是捕获时刻的结论。
 */
export type FreshnessAtCapture = 'fresh' | 'stale' | 'expired';

/** 统一视图快照（全量） */
export interface WorkspaceSnapshot {
  readonly contractVersion: ContractVersion;
  readonly scope: SnapshotScope;

  /** 快照版本：同一 scope 内单调递增；两视图必须消费同一版本（验收核对基准） */
  readonly snapshotVersion: number;
  /** 快照捕获时间（RFC3339） */
  readonly capturedAt: string;
  /** 源侧最新更新时间（RFC3339）——过期判断的时间基准 */
  readonly sourceUpdatedAt: string;
  /** 捕获时刻的新鲜度判定（客户端随时间重新评估） */
  readonly freshness: FreshnessAtCapture;

  readonly dataSource: DataSourceMarker;
  readonly viewer: { readonly scope: ViewerScope };

  readonly agents: readonly AgentNode[];
  readonly squads: readonly SquadNode[];
  readonly issues: readonly IssueNode[];
  readonly runs: readonly RunNode[];
  readonly edges: readonly RelationEdge[];
}
