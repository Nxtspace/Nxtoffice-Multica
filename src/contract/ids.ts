/**
 * 稳定 ID（ADR-01：每个对象带稳定 ID）。
 *
 * 品牌类型（branded type）只提供编译期防混淆：不同对象集合的 ID 互换会直接报错。
 * 品牌在运行时不存在（纯类型层），JSON 序列化不受影响。
 * ID 由服务端授权适配器从源数据透传，跨快照稳定。
 */

declare const brand: unique symbol;

export type WorkspaceId = string & { readonly [brand]: 'WorkspaceId' };
export type ProjectId = string & { readonly [brand]: 'ProjectId' };
export type AgentId = string & { readonly [brand]: 'AgentId' };
export type SquadId = string & { readonly [brand]: 'SquadId' };
export type IssueId = string & { readonly [brand]: 'IssueId' };
export type RunId = string & { readonly [brand]: 'RunId' };
export type EdgeId = string & { readonly [brand]: 'EdgeId' };

/** 构造品牌 ID（供适配器 / mock 生成器在数据入口处集中使用，消费侧不再 cast） */
export const asWorkspaceId = (v: string): WorkspaceId => v as WorkspaceId;
export const asProjectId = (v: string): ProjectId => v as ProjectId;
export const asAgentId = (v: string): AgentId => v as AgentId;
export const asSquadId = (v: string): SquadId => v as SquadId;
export const asIssueId = (v: string): IssueId => v as IssueId;
export const asRunId = (v: string): RunId => v as RunId;
export const asEdgeId = (v: string): EdgeId => v as EdgeId;

/** 对象类别（列表、详情、选择器共用） */
export type ObjectKind = 'agent' | 'squad' | 'issue' | 'run';

/** 对象引用：详情按单对象重新鉴权（ADR-01）时的寻址方式 */
export type ObjectRef =
  | { readonly kind: 'agent'; readonly id: AgentId }
  | { readonly kind: 'squad'; readonly id: SquadId }
  | { readonly kind: 'issue'; readonly id: IssueId }
  | { readonly kind: 'run'; readonly id: RunId };
