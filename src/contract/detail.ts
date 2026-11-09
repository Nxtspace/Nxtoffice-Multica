/**
 * 详情按单对象重新鉴权（ADR-01）。
 *
 * 列表/场景里的可见性 ≠ 详情可见性：详情每次请求都按对象重新鉴权
 * （对齐测试用例 T04「直接 ID 访问不存在或无权对象」）。
 *
 * 403 与 404 的语义分配（受限对象返回 403 还是统一 404 防探测）
 * **待平台正式契约确认**；v0 两类结果都建模，mock 两者都会出现。
 */

import type { AgentNode, IssueNode, RunNode, SquadNode } from './objects';

export type ContractObject = AgentNode | SquadNode | IssueNode | RunNode;

export type DetailFailure =
  | { readonly code: 403; readonly reason: 'permission-denied'; readonly message: string }
  | { readonly code: 404; readonly reason: 'not-found'; readonly message: string };

export type DetailResult = { readonly ok: true; readonly object: ContractObject } | { readonly ok: false; readonly failure: DetailFailure };

export const detailDenied = (message = '当前用户无权查看该对象详情'): DetailResult => ({
  ok: false,
  failure: { code: 403, reason: 'permission-denied', message },
});

export const detailNotFound = (message = '对象不存在或不可见'): DetailResult => ({
  ok: false,
  failure: { code: 404, reason: 'not-found', message },
});
