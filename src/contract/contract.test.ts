/**
 * 共享契约层单测（ADR-01 v0 的纯函数语义守门）。
 * 覆盖：状态字典、新鲜度边界、增量判定与应用（含悬空边防御）、
 * 快照不变量校验、场景模型投影。
 */

import { describe, expect, it } from 'vitest';
import {
  asAgentId,
  asIssueId,
  asRunId,
  asSquadId,
} from './ids';
import {
  membershipEdgeId,
  runAssociationEdgeId,
  type RunAssociationEdge,
} from './edges';
import { CONTRACT_VERSION, type WorkspaceSnapshot } from './envelope';
import { deriveAgentDisplayState, isIssueStatus, isRunStatus } from './state-dictionary';
import { evaluateFreshness, type FreshnessThresholds } from './freshness';
import { classifyUpdate, type SnapshotUpdate } from './updates';
import { applyDelta, applyFull, type AppliedState } from './apply';
import { validateSnapshot } from './validate';
import { buildSceneModel } from './selectors';
import { DEMO_THRESHOLDS, MOCK_SCENARIOS, type MockScenarioId } from '../mock/scenarios';
import {
  MOCK_PROJECT_ID,
  MOCK_WORKSPACE_ID,
  buildNormalFixtures,
  mockAgent,
  mockIssue,
} from '../mock/fixtures';

const T0 = Date.parse('2026-11-06T08:00:00Z');
const THRESHOLDS: FreshnessThresholds = { staleAfterMs: 10_000, expireAfterMs: 30_000 };
type DeltaBody = Extract<SnapshotUpdate, { kind: 'delta' }>['delta'];

const snapshotWith = (sourceUpdatedAt: string): WorkspaceSnapshot => {
  const fixtures = buildNormalFixtures(T0);
  return {
    contractVersion: CONTRACT_VERSION,
    scope: {
      workspaceId: MOCK_WORKSPACE_ID,
      project: {
        id: MOCK_PROJECT_ID,
        name: '示例项目（mock）',
        source: { system: 'multica', objectType: 'project' },
        visibility: { level: 'full' },
      },
    },
    snapshotVersion: 1,
    capturedAt: new Date(T0).toISOString(),
    sourceUpdatedAt,
    freshness: 'fresh',
    dataSource: { kind: 'mock', generator: 'test', note: '单测构造' },
    viewer: { scope: 'full' },
    ...fixtures,
  };
};

describe('状态字典（ADR-01）', () => {
  it('running 派生为 working；无 run 派生为 idle', () => {
    expect(deriveAgentDisplayState({ runStatuses: [] })).toBe('idle');
    expect(deriveAgentDisplayState({ runStatuses: ['completed'] })).toBe('idle');
    expect(deriveAgentDisplayState({ runStatuses: ['completed', 'running'] })).toBe('working');
  });

  it('未识别的 run.status 防御性归为 unknown，绝不猜测', () => {
    expect(deriveAgentDisplayState({ runStatuses: ['mystery'] })).toBe('unknown');
    expect(deriveAgentDisplayState({ runStatuses: ['completed', 'weird'] })).toBe('unknown');
  });

  it('issue.status 词汇表保留源值（blocked 是议题状态，不等于 Agent 阻塞）', () => {
    expect(isIssueStatus('blocked')).toBe(true);
    expect(isIssueStatus('in_progress')).toBe(true);
    expect(isIssueStatus('wat')).toBe(false);
    expect(isRunStatus('running')).toBe(true);
    expect(isRunStatus('paused')).toBe(false);
  });
});

describe('新鲜度边界（T10：恰在阈值前/上/后）', () => {
  const iso = (ms: number) => new Date(ms).toISOString();

  it('age < stale → fresh；stale <= age < expire → stale；age >= expire → expired', () => {
    expect(evaluateFreshness({ sourceUpdatedAt: iso(T0) }, T0 + 9_999, THRESHOLDS).status).toBe('fresh');
    expect(evaluateFreshness({ sourceUpdatedAt: iso(T0) }, T0 + 10_000, THRESHOLDS).status).toBe('stale');
    expect(evaluateFreshness({ sourceUpdatedAt: iso(T0) }, T0 + 29_999, THRESHOLDS).status).toBe('stale');
    expect(evaluateFreshness({ sourceUpdatedAt: iso(T0) }, T0 + 30_000, THRESHOLDS).status).toBe('expired');
  });

  it('无法解析的时间按过期处理（不伪装实时）', () => {
    const result = evaluateFreshness({ sourceUpdatedAt: 'not-a-date' }, T0, THRESHOLDS);
    expect(result.status).toBe('expired');
    expect(Number.isFinite(result.ageMs)).toBe(false);
  });
});

