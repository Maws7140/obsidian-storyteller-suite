import { describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';

(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
vi.mock('../../src/modals/EventModal', () => ({ EventModal: class { open() {} } }));

function setup(initial: Array<Record<string, unknown>>) {
  const store = initial.map(e => ({ ...e }));
  const plugin = {
    app: { vault: { getMarkdownFiles: () => [] }, metadataCache: { getFileCache: () => null }, workspace: {} },
    settings: { calendarSystems: [], timelineThemes: [], stories: [], activeStoryId: '' },
    getActiveStory: () => undefined,
    getTimelineTracks: () => [], getTimelineForks: () => [], getTimelineFork: () => undefined,
    listEvents: async () => store.map(e => ({ ...e })),
    listLocations: async () => [], listCharacters: async () => [],
    saveEvent: vi.fn(async () => {}),
  } as any;
  const r: any = new NativeTimelineRenderer({ ownerDocument: { defaultView: null } } as any, plugin, { editMode: true, getReferenceDate: () => new Date('2026-10-09T00:00:00Z') });
  r.scheduleDraw = () => {};
  r.filters = {};
  r.viewStart = Date.UTC(1420, 0, 1); r.viewEnd = Date.UTC(1421, 0, 1);
  return { r, store };
}

const alpha = { id: 'a', name: 'Alpha', filePath: 'Events/Alpha.md', dateTime: '1420-03-15 00:00' };
const beta = { id: 'b', name: 'Beta', filePath: 'Events/Beta.md', dateTime: '1420-04-01 00:00' };

describe('a rebuild keeps the selection on the rebuilt item for the same event', () => {
  it('the selected item is re-pointed at the new item object after a refresh', async () => {
    const { r } = setup([alpha, beta]);
    await r.refresh();
    const before = r.lanes.flatMap((l: any) => l.items);
    r.selected = before.find((item: any) => item.event.name === 'Beta');
    await r.refresh();
    const after = r.lanes.flatMap((l: any) => l.items);
    const beforeObjects = after.filter((item: any) => before.includes(item));
    expect(beforeObjects).toHaveLength(0); // rebuilt objects, as the bug depends on
    expect(r.selected).toBe(after.find((item: any) => item.event.name === 'Beta'));
  });

  it('the hovered item is re-pointed too', async () => {
    const { r } = setup([alpha, beta]);
    await r.refresh();
    r.hovered = r.lanes.flatMap((l: any) => l.items).find((item: any) => item.event.name === 'Alpha');
    await r.refresh();
    expect(r.hovered).toBe(r.lanes.flatMap((l: any) => l.items).find((item: any) => item.event.name === 'Alpha'));
  });

  it('the selection is cleared and listeners are told when the event is gone', async () => {
    const onEventSelected = vi.fn();
    const { r, store } = setup([alpha, beta]);
    r.options.onEventSelected = onEventSelected;
    await r.refresh();
    r.selected = r.lanes.flatMap((l: any) => l.items).find((item: any) => item.event.name === 'Beta');
    store.splice(store.findIndex(e => e.name === 'Beta'), 1);
    await r.refresh();
    expect(r.selected).toBeNull();
    expect(onEventSelected).toHaveBeenLastCalledWith(null);
  });
});
