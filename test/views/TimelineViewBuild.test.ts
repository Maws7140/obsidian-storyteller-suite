import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  const merged: any = { ...actual };
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});

// A stand-in renderer. It mounts only when its initialize() resolves and it has not been
// destroyed, the same contract NativeTimelineRenderer keeps, so a stale build cannot take the container.
vi.mock('../../src/utils/NativeTimelineRenderer', () => {
  const instances: any[] = [];
  let gate: Array<() => void> = [];
  class FakeRenderer {
    destroyed = false; destroyCalls = 0; initializeCalls = 0;
    constructor(public container: any, public plugin: any, public options: any) { instances.push(this); }
    initialize(): Promise<void> {
      this.initializeCalls++;
      return new Promise<void>(resolve => {
        gate.push(() => {
          if (!this.destroyed) this.container.current = this;
          resolve();
        });
      });
    }
    destroy() { this.destroyed = true; this.destroyCalls++; }
    applyFilters() {} setShowScenes() {} setShowWatchedNotes() {} redraw() {}
    getEventTally() { return { dated: 1, undated: [], hiddenByFilters: 0, total: 1 }; }
    getDateRange() { return null; }
  }
  return { TimelineRenderer: FakeRenderer, __instances: instances, __gate: () => gate, __reset: () => { instances.length = 0; gate = []; } };
});

import { TimelineView } from '../../src/views/TimelineView';
import * as R from '../../src/utils/NativeTimelineRenderer';
const fake = R as any;

function makeView() {
  const container: any = { current: null, empty() {}, setCssStyles() {} };
  const view: any = Object.create((TimelineView as any).prototype);
  Object.assign(view, {
    timelineContainer: container,
    currentState: { ganttMode: false, timelineLayout: 'chronology', timelineOrientation: 'horizontal', groupMode: 'none', stackEnabled: true, density: 50, editMode: false, showEras: false, showPresence: false, narrativeOrder: false, filters: {} },
    plugin: { settings: {}, getReferenceTodayDate: () => new Date() },
    showScenes: false, showWatchedNotes: false, renderer: null,
    controlsBuilder: { updateZoomReadout() {} },
    updateSearchDropdown() {}, renderEmptyState() {}, scheduleTimelineRedraw() {}, updateFooterStatus() {},
  });
  return { view, container };
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('TimelineView.buildTimeline lifecycle', () => {
  it('destroys the previous renderer when the timeline is rebuilt', async () => {
    fake.__reset();
    const { view } = makeView();
    const p1 = view.buildTimeline(); await flush(); fake.__gate().forEach((g: any) => g()); await p1;
    const first = view.renderer;
    const p2 = view.buildTimeline(); await flush(); fake.__gate().slice(1).forEach((g: any) => g()); await p2;
    expect(first.destroyCalls).toBe(1);
    expect(view.renderer).not.toBe(first);
  });

  it('keeps the toolbar on the renderer that is on screen when two builds overlap', async () => {
    fake.__reset();
    const { view, container } = makeView();
    const pA = view.buildTimeline();
    const pB = view.buildTimeline();
    await flush();
    const gates = fake.__gate();
    const A = fake.__instances[0], B = fake.__instances[1];
    // B finishes first, then the stale A resolves: A must not mount over B.
    gates[1](); await pB;
    gates[0](); await pA;
    expect(A.destroyed).toBe(true);
    expect(container.current).toBe(B);
    expect(view.renderer).toBe(B);
  });
});
