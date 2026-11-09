/**
 * mock 场景矩阵（**仅限隔离开发，不得用于验收放行**）。
 *
 * 覆盖：加载 / 正常 / 空 / 新鲜度滞后 / 过期 / 断线（模拟）/ 请求错误 / 无权限。
 * 每个场景产出同一契约版本的 WorkspaceSnapshot，2D/3D 消费同一份数据。
 *
 * ⚠️ DEMO_THRESHOLDS 是**演示用阈值**，不是项目方批准的产品时效；
 * 正式阈值待 D-2 书面批准后由配置注入（ADR-01 要求不填假阈值）。
 */

import type { FreshnessThresholds } from '../contract';
import { CONTRACT_VERSION, type WorkspaceSnapshot, type DataSourceMarker } from '../contract';
import { MOCK_PROJECT_ID, MOCK_WORKSPACE_ID, buildNormalFixtures, buildRestrictedFixtures, type FixtureSet } from './fixtures';

/** 演示阈值（非批准值；仅让占位场景能演示 fresh/stale/expired 三态） */
export const DEMO_THRESHOLDS: FreshnessThresholds = {
  staleAfterMs: 30_000,
  expireAfterMs: 90_000,
};

export const MOCK_GENERATOR = 'nxtoffice-mock@0.1.0';

const MOCK_MARKER: DataSourceMarker = {
  kind: 'mock',
  generator: MOCK_GENERATOR,
  note: '隔离开发用 mock 数据，非真实 Multica 记录，不得用于验收放行',
};

export type MockScenarioId =
  | 'loading'
  | 'normal'
  | 'empty'
  | 'stale'
  | 'expired'
  | 'disconnected'
  | 'error'
  | 'forbidden';

/** 通道行为脚本（由 MockChannel 解释） */
export interface ChannelPlan {
  /** 首次下发快照前的延迟（演示加载态） */
  readonly initialDelayMs: number;
  /** 是否下发初始快照；false 表示一直停在加载态 */
  readonly emitInitial: boolean;
  /** 是否在连接后模拟请求错误（错误态） */
  readonly failInitial: boolean;
  /** 连接后多久模拟断线（未设置 = 不断线） */
  readonly disconnectAfterMs?: number;
  /** 是否播放「分派→运行→完成」增量脚本（演示增量与动效） */
  readonly playScriptedUpdates: boolean;
}

export interface MockScenario {
  readonly id: MockScenarioId;
  readonly label: string;
  readonly description: string;
  readonly plan: ChannelPlan;
  readonly build: (nowMs: number) => WorkspaceSnapshot | null;
}

const snapshotOf = (
  fixtures: FixtureSet,
  opts: {
    readonly nowMs: number;
    readonly sourceUpdatedAt: string;
    readonly viewer: 'full' | 'restricted';
    readonly snapshotVersion?: number;
    readonly projectName?: string;
  },
): WorkspaceSnapshot => ({
  contractVersion: CONTRACT_VERSION,
  scope: {
    workspaceId: MOCK_WORKSPACE_ID,
    project: {
      id: MOCK_PROJECT_ID,
      name: opts.projectName ?? '示例项目（mock）',
      source: { system: 'multica', objectType: 'project' },
      visibility: { level: 'full' },
    },
  },
  snapshotVersion: opts.snapshotVersion ?? 1,
  capturedAt: new Date(opts.nowMs).toISOString(),
  sourceUpdatedAt: opts.sourceUpdatedAt,
  freshness: 'fresh',
  dataSource: MOCK_MARKER,
  viewer: { scope: opts.viewer },
  agents: fixtures.agents,
  squads: fixtures.squads,
  issues: fixtures.issues,
  runs: fixtures.runs,
  edges: fixtures.edges,
});

const iso = (ms: number) => new Date(ms).toISOString();

