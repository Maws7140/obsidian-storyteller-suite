import { describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';

// The renderer pulls in the event modal, which needs Obsidian's fuzzy modal
// base class. The tally never opens a modal, so a stub is enough.
vi.mock('../../src/modals/EventModal', () => ({ EventModal: class {} }));

/**
 * The empty state and footer rely on telling "no events", "undated events"
 * and "filtered out" apart. Build a renderer around a bare event list so the
 * tally can be checked without mounting a canvas.
 */
function rendererWith(events: Array<Record<string, unknown>>, filters: Record<string, unknown> = {}) {
  const plugin = {
    app: {},
    settings: {},
    listEvents: async () => events,
    getTimelineForks: () => [],
    getTimelineFork: () => undefined
  } as unknown as ConstructorParameters<typeof NativeTimelineRenderer>[1];
  const renderer = new NativeTimelineRenderer({} as HTMLElement, plugin, {});
  const internals = renderer as unknown as { events: unknown[]; filters: unknown };
  internals.events = events;
  internals.filters = filters;
  return renderer;
}

describe('NativeTimelineRenderer.getEventTally', () => {
  it('reports an empty story as having nothing at all', () => {
    const tally = rendererWith([]).getEventTally();
    expect(tally).toMatchObject({ total: 0, dated: 0, hiddenByFilters: 0 });
    expect(tally.undated).toHaveLength(0);
  });

  it('separates undated events from dated ones and keeps the dated count honest', () => {
    const events = [
      { id: 'a', name: 'Dated', dateTime: '2024-01-01' },
      { id: 'b', name: 'Undated one' },
      { id: 'c', name: 'Undated two', dateTime: '' }
    ];
    const renderer = rendererWith(events);
    const tally = renderer.getEventTally();
    expect(tally.total).toBe(3);
    expect(tally.dated).toBe(1);
    expect(tally.dated).toBe(renderer.getEventCount());
    expect(tally.undated.map(e => e.id)).toEqual(['b', 'c']);
    expect(tally.hiddenByFilters).toBe(0);
  });

  it('counts events hidden by a filter separately from events that lack a date', () => {
    const events = [
      { id: 'a', name: 'Milestone', dateTime: '2024-01-01', isMilestone: true },
      { id: 'b', name: 'Plain dated', dateTime: '2024-02-01', isMilestone: false },
      { id: 'c', name: 'Plain undated', isMilestone: false }
    ];
    const tally = rendererWith(events, { milestonesOnly: true }).getEventTally();
    expect(tally.dated).toBe(1);
    expect(tally.undated.map(e => e.id)).toEqual([]);
    expect(tally.hiddenByFilters).toBe(2);
  });
});
