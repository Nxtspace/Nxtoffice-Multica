/**
 * mock 固定装置（**仅限隔离开发，不得用于验收放行**）。
 *
 * 全部 ID 以 `mock-` 开头、名称带「示例」字样，便于任何截图/日志一眼识别；
 * 不复制任何真实 Multica 记录（正式数据入口尚未验证，owner CLI 不是生产接口）。
 */

import {
  asAgentId,
  asIssueId,
  asProjectId,
  asRunId,
  asSquadId,
  asWorkspaceId,
  assignmentEdgeId,
  membershipEdgeId,
  runAssociationEdgeId,
  type AgentId,
  type IssueId,
  type RunId,
  type SquadId,
} from '../contract';
import type { AgentNode, IssueNode, RunNode, SquadNode } from '../contract';
import type { AssignmentEdge, MembershipEdge, RelationEdge, RunAssociationEdge } from '../contract';
import { FULL_VISIBILITY, metadataVisibility } from '../contract';
import type { VisibilityTrim } from '../contract';

export const MOCK_WORKSPACE_ID = asWorkspaceId('mock-workspace');
export const MOCK_PROJECT_ID = asProjectId('mock-project');

const MOCK_SOURCE = { system: 'multica', objectType: 'agent' } as const;

/** 远端（对当前受限用户不可见）的 mock 对象 ID：用于 403/404 差异演示与测试 */
export const MOCK_HIDDEN_AGENT_ID = asAgentId('mock-agent-hidden-01');
export const MOCK_MISSING_ISSUE_ID = asIssueId('mock-issue-does-not-exist');

export const mockAgent = (
  id: string,
  name: string,
  visibility: VisibilityTrim = FULL_VISIBILITY,
): AgentNode => ({ id: asAgentId(id), name, source: MOCK_SOURCE, visibility });

export const mockSquad = (id: string, name: string): SquadNode => ({
  id: asSquadId(id),
  name,
  source: { system: 'multica', objectType: 'squad' },
  visibility: FULL_VISIBILITY,
});

export const mockIssue = (
  id: string,
  title: string,
  status: IssueNode['status'],
  updatedAt: string,
  visibility: VisibilityTrim = FULL_VISIBILITY,
): IssueNode => ({
  id: asIssueId(id),
  title,
  status,
  updatedAt,
  source: { system: 'multica', objectType: 'issue' },
  visibility,
});

export const mockRun = (
  id: string,
  issueId: string,
  agentId: string,
  status: RunNode['status'],
  startedAt: string,
  completedAt: string | null = null,
): RunNode => ({
  id: asRunId(id),
  issueId: asIssueId(issueId),
  agentId: asAgentId(agentId),
  status,
  startedAt,
  completedAt,
  source: { system: 'multica', objectType: 'run' },
  visibility: FULL_VISIBILITY,
});

export const membership = (squad: SquadId, agent: AgentId): MembershipEdge => ({
  id: membershipEdgeId(squad, agent),
  kind: 'membership',
  squadId: squad,
  agentId: agent,
  source: { system: 'multica', objectType: 'squad-member' },
  visibility: FULL_VISIBILITY,
});

export const assignmentToAgent = (issue: IssueId, agent: AgentId): AssignmentEdge => ({
  id: assignmentEdgeId(issue),
  kind: 'assignment',
  issueId: issue,
  target: { kind: 'agent', id: agent },
  source: { system: 'multica', objectType: 'issue-assignee' },
  visibility: FULL_VISIBILITY,
});

export const assignmentToSquad = (issue: IssueId, squad: SquadId): AssignmentEdge => ({
  id: assignmentEdgeId(issue),
  kind: 'assignment',
  issueId: issue,
  target: { kind: 'squad', id: squad },
  source: { system: 'multica', objectType: 'issue-assignee' },
  visibility: FULL_VISIBILITY,
});

export const runAssociation = (run: RunId, issue: IssueId, agent: AgentId): RunAssociationEdge => ({
  id: runAssociationEdgeId(run),
  kind: 'run-association',
  runId: run,
  issueId: issue,
  agentId: agent,
  source: { system: 'multica', objectType: 'run' },
  visibility: FULL_VISIBILITY,
});

