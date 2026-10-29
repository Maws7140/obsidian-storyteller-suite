import { describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';
import { noticeMessages } from '../../test/__mocks__/obsidian';

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
  r.viewStart = Date.UTC(-100, 0, 1);
  r.viewEnd = Date.UTC(100, 0, 1);
  return { r, saved, plugin };
}

function chipItem(r: any, event: any, start: number, end: number) {
  const item = { id: 'x', event, eventIndex: 0, start, end, laneId: 'l', laneLabel: 'L', laneColor: '#000', row: 0, approximate: false, rect: { x: 100, y: 100, right: 200, bottom: 120, width: 100, height: 20 } };
  r.lanes = [{ id: 'l', label: 'L', color: '#000', items: [item], top: 0, height: 40, branchDepth: 0 }];
  r.visibleItems = [item];
  return item;
}

async function dragChip(r: any, dx: number) {
  await r.onPointerDown({ pointerId: 1, offsetX: 150, offsetY: 110, clientX: 150, clientY: 110, pointerType: 'mouse' });
  await r.onPointerMove({ pointerId: 1, offsetX: 150 + dx, offsetY: 110, clientX: 150 + dx, clientY: 110 });
  await r.onPointerUp({ pointerId: 1, offsetX: 150 + dx, offsetY: 110, clientX: 150 + dx, clientY: 110 });
}

/** Date.UTC maps years 0-99 onto 1900-1999, so set the year explicitly. */
function utc(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date.getTime();
}

describe('dragging a BCE event writes a date that reads back', () => {
  it('writes a BCE drop as a string the parser reads back to the same day', async () => {
    const event = { id: 'e1', name: 'Event', filePath: 'Events/Event.md', dateTime: '44 BCE' };
    const { r, saved } = setup([event]);
    const start = Date.UTC(-43, 0, 1);
    const item = chipItem(r, event, start, start);
    await dragChip(r, 30);
    expect(saved).toHaveLength(1);
    const written = String(saved[0].dateTime);
    expect(r.parseDate(written)).toBe(item.start);
  });

  it.each([
    ['-43 (44 BCE)', Date.UTC(-43, 0, 1)],
    ['-43 late in the year', Date.UTC(-43, 11, 31)],
    ['year 0 (1 BCE)', utc(0, 5, 15)],
    ['-999', Date.UTC(-999, 2, 15)],
    ['-4000', Date.UTC(-4000, 6, 1)],
  ])('round-trips %s', async (_label, instant) => {
    const { r } = setup([]);
    const text = r.formatEditDate(instant);
    expect(r.parseDate(text)).toBe(instant);
  });

  it('does not save and reverts when the written text would not read back', async () => {
    const event = { id: 'e1', name: 'Event', filePath: 'Events/Event.md', dateTime: '1420-03-15' };
    const { r, saved } = setup([event]);
    const item = chipItem(r, event, Date.UTC(1420, 2, 15), Date.UTC(1420, 2, 15));
    // Simulate a write that the parser cannot read back to the same instant.
    r.parseDate = () => NaN;
    const before = noticeMessages.length;
    await dragChip(r, 50);
    expect(saved).toHaveLength(0);
    expect(event.dateTime).toBe('1420-03-15');
    expect(item.start).toBe(Date.UTC(1420, 2, 15));
    expect(noticeMessages.slice(before).join(' ')).toMatch(/could not|cannot|not saved/i);
  });
});
