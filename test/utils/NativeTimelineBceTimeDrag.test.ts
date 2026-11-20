import { describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';
import { noticeMessages } from '../__mocks__/obsidian';

vi.mock('../../src/modals/EventModal', () => ({ EventModal: class { open() {} } }));
(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };

const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(res => setTimeout(res, 0)); };

/** Date.UTC maps years 0-99 onto 1900-1999, so set the year explicitly. */
function utc(year: number, month: number, day: number, hour = 0): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(hour, 0, 0, 0);
  return date.getTime();
}

function setup(events: Array<Record<string, unknown>>, span: [number, number]) {
  const saved: Array<Record<string, unknown>> = [];
  const plugin = {
    app: { vault: { getMarkdownFiles: () => [] }, metadataCache: { getFileCache: () => null }, workspace: {} },
    settings: { calendarSystems: [], timelineThemes: [], stories: [], activeStoryId: '' },
    getActiveStory: () => undefined, getTimelineTracks: () => [], getTimelineForks: () => [], getTimelineFork: () => undefined,
    listEvents: async () => events.map(e => ({ ...e })), listLocations: async () => [], listCharacters: async () => [],
    saveEvent: vi.fn(async (e: Record<string, unknown>) => { saved.push({ ...e }); }),
  } as any;
  const r: any = new NativeTimelineRenderer({ ownerDocument: { defaultView: null } } as any, plugin, { editMode: true, getReferenceDate: () => new Date('2026-10-09T00:00:00Z') });
  r.root = { clientWidth: 900, clientHeight: 500, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  r.canvas = { style: {}, setPointerCapture() {}, releasePointerCapture() {} };
  r.scheduleDraw = () => {};
  r.filters = {};
  r.viewStart = span[0]; r.viewEnd = span[1];
  return { r, saved };
}

async function placeFirst(r: any) {
  await r.refresh();
  const item = r.lanes.flatMap((l: any) => l.items)[0];
  item.rect = { x: 100, y: 100, right: 200, bottom: 120, width: 100, height: 20 };
  r.visibleItems = [item];
  return item;
}

async function dragRight(r: any, dx: number) {
  await r.onPointerDown({ pointerId: 1, offsetX: 150, offsetY: 110, clientX: 150, clientY: 110, pointerType: 'mouse' });
  r.onPointerMove({ pointerId: 1, offsetX: 150 + dx, offsetY: 110, clientX: 150 + dx, clientY: 110, pointerType: 'mouse' });
  await r.onPointerUp({ pointerId: 1, offsetX: 150 + dx, offsetY: 110, clientX: 150 + dx, clientY: 110, pointerType: 'mouse' });
  await flush();
}

const span: [number, number] = [utc(-100, 0, 1), utc(100, 0, 1)];

describe('a BCE date with a time of day places on its BCE year and drags back to text that reads the same', () => {
  it.each([
    ['-44-03-15 10:00', utc(-44, 2, 15, 10)],
    ['-0044-03-15 10:00', utc(-44, 2, 15, 10)],
    ['44 BCE 10:00', utc(-43, 0, 1, 10)],
  ])('"%s" is drawn at its own date, not today', async (text, expected) => {
    const event = { id: 'e1', name: 'Event', filePath: 'Events/Event.md', dateTime: text };
    const { r, saved } = setup([event], span);
    const item = await placeFirst(r);
    expect(item.start).toBe(expected);
    await dragRight(r, 40);
    expect(saved).toHaveLength(1);
    const written = String(saved[0].dateTime);
    expect(r.parseDate(written)).toBe(item.start);
    expect(new Date(item.start).getUTCFullYear()).toBeLessThan(0);
  });

  it('a drop at a time of day in a BCE year reads back to the same instant', () => {
    const { r } = setup([], span);
    const instant = utc(-43, 0, 1, 10) + 30 * 60e3;
    expect(r.parseDate(r.formatEditDate(instant))).toBe(instant);
  });

  it('refuses a drag when the stored text does not read as the date on screen', async () => {
    const event = { id: 'e2', name: 'Misread', filePath: 'Events/Misread.md', dateTime: '1420-04-01' };
    const { r, saved } = setup([event], [Date.UTC(1419, 0, 1), Date.UTC(1421, 0, 1)]);
    const item = await placeFirst(r);
    item.start = Date.UTC(1420, 2, 15); item.end = item.start;
    const before = noticeMessages.length;
    await dragRight(r, 40);
    expect(saved).toHaveLength(0);
    expect(item.start).toBe(Date.UTC(1420, 2, 15));
    expect(noticeMessages.slice(before).join(' ')).toMatch(/does not read as the date on screen/);
  });
});