describe('增量判定 classifyUpdate（T06：旧事件不覆盖新版本）', () => {
  const full = (version: number): SnapshotUpdate => ({ kind: 'full', snapshot: snapshotWithVersion(version) });
  const snapshotWithVersion = (version: number): WorkspaceSnapshot => ({
    ...snapshotWith(new Date(T0).toISOString()),
    snapshotVersion: version,
  });
  const delta = (base: number, version: number, sequence: number): SnapshotUpdate => ({
    kind: 'delta',
    delta: {
      contractVersion: CONTRACT_VERSION,
      baseSnapshotVersion: base,
      snapshotVersion: version,
      sequence,
      capturedAt: new Date(T0).toISOString(),
      sourceUpdatedAt: new Date(T0).toISOString(),
      freshness: 'fresh',
      dataSource: { kind: 'mock', generator: 'test', note: '单测构造' },
      upserts: {},
      removals: {},
    },
  });

  it('full：版本不新旧于当前 → apply；旧 → ignore-stale', () => {
    expect(classifyUpdate({ snapshotVersion: 1, lastSequence: 1 }, full(2))).toEqual({ action: 'apply' });
    expect(classifyUpdate({ snapshotVersion: 2, lastSequence: 2 }, full(2))).toEqual({ action: 'apply' });
    expect(classifyUpdate({ snapshotVersion: 3, lastSequence: 3 }, full(2))).toEqual({ action: 'ignore-stale' });
  });

  it('delta：版本与顺序衔接 → apply；顺序空洞 → needs-recovery', () => {
    expect(classifyUpdate({ snapshotVersion: 2, lastSequence: 2 }, delta(2, 3, 3))).toEqual({ action: 'apply' });
    expect(classifyUpdate({ snapshotVersion: 2, lastSequence: 2 }, delta(2, 3, 5))).toEqual({
      action: 'needs-recovery',
    });
  });

  it('delta：base 跳变（中间有缺口）→ needs-recovery', () => {
    expect(classifyUpdate({ snapshotVersion: 2, lastSequence: 2 }, delta(5, 6, 6))).toEqual({
      action: 'needs-recovery',
    });
  });

  it('delta：迟到但顺序衔接 → apply；迟到且顺序断层 → ignore-stale（不回退）', () => {
    expect(classifyUpdate({ snapshotVersion: 3, lastSequence: 3 }, delta(2, 3, 4))).toEqual({ action: 'apply' });
    expect(classifyUpdate({ snapshotVersion: 3, lastSequence: 3 }, delta(2, 3, 9))).toEqual({
      action: 'ignore-stale',
    });
  });
});

describe('更新应用 applyDelta / applyFull', () => {
  const base = snapshotWith(new Date(T0).toISOString());
  const applied: AppliedState = applyFull({ snapshot: base, lastSequence: 0 }, base);

  it('upsert 新对象 / removal 移除对象；后写覆盖前写', () => {
    const agent = mockAgent('mock-agent-99', '示例甲');
    const delta: DeltaBody = {
      contractVersion: CONTRACT_VERSION,
      baseSnapshotVersion: 1,
      snapshotVersion: 2,
      sequence: 2,
      capturedAt: new Date(T0).toISOString(),
      sourceUpdatedAt: new Date(T0).toISOString(),
      freshness: 'fresh',
      dataSource: { kind: 'mock', generator: 'test', note: '单测构造' },
      upserts: { agents: [agent] },
      removals: {},
    };
    const next = applyDelta(applied, delta);
    expect(next.snapshot.agents.some((a) => a.id === 'mock-agent-99')).toBe(true);
    expect(next.lastSequence).toBe(2);

    const remove: DeltaBody = { ...delta, upserts: {}, removals: { agentIds: ['mock-agent-99'] } };
    const after = applyDelta(next, remove);
    expect(after.snapshot.agents.some((a) => a.id === 'mock-agent-99')).toBe(false);
  });

  it('移除对象时防御性剪除悬空边（权限撤销不残留指向不可见对象的边）', () => {
    const agentId = asAgentId('mock-agent-01');
    const squadId = asSquadId('mock-squad-01');
    const membershipId = membershipEdgeId(squadId, agentId);
    const edge = base.edges.find((e) => e.id === membershipId);
    expect(edge).toBeDefined();
    const delta: DeltaBody = {
      contractVersion: CONTRACT_VERSION,
      baseSnapshotVersion: 1,
      snapshotVersion: 2,
      sequence: 2,
      capturedAt: new Date(T0).toISOString(),
      sourceUpdatedAt: new Date(T0).toISOString(),
      freshness: 'fresh',
      dataSource: { kind: 'mock', generator: 'test', note: '单测构造' },
      upserts: {},
      removals: { agentIds: [String(agentId)] },
    };
    const next = applyDelta(applied, delta);
    expect(next.snapshot.agents.some((a) => a.id === agentId)).toBe(false);
    expect(next.snapshot.edges.some((e) => e.id === membershipId)).toBe(false);
  });

  it('applyFull 也会剪除悬空边', () => {
    // 注意：这里刻意「只加边、不加 Agent」——端点不存在才是真正的悬空边
    const broken: WorkspaceSnapshot = {
      ...base,
      edges: [
        ...base.edges,
        {
          id: membershipEdgeId(asSquadId('mock-squad-01'), asAgentId('mock-agent-lonely')),
          kind: 'membership',
          squadId: asSquadId('mock-squad-01'),
          agentId: asAgentId('mock-agent-lonely'),
          source: { system: 'multica', objectType: 'squad' },
          visibility: { level: 'full' },
        },
      ],
    };
    const result = applyFull(applied, broken);
    expect(
      result.snapshot.edges.some((e) => e.kind === 'membership' && e.agentId === 'mock-agent-lonely'),
    ).toBe(false);
    expect(result.snapshot.agents.some((a) => a.id === 'mock-agent-lonely')).toBe(false);
  });
});

