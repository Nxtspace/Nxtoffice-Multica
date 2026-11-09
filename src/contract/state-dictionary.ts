/**
 * 状态字典（ADR-01 统一视图契约 v0 的核心共享语义之一）。
 *
 * 两条铁律（ADR-01 原文语义）：
 * 1. `issue.status`、`run.status` 是**源状态，原样保留**——两视图与详情
 *    展示源值，不做语义改写。
 * 2. 角色的「工作中 / 空闲 / 未知」**仅是派生展示状态**，由本模块（共享层）
 *    唯一实现；2D/3D 只消费结果。且**不能把议题阻塞等同于 Agent 阻塞**——
 *    Agent 展示状态只从 run 数据派生，与 issue.status 无关。
 *
 * 本文件是状态字典的唯一实现处；2D/3D 视图与详情不得各自另写一套推导。
 */

/**
 * Multica `issue.status` 词汇表。
 * 已验证：2026-11-06 经 multica CLI 实测（issue list / issue status 命令文档）。
 */
export const ISSUE_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const isIssueStatus = (v: unknown): v is IssueStatus =>
  typeof v === 'string' && (ISSUE_STATUSES as readonly string[]).includes(v);

/**
 * Multica `run.status` 词汇表。
 * 已验证：running / completed（2026-11-06 经 multica issue runs 实测）。
 * failed / cancelled 为依 attempt/max_attempts/error 字段做出的合理推断，
 * **待平台正式契约确认**（ADR-01 能力缺口 ①）；未知值按防御路径处理（见下）。
 */
export const RUN_STATUSES = ['running', 'completed', 'failed', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const isRunStatus = (v: unknown): v is RunStatus =>
  typeof v === 'string' && (RUN_STATUSES as readonly string[]).includes(v);

/**
 * Agent 派生展示状态（ADR-01：仅作派生展示状态，非源数据）。
 *
 * - working：该 Agent 存在 status = 'running' 的 run 关联。
 * - idle：快照内该 Agent 无 running run（快照即捕获时刻的完整集）。
 * - unknown：输入缺失或无法识别（run.status 未知值、关联数据不完整），
 *   防御性归为未知，绝不猜测。
 */
export type AgentDisplayState = 'working' | 'idle' | 'unknown';

/**
 * issue.status 的展示元数据（占位口径，待 UI 设计师状态字典定稿后替换文案）。
 * closed 类别供两视图做统一步进/收敛动画判断，不改变源状态本身。
 */
export interface IssueStatusMeta {
  readonly label: string;
  readonly closed: boolean;
}

export const ISSUE_STATUS_META: Readonly<Record<IssueStatus, IssueStatusMeta>> = {
  backlog: { label: '积压', closed: false },
  todo: { label: '待办', closed: false },
  in_progress: { label: '进行中', closed: false },
  in_review: { label: '评审中', closed: false },
  blocked: { label: '阻塞', closed: false },
  done: { label: '已完成', closed: true },
  cancelled: { label: '已取消', closed: true },
};

/** run.status 的展示元数据（占位口径，同上） */
export const RUN_STATUS_META: Readonly<Record<RunStatus, { label: string }>> = {
  running: { label: '运行中' },
  completed: { label: '已完成' },
  failed: { label: '失败' },
  cancelled: { label: '已取消' },
};

/**
 * 派生 Agent 展示状态所需的最小输入（由快照选择器从 WorkspaceSnapshot 提取）。
 * 显式收窄输入而不是直接传整个快照，保证该推导可独立单测。
 */
export interface AgentRunInputs {
  /** 该 Agent 的全部 run 状态（含历史）；无 run 即空数组 */
  readonly runStatuses: readonly unknown[];
}

/**
 * 唯一的 Agent 展示状态推导（共享层实现）。
 *
 * 规则：
 * - 任一 run.status === 'running' → 'working'
 * - run.status 存在无法识别的值 → 'unknown'（防御：不猜）
 * - 其余（含无 run）→ 'idle'
 *
 * 注意：本推导与 issue.status 完全无关——issue 阻塞不代表 Agent 阻塞（ADR-01）。
 */
export function deriveAgentDisplayState(inputs: AgentRunInputs): AgentDisplayState {
  let sawUnrecognized = false;
  for (const status of inputs.runStatuses) {
    if (status === 'running') return 'working';
    if (!isRunStatus(status)) sawUnrecognized = true;
  }
  return sawUnrecognized ? 'unknown' : 'idle';
}
