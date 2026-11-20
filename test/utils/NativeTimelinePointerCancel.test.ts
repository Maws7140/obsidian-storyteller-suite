import { describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';
import { noticeMessages } from '../__mocks__/obsidian';

const opened: unknown[] = [];
vi.mock('../../src/modals/EventModal', () => ({
  EventModal: class { constructor(_a: unknown, _p: unknown, event: unknown) { opened.push(event); } open() {} },
}));
(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };

const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(res => setTimeout(res, 0)); };

/** A canvas that records its listeners, so a test can fire the same events the browser would. */
function fakeCanvas() {
  const listeners: Record<string, (event: any) => unknown> = {};
  return {
    listeners,
    style: {},
    addEventListener(type: string, fn: (event: any) => unknown) { listeners[type] = fn; },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
}

function setup(events: Array<Record<string, unknown>>, editMode: boolean) {
  const saved: Array<Record<string, unknown>> = [];
  const plugin = {
    app: { vault: { getMarkdownFiles: () => [] }, metadataCache: { getFileCache: () => null }, workspace: {} },
    settings: { calendarSystems: [], timelineThemes: [], stories: [], activeStoryId: '' },
    getActiveStory: () => undefined,
    getTimelineTracks: () => [], getTimelineForks: () => [], getTimelineFork: () => undefined,
    listEvents: async () => events.map(e => ({ ...e })),
    listLocations: async () => [], listCharacters: async () => [],
    saveEvent: vi.fn(async (e: Record<string, unknown>) => { saved.push({ ...e }); }),
  } as any;
  const r: any = new NativeTimelineRenderer({ ownerDocument: { defaultView: null } } as any, plugin, { editMode, getReferenceDate: () => new Date('2026-10-09T00:00:00Z') });
  r.root = { clientWidth: 900, clientHeight: 500, getBoundingClientRect: () => ({ left: 0, top: 0 }), addEventListener() {} };
  r.canvas = fakeCanvas();
  r.scheduleDraw = () => {};
  r.filters = {};
  r.viewStart = Date.UTC(1420, 0, 1); r.viewEnd = Date.UTC(1421, 0, 1);
  r.bindEvents();
  return { r, saved };
}

/** Lay out the real items and make the first one hittable at (150, 110). */
async function layout(r: any) {
  await r.refresh();
  r.visibleItems = r.lanes.flatMap((l: any) => l.items);
  const item = r.visibleItems[0];
  item.rect = { x: 100, y: 100, right: 200, bottom: 120, width: 100, height: 20 };
  return item;
}

const ev = { id: 'e1', name: 'Event', filePath: 'Events/Event.md', dateTime: '1420-03-15 00:00' };
const at = (pointerId: number, offsetX: number, pointerType: string) => ({ pointerId, offsetX, offsetY: 110, clientX: offsetX, clientY: 110, pointerType });

describe('pen and touch presses on a chip', () => {
  it('a pen press on a chip in view mode pans the view, as touch does', async () => {
    const { r } = setup([ev], false);
    await layout(r);
    const before = r.viewStart;
    await r.onPointerDown(at(2, 150, 'pen'));
    r.onPointerMove(at(2, 250, 'pen'));
    expect(r.viewStart).not.toBe(before);
  });

  it('a mouse press on a chip in view mode does not pan', async () => {
    const { r } = setup([ev], false);
    await layout(r);
    const before = r.viewStart;
    await r.onPointerDown(at(2, 150, 'mouse'));
    r.onPointerMove(at(2, 250, 'mouse'));
    expect(r.viewStart).toBe(before);
  });
});

describe('pointercancel is not a pointerup', () => {
  it('a cancelled press right after a tap on the selected chip does not open the event', async () => {
    const { r } = setup([ev], false);
    const canvas = r.canvas;
    await layout(r);
    await canvas.listeners.pointerdown(at(4, 150, 'touch'));
    await canvas.listeners.pointerup(at(4, 150, 'touch'));
    await flush();
    // The chip is now selected, so a real tap would open it.
    opened.length = 0;
    await canvas.listeners.pointerdown(at(5, 150, 'touch'));
    await canvas.listeners.pointercancel(at(5, 150, 'touch'));
    await flush();
    expect(opened).toHaveLength(0);
  });

  it('the same press followed by a real pointerup does open the event', async () => {
    const { r } = setup([ev], false);
    const canvas = r.canvas;
    await layout(r);
    await canvas.listeners.pointerdown(at(4, 150, 'touch'));
    await canvas.listeners.pointerup(at(4, 150, 'touch'));
    await flush();
    opened.length = 0;
    await canvas.listeners.pointerdown(at(5, 150, 'touch'));
    await canvas.listeners.pointerup(at(5, 150, 'touch'));
    await flush();
    expect(opened).toHaveLength(1);
  });

  it('cancelling a chip move puts the chip back and writes nothing', async () => {
    const { r, saved } = setup([ev], true);
    const canvas = r.canvas;
    const item = await layout(r);
    const start = item.start;
    await canvas.listeners.pointerdown(at(6, 150, 'mouse'));
    r.onPointerMove(at(6, 200, 'mouse'));
    expect(item.start).not.toBe(start);
    await canvas.listeners.pointercancel(at(6, 200, 'mouse'));
    await flush();
    expect(item.start).toBe(start);
    expect(saved).toHaveLength(0);
    expect(noticeMessages.join(' ')).not.toMatch(/Moved/);
  });
});
