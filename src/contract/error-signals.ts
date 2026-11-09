/**
 * ADR-0004 错误通道结构化信号 → 终态/瞬态分类（唯一实现处）。
 *
 * 铁律（验收可证伪）：`expired` / `noPermission` 两个终态**只能**由本模块从
 * 结构化错误码派生。空列表、响应迟延、非结构化错误文本、未知状态码
 * 一律不得推断终态——瞬态错误退避/重连后必须能离开 loading/disconnected，
 * 不得沉淀为终态。
 *
 * 依赖方向：store / views 经本模块派生；本模块不依赖任何视图/框架代码。
 */

/** ADR-0004 结构化错误词汇表：HTTP 状态 + 业务码 */
export type StructuredErrorStatus = 401 | 403 | 429;

/** 会话过期业务码（401） */
export const SESSION_EXPIRED_CODE = 'session_expired' as const;
/** 越权业务码（403） */
export const ACCESS_DENIED_CODE = 'access_denied' as const;

/** 错误通道下发的结构化错误（对齐服务端授权适配器的错误契约） */
export interface StructuredError {
  readonly status: StructuredErrorStatus;
  readonly code: string;
  readonly message?: string;
  /** 429 退避：Retry-After 头语义，毫秒 */
  readonly retryAfterMs?: number;
}

/** 终态会话状态：session-expired 在视觉层与数据过期合并为同一个 expired */
export type TerminalSessionState = 'session-expired' | 'no-permission';

/** store 会话状态：active 或某个终态 */
export type SessionState = 'active' | TerminalSessionState;

/** 结构化错误的分类结果 */
export type ErrorSignal =
  | { readonly kind: 'terminal'; readonly terminal: TerminalSessionState }
  | { readonly kind: 'transient-rate-limited'; readonly retryAfterMs: number | null }
  | { readonly kind: 'unmatched' };

/**
 * 按 ADR-0004 信号分类表派生：
 * - 401 + session_expired → 终态 expired（需重新鉴权，不自愈）
 * - 403 + access_denied  → 终态 noPermission（等待授权，不自愈）
 * - 429 (+ Retry-After)  → 瞬态：loading 带退避，退避后自动重取
 * - 其余（含状态码对不上业务码、未知码）→ unmatched：不派生任何终态，
 *   由上层按非结构化错误的既有语义处理（可重试错误）。
 */
export function classifyStructuredError(error: StructuredError): ErrorSignal {
  if (error.status === 401 && error.code === SESSION_EXPIRED_CODE) {
    return { kind: 'terminal', terminal: 'session-expired' };
  }
  if (error.status === 403 && error.code === ACCESS_DENIED_CODE) {
    return { kind: 'terminal', terminal: 'no-permission' };
  }
  if (error.status === 429) {
    return { kind: 'transient-rate-limited', retryAfterMs: error.retryAfterMs ?? null };
  }
  return { kind: 'unmatched' };
}

/** 结构化错误是否确立终态（断言/测试用） */
export function isTerminalSignal(signal: ErrorSignal): signal is Extract<ErrorSignal, { kind: 'terminal' }> {
  return signal.kind === 'terminal';
}
