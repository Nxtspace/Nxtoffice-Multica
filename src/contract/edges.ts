/**
 * 关系边（ADR-01：成员、分派、运行关联三类）。
 *
 * 防泄露规则（ADR-01 权限边界 + 设计约束）：
 * - 关系边与列表、详情使用**同一可见性判断**：任一端点不可见的边
 *   **不进入快照**（适配器负责裁剪；validateSnapshot 负责兜底校验），
 *   避免用关联泄露不可见议题或不可见 Agent。
 * - 边的 visibility 描述该边自身（而非端点）的裁剪结果。
 */

import type { AgentId, EdgeId, IssueId, RunId, SquadId } from './ids';
import type { SourceRef, VisibilityTrim } from './source';

export interface EdgeBase {
  readonly id: EdgeId;
  readonly source: SourceRef;
  readonly visibility: VisibilityTrim;
}

/** 成员边：squad ↔ agent（对应 CLI `squad member list` 的成员关系） */
export interface MembershipEdge extends EdgeBase {
  readonly kind: 'membership';
  readonly squadId: SquadId;
  readonly agentId: AgentId;
}

/**
 * 分派边：issue → assignee。
 * 分派目标已验证两种：agent、squad（2026-11-06 issue list 实测 assignee_type）；
 * 其他目标类型（如成员本人）待平台契约确认后再加判别分支。
 */
export type AssignmentTarget =
  | { readonly kind: 'agent'; readonly id: AgentId }
  | { readonly kind: 'squad'; readonly id: SquadId };

export interface AssignmentEdge extends EdgeBase {
  readonly kind: 'assignment';
  readonly issueId: IssueId;
  readonly target: AssignmentTarget;
}

/** 运行关联边：run ↔ issue ↔ agent（从 run 的 issue_id / agent_id 派生） */
export interface RunAssociationEdge extends EdgeBase {
  readonly kind: 'run-association';
  readonly runId: RunId;
  readonly issueId: IssueId;
  readonly agentId: AgentId;
}

export type RelationEdge = MembershipEdge | AssignmentEdge | RunAssociationEdge;

/** 边的稳定 ID 构造（确定性：同一端点集合始终生成同一 ID） */
export const membershipEdgeId = (squadId: SquadId, agentId: AgentId): EdgeId =>
  `membership:${squadId}:${agentId}` as EdgeId;

export const assignmentEdgeId = (issueId: IssueId): EdgeId => `assignment:${issueId}` as EdgeId;

export const runAssociationEdgeId = (runId: RunId): EdgeId =>
  `run-association:${runId}` as EdgeId;
