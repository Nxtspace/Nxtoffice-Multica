/**
 * SnapshotChannel：共享层与传输层之间的接口。
 *
 * mock 通道（src/mock/channel.ts）与未来的正式服务端授权适配器（M2）
 * 实现同一接口——视图与 store 只面向本接口编程，替换数据源不动视图。
 *
 * 事件顺序约定：
 * - connect() 后先发 connection('connecting'|'connected')，再发 update；
 * - 断线：connection('disconnected')，此后不再有 update，直到恢复；
 * - requestRecovery() 的响应是若干 update（补齐的 delta 序列，或一份 full）。
 */

import type { ObjectRef } from './ids';
import type { DetailResult } from './detail';
import type { RecoveryRequest, SnapshotUpdate } from './updates';

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export type ChannelEvent =
  | { readonly type: 'connection'; readonly state: ConnectionState }
  | { readonly type: 'update'; readonly update: SnapshotUpdate }
  | { readonly type: 'error'; readonly message: string };

export interface SnapshotChannel {
  /** 'mock' 仅限隔离开发；'live' 须待平台正式入口验证后启用 */
  readonly kind: 'mock' | 'live';

  /** 建立连接（幂等；重连也走这里或 requestRecovery） */
  connect(): void;

  /** 主动断开 */
  disconnect(): void;

  /**
   * 断线恢复：向通道索取 fromSnapshotVersion 之后的缺口。
   * 通道自行决定策略——重放缺口内增量（补齐）或直接下发全量快照
   * （ADR-01：断线重连先补齐或全量重取；策略归服务端/通道）。
   */
  requestRecovery(request: RecoveryRequest): void;

  /** 客户端主动请求全量重取 */
  requestFullRefetch(): void;

  /** 详情按单对象重新鉴权（每次请求都重新判定，不用列表可见性兜底） */
  fetchDetail(ref: ObjectRef): Promise<DetailResult>;

  /** 订阅事件；返回取消订阅函数 */
  subscribe(listener: (event: ChannelEvent) => void): () => void;

  /** 释放资源（监听器、定时器等） */
  dispose(): void;
}
