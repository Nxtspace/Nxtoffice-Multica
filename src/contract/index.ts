/**
 * 共享契约层（ADR-01 v0）—— 2D/3D 唯一的语义来源。
 *
 * 依赖方向：views → contract，contract 不依赖任何视图/框架代码。
 * 状态字典、版本/过期判断、可见性裁剪结果、增量与重连语义只在本层实现。
 */

export * from './ids';
export * from './source';
export * from './state-dictionary';
export * from './objects';
export * from './edges';
export * from './envelope';
export * from './freshness';
export * from './updates';
export * from './apply';
export * from './validate';
export * from './detail';
export * from './channel';
export * from './store';
export * from './selectors';
