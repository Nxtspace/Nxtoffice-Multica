/**
 * 快照不变量校验：契约层的守门员。
 *
 * 供三方复用：mock 生成器自检（每个场景产物必须通过）、未来的正式适配器
 * 契约测试、以及前端联调期的防御性检查。校验失败即数据缺陷，不是可忽略告警。
 */

import type { WorkspaceSnapshot } from './envelope';
import { isIssueStatus, isRunStatus } from './state-dictionary';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

const noDuplicateIds = (items: readonly { id: string }[], path: string, out: ValidationIssue[]): void => {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) out.push({ path: `${path}[${item.id}]`, message: '重复对象 ID' });
    seen.add(item.id);
  }
};

/** 校验一份全量快照的结构不变量 */
export function validateSnapshot(snapshot: WorkspaceSnapshot): ValidationResult {
  const violations: ValidationIssue[] = [];
  const { agents, squads, issues, runs, edges } = snapshot;

  const agentIds = new Set(agents.map((a) => a.id));
  const squadIds = new Set(squads.map((s) => s.id));
  const issueIds = new Set(issues.map((i) => i.id));
  const runIds = new Set(runs.map((r) => r.id));

  noDuplicateIds(agents, 'agents', violations);
  noDuplicateIds(squads, 'squads', violations);
  noDuplicateIds(issues, 'issues', violations);
  noDuplicateIds(runs, 'runs', violations);
  noDuplicateIds(edges, 'edges', violations);

  for (const edge of edges) {
    switch (edge.kind) {
      case 'membership':
        if (!squadIds.has(edge.squadId) || !agentIds.has(edge.agentId)) {
          violations.push({ path: `edges[${edge.id}]`, message: '成员边端点不存在（不可见对象不得以边泄露）' });
        }
        break;
      case 'assignment':
        if (!issueIds.has(edge.issueId)) {
          violations.push({ path: `edges[${edge.id}]`, message: '分派边指向不存在的议题' });
        } else if (edge.target.kind === 'agent' ? !agentIds.has(edge.target.id) : !squadIds.has(edge.target.id)) {
          violations.push({ path: `edges[${edge.id}]`, message: '分派边目标不存在' });
        }
        break;
      case 'run-association':
        if (!runIds.has(edge.runId) || !issueIds.has(edge.issueId) || !agentIds.has(edge.agentId)) {
          violations.push({ path: `edges[${edge.id}]`, message: '运行关联边端点不存在' });
        }
        break;
    }
  }

  for (const run of runs) {
    if (!issueIds.has(run.issueId)) violations.push({ path: `runs[${run.id}]`, message: 'run 指向不存在的议题' });
    if (!agentIds.has(run.agentId)) violations.push({ path: `runs[${run.id}]`, message: 'run 指向不存在的 agent' });
    if (!isRunStatus(run.status)) {
      violations.push({ path: `runs[${run.id}]`, message: `未知 run.status：「${String(run.status)}」（词汇表待平台契约确认）` });
    }
  }

  for (const issue of issues) {
    if (!isIssueStatus(issue.status)) {
      violations.push({ path: `issues[${issue.id}]`, message: `未知 issue.status：「${String(issue.status)}」` });
    }
    // metadata 级裁剪：被裁字段不得出现（防适配器 accidentally 泄露）
    if (issue.visibility.level === 'metadata' && issue.visibility.trimmedFields?.includes('title') && issue.title != null) {
      violations.push({ path: `issues[${issue.id}]`, message: 'title 已声明裁剪却仍出现（泄露）' });
    }
  }

  if (snapshot.contractVersion !== 'v0') {
    violations.push({ path: 'contractVersion', message: `不支持的契约版本：${snapshot.contractVersion}` });
  }
  if (snapshot.dataSource.kind === 'live') {
    violations.push({ path: 'dataSource', message: 'live 数据入口尚未验证（ADR-01 能力缺口），当前只允许 mock' });
  }

  return { ok: violations.length === 0, issues: violations };
}
