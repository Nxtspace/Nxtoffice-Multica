/**
 * 更新应用（纯函数）：把 full / delta 变换为新的快照状态。
 *
 * 防御规则（联调守则）：
 * - 应用 delta 后若出现悬空边（端点已被移除），防御性移除该边——
 *   适配器应保证边一致，此处兜底避免视图渲染不存在的对象；
 * - 任何输入都不得让输出快照包含重复 ID（后写覆盖前写）。
 */

import type { RelationEdge } from './edges';
import type { WorkspaceSnapshot } from './envelope';
import type { SnapshotDelta } from './updates';

/** store 维护的「可应用状态」：最后已知快照 + 顺序水位 */
export interface AppliedState {
  readonly snapshot: WorkspaceSnapshot;
  readonly lastSequence: number;
}

const upsertById = <T extends { id: string }>(list: readonly T[], patch: readonly T[] | undefined): readonly T[] => {
  if (!patch || patch.length === 0) return list;
  const map = new Map(list.map((item) => [item.id, item]));
  for (const item of patch) map.set(item.id, item); // 后写覆盖
  return [...map.values()];
};

const removeById = <T extends { id: string }>(list: readonly T[], ids: readonly string[] | undefined): readonly T[] => {
  if (!ids || ids.length === 0) return list;
  const doomed = new Set(ids);
  return list.filter((item) => !doomed.has(item.id));
};

/** 端点是否存在（用于悬空边防御） */
const edgeEndpointsExist = (edge: RelationEdge, s: WorkspaceSnapshot): boolean => {
  switch (edge.kind) {
    case 'membership':
      return s.squads.some((x) => x.id === edge.squadId) && s.agents.some((x) => x.id === edge.agentId);
    case 'assignment':
      return (
        s.issues.some((x) => x.id === edge.issueId) &&
        (edge.target.kind === 'agent'
          ? s.agents.some((x) => x.id === edge.target.id)
          : s.squads.some((x) => x.id === edge.target.id))
      );
    case 'run-association':
      return (
        s.runs.some((x) => x.id === edge.runId) &&
        s.issues.some((x) => x.id === edge.issueId) &&
        s.agents.some((x) => x.id === edge.agentId)
      );
  }
};

const pruneDanglingEdges = (s: WorkspaceSnapshot): WorkspaceSnapshot => {
  const kept = s.edges.filter((edge) => edgeEndpointsExist(edge, s));
  return kept.length === s.edges.length ? s : { ...s, edges: kept };
};

/** 应用全量快照（调用方须先经 classifyUpdate 判定为 apply） */
export function applyFull(_current: AppliedState, snapshot: WorkspaceSnapshot): AppliedState {
  return { snapshot: pruneDanglingEdges(snapshot), lastSequence: snapshot.snapshotVersion };
}

/** 应用增量（调用方须先经 classifyUpdate 判定为 apply） */
export function applyDelta(current: AppliedState, delta: SnapshotDelta): AppliedState {
  const base = current.snapshot;
  let next: WorkspaceSnapshot = {
    ...base,
    snapshotVersion: delta.snapshotVersion,
    capturedAt: delta.capturedAt,
    sourceUpdatedAt: delta.sourceUpdatedAt,
    freshness: delta.freshness,
    dataSource: delta.dataSource,
    agents: removeById(upsertById(base.agents, delta.upserts.agents), delta.removals.agentIds),
    squads: removeById(upsertById(base.squads, delta.upserts.squads), delta.removals.squadIds),
    issues: removeById(upsertById(base.issues, delta.upserts.issues), delta.removals.issueIds),
    runs: removeById(upsertById(base.runs, delta.upserts.runs), delta.removals.runIds),
    edges: removeById(upsertById(base.edges, delta.upserts.edges), delta.removals.edgeIds),
  };
  next = pruneDanglingEdges(next);
  return { snapshot: next, lastSequence: delta.sequence };
}
