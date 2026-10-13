import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  const merged: any = { ...actual };
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});

vi.mock('../../src/utils/NativeTimelineRenderer', () => ({ TimelineRenderer: class {} }));

import { TimelineView } from '../../src/views/TimelineView';
import { ItemView } from 'obsidian';

/** The obsidian test double has no ItemView.setState, so give the base class a no-op for the duration of a test. */
function stubBaseSetState(): () => void {
  const proto = (ItemView as any).prototype;
  const had = Object.prototype.hasOwnProperty.call(proto, 'setState');
  proto.setState = async () => {};
  return () => { if (!had) delete proto.setState; };
}

function makeView(calendarMode: boolean) {
  const view: any = Object.create((TimelineView as any).prototype);
  Object.assign(view, {
    currentState: {
      ganttMode: false, calendarMode, timelineLayout: 'chronology', timelineOrientation: 'horizontal',
      groupMode: 'none', stackEnabled: true, density: 50, editMode: false, showEras: false,
      showPresence: false, narrativeOrder: false, filters: {},
    },
    plugin: { settings: {}, getReferenceTodayDate: () => new Date() },
    showScenes: false, showWatchedNotes: false, renderer: null, toolbarEl: null,
  });
  return view;
}

describe('TimelineView calendar mode persistence', () => {
  it('saves the calendar choice in the view state', () => {
    expect(makeView(true).getState()).toMatchObject({ calendarMode: true });
    expect(makeView(false).getState()).toMatchObject({ calendarMode: false });
  });

  it('restores the calendar choice from a saved state', async () => {
    const restore = stubBaseSetState();
    try {
      const view = makeView(false);
      await view.setState({ calendarMode: true, ganttMode: false, timelineLayout: 'chronology', filters: {} }, {});
      expect(view.currentState.calendarMode).toBe(true);
      expect(view.getState()).toMatchObject({ calendarMode: true });
    } finally {
      restore();
    }
  });

  it('loads an older saved state, with no calendar key, as not calendar', async () => {
    const restore = stubBaseSetState();
    try {
      const view = makeView(true);
      await view.setState({ ganttMode: true, timelineLayout: 'timeline', filters: {} }, {});
      expect(view.currentState.calendarMode).toBe(false);
      expect(view.currentState.ganttMode).toBe(true);
      expect(view.currentState.timelineLayout).toBe('timeline');
    } finally {
      restore();
    }
  });
});
