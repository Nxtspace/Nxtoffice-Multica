import { useSyncExternalStore } from 'react';
import type { SceneModel, SnapshotStore, StoreState, WorkspaceSnapshot } from '../contract';
import { buildSceneModel } from '../contract';

/** 订阅 store（React 外部状态的唯一桥接） */
export function useStoreState(store: SnapshotStore): StoreState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** 从快照派生场景模型（两视图共用；useMemo 由调用方保证） */
export function toSceneModel(snapshot: WorkspaceSnapshot): SceneModel {
  return buildSceneModel(snapshot);
}
