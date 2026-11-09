/**
 * 场景视觉 token（占位值，待 UI 设计师状态字典/设计系统定稿后替换）。
 * 2D/3D 共用同一组状态色，保证两视图对同一快照的观感一致。
 */

import type { AgentDisplayState, IssueStatus } from '../contract';

export const STATE_COLORS: Readonly<Record<AgentDisplayState, number>> = {
  working: 0x4ade80,
  idle: 0x94a3b8,
  unknown: 0xfbbf24,
};

export const STATE_LABELS: Readonly<Record<AgentDisplayState, string>> = {
  working: '工作中',
  idle: '空闲',
  unknown: '未知',
};

/** 议题状态色（与状态字典对齐；仅占位） */
export const ISSUE_COLORS: Readonly<Record<IssueStatus, number>> = {
  backlog: 0x64748b,
  todo: 0x60a5fa,
  in_progress: 0x22d3ee,
  in_review: 0xa78bfa,
  blocked: 0xef4444,
  done: 0x4ade80,
  cancelled: 0x475569,
};

export const SCENE_PALETTE = {
  background: 0x0b1220,
  floor: 0x121c2e,
  floorAlt: 0x16233a,
  floorEdge: 0x24344f,
  token: 0x1e293b,
  text: 0xe2e8f0,
  textMuted: 0x94a3b8,
} as const;
