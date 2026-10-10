import { describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';
import { formatInCalendar } from '../../src/calendar/CalendarDateText';
import { THIRTEEN_MOONS } from '../../src/calendar/presets';
import type { CalendarSystem } from '../../src/calendar/types';

vi.mock('../../src/modals/EventModal', () => ({ EventModal: class { open() {} } }));
(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };

const MINUTE_CAL: CalendarSystem = {
  schemaVersion: THIRTEEN_MOONS.schemaVersion, id: 'custom-minute', name: 'Minute', baseUnit: 'minute', unitsPerDay: 1440,
  epochAbsoluteDay: 0, epochLabel: 'MC',
  months: [{ name: 'A', days: 30 }, { name: 'B', days: 30 }, { name: 'C', days: 30 }],
};

function setup(dateText: string) {
  const store: any[] = [{ id: 'a', name: 'Alpha', filePath: 'Events/Alpha.md', dateTime: dateText }];
  const saved: any[] = [];
  const plugin = {
    app: { vault: { getMarkdownFiles: () => [] }, metadataCache: { getFileCache: () => null }, workspace: {} },
    settings: { calendarSystems: [MINUTE_CAL], timelineThemes: [], stories: [], activeStoryId: '' },
    getActiveStory: () => ({ id: 's', activeCalendarId: MINUTE_CAL.id }),
    getTimelineTracks: () => [], getTimelineForks: () => [], getTimelineFork: () => undefined,
    listEvents: async () => store.map(e => ({ ...e })), listLocations: async () => [], listCharacters: async () => [],
    saveEvent: vi.fn(async (e: any) => { saved.push({ ...e }); }),
  } as any;
  const r: any = new NativeTimelineRenderer({ ownerDocument: { defaultView: null } } as any, plugin, { editMode: true, getReferenceDate: () => new Date('2026-10-09T00:00:00Z') });
  r.root = { clientWidth: 900, clientHeight: 500, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  r.canvas = { style: {}, setPointerCapture() {}, releasePointerCapture() {} };
  r.scheduleDraw = () => {};
  r.filters = {};
  return { r, saved };
}
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(res => setTimeout(res, 0)); };

async function dragTimedEvent(dateText: string) {
  const { r, saved } = setup(dateText);
  await r.refresh();
  const t = r.parseDate(dateText);
  expect(Number.isFinite(t)).toBe(true);
  r.viewStart = t - 3 * 86400e3; r.viewEnd = t + 3 * 86400e3;
  await r.refresh();
  const item = r.lanes.flatMap((l: any) => l.items)[0];
  expect(item).toBeTruthy();
  item.rect = { x: 100, y: 100, right: 200, bottom: 120, width: 100, height: 20 };
  r.visibleItems = [item];
  await r.onPointerDown({ pointerId: 1, offsetX: 150, offsetY: 110, clientX: 150, clientY: 110, pointerType: 'mouse' });
  r.onPointerMove({ pointerId: 1, offsetX: 190, offsetY: 110, clientX: 190, clientY: 110, pointerType: 'mouse' });
  const onScreen = item.start;
  await r.onPointerUp({ pointerId: 1, offsetX: 190, offsetY: 110, clientX: 190, clientY: 110, pointerType: 'mouse' });
  await flush();
  return { r, saved, onScreen };
}

describe('minute calendar drag write-back', () => {
  it('a timed event stored with numeric text saves the dragged instant', async () => {
    const { r, saved, onScreen } = await dragTimedEvent('1-02-11 10:00');
    expect(saved).toHaveLength(1);
    expect(r.parseDate(saved[0].dateTime)).toBe(onScreen);
  });

  it('a timed event stored in named-month form saves the dragged instant', async () => {
    const text = formatInCalendar({ year: 1, month: 1, day: 11, unitOfDay: 600 }, MINUTE_CAL, 'time');
    expect(text).toBe('B 11, 1 MC 10:00');
    const { r, saved, onScreen } = await dragTimedEvent(text);
    expect(saved).toHaveLength(1);
    expect(r.parseDate(saved[0].dateTime)).toBe(onScreen);
  });
});
