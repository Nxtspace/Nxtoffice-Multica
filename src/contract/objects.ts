/**
 * 契约对象（ADR-01 v0：workspace/project、agents、squads、issues、runs）。
 *
 * 字段口径：
 * - 已验证字段来自 2026-11-06 的 owner CLI 读取面（issue: project_id / status /
 *   assignee_id / updated_at；run: issue_id / agent_id / status / started_at /
 *   completed_at）——该读取面只证明 owner 身份的 CLI 能力，不是正式 API 契约。
 * - 可见字段清单（哪些业务字段对最终用户开放）待产品/平台契约确认（D-2 / D-3），
 *   故业务字段一律可缺省：metadata 级裁剪或字段未定时，字段不出现在快照中。
 * - 时间均为 RFC3339 UTC 字符串，原样透传源值，由视图按本地时区格式化。
 */

import type { AgentId, IssueId, ProjectId, RunId, SquadId, WorkspaceId } from './ids';
import type { SourceRef, VisibilityTrim } from './source';
import type { IssueStatus, RunStatus } from './state-dictionary';

/** 契约对象公共字段：稳定 ID、来源、可见性裁剪结果（ADR-01） */
export interface ContractObjectBase {
  readonly source: SourceRef;
  readonly visibility: VisibilityTrim;
}

/** 项目信息（快照的作用域） */
export interface ProjectInfo extends ContractObjectBase {
  readonly id: ProjectId;
  readonly name?: string;
}

/** Agent（虚拟办公室里的「角色」） */
export interface AgentNode extends ContractObjectBase {
  readonly id: AgentId;
  /** 展示名；metadata 级裁剪时可缺省（字段名列入 visibility.trimmedFields） */
  readonly name?: string;
}

/** Squad（小队，对应办公场景的一个分区） */
export interface SquadNode extends ContractObjectBase {
  readonly id: SquadId;
  readonly name?: string;
}

/**
 * 议题/任务。
 * 注意：不含 assignee 字段——分派关系是关系边（assignment），见 edges.ts；
 * 适配器从源的 issue.assignee_id / assignee_type 派生该边，避免双份真相。
 */
export interface IssueNode extends ContractObjectBase {
  readonly id: IssueId;
  /** 标题；metadata 级裁剪时可缺省 */
  readonly title?: string;
  /** 源状态，原样保留（ADR-01） */
  readonly status: IssueStatus;
  /** 源侧最后更新时间（已验证字段） */
  readonly updatedAt?: string;
}

/** 运行记录（Agent 在某议题上的一次执行） */
export interface RunNode extends ContractObjectBase {
  readonly id: RunId;
  readonly issueId: IssueId;
  readonly agentId: AgentId;
  /** 源状态，原样保留（ADR-01） */
  readonly status: RunStatus;
  readonly startedAt?: string;
  readonly completedAt?: string | null;
}

/** 快照作用域：工作区 + 项目 */
export interface SnapshotScope {
  readonly workspaceId: WorkspaceId;
  readonly project: ProjectInfo;
}