export const MOCK_SCENARIOS: Readonly<Record<MockScenarioId, MockScenario>> = {
  loading: {
    id: 'loading',
    label: '加载中',
    description: '连接建立中，尚无任何快照（首屏加载态）。',
    plan: { initialDelayMs: 60_000, emitInitial: false, failInitial: false, playScriptedUpdates: false },
    build: () => null,
  },
  normal: {
    id: 'normal',
    label: '正常',
    description: '完整数据、新鲜快照；含 working/idle/blocked/done 组合，并播放增量脚本。',
    plan: { initialDelayMs: 300, emitInitial: true, failInitial: false, playScriptedUpdates: true },
    build: (nowMs) => snapshotOf(buildNormalFixtures(nowMs), { nowMs, sourceUpdatedAt: iso(nowMs - 2_000), viewer: 'full' }),
  },
  empty: {
    id: 'empty',
    label: '空',
    description: '项目内暂无任何 Agent / 小队 / 议题（首次使用空态）。',
    plan: { initialDelayMs: 200, emitInitial: true, failInitial: false, playScriptedUpdates: false },
    build: (nowMs) =>
      snapshotOf(
        { agents: [], squads: [], issues: [], runs: [], edges: [] },
        { nowMs, sourceUpdatedAt: iso(nowMs - 1_000), viewer: 'full' },
      ),
  },
  stale: {
    id: 'stale',
    label: '数据滞后',
    description: '源数据超过演示滞后阈值但未过期（提示可能滞后，动效不冻结）。',
    plan: { initialDelayMs: 200, emitInitial: true, failInitial: false, playScriptedUpdates: false },
    build: (nowMs) => snapshotOf(buildNormalFixtures(nowMs), { nowMs, sourceUpdatedAt: iso(nowMs - 45_000), viewer: 'full' }),
  },
  expired: {
    id: 'expired',
    label: '数据过期',
    description: '源数据超过演示过期阈值：冻结「正在工作」动效并显示最后更新时间。',
    plan: { initialDelayMs: 200, emitInitial: true, failInitial: false, playScriptedUpdates: false },
    build: (nowMs) => snapshotOf(buildNormalFixtures(nowMs), { nowMs, sourceUpdatedAt: iso(nowMs - 10 * 60_000), viewer: 'full' }),
  },
  disconnected: {
    id: 'disconnected',
    label: '断线（模拟）',
    description: '先收到快照，随后模拟连接中断：保留最后快照、冻结动效、显示最后更新时间。',
    plan: {
      initialDelayMs: 200,
      emitInitial: true,
      failInitial: false,
      disconnectAfterMs: 4_000,
      playScriptedUpdates: true,
    },
    build: (nowMs) => snapshotOf(buildNormalFixtures(nowMs), { nowMs, sourceUpdatedAt: iso(nowMs - 5_000), viewer: 'full' }),
  },
  error: {
    id: 'error',
    label: '请求错误',
    description: '连接建立后快照请求失败（错误态，可重试）。',
    plan: { initialDelayMs: 400, emitInitial: false, failInitial: true, playScriptedUpdates: false },
    build: (nowMs) => snapshotOf(buildNormalFixtures(nowMs), { nowMs, sourceUpdatedAt: iso(nowMs - 2_000), viewer: 'full' }),
  },
  forbidden: {
    id: 'forbidden',
    label: '无权限（受限用户）',
    description: '受限用户视角：部分议题仅元数据可见、部分对象完全不下发（不泄露存在性）。',
    plan: { initialDelayMs: 250, emitInitial: true, failInitial: false, playScriptedUpdates: false },
    build: (nowMs) =>
      snapshotOf(buildRestrictedFixtures(nowMs), {
        nowMs,
        sourceUpdatedAt: iso(nowMs - 4_000),
        viewer: 'restricted',
      }),
  },
};

export const MOCK_SCENARIO_IDS = Object.keys(MOCK_SCENARIOS) as MockScenarioId[];

export const isMockScenarioId = (v: unknown): v is MockScenarioId =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(MOCK_SCENARIOS, v);
