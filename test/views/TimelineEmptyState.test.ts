import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  const merged: any = { ...actual };
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});
vi.mock('../../src/utils/NativeTimelineRenderer', () => ({ TimelineRenderer: class {} }));
// Records what the "Set a date" button hands the editor.
vi.mock('../../src/modals/EventModal', () => ({
  EventModal: class {
    constructor(_app: unknown, _plugin: unknown, event: unknown) { (globalThis as any).__edited.push(event); }
    open() {}
  },
}));

import { TimelineView } from '../../src/views/TimelineView';

function makeView(store: { events: any[] }) {
  const view: any = Object.create((TimelineView as any).prototype);
  const renderer = {
    tally: { dated: 0, undated: [store.events[0]], hiddenByFilters: 0, total: 1 },
    refresh: vi.fn(async () => {}),
    getEventTally() { return this.tally; },
  };
  Object.assign(view, {
    app: {},
    renderer,
    plugin: { listEvents: async () => store.events, saveEvent: vi.fn(async () => {}), getReferenceTodayDate: () => new Date() },
    lastBranchSignature: '',
    branchSignature: () => '',
    buildToolbar() {},
    updateFooterStatus() {},
    updateSearchDropdown() {},
    renderEmptyState: vi.fn(),
  });
  return { view, renderer };
}

describe('TimelineView empty state', () => {
  it('is re-evaluated when the view refreshes', async () => {
    const store = { events: [{ id: 'e1', name: 'Undated', filePath: 'Events/U.md' }] };
    const { view, renderer } = makeView(store);
    // The renderer has just been given a date for the event, so the card should go away.
    renderer.tally = { dated: 1, undated: [], hiddenByFilters: 0, total: 1 };
    view.renderEmptyState.mockClear();
    await view.refresh();
    expect(view.renderEmptyState).toHaveBeenCalled();
  });

  it('opens the event as it is in the store now, not the snapshot taken when the card was drawn', async () => {
    (globalThis as any).__edited = [];
    const snapshot = { id: 'e1', name: 'Undated', filePath: 'Events/U.md' };
    const store = { events: [{ id: 'e1', name: 'Renamed', dateTime: '1420-03-15', filePath: 'Events/U.md' }] };
    const { view } = makeView(store);
    await view.openUndatedEvent(snapshot);
    expect((globalThis as any).__edited).toEqual([store.events[0]]);
    expect((globalThis as any).__edited[0]).not.toBe(snapshot);
  });
});
