/**
 * 3D 占位场景（React Three Fiber，按 ADR-02）。
 *
 * 职责边界与 2D 相同：只做布局、绘制、命中与动效；
 * 状态、可见性、版本判断全部来自共享层（消费同一 SceneModel）。
 * 资源治理：声明式 R3F，卸载由 R3F 负责；过期/断线时 frozen 停止浮动动效。
 * 本模块按路由懒加载（见 App.tsx），three 栈独立分包，不进入 2D 首屏。
 *
 * 标签层说明：不使用 drei <Html>（其 portal 在 React 19 卸载/重挂时会抛
 * removeChild 异常）——改为自写的投影标签层：DOM 标签平铺在 Canvas 外，
 * 由 Canvas 内的 LabelProjector 用相机投影逐帧写位置，零额外依赖。
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentId, AgentSceneModel, SceneModel, SquadId } from '../../contract';
import { SCENE_PALETTE, STATE_COLORS, STATE_LABELS } from '../scene-tokens';
import './three-d.css';

export interface OfficeSceneProps {
  readonly model: SceneModel;
  /** 冻结「正在工作」动效（过期/断线） */
  readonly frozen: boolean;
  readonly onSelect: (id: AgentId) => void;
}

interface Placement {
  readonly position: [number, number, number];
  readonly zoneIndex: number;
}

interface LabelAnchor {
  readonly key: string;
  readonly position: [number, number, number];
}

/** 世界坐标布局：小队沿 z 轴分区，Agent 在分区内 3 列网格 */
function layoutAgents(model: SceneModel) {
  type Zone = { id: SquadId | null; name: string | null | undefined };
  const zones: Zone[] = model.squads.map((squad) => ({ id: squad.id, name: squad.name }));
  if (zones.length === 0) zones.push({ id: null, name: '未分组' });
  const bySquad = new Map<string, AgentSceneModel[]>();
  for (const zone of zones) bySquad.set(String(zone.id), []);
  const ungrouped: AgentSceneModel[] = [];
  for (const agent of model.agents) {
    const key = agent.squadIds[0] != null ? String(agent.squadIds[0]) : 'null';
    if (bySquad.has(key)) bySquad.get(key)!.push(agent);
    else ungrouped.push(agent);
  }
  if (ungrouped.length > 0 && !bySquad.has('null')) {
    zones.push({ id: null, name: '未分组' });
    bySquad.set('null', ungrouped);
  }

  const positions = new Map<string, Placement>();
  const zoneSpan = 9;
  const baseZ = -((zones.length - 1) * zoneSpan) / 2;
  zones.forEach((zone, zoneIndex) => {
    const list = bySquad.get(String(zone.id)) ?? [];
    const rows = Math.max(1, Math.ceil(list.length / 3));
    const rowSpacing = Math.min(2.2, 6.5 / rows);
    list.forEach((agent, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      positions.set(String(agent.agent.id), {
        position: [(col - 1) * 2.6, 0, baseZ + zoneIndex * zoneSpan + (row - (rows - 1) / 2) * rowSpacing],
        zoneIndex,
      });
    });
  });
  return { positions, zones, bySquad, zoneSpan, baseZ };
}

/**
 * 投影标签层：在 Canvas 内逐帧把世界坐标投影为屏幕坐标，
 * 写到 Canvas 外的平铺 DOM 标签上（相机背后的标签隐藏）。
 */
function LabelProjector({
  registry,
  anchors,
}: {
  readonly registry: React.MutableRefObject<Map<string, HTMLElement>>;
  readonly anchors: readonly LabelAnchor[];
}) {
  const { camera, size } = useThree();
  const vec = useRef(new THREE.Vector3());

  useFrame(() => {
    const halfW = size.width / 2;
    const halfH = size.height / 2;
    const v = vec.current;
    for (const anchor of anchors) {
      const el = registry.current.get(anchor.key);
      if (!el) continue;
      v.set(anchor.position[0], anchor.position[1], anchor.position[2]);
      v.project(camera);
      if (v.z > 1) {
        el.style.opacity = '0';
        continue;
      }
      el.style.opacity = '1';
      el.style.transform = `translate(-50%, -50%) translate(${(v.x * halfW + halfW).toFixed(1)}px, ${(-v.y * halfH + halfH).toFixed(1)}px)`;
    }
  });
  return null;
}

