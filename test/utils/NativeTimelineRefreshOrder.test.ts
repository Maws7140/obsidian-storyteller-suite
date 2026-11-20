import { describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';

(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
vi.mock('../../src/modals/EventModal', () => ({ EventModal: class { open() {} } }));

describe('overlapping refreshes', () => {
  it('an older refresh that finishes last does not replace the newer event list', async () => {
    let call = 0;
    const gates: Array<() => void> = [];
    const plugin = {
      app: { vault: { getMarkdownFiles: () => [] }, metadataCache: { getFileCache: () => null }, workspace: {} },
      settings: { calendarSystems: [], timelineThemes: [], stories: [], activeStoryId: '' },
      getActiveStory: () => undefined, getTimelineTracks: () => [], getTimelineForks: () => [], getTimelineFork: () => undefined,
      listEvents: vi.fn(() => {
        const n = ++call;
        const data = n === 1
          ? [{ id: 'a', name: 'Old', dateTime: '1420-03-15 00:00' }]
          : [{ id: 'a', name: 'Old', dateTime: '1420-03-15 00:00' }, { id: 'b', name: 'New', dateTime: '1420-04-01 00:00' }];
        return new Promise<any[]>(res => gates.push(() => res(data)));
      }),
      listLocations: async () => [], listCharacters: async () => [],
    } as any;
    const r: any = new NativeTimelineRenderer({ ownerDocument: { defaultView: null } } as any, plugin, { getReferenceDate: () => new Date('2026-10-09T00:00:00Z') });
    r.scheduleDraw = () => {};
    const first = r.refresh();   // slow, started first
    const second = r.refresh();  // fast, started second
    gates[1]();
    await second;
    gates[0]();
    await first;
    expect(r.events.map((e: any) => e.name)).toEqual(['Old', 'New']);
  });
});
