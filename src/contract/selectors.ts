/**
 * 共享选择器：把快照投影为「与渲染器无关」的场景模型。
 *
 * 2D/3D 只消费这里的结果做布局/绘制，禁止各自再推导状态或可见性。
 * 布局（等距网格、3D 座位）属于各自视图的投影细节，不在共享层。
 */

import type { RelationEdge } from './edges';
import type { WorkspaceSnapshot } from './envelope';
import type { IssueId, SquadId } from './ids';
import type { AgentNode, IssueNode, SquadNode } from './objects';
import { deriveAgentDisplayState, type AgentDisplayState } from './state-dictionary';

/** 某个 Agent 在场景中的模型（状态已由共享层派生完毕） */
export interface AgentSceneModel {
  readonly agent: AgentNode;
  readonly displayState: AgentDisplayState;
  /** 当前运行中的议题（派生自 run 关联边 + run.status） */
  readonly activeIssueIds: readonly IssueNode['id'][];
  /** 已分派给该 Agent 的议题（assignment 边 + 运行关联边去重） */
  readonly assignedIssueIds: readonly IssueNode['id'][];
  readonly squadIds: readonly SquadNode['id'][];
}

/** 场景模型：两视图的唯一数据输入 */
export interface SceneModel {
  readonly snapshotVersion: number;
  readonly agents: readonly AgentSceneModel[];
  readonly squads: readonly SquadNode[];
  readonly issues: readonly IssueNode[];
  readonly edges: readonly RelationEdge[];
  /** 状态计数（顶栏/图例用，两视图同值） */
  readonly counts: {
    readonly working: number;
    readonly idle: number;
    readonly unknown: number;
  };
}

/** 边按端点索引（避免视图里 O(n²) 扫描） */
const indexEdges = (edges: readonly RelationEdge[]) => {
  const byAgent = new Map<string, RelationEdge[]>();
  const byIssue = new Map<string, RelationEdge[]>();
  const bySquad = new Map<string, RelationEdge[]>();
  for (const edge of edges) {
    const push = (map: Map<string, RelationEdge[]>, key: string) => {
      const list = map.get(key);
      if (list) list.push(edge);
      else map.set(key, [edge]);
    };
    switch (edge.kind) {
      case 'membership':
        push(byAgent, edge.agentId);
        push(bySquad, edge.squadId);
        break;
      case 'assignment':
        push(byIssue, edge.issueId);
        if (edge.target.kind === 'agent') push(byAgent, edge.target.id);
        else push(bySquad, edge.target.id);
        break;
      case 'run-association':
        push(byAgent, edge.agentId);
        push(byIssue, edge.issueId);
        break;
    }
  }
  return { byAgent, byIssue, bySquad };
};

/**
 * 构建场景模型（纯函数，两视图必须对同一快照得到相同结果）。
 *
 * Agent 展示状态只从 run 数据派生；issue.status 不参与（ADR-01）。
 */
export function buildSceneModel(snapshot: WorkspaceSnapshot): SceneModel {
  const { byAgent } = indexEdges(snapshot.edges);
  const runById = new Map(snapshot.runs.map((r) => [r.id, r]));
  const issueIds = new Set(snapshot.issues.map((i) => i.id));

  const agents = snapshot.agents.map((agent): AgentSceneModel => {
    const edges = byAgent.get(agent.id) ?? [];
    const runEdges = edges.filter((e) => e.kind === 'run-association');
    const assigned = new Set<IssueId>();
    for (const edge of runEdges) {
      if (edge.kind === 'run-association' && issueIds.has(edge.issueId)) assigned.add(edge.issueId);
    }
    for (const edge of edges) {
      if (edge.kind === 'assignment' && edge.target.kind === 'agent' && edge.target.id === agent.id) {
        if (issueIds.has(edge.issueId)) assigned.add(edge.issueId);
      }
    }
    const squads = new Set<SquadId>();
    for (const edge of edges) {
      if (edge.kind === 'membership' && edge.agentId === agent.id) squads.add(edge.squadId);
    }

    const runStatuses = runEdges.flatMap((e) => {
      if (e.kind !== 'run-association') return [];
      const run = runById.get(e.runId);
      return run ? [run.status] : ['__missing-run__']; // 缺失视为未知，不猜
    });

    const activeIssueIds = runEdges.flatMap((e) => {
      if (e.kind !== 'run-association') return [];
      const run = runById.get(e.runId);
      return run && run.status === 'running' ? [run.issueId] : [];
    });

    return {
      agent,
      displayState: deriveAgentDisplayState({ runStatuses }),
      activeIssueIds: [...new Set(activeIssueIds)],
      assignedIssueIds: [...assigned],
      squadIds: [...squads],
    };
  });

  const counts = { working: 0, idle: 0, unknown: 0 };
  for (const model of agents) counts[model.displayState] += 1;

  return {
    snapshotVersion: snapshot.snapshotVersion,
    agents,
    squads: snapshot.squads,
    issues: snapshot.issues,
    edges: snapshot.edges,
    counts,
  };
}

/** 详情面板用：某议题的关联 run / Agent */
export function runsForIssue(snapshot: WorkspaceSnapshot, issueId: IssueNode['id']) {
  return snapshot.runs.filter((run) => run.issueId === issueId);
}

/** 详情面板用：某 Agent 参与的议题与 run */
export function issuesForAgent(snapshot: WorkspaceSnapshot, agentId: AgentNode['id']) {
  return snapshot.runs.filter((run) => run.agentId === agentId);
}