function AgentToken({
  agent,
  placement,
  frozen,
  onSelect,
}: {
  readonly agent: AgentSceneModel;
  readonly placement: Placement;
  readonly frozen: boolean;
  readonly onSelect: (id: AgentId) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.Mesh>(null);
  const color = STATE_COLORS[agent.displayState];
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame((state) => {
    const group = groupRef.current;
    const light = lightRef.current;
    if (!group || !light) return;
    if (agent.displayState !== 'working' || frozen) {
      group.position.y = 0;
      light.scale.setScalar(1);
      return;
    }
    const t = state.clock.elapsedTime + phase;
    group.position.y = 0.12 * (0.5 + 0.5 * Math.sin(t * 2));
    light.scale.setScalar(1 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3)));
  });

  const select = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(agent.agent.id);
  };

  return (
    <group
      ref={groupRef}
      position={placement.position}
      onClick={select}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.62, 0.1, 24]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[0.9, 1.2, 0.9]} />
        <meshStandardMaterial color={SCENE_PALETTE.token} />
      </mesh>
      <mesh position={[0, 1.48, 0]} castShadow>
        <sphereGeometry args={[0.3, 24, 24]} />
        <meshStandardMaterial color={SCENE_PALETTE.token} />
      </mesh>
      <mesh ref={lightRef} position={[0, 1.86, 0]}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

export default function OfficeScene({ model, frozen, onSelect }: OfficeSceneProps) {
  const { positions, zones, bySquad, zoneSpan, baseZ } = useMemo(() => layoutAgents(model), [model]);
  const labelEls = useRef<Map<string, HTMLElement>>(new Map());

  const anchors: LabelAnchor[] = useMemo(() => {
    const list: LabelAnchor[] = [];
    for (const agent of model.agents) {
      const placement = positions.get(String(agent.agent.id));
      if (!placement) continue;
      list.push({
        key: `label-agent:${agent.agent.id}`,
        position: [placement.position[0], placement.position[1] + 2.35, placement.position[2]],
      });
    }
    zones.forEach((zone, index) => {
      list.push({
        key: `label-zone:${zone.id ?? 'ungrouped'}:${index}`,
        position: [-3.9, 0.3, baseZ + index * zoneSpan - 3.7],
      });
    });
    return list;
  }, [model, positions, zones, zoneSpan, baseZ]);

  const setLabelEl = (key: string) => (el: HTMLElement | null) => {
    if (el) labelEls.current.set(key, el);
    else labelEls.current.delete(key);
  };

  return (
    <div className="scene-host scene-3d" data-testid="scene-3d">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [10, 10, 13], fov: 42 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[SCENE_PALETTE.background]} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[6, 12, 8]} intensity={0.9} castShadow />
        <directionalLight position={[-8, 6, -6]} intensity={0.25} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
          <planeGeometry args={[48, 48]} />
          <meshStandardMaterial color={SCENE_PALETTE.floor} />
        </mesh>
        <gridHelper args={[48, 48, SCENE_PALETTE.floorEdge, SCENE_PALETTE.floorAlt]} position={[0, -0.19, 0]} />

        {zones.map((zone, index) => (
          <group key={`zone3d:${zone.id ?? 'ungrouped'}:${index}`}>
            <mesh position={[0, -0.08, baseZ + index * zoneSpan]} receiveShadow>
              <boxGeometry args={[8.4, 0.12, 8]} />
              <meshStandardMaterial
                color={index % 2 === 0 ? SCENE_PALETTE.floor : SCENE_PALETTE.floorAlt}
              />
            </mesh>
          </group>
        ))}

        {model.agents.map((agent) => {
          const placement = positions.get(String(agent.agent.id));
          if (!placement) return null;
          return (
            <AgentToken
              key={`agent3d:${agent.agent.id}`}
              agent={agent}
              placement={placement}
              frozen={frozen}
              onSelect={onSelect}
            />
          );
        })}

        <LabelProjector registry={labelEls} anchors={anchors} />
        <OrbitControls makeDefault enablePan minDistance={6} maxDistance={30} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>

      {/* 标签层：平铺 DOM，位置由 LabelProjector 逐帧写入；不拦截指针 */}
      <div className="scene3d-labels" aria-hidden="true">
        {zones.map((zone, index) => {
          const list = bySquad.get(String(zone.id)) ?? [];
          return (
            <div
              key={`label-zone:${zone.id ?? 'ungrouped'}:${index}`}
              ref={setLabelEl(`label-zone:${zone.id ?? 'ungrouped'}:${index}`)}
              className="zone3d-label"
            >
              {zone.name ?? '未分组'} · {list.length} 名
            </div>
          );
        })}
        {model.agents.map((agent) => {
          const placement = positions.get(String(agent.agent.id));
          if (!placement) return null;
          const color = STATE_COLORS[agent.displayState];
          const name = agent.agent.name ?? '字段不可见';
          const label = STATE_LABELS[agent.displayState];
          return (
            <div
              key={`label-agent:${agent.agent.id}`}
              ref={setLabelEl(`label-agent:${agent.agent.id}`)}
              className={`agent3d-label${agent.agent.visibility.level === 'metadata' ? ' is-metadata' : ''}`}
            >
              <span className="agent3d-name">{name}</span>
              <span className="agent3d-state" style={{ color: `#${color.toString(16).padStart(6, '0')}` }}>
                {label}
                {agent.agent.visibility.level === 'metadata' ? '（仅元数据）' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
