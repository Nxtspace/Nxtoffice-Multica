/**
 * 2D 等距占位场景（SVG + React + CSS 动画；按 D-1 决议修订后的 ADR-02，
 * 不再使用 PixiJS。契约骨架与 mock 生成器不受 2D 引擎选择影响）。
 *
 * 职责边界：只做布局、绘制、命中与动效；状态、可见性、版本判断全部来自共享层。
 * 资源治理：纯声明式 SVG，无 canvas/定时器需释放；
 * 过期/断线时由 frozen 停止「工作中」脉冲（冻结），不伪装实时。
 */

import { useMemo } from 'react';
import type { AgentId, AgentSceneModel, SceneModel } from '../../contract';
import { SCENE_PALETTE, STATE_COLORS, STATE_LABELS } from '../scene-tokens';
import './two-d.css';

export interface IsometricSceneProps {
  readonly model: SceneModel;
  /** 冻结「正在工作」动效（过期/断线） */
  readonly frozen: boolean;
  readonly onSelect: (id: AgentId) => void;
}

const DESIGN_W = 960;
const DESIGN_H = 640;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

interface TokenPlacement {
  readonly x: number;
  readonly y: number;
  readonly squadId: string | null;
}

/** 等距坐标：按小队分区、Agent 在分区内排成 2 列网格 */
function layoutAgents(model: SceneModel) {
  const zones = model.squads.length > 0 ? model.squads : [{ id: null, name: '未分组' }];
  const bySquad = new Map<string, AgentSceneModel[]>();
  for (const zone of zones) bySquad.set(String(zone.id), []);
  const ungrouped: AgentSceneModel[] = [];
  for (const agent of model.agents) {
    const key = agent.squadIds[0] != null ? String(agent.squadIds[0]) : 'null';
    if (bySquad.has(key)) bySquad.get(key)!.push(agent);
    else ungrouped.push(agent);
  }

  const positions = new Map<string, TokenPlacement>();
  const zoneHeight = Math.max(140, Math.min(260, (DESIGN_H - 120) / Math.max(1, zones.length)));
  zones.forEach((zone, zoneIndex) => {
    const list = bySquad.get(String(zone.id)) ?? [];
    const rows = Math.max(1, Math.ceil(list.length / 2));
    const stride = Math.min(46, (zoneHeight - 78) / rows);
    const originY = 96 + zoneIndex * zoneHeight;
    list.forEach((agent, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      positions.set(String(agent.agent.id), {
        x: DESIGN_W / 2 + (col - row) * 96,
        y: originY + (col + row) * stride,
        squadId: zone.id != null ? String(zone.id) : null,
      });
    });
  });
  ungrouped.forEach((agent, index) => {
    positions.set(String(agent.agent.id), {
      x: 120 + (index % 3) * 110,
      y: 130 + Math.floor(index / 3) * 74,
      squadId: null,
    });
  });
  return { positions, zones, bySquad, zoneHeight };
}

export function IsometricScene({ model, frozen, onSelect }: IsometricSceneProps) {
  const { positions, zones, bySquad, zoneHeight } = useMemo(() => layoutAgents(model), [model]);

  return (
    <svg
      className={frozen ? 'iso-svg scene-frozen' : 'iso-svg'}
      viewBox={`0 0 ${DESIGN_W} ${DESIGN_H}`}
      data-testid="scene-2d"
      role="group"
      aria-label="虚拟办公室 2D 占位场景"
    >
      <rect
        x={0}
        y={0}
        width={DESIGN_W}
        height={DESIGN_H}
        fill={hex(SCENE_PALETTE.background)}
      />

      {/* 分区地板（等距菱形）+ 标题 */}
      {zones.map((zone, index) => {
        const cx = DESIGN_W / 2;
        const cy = 60 + index * zoneHeight + (zoneHeight - 24) / 2;
        const hw = 316;
        const hh = (zoneHeight - 24) / 2;
        const count = (bySquad.get(String(zone.id)) ?? []).length;
        return (
          <g key={`zone:${zone.id ?? 'ungrouped'}:${index}`}>
            <polygon
              className="iso-floor"
              points={`${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`}
              fill={index % 2 === 0 ? hex(SCENE_PALETTE.floor) : hex(SCENE_PALETTE.floorAlt)}
              stroke={hex(SCENE_PALETTE.floorEdge)}
              strokeWidth={1}
            />
            <text
              x={cx - hw + 16}
              y={cy - hh + 20}
              fill={hex(SCENE_PALETTE.textMuted)}
              fontSize={12}
            >
              {zone.name ?? '未分组'} · {count} 名
            </text>
          </g>
        );
      })}

      {/* Agent token：菱形站台 + 状态灯 + 名牌 */}
      {model.agents.map((agent) => {
        const pos = positions.get(String(agent.agent.id));
        if (!pos) return null;
        const color = hex(STATE_COLORS[agent.displayState]);
        const label = STATE_LABELS[agent.displayState];
        const name = (agent.agent.name ?? '字段不可见').slice(0, 12);
        const kind = agent.agent.visibility.level === 'metadata' ? '（仅元数据）' : '';
        return (
          <g
            key={`agent:${agent.agent.id}`}
            className={`agent-token${agent.displayState === 'working' ? ' working' : ''}`}
            transform={`translate(${pos.x} ${pos.y})`}
            role="button"
            tabIndex={0}
            aria-label={`${name}（${label}）${kind}`}
            onClick={() => onSelect(agent.agent.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Space') {
                event.preventDefault();
                onSelect(agent.agent.id);
              }
            }}
          >
            <ellipse cx={0} cy={18} rx={44} ry={14} fill={color} fillOpacity={0.16} />
            <ellipse cx={0} cy={20} rx={30} ry={9} fill="#000000" fillOpacity={0.35} />
            <polygon
              className="podium-top"
              points="0,-16 40,0 0,16 -40,0"
              fill={hex(SCENE_PALETTE.token)}
              stroke={color}
              strokeWidth={2}
            />
            <polygon className="podium-left" points="-40,0 0,16 0,27 -40,11" />
            <polygon className="podium-right" points="40,0 0,16 0,27 40,11" />
            <circle className="state-ring" cx={0} cy={-2} r={7} fill={color} />
            <text x={0} y={-26} textAnchor="middle" fill={hex(SCENE_PALETTE.text)} fontSize={12}>
              {name}
            </text>
            <text x={0} y={42} textAnchor="middle" fill={color} fontSize={10}>
              {label}
              {kind}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
