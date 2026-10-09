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
  return { r, saved };
}

function chipItem(r: any, event: any, start: number, end: number) {
  const item = { id: 'x', event, eventIndex: 0, start, end, laneId: 'l', laneLabel: 'L', laneColor: '#000', row: 0, approximate: false, rect: { x: 100, y: 100, right: 200, bottom: 120, width: 100, height: 20 } };
  r.lanes = [{ id: 'l', label: 'L', color: '#000', items: [item], top: 0, height: 40, branchDepth: 0 }];
  r.visibleItems = [item];
  return item;
}

describe('a pinch that starts during a chip drag', () => {
  it('puts the dragged chip back and saves nothing', async () => {
    const event = { id: 'e1', name: 'Event', filePath: 'Events/Event.md', dateTime: '1420-03-15' };
    const { r, saved } = setup([event]);
    const item = chipItem(r, event, Date.UTC(1420, 2, 15), Date.UTC(1420, 2, 15));
    const startStart = item.start;
    await r.onPointerDown({ pointerId: 1, offsetX: 150, offsetY: 110, clientX: 150, clientY: 110, pointerType: 'touch' });
    await r.onPointerMove({ pointerId: 1, offsetX: 230, offsetY: 110, clientX: 230, clientY: 110 });
    expect(item.start).not.toBe(startStart); // the drag really moved the chip
    await r.onPointerDown({ pointerId: 2, offsetX: 300, offsetY: 300, clientX: 300, clientY: 300, pointerType: 'touch' });
    expect(item.start).toBe(startStart);
    await r.onPointerUp({ pointerId: 2, offsetX: 300, offsetY: 300, clientX: 300, clientY: 300 });
    await r.onPointerUp({ pointerId: 1, offsetX: 230, offsetY: 110, clientX: 230, clientY: 110 });
    expect(item.start).toBe(startStart);
    expect(event.dateTime).toBe('1420-03-15');
    expect(saved).toHaveLength(0);
  });
});
