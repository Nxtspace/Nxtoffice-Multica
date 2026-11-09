/**
 * 应用外壳（占位）：装配 mock 会话 → store → 2D/3D 占位场景。
 *
 * 只做「装配与呈现许可透传」：状态字典、版本/过期/可见性判断全部来自共享层。
 * mock 场景选择器、视图切换、详情按单对象重新鉴权（含竞态取消）与本外壳的四态
 * 覆盖（加载/空/错误/正常）都在这里演示，供 2D/3D 共用。
 */

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { AgentId, AgentSceneModel, ContractObject, DetailFailure, SceneModel } from '../contract';
import { STATE_LABELS } from '../views/scene-tokens';
import { IsometricScene } from '../views/two-d';
import { useStoreState, toSceneModel } from './hooks';
import { createMockSession, type MockSession } from './session';
import { MOCK_SCENARIO_IDS, MOCK_SCENARIOS, type MockScenarioId } from '../mock/scenarios';

const OfficeScene = lazy(() => import('../views/three-d/OfficeScene'));

type ViewId = '2d' | '3d';

const CONNECTION_LABELS: Readonly<Record<string, string>> = {
  idle: '未连接',
  connecting: '连接中',
  connected: '已连接',
  disconnected: '已断开',
  reconnecting: '重连中',
};

const DATA_LABELS: Readonly<Record<string, string>> = {
  'not-connected': '未连接',
  live: '实时',
  lagging: '疑似滞后',
  expired: '已过期',
  offline: '离线',
};

const FRESHNESS_LABELS: Readonly<Record<string, string>> = {
  fresh: '新鲜',
  stale: '滞后',
  expired: '过期',
};

/** 详情面板状态（含按单对象重新鉴权的失败态） */
type DetailState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly object: ContractObject }
  | { readonly status: 'denied'; readonly failure: DetailFailure }
  | { readonly status: 'error'; readonly message: string };

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false });
}

