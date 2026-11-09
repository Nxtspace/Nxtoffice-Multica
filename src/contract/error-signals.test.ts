/**
 * ADR-0004 结构化错误信号分类单测（铁律可证伪）。
 *
 * 重点：终态只能由「状态码 + 业务码」精确组合派生；任何不匹配
 * （空列表、非结构化文本、码对不上、未知状态码）都不得推断终态。
 */

import { describe, expect, it } from 'vitest';
import {
  ACCESS_DENIED_CODE,
  SESSION_EXPIRED_CODE,
  classifyStructuredError,
  isTerminalSignal,
  type StructuredError,
} from './error-signals';

const signal = (status: StructuredError['status'], code: string, extra?: Partial<StructuredError>): StructuredError => ({
  status,
  code,
  ...extra,
});

describe('classifyStructuredError', () => {
  it('401 + session_expired → 终态 session-expired（需重新鉴权，不自愈）', () => {
    const result = classifyStructuredError(signal(401, SESSION_EXPIRED_CODE));
    expect(result).toEqual({ kind: 'terminal', terminal: 'session-expired' });
    expect(isTerminalSignal(result)).toBe(true);
  });

  it('403 + access_denied → 终态 no-permission（等待授权，不自愈）', () => {
    const result = classifyStructuredError(signal(403, ACCESS_DENIED_CODE));
    expect(result).toEqual({ kind: 'terminal', terminal: 'no-permission' });
    expect(isTerminalSignal(result)).toBe(true);
  });

  it('429 → 瞬态限流（携带 Retry-After；缺省时为 null）', () => {
    expect(classifyStructuredError(signal(429, 'rate_limited', { retryAfterMs: 5_000 }))).toEqual({
      kind: 'transient-rate-limited',
      retryAfterMs: 5_000,
    });
    expect(classifyStructuredError(signal(429, 'rate_limited'))).toEqual({
      kind: 'transient-rate-limited',
      retryAfterMs: null,
    });
  });

  it('码对不上状态码 → unmatched（401 配 access_denied 不得派生任何终态）', () => {
    expect(classifyStructuredError(signal(401, ACCESS_DENIED_CODE))).toEqual({ kind: 'unmatched' });
    expect(classifyStructuredError(signal(403, SESSION_EXPIRED_CODE))).toEqual({ kind: 'unmatched' });
  });

  it('未知业务码 / 未知状态码 → unmatched', () => {
    expect(classifyStructuredError(signal(401, 'unknown_code'))).toEqual({ kind: 'unmatched' });
    expect(classifyStructuredError(signal(403, 'unknown_code'))).toEqual({ kind: 'unmatched' });
    expect(classifyStructuredError(signal(429, 'totally_different'))).toEqual({
      kind: 'transient-rate-limited',
      retryAfterMs: null,
    });
  });

  it('瞬态与 unmatched 都不是终态（空列表/延迟/非结构化错误不得推断终态）', () => {
    expect(isTerminalSignal({ kind: 'transient-rate-limited', retryAfterMs: 1_000 })).toBe(false);
    expect(isTerminalSignal({ kind: 'unmatched' })).toBe(false);
  });
});