/** 场景规模（≈ 前端负责人估算占位值 50/10/100/200 的缩小演示版，不是批准规模） */
export interface FixtureSet {
  readonly agents: readonly AgentNode[];
  readonly squads: readonly SquadNode[];
  readonly issues: readonly IssueNode[];
  readonly runs: readonly RunNode[];
  readonly edges: readonly RelationEdge[];
}

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * 正常场景固定装置：3 小队 / 8 Agent / 12 议题 / 12 运行 / 完整三类关系边。
 * 同时覆盖 working、idle、blocked 议题、完成运行等状态组合。
 */
export function buildNormalFixtures(nowMs: number): FixtureSet {
  const t = (minutesAgo: number) => iso(nowMs - minutesAgo * 60_000);

  const agents = [
    mockAgent('mock-agent-01', '示例 Agent 01 · 前端'),
    mockAgent('mock-agent-02', '示例 Agent 02 · 后端'),
    mockAgent('mock-agent-03', '示例 Agent 03 · 设计'),
    mockAgent('mock-agent-04', '示例 Agent 04 · 测试'),
    mockAgent('mock-agent-05', '示例 Agent 05 · 运维'),
    mockAgent('mock-agent-06', '示例 Agent 06 · 建模'),
    mockAgent('mock-agent-07', '示例 Agent 07 · 产品'),
    mockAgent('mock-agent-08', '示例 Agent 08 · 技术总监'),
  ];

  const squads = [
    mockSquad('mock-squad-01', '示例小队 · 产品研发'),
    mockSquad('mock-squad-02', '示例小队 · 视觉资产'),
    mockSquad('mock-squad-03', '示例小队 · 质量保障'),
  ];

  const issues = [
    mockIssue('mock-issue-01', '示例议题 · 共享契约骨架', 'in_progress', t(3)),
    mockIssue('mock-issue-02', '示例议题 · mock 快照生成器', 'in_progress', t(8)),
    mockIssue('mock-issue-03', '示例议题 · 2D 占位场景', 'in_review', t(15)),
    mockIssue('mock-issue-04', '示例议题 · 3D 占位场景', 'todo', t(20)),
    mockIssue('mock-issue-05', '示例议题 · 资产盘点', 'blocked', t(35)),
    mockIssue('mock-issue-06', '示例议题 · 权限矩阵验证', 'done', t(90)),
    mockIssue('mock-issue-07', '示例议题 · 性能小样', 'backlog', t(120)),
    mockIssue('mock-issue-08', '示例议题 · 状态字典定稿', 'cancelled', t(200)),
    mockIssue('mock-issue-09', '示例议题 · 灰度演练', 'todo', t(25)),
    mockIssue('mock-issue-10', '示例议题 · 验收脚本冻结', 'in_progress', t(12)),
    mockIssue('mock-issue-11', '示例议题 · 详情重新鉴权', 'in_review', t(40)),
    mockIssue('mock-issue-12', '示例议题 · 断线重连补偿', 'todo', t(55)),
  ];

  const runs = [
    mockRun('mock-run-01', 'mock-issue-01', 'mock-agent-01', 'running', t(18)),
    mockRun('mock-run-02', 'mock-issue-02', 'mock-agent-02', 'running', t(22)),
    mockRun('mock-run-03', 'mock-issue-03', 'mock-agent-03', 'completed', t(70), t(24)),
    mockRun('mock-run-04', 'mock-issue-06', 'mock-agent-04', 'completed', t(95), t(88)),
    mockRun('mock-run-05', 'mock-issue-05', 'mock-agent-06', 'failed', t(60), t(52)),
    mockRun('mock-run-06', 'mock-issue-10', 'mock-agent-07', 'running', t(11)),
    mockRun('mock-run-07', 'mock-issue-12', 'mock-agent-02', 'completed', t(150), t(130)),
    mockRun('mock-run-08', 'mock-issue-09', 'mock-agent-05', 'cancelled', t(45), t(41)),
    mockRun('mock-run-09', 'mock-issue-04', 'mock-agent-06', 'running', t(6)),
    mockRun('mock-run-10', 'mock-issue-11', 'mock-agent-08', 'completed', t(80), t(58)),
    mockRun('mock-run-11', 'mock-issue-01', 'mock-agent-02', 'completed', t(300), t(260)),
    mockRun('mock-run-12', 'mock-issue-02', 'mock-agent-01', 'completed', t(280), t(240)),
  ];

  const edges: RelationEdge[] = [
    membership(asSquadId('mock-squad-01'), asAgentId('mock-agent-01')),
    membership(asSquadId('mock-squad-01'), asAgentId('mock-agent-02')),
    membership(asSquadId('mock-squad-01'), asAgentId('mock-agent-07')),
    membership(asSquadId('mock-squad-01'), asAgentId('mock-agent-08')),
    membership(asSquadId('mock-squad-02'), asAgentId('mock-agent-03')),
    membership(asSquadId('mock-squad-02'), asAgentId('mock-agent-06')),
    membership(asSquadId('mock-squad-03'), asAgentId('mock-agent-04')),
    membership(asSquadId('mock-squad-03'), asAgentId('mock-agent-05')),
    assignmentToAgent(asIssueId('mock-issue-01'), asAgentId('mock-agent-01')),
    assignmentToAgent(asIssueId('mock-issue-02'), asAgentId('mock-agent-02')),
    assignmentToSquad(asIssueId('mock-issue-03'), asSquadId('mock-squad-02')),
    assignmentToAgent(asIssueId('mock-issue-05'), asAgentId('mock-agent-06')),
    assignmentToAgent(asIssueId('mock-issue-06'), asAgentId('mock-agent-04')),
    assignmentToSquad(asIssueId('mock-issue-09'), asSquadId('mock-squad-03')),
    assignmentToAgent(asIssueId('mock-issue-10'), asAgentId('mock-agent-07')),
    assignmentToAgent(asIssueId('mock-issue-11'), asAgentId('mock-agent-08')),
    assignmentToAgent(asIssueId('mock-issue-12'), asAgentId('mock-agent-02')),
    ...runs.map((run) => runAssociation(run.id, run.issueId, run.agentId)),
  ];

  return { agents, squads, issues, runs, edges };
}