function App() {
  const [scenarioId, setScenarioId] = useState<MockScenarioId>('normal');
  const [view, setView] = useState<ViewId>('2d');

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <span className="app-title">Multica 虚拟办公室（占位）</span>
        <label className="badge" htmlFor="scenario-select">
          场景
          <select
            id="scenario-select"
            className="app-select"
            value={scenarioId}
            onChange={(event) => setScenarioId(event.target.value as MockScenarioId)}
          >
            {MOCK_SCENARIO_IDS.map((id) => (
              <option key={id} value={id}>
                {MOCK_SCENARIOS[id].label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`app-btn${view === '2d' ? ' is-active' : ''}`}
          onClick={() => setView('2d')}
        >
          2D
        </button>
        <button
          type="button"
          className={`app-btn${view === '3d' ? ' is-active' : ''}`}
          onClick={() => setView('3d')}
        >
          3D
        </button>
        <span className="app-spacer" />
      </header>
      <WorkspaceStage key={scenarioId} scenarioId={scenarioId} view={view} />
    </div>
  );
}

/** 按场景整体重建会话（切换场景不残留旧快照；key 变化即销毁旧会话） */
function WorkspaceStage({ scenarioId, view }: { readonly scenarioId: MockScenarioId; readonly view: ViewId }) {
  const [session] = useState<MockSession>(() => createMockSession(scenarioId));
  const { snapshot, presentation } = useStoreState(session.store);
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null);
  const [detail, setDetail] = useState<DetailState>({ status: 'idle' });

  const model: SceneModel | null = useMemo(() => (snapshot ? toSceneModel(snapshot) : null), [snapshot]);

  // 详情按单对象重新鉴权：每次选择都重新请求，切走立即取消（竞态不残留）
  useEffect(() => {
    if (!selectedAgentId) {
      setDetail({ status: 'idle' });
      return;
    }
    setDetail({ status: 'loading' });
    let cancelled = false;
    session.channel
      .fetchDetail({ kind: 'agent', id: selectedAgentId })
      .then((result) => {
        if (cancelled) return;
        setDetail(
          result.ok
            ? { status: 'ok', object: result.object }
            : { status: 'denied', failure: result.failure },
        );
      })
      .catch(() => {
        if (!cancelled) setDetail({ status: 'error', message: '详情请求失败（mock 通道不应到达）' });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAgentId, session]);

  useEffect(() => () => session.dispose(), [session]);

  const showLoading = !snapshot && presentation.loadError == null && presentation.connection !== 'disconnected';
  const showError = presentation.loadError != null;
  const showEmpty = model != null && model.agents.length === 0;
  const frozenBanner =
    presentation.dataLabel === 'offline' || presentation.dataLabel === 'expired'
      ? `已冻结：${presentation.dataLabel === 'offline' ? '连接中断' : '数据过期'}，展示最后已知快照（最后更新 ${formatTime(presentation.lastUpdatedAt)}）`
      : null;

  const selectedAgent = model?.agents.find((a) => a.agent.id === selectedAgentId) ?? null;

  return (
    <>
      <div className="app-topbar app-topbar-status">
        <span className={`badge conn-${presentation.connection}`}>
          {CONNECTION_LABELS[presentation.connection] ?? presentation.connection}
        </span>
        <span className={`badge state-${presentation.dataLabel}`}>
          数据：{DATA_LABELS[presentation.dataLabel] ?? presentation.dataLabel}
        </span>
        {presentation.freshness && (
          <span className="badge">新鲜度：{FRESHNESS_LABELS[presentation.freshness.status] ?? presentation.freshness.status}</span>
        )}
        <span className="badge">快照版本 v{snapshot?.snapshotVersion ?? '—'}</span>
        <span className="badge">最后更新 {formatTime(presentation.lastUpdatedAt)}</span>
        {model && (
          <span className="counts">
            <span>
              工作 <b>{model.counts.working}</b>
            </span>
            <span>
              空闲 <b>{model.counts.idle}</b>
            </span>
            <span>
              未知 <b>{model.counts.unknown}</b>
            </span>
          </span>
        )}
        {presentation.mock && <span className="badge mock">MOCK · 隔离开发数据，不得用于验收</span>}
        <span className="app-spacer" />
        <span className="badge">{MOCK_SCENARIOS[scenarioId].description}</span>
      </div>
      <div className="app-main">
        <div className="app-stage">
          {frozenBanner && <div className="freeze-banner">{frozenBanner}</div>}
          {model && view === '2d' && (
            <IsometricScene model={model} frozen={presentation.animationsFrozen} onSelect={setSelectedAgentId} />
          )}
          {model && view === '3d' && (
            <Suspense fallback={<div className="scene-suspense">正在加载 3D 场景…</div>}>
              <OfficeScene model={model} frozen={presentation.animationsFrozen} onSelect={setSelectedAgentId} />
            </Suspense>
          )}
          {showLoading && (
            <div className="overlay" data-testid="overlay-loading">
              <h2>正在加载</h2>
              <p>等待快照下发…（mock 场景：{MOCK_SCENARIOS[scenarioId].label}）</p>
            </div>
          )}
          {showError && (
            <div className="overlay" data-testid="overlay-error">
              <h2>加载失败</h2>
              <p>{presentation.loadError}</p>
              <button type="button" className="app-btn" onClick={() => session.store.requestFullRefetch()}>
                重试
              </button>
            </div>
          )}
          {showEmpty && (
            <div className="overlay" data-testid="overlay-empty">
              <h2>暂无可见内容</h2>
              <p>当前项目内没有可见的 Agent / 小队 / 议题（首次使用或权限范围内为空）。</p>
            </div>
          )}
        </div>
        <aside className="app-aside" data-testid="detail-panel">
          <h3>详情（按单对象重新鉴权）</h3>
          <DetailContent detail={detail} selectedAgent={selectedAgent} />
        </aside>
      </div>
    </>
  );
}

function DetailContent({
  detail,
  selectedAgent,
}: {
  readonly detail: DetailState;
  readonly selectedAgent: AgentSceneModel | null;
}) {
  if (detail.status === 'idle') {
    return <p className="detail-empty">在场景中点选一名 Agent 查看详情。</p>;
  }
  if (detail.status === 'loading') {
    return <p className="detail-loading">正在重新鉴权并请求详情…</p>;
  }
  if (detail.status === 'error') {
    return (
      <div>
        <p className="detail-denied">请求失败</p>
        <div className="detail-note">{detail.message}</div>
      </div>
    );
  }
  if (detail.status === 'denied') {
    const failure = detail.failure;
    return (
      <div>
        <p className="detail-denied">
          {failure.code} · {failure.reason === 'permission-denied' ? '无权访问' : '对象不存在或不可见'}
        </p>
        <div className="detail-note">{failure.message}</div>
        <div className="detail-note">
          列表可见性 ≠ 详情可见性：详情每次请求都按对象重新鉴权；对无权对象不泄露内容。
        </div>
      </div>
    );
  }

  const object = detail.object;
  const rows: Array<[string, string]> = [
    ['对象类型', object.source.objectType],
    ['对象 ID', object.id],
    ['可见性', object.visibility.level === 'full' ? '完整可见' : '仅元数据'],
  ];
  if (object.visibility.level === 'metadata') {
    rows.push(['被裁字段', (object.visibility.trimmedFields ?? []).join('、') || '（未列明）']);
  }
  if ('name' in object && object.name != null) rows.push(['名称', object.name]);
  if ('title' in object && object.title != null) rows.push(['标题', object.title]);
  if ('status' in object) rows.push(['源状态', String(object.status)]);
  if ('updatedAt' in object && object.updatedAt != null) rows.push(['源更新时间', formatTime(object.updatedAt)]);
  if (selectedAgent) {
    rows.push(['展示状态', STATE_LABELS[selectedAgent.displayState]]);
    if (selectedAgent.activeIssueIds.length > 0) rows.push(['运行中议题', String(selectedAgent.activeIssueIds.length)]);
    if (selectedAgent.assignedIssueIds.length > 0) rows.push(['已分派议题', String(selectedAgent.assignedIssueIds.length)]);
    if (selectedAgent.squadIds.length > 0) rows.push(['所属小队', String(selectedAgent.squadIds.length)]);
  }

  return (
    <div>
      {rows.map(([key, value]) => (
        <div className="detail-row" key={key}>
          <span className="key">{key}</span>
          <span className="value">{value}</span>
        </div>
      ))}
      <div className="detail-note">状态由共享层从 run 数据派生；issue.status 原样保留，不参与 Agent 展示状态。</div>
    </div>
  );
}

export default App;
