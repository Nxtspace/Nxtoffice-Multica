/**
 * US-5 六态视觉矩阵的派生（ADR-0004 状态优先级，唯一实现处）。
 *
 * 六态：正常 / 空 / 断线 / 过期 / 无权限 / 加载中（loading 含错误可重试与
 * 限流退避两个子形态——二者都是瞬态，不得沉淀为终态）。
 *
 * 优先级（先到先得，高层覆盖低层）：
 * 1. 终态会话（结构化错误码派生）：session-expired 并入 expired，
 *    no-permission 独立为 noPermission；
 * 2. 数据过期：freshness 阈值跨越（独立于错误通道）→ expired；
 * 3. 断线：连接断开/重连中 → disconnected（瞬态）；
 * 4. 无快照（含首屏、可重试错误、限流退避）→ loading；
 * 5. 有快照但无可见对象 → empty；
 * 6. 其余 → normal。
 *
 * 消费层保持「数据过期」与「会话过期」相互独立（freshness.ts 仍只看
 * sourceUpdatedAt），本模块只在视觉层合并。
 */

import type { ConnectionState } from './channel';
import type { DataLabel } from './store';
import type { SessionState } from './error-signals';

export type VisualState = 'loading' | 'empty' | 'disconnected' | 'expired' | 'no-permission' | 'normal';

export interface VisualStateInput {
  readonly sessionState: SessionState;
  readonly connection: ConnectionState;
  readonly dataLabel: DataLabel;
  /** 最后已知快照是否存在 */
  readonly hasSnapshot: boolean;
  /** 场景内可见 Agent 数（0 = 空态；仅快照存在时有意义） */
  readonly visibleAgentCount: number;
  /** 请求错误（可重试；非结构化或 unmatched 结构化错误） */
  readonly loadError: string | null;
  /** 限流退避剩余（ms；null = 未在退避） */
  readonly retryAfterMs: number | null;
}

export function deriveVisualState(input: VisualStateInput): VisualState {
  // 1. 终态：只可能来自结构化错误码（error-signals.ts），优先一切
  if (input.sessionState === 'session-expired') return 'expired';
  if (input.sessionState === 'no-permission') return 'no-permission';

  // 2. 数据过期（freshness 阈值跨越）：视觉层与 session-expired 合并
  if (input.dataLabel === 'expired') return 'expired';

  // 3. 断线（瞬态；先于 loading 判定：有快照时展示冻结的最后快照）
  if (input.connection === 'disconnected' || input.connection === 'reconnecting') return 'disconnected';

  if (!input.hasSnapshot) {
    // 4. 无快照：loading（含错误可重试、限流退避两个瞬态子形态）
    return 'loading';
  }

  // 5. 空态：快照内无可见对象——不是无权限，只是范围内为空
  if (input.visibleAgentCount === 0) return 'empty';

  return 'normal';
}
