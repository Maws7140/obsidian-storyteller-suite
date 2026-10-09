import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  const merged: any = { ...actual };
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});

// Same contract as the real renderer: mount only if initialize() resolves while not destroyed.
vi.mock('../../src/utils/NativeTimelineRenderer', () => {
  const instances: any[] = [];
  let gate: Array<() => void> = [];
  class FakeRenderer {
    destroyed = false; destroyCalls = 0;
    constructor(public container: any, public plugin: any, public options: any) { instances.push(this); }
    initialize(): Promise<void> {
      return new Promise<void>(resolve => {
        gate.push(() => { if (!this.destroyed) this.container.current = this; resolve(); });
      });
    }
    destroy() { this.destroyed = true; this.destroyCalls++; }
    applyFilters() {} redraw() {}
  }
  return { TimelineRenderer: FakeRenderer, __instances: instances, __gate: () => gate, __reset: () => { instances.length = 0; gate = []; } };
});

import { TimelineModal } from '../../src/modals/TimelineModal';
import * as R from '../../src/utils/NativeTimelineRenderer';
const fake = R as any;
const flush = () => new Promise(r => setTimeout(r, 0));

describe('TimelineModal.renderTimeline', () => {
  it('keeps the on-screen renderer in step with the modal when two renders overlap', async () => {
    fake.__reset();
    const container: any = { current: null, empty() {} };
    const modal: any = Object.create((TimelineModal as any).prototype);
    Object.assign(modal, {
      renderer: null,
      timelineContainer: container,
      legendEl: null, detailsEl: null,
      defaultGanttDuration: 1,
      currentState: { ganttMode: false, timelineLayout: 'chronology', timelineOrientation: 'horizontal', groupMode: 'none', stackEnabled: true, density: 50, editMode: false, showEras: false, showPresence: false, narrativeOrder: false, filters: {} },
      plugin: { settings: {}, getReferenceTodayDate: () => new Date() },
      filterBuilder: { hasActiveFilters: () => false },
      scheduleTimelineRedraw() {}, updateSearchDropdown() {},
    });
    const pA = (TimelineModal as any).prototype.renderTimeline.call(modal);
    const pB = (TimelineModal as any).prototype.renderTimeline.call(modal);
    await flush();
    const gates = fake.__gate();
    const A = fake.__instances[0], B = fake.__instances[1];
    gates[1](); await pB;
    gates[0](); await pA;
    expect(A.destroyCalls).toBeGreaterThan(0);
    expect(container.current).toBe(B);
    expect(modal.renderer).toBe(B);
  });
});
