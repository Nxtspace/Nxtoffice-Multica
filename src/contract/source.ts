/**
 * 对象来源与可见性裁剪结果（ADR-01：每个对象带稳定 ID、来源和可见性裁剪结果）。
 */

/**
 * 对象来源系统。v0 只有 Multica 平台一个来源；保留联合类型而非字面量 'multica'，
 * 是为了让未来多来源聚合（若有）以加法演进，不破坏既有判别。
 */
export type SourceSystem = 'multica';

/** 来源引用：记录对象来自哪个系统、在源侧的类型标识 */
export interface SourceRef {
  readonly system: SourceSystem;
  /** 源侧对象类型（'agent' | 'squad' | 'issue' | 'run' | 'project'） */
  readonly objectType: string;
}

/**
 * 可见性裁剪结果（ADR-01 权限边界）。
 *
 * 由服务端授权适配器按最终用户身份逐项目、逐对象判定后随对象下发；
 * 前端只消费该结果做展示投影，**不做任何权限判断**（权限判断属于服务端）。
 *
 * - 'full'：业务字段完整可见。
 * - 'metadata'：对象存在性对当前用户可见，但部分业务字段被裁剪
 *   （被裁字段名列于 trimmedFields，字段值不出现在快照中，不泄露内容）。
 * - **不存在 'none' 这一档**：对当前用户完全不可见的对象不会出现在快照里——
 *   不可见对象不能以轮廓、占位或数量泄露（关联边同理，见 edges.ts）。
 */
export type VisibilityLevel = 'full' | 'metadata';

export interface VisibilityTrim {
  readonly level: VisibilityLevel;
  /**
   * level = 'metadata' 时被裁剪的业务字段名（不含值）。
   * 视图对被裁字段必须显示占位（如「内容不可见」），不得推断或猜测。
   */
  readonly trimmedFields?: readonly string[];
}

/** 常用裁剪结果，避免各处字面量漂移 */
export const FULL_VISIBILITY: VisibilityTrim = { level: 'full' } as const;

export const metadataVisibility = (trimmedFields: readonly string[]): VisibilityTrim => ({
  level: 'metadata',
  trimmedFields,
});