describe('快照不变量 validateSnapshot', () => {
  it('mock 正常场景产物通过校验', () => {
    const snapshot = MOCK_SCENARIOS.normal.build(T0);
    expect(snapshot).not.toBeNull();
    const result = validateSnapshot(snapshot!);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('重复对象 ID 不通过', () => {
    const snapshot = snapshotWith(new Date(T0).toISOString());
    const dup = { ...snapshot, agents: [...snapshot.agents, { ...snapshot.agents[0] }] };
    expect(validateSnapshot(dup).ok).toBe(false);
  });

  it('悬空边不通过（不可见对象不得以边泄露存在性）', () => {
    const snapshot = snapshotWith(new Date(T0).toISOString());
    const ghostEdge: RunAssociationEdge = {
      id: runAssociationEdgeId(asRunId('mock-run-ghost')),
      kind: 'run-association',
      runId: asRunId('mock-run-ghost'),
      issueId: asIssueId('mock-issue-01'),
      agentId: snapshot.agents[0].id,
      source: { system: 'multica', objectType: 'run' },
      visibility: { level: 'full' },
    };
    const dangling: WorkspaceSnapshot = {
      ...snapshot,
      edges: [...snapshot.edges, ghostEdge],
    };
    expect(validateSnapshot(dangling).ok).toBe(false);
  });

  it('metadata 级裁剪声明裁掉 title 却仍带值 → 判为泄露', () => {
    const snapshot = snapshotWith(new Date(T0).toISOString());
    const trimmed = {
      ...snapshot,
      issues: [
        mockIssue('mock-issue-99', '不应出现的标题', 'todo', new Date(T0).toISOString(), {
          level: 'metadata',
          trimmedFields: ['title'],
        }),
      ],
    };
    const result = validateSnapshot(trimmed);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes('泄露'))).toBe(true);
  });

  it('live 数据入口当前不被接受（ADR-01 能力缺口）', () => {
    const snapshot = snapshotWith(new Date(T0).toISOString());
    const live = { ...snapshot, dataSource: { kind: 'live' as const } };
    expect(validateSnapshot(live).ok).toBe(false);
  });
});

describe('场景模型投影 buildSceneModel（两视图共用）', () => {
  it('Agent 展示状态仅从 run 派生，issue.status 不参与', () => {
    const snapshot = snapshotWith(new Date(T0).toISOString());
    const model = buildSceneModel(snapshot);
    const blockedIssue = snapshot.issues.find((i) => i.status === 'blocked');
    expect(blockedIssue).toBeDefined();
    // 存在 blocked 议题，但任何 Agent 都不应因此出现「阻塞」展示状态
    expect(model.counts.working + model.counts.idle + model.counts.unknown).toBe(model.agents.length);
    for (const agent of model.agents) {
      expect(['working', 'idle', 'unknown']).toContain(agent.displayState);
    }
  });

  it('同一快照两次投影结果一致（确定性）', () => {
    const snapshot = snapshotWith(new Date(T0).toISOString());
    const a = buildSceneModel(snapshot);
    const b = buildSceneModel(snapshot);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('空快照投影为空且计数为零（空态）', () => {
    const empty = snapshotWith(new Date(T0).toISOString());
    const model = buildSceneModel({
      ...empty,
      agents: [],
      squads: [],
      issues: [],
      runs: [],
      edges: [],
    });
    expect(model.agents).toEqual([]);
    expect(model.counts).toEqual({ working: 0, idle: 0, unknown: 0 });
  });
});

describe('mock 场景矩阵契约自检', () => {
  const ids = Object.keys(MOCK_SCENARIOS) as MockScenarioId[];
  for (const id of ids) {
    it(`场景「${MOCK_SCENARIOS[id].label}」产物通过 validateSnapshot 且标记 mock`, () => {
      const snapshot = MOCK_SCENARIOS[id].build(T0);
      if (!snapshot) return; // loading 场景本身不下发快照
      expect(snapshot.dataSource.kind).toBe('mock');
      expect(snapshot.contractVersion).toBe(CONTRACT_VERSION);
      const result = validateSnapshot(snapshot);
      if (!result.ok) console.error(id, result.issues);
      expect(result.ok).toBe(true);
    });
  }

  it('演示阈值是显式的非批准值', () => {
    expect(DEMO_THRESHOLDS.staleAfterMs).toBeLessThan(DEMO_THRESHOLDS.expireAfterMs);
  });
});