/**
 * 无权限场景固定装置：模拟「受限最终用户」视角。
 * - 部分议题保留元数据但 content/title 被裁剪（metadata 级）；
 * - 被分派给隐藏 Agent 的议题**完全不下发**（不在快照内），其分派边与运行边一并裁剪，
 *   防止以「边」或数量泄露（对应 T12）。
 */
export function buildRestrictedFixtures(nowMs: number): FixtureSet {
  const base = buildNormalFixtures(nowMs);
  const t = (minutesAgo: number) => iso(nowMs - minutesAgo * 60_000);

  const trimmedIssue = mockIssue(
    'mock-issue-03',
    '示例议题 · 2D 占位场景',
    'in_review',
    t(15),
    metadataVisibility(['title']),
  );
  // metadata 级必须真正移除被裁字段，不能只标记（validate 会拦截）
  const { title: _removedTitle, ...trimmedWithoutTitle } = trimmedIssue;

  const hiddenIssue = mockIssue('mock-issue-hidden-01', '示例议题 · 受限用户不可见', 'in_progress', t(5));
  const hiddenAgent = mockAgent('mock-agent-hidden-01', '示例 Agent · 受限用户不可见');
  /** 隐藏对象完整记录只存在于 mock 鉴权登记表（供 fetchDetail 返回 403，不进入快照） */
  void hiddenIssue;
  void hiddenAgent;

  const visibleIssues = base.issues
    .filter((i) => i.id !== 'mock-issue-03' && i.id !== 'mock-issue-05')
    .concat(trimmedWithoutTitle as IssueNode);
  const visibleAgents = base.agents.filter((a) => a.id !== 'mock-agent-06');
  const visibleSquads = base.squads;

  // 隐藏对象相关的边全部不下发
  const visibleEdges = base.edges.filter((edge) => {
    if (edge.kind === 'membership') return edge.agentId !== 'mock-agent-06';
    if (edge.kind === 'assignment') {
      if (edge.issueId === 'mock-issue-05' || edge.issueId === 'mock-issue-hidden-01') return false;
      return edge.target.kind !== 'agent' || edge.target.id !== 'mock-agent-06';
    }
    return edge.agentId !== 'mock-agent-06';
  });
  const visibleRuns = base.runs.filter((run) => run.agentId !== 'mock-agent-06' && run.issueId !== 'mock-issue-05');

  return {
    agents: visibleAgents,
    squads: visibleSquads,
    issues: visibleIssues,
    runs: visibleRuns,
    edges: visibleEdges,
  };
}
