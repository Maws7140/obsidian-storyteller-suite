import { describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';

vi.mock('../../src/modals/EventModal', () => ({ EventModal: class {} }));
(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };

function setup(events: Array<Record<string, unknown>>) {
  const saved: Array<Record<string, unknown>> = [];
  const plugin = {
    app: { vault: {}, workspace: {} },
    settings: { calendarSystems: [], timelineThemes: [], stories: [], activeStoryId: '' },
    getActiveStory: () => undefined,
    getTimelineTracks: () => [],
    getTimelineForks: () => [],
    getTimelineFork: () => undefined,
    listEvents: async () => events,
    saveEvent: vi.fn(async (e: Record<string, unknown>) => { saved.push({ ...e }); }),
  } as any;
  const renderer = new NativeTimelineRenderer({ ownerDocument: { defaultView: null } } as any, plugin, { editMode: true, getReferenceDate: () => new Date('2026-10-09T00:00:00Z') });
  const r = renderer as any;
  r.root = { clientWidth: 900, clientHeight: 500, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  r.canvas = { style: {}, setPointerCapture() {}, releasePointerCapture() {} };
  r.scheduleDraw = () => {};
  r.rebuild = () => {};
  r.events = events;
  r.filters = {};
  r.viewStart = Date.UTC(1420, 0, 1);
  r.viewEnd = Date.UTC(1421, 0, 1);
  return { r, saved, plugin };
}

function chipItem(r: any, event: any, start: number, end: number, approximate = false) {
  const item = { id: 'x', event, eventIndex: 0, start, end, laneId: 'l', laneLabel: 'L', laneColor: '#000', row: 0, approximate, rect: { x: 100, y: 100, right: 200, bottom: 120, width: 100, height: 20 } };
  r.lanes = [{ id: 'l', label: 'L', color: '#000', items: [item], top: 0, height: 40, branchDepth: 0 }];
  r.visibleItems = [item];
  return item;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('keyboard nudge commits the move like a pointer drag', () => {
  it('saves the moved date when an arrow key nudges a selected event', async () => {
    const event = { id: 'e1', name: 'Event', filePath: 'Events/Event.md', dateTime: '1420-03-15' };
    const { r, saved } = setup([event]);
    const item = chipItem(r, event, Date.UTC(1420, 2, 15), Date.UTC(1420, 2, 15));
    r.selected = item;
    r.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
    await flush();
    expect(item.start).toBeGreaterThan(Date.UTC(1420, 2, 15));
    expect(saved).toHaveLength(1);
    // The file must hold the date that is on screen.
    expect(r.parseDate(String(saved[0].dateTime))).toBe(item.start);
  });

  it('does not nudge an approximate event at all', async () => {
    const event = { id: 'e1', name: 'Event', filePath: 'Events/Event.md', dateTime: 'around 1420', approximate: true };
    const { r, saved } = setup([event]);
    const item = chipItem(r, event, Date.UTC(1420, 0, 1), Date.UTC(1420, 0, 1), true);
    r.selected = item;
    r.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
    await flush();
    expect(item.start).toBe(Date.UTC(1420, 0, 1));
    expect(saved).toHaveLength(0);
  });
});
