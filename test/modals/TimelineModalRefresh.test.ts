import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  const merged: any = { ...actual };
  class Modal {
    modalEl = { addClass() {}, removeClass() {} };
    contentEl = { empty() {}, addClass() {}, createDiv: () => ({}) };
    constructor(public app: any) {}
  }
  merged.Modal = Modal;
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});
vi.mock('../../src/utils/NativeTimelineRenderer', () => {
  class FakeRenderer {
    refreshCalls = 0; destroyed = false;
    constructor(public container: any, public plugin: any, public options: any) {}
    async refresh() { this.refreshCalls++; }
    destroy() { this.destroyed = true; }
  }
  return { TimelineRenderer: FakeRenderer };
});

import { TimelineModal } from '../../src/modals/TimelineModal';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function makeModal() {
  const live = new Set<any>();
  const plugin: any = {
    app: {},
    settings: { ganttDefaultDuration: 1 },
    getReferenceTodayDate: () => new Date('2026-10-09T00:00:00Z'),
    listEvents: async () => [],
    registerLiveTimeline: (surface: any) => { live.add(surface); return () => live.delete(surface); },
  };
  const modal: any = new TimelineModal({} as any, plugin, []);
  return { modal, plugin, live };
}

describe('the timeline modal follows data changes', () => {
  it('registers itself as a live timeline while open', () => {
    const { modal, live } = makeModal();
    expect(live.has(modal)).toBe(true);
  });

  it('refreshes its renderer when the plugin announces data changes', async () => {
    const { modal, plugin, live } = makeModal();
    modal.renderer = { refreshCalls: 0, refresh: vi.fn(async () => {}) };
    for (const surface of live) await surface.refreshTimeline();
    expect(modal.renderer.refresh).toHaveBeenCalledTimes(1);
    void plugin;
  });

  it('unregisters when closed', () => {
    const { modal, live } = makeModal();
    modal.onClose();
    expect(live.has(modal)).toBe(false);
  });
});
