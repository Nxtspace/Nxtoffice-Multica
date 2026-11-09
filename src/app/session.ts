/**
 * mock 会话装配：通道 + store + 场景。切换场景时整体重建，保证不残留旧快照。
 * 正式适配器接入后，本文件只需替换通道实现（视图与 store 不变）。
 */

import { SnapshotStore } from '../contract';
import { MockChannel } from '../mock/channel';
import { DEMO_THRESHOLDS, type MockScenarioId } from '../mock/scenarios';

export interface MockSession {
  readonly scenario: MockScenarioId;
  readonly channel: MockChannel;
  readonly store: SnapshotStore;
  dispose(): void;
}

export function createMockSession(scenario: MockScenarioId): MockSession {
  const channel = new MockChannel({ scenario });
  const store = new SnapshotStore({ thresholds: DEMO_THRESHOLDS });
  store.attach(channel);
  store.startClock();
  channel.connect();
  return {
    scenario,
    channel,
    store,
    dispose() {
      store.dispose();
      channel.dispose();
    },
  };
}
