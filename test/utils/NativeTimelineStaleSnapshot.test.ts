import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';
import { noticeMessages } from '../__mocks__/obsidian';

// The modal records what it was asked to edit, so a test can tell which copy of the event was opened.
vi.mock('../../src/modals/EventModal', () => ({
  EventModal: class {
    constructor(_app: unknown, _plugin: unknown, event: unknown) { (globalThis as any).__opened.push(event); }
    open() {}
  },
}));
(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
(globalThis as any).__opened = [] as unknown[];

const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(res => setTimeout(res, 0)); };

/** A renderer over an in-memory store. Writes go to `saved`; the store only changes when the test changes it. */
function setup(initial: Array<Record<string, unknown>>, editMode = true) {
  const store = initial.map(e => ({ ...e }));
  const saved: Array<Record<string, unknown>> = [];
  const plugin = {
    app: { vault: { getMarkdownFiles: () => [] }, metadataCache: { getFileCache: () => null }, workspace: {} },
    settings: { calendarSystems: [], timelineThemes: [], stories: [], activeStoryId: '' },
    getActiveStory: () => undefined,
    getTimelineTracks: () => [], getTimelineForks: () => [], getTimelineFork: () => undefined,
    listEvents: async () => store.map(e => ({ ...e })),
    listLocations: async () => [], listCharacters: async () => [],
    saveEvent: vi.fn(async (e: Record<string, unknown>) => { saved.push({ ...e }); }),
  } as any;
  const r: any = new NativeTimelineRenderer({ ownerDocument: { defaultView: null } } as any, plugin, { editMode, getReferenceDate: () => new Date('2026-10-09T00:00:00Z') });
  r.root = { clientWidth: 900, clientHeight: 500, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  r.canvas = { style: {}, setPointerCapture() {}, releasePointerCapture() {} };
  r.scheduleDraw = () => {};
  r.filters = {};
  r.viewStart = Date.UTC(1420, 0, 1); r.viewEnd = Date.UTC(1421, 0, 1);
  return { r, store, saved };
}

/** Lay out the real items and make the first one hittable at (150, 110). */
async function layout(r: any) {
  await r.refresh();
  r.visibleItems = r.lanes.flatMap((l: any) => l.items);
  const item = r.visibleItems[0];
  item.rect = { x: 100, y: 100, right: 200, bottom: 120, width: 100, height: 20 };
  return item;
}

async function dragChipRight(r: any, dx: number) {
  await r.onPointerDown({ pointerId: 1, offsetX: 150, offsetY: 110, clientX: 150, clientY: 110, pointerType: 'mouse' });
  r.onPointerMove({ pointerId: 1, offsetX: 150 + dx, offsetY: 110, clientX: 150 + dx, clientY: 110, pointerType: 'mouse' });
  await r.onPointerUp({ pointerId: 1, offsetX: 150 + dx, offsetY: 110, clientX: 150 + dx, clientY: 110, pointerType: 'mouse' });
  await flush();
}

const alpha = { id: 'a', name: 'Alpha', filePath: 'Events/Alpha.md', dateTime: '1420-03-15 00:00', description: 'old' };

beforeEach(() => {
  noticeMessages.length = 0;
  (globalThis as any).__opened.length = 0;
});

describe('writes start from the note as it is now, not the snapshot from the last rebuild', () => {
  it('a drag keeps the name and description the note was edited to', async () => {
    const { r, store, saved } = setup([alpha]);
    const item = await layout(r);
    // Edited in the note's own pane. Event notes do not trigger a timeline refresh.
    store[0] = { ...store[0], name: 'Alpha (edited in note)', description: 'new text' };
    await dragChipRight(r, 30);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Alpha (edited in note)');
    expect(saved[0].description).toBe('new text');
    expect(saved[0].dateTime).not.toBe(alpha.dateTime);
    expect(r.parseDate(String(saved[0].dateTime))).toBe(item.start);
  });

  it('ArrowRight after an external rename and a refresh saves the renamed event', async () => {
    const { r, store, saved } = setup([alpha]);
    await layout(r);
    r.selected = r.visibleItems[0];
    store[0] = { ...store[0], name: 'Alpha (renamed elsewhere)', description: 'new' };
    await r.refresh();
    r.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
    await flush();
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Alpha (renamed elsewhere)');
    expect(saved[0].description).toBe('new');
  });

  it('a drag that overlaps a refresh commits the current note, not the pre-refresh copy', async () => {
    const { r, store, saved } = setup([alpha]);
    await layout(r);
    await r.onPointerDown({ pointerId: 6, offsetX: 150, offsetY: 110, clientX: 150, clientY: 110, pointerType: 'mouse' });
    r.onPointerMove({ pointerId: 6, offsetX: 180, offsetY: 110, clientX: 180, clientY: 110, pointerType: 'mouse' });
    store[0] = { ...store[0], name: 'Alpha renamed mid-drag' };
    await r.refresh();
    await r.onPointerUp({ pointerId: 6, offsetX: 180, offsetY: 110, clientX: 180, clientY: 110, pointerType: 'mouse' });
    await flush();
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Alpha renamed mid-drag');
  });

  it('Enter opens the editor on the current note, not the pre-refresh copy', async () => {
    const { r, store } = setup([alpha], false);
    await layout(r);
    r.selected = r.visibleItems[0];
    store[0] = { ...store[0], name: 'Alpha (renamed elsewhere)' };
    await r.refresh();
    r.onKeyDown({ key: 'Enter', preventDefault() {} });
    await flush();
    expect((globalThis as any).__opened).toHaveLength(1);
    expect((globalThis as any).__opened[0].name).toBe('Alpha (renamed elsewhere)');
  });

  it('a drag of an event that no longer exists shows a notice and writes nothing', async () => {
    const { r, store, saved } = setup([alpha]);
    const item = await layout(r);
    store.length = 0;
    await dragChipRight(r, 30);
    expect(saved).toHaveLength(0);
    expect(item.start).toBe(Date.UTC(1420, 2, 15));
    expect(noticeMessages.join(' ')).toMatch(/no longer exists/);
  });

  it('a drag is refused when the stored date does not read as the date on screen', async () => {
    const misread = { id: 'm', name: 'Misread', filePath: 'Events/Misread.md', dateTime: '1420-04-01' };
    const { r, saved } = setup([misread]);
    const item = await layout(r);
    // The chip is drawn at 15 March while the note says 1 April: the app and the note disagree.
    item.start = Date.UTC(1420, 2, 15); item.end = item.start;
    await dragChipRight(r, 30);
    expect(saved).toHaveLength(0);
    expect(item.start).toBe(Date.UTC(1420, 2, 15));
    expect(noticeMessages.join(' ')).toMatch(/does not read as the date on screen/);
  });
});
