/**
 * 版本 / 过期判断（ADR-01：过期时冻结动画并显示最后更新时间，不能伪装实时）。
 *
 * 唯一实现在共享层；2D/3D 只消费评估结果。
 *
 * 阈值不内置业务默认值：staleAfterMs / expireAfterMs 须由产品/项目方批准后
 * 由调用方显式传入（D-2 待决项）。mock 与占位场景使用「演示阈值」时必须
 * 显式标注非批准值（见 mock/scenarios.ts 的 DEMO_THRESHOLDS）。
 */

import type { WorkspaceSnapshot } from './envelope';

export type FreshnessStatus = 'fresh' | 'stale' | 'expired';

export interface FreshnessThresholds {
  /** 超过该时限判定为 stale（提示数据可能滞后，动效不冻结） */
  readonly staleAfterMs: number;
  /** 超过该时限判定为 expired（冻结「正在工作」动效，显示最后更新时间） */
  readonly expireAfterMs: number;
}

/** 新鲜度评估结果（含冻结依据与展示所需字段） */
export interface FreshnessAssessment {
  readonly status: FreshnessStatus;
  /** 时间基准（= envelope.sourceUpdatedAt，过期时显示「最后更新」用它） */
  readonly referenceTime: string;
  /** 相对评估时刻的数据年龄（毫秒） */
  readonly ageMs: number;
}

/**
 * 评估快照新鲜度（纯函数）。
 *
 * 时间基准取 sourceUpdatedAt（源侧最新更新）——若源侧长期无变化，
 * 快照本身并不因此「过期」（以源更新时间为准，与 ADR-01 字段语义一致）。
 *
 * 边界语义（对齐测试用例 T10「恰在阈值前/上/后」）：
 * - age <  staleAfterMs            → fresh
 * - staleAfterMs <= age < expireAfterMs → stale
 * - age >= expireAfterMs           → expired
 */
export function evaluateFreshness(
  snapshot: Pick<WorkspaceSnapshot, 'sourceUpdatedAt'>,
  nowMs: number,
  thresholds: FreshnessThresholds,
): FreshnessAssessment {
  const sourceMs = Date.parse(snapshot.sourceUpdatedAt);
  const ageMs = Number.isNaN(sourceMs) ? Number.POSITIVE_INFINITY : Math.max(0, nowMs - sourceMs);
  const status: FreshnessStatus =
    ageMs >= thresholds.expireAfterMs ? 'expired' : ageMs >= thresholds.staleAfterMs ? 'stale' : 'fresh';
  return { status, referenceTime: snapshot.sourceUpdatedAt, ageMs };
}

/** 供状态栏展示的时态标签（含断线维度由 store 组合，此处只管时间维度） */
export const freshnessLabel = (status: FreshnessStatus): string =>
  status === 'fresh' ? '数据实时' : status === 'stale' ? '数据滞后' : '数据已过期';
