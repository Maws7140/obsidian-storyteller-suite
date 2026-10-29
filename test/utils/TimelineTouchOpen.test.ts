import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';

// The modal records what it was asked to edit, so a test can tell whether an event was opened.
vi.mock('../../src/modals/EventModal', () => ({
  EventModal: class {
    constructor(_app: unknown, _plugin: unknown, event: unknown) { (globalThis as any).__opened.push(event); }
    open() {}
  },
}));
(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };

function setup(events: Array<Record<string, unknown>>) {
  const plugin = {
    app: { vault: {}, workspace: {} },
    settings: { calendarSystems: [], timelineThemes: [], stories: [], activeStoryId: '' },
    getActiveStory: () => undefined,
    getTimelineTracks: () => [],
    getTimelineForks: () => [],
    getTimelineFork: () => undefined,
    listEvents: async () => events,
    saveEvent: async () => {},
  } as any;
  const renderer = new NativeTimelineRenderer({ ownerDocument: { defaultView: null } } as any, plugin, { editMode: false, getReferenceDate: () => new Date('2026-10-09T00:00:00Z') });
  const r = renderer as any;
  r.root = { clientWidth: 900, clientHeight: 500, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  r.canvas = { style: {}, setPointerCapture() {}, releasePointerCapture() {} };
  r.scheduleDraw = () => {};
  r.rebuild = () => {};
  r.events = events;
  r.filters = {};
  r.viewStart = Date.UTC(1420, 0, 1);
  r.viewEnd = Date.UTC(1421, 0, 1);
  return r;
}

function chipItem(r: any, event: any) {
  const start = Date.UTC(1420, 2, 15);
  const item = { id: 'x', event, eventIndex: 0, start, end: start, laneId: 'l', laneLabel: 'L', laneColor: '#000', row: 0, approximate: false, rect: { x: 100, y: 100, right: 200, bottom: 120, width: 100, height: 20 } };
  r.lanes = [{ id: 'l', label: 'L', color: '#000', items: [item], top: 0, height: 40, branchDepth: 0 }];
  r.visibleItems = [item];
  return item;
}

const ev = { id: 'e1', name: 'Event', filePath: 'Events/Event.md', dateTime: '1420-03-15' };
const opened = (): unknown[] => (globalThis as any).__opened;

/** A touch tap at (x, y): press and release without moving. */
async function tap(r: any, x = 150, y = 110, pointerType = 'touch', dx = 0) {
  await r.onPointerDown({ pointerId: 1, offsetX: x, offsetY: y, clientX: x, clientY: y, pointerType });
  await r.onPointerUp({ pointerId: 1, offsetX: x + dx, offsetY: y, clientX: x + dx, clientY: y, pointerType });
}

beforeEach(() => { (globalThis as any).__opened = []; });

describe('touch and keyboard users can open an event', () => {
  it('a second tap on the selected chip opens the event', async () => {
    const r = setup([ev]);
    chipItem(r, ev);
    await tap(r);
    expect(opened()).toHaveLength(0);
    await tap(r);
    expect(opened()).toEqual([ev]);
  });

  it('a tap on the selected chip that is dragged across does not open the event', async () => {
    const r = setup([ev]);
    chipItem(r, ev);
    await tap(r);
    await tap(r, 150, 110, 'touch', 60);
    expect(opened()).toHaveLength(0);
  });

  it('a second mouse click does not open the event (mouse keeps dblclick)', async () => {
    const r = setup([ev]);
    chipItem(r, ev);
    await tap(r, 150, 110, 'mouse');
    await tap(r, 150, 110, 'mouse');
    expect(opened()).toHaveLength(0);
  });

  it('Enter on the selected item opens the event', async () => {
    const r = setup([ev]);
    r.selected = chipItem(r, ev);
    r.onKeyDown({ key: 'Enter', preventDefault() {} });
    // The editor opens once the store's copy has been read.
    await new Promise(res => setTimeout(res, 0));
    expect(opened()).toEqual([ev]);
  });
});

describe('hover card follows touch selection', () => {
  it('a tap on a chip shows its card, and a tap on empty space hides it', async () => {
    const r = setup([ev]);
    chipItem(r, ev);
    const show = vi.fn(); const hide = vi.fn();
    r.showTooltip = show; r.hideTooltip = hide;
    await tap(r);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0][0]).toBe(r.visibleItems[0]);
    await tap(r, 600, 400);
    expect(hide).toHaveBeenCalled();
  });

  it('a touch leaving the canvas after lift does not hide the card', () => {
    const r = setup([ev]);
    const hide = vi.fn();
    r.hideTooltip = hide;
    r.onPointerLeave({ pointerType: 'touch' });
    expect(hide).not.toHaveBeenCalled();
  });
});
