import { describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';

vi.mock('../../src/modals/EventModal', () => ({ EventModal: class {} }));
vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  const merged: any = { ...actual };
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});
(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };

const YEAR = 365 * 86_400_000;

/** A Gantt renderer showing the year 1420, without mounting a canvas. */
function setup() {
  const plugin = {
    app: { vault: {}, workspace: {} },
    settings: { calendarSystems: [], timelineThemes: [], stories: [], activeStoryId: '' },
    getActiveStory: () => undefined,
    getTimelineTracks: () => [], getTimelineForks: () => [], getTimelineFork: () => undefined,
  } as any;
  const renderer = new NativeTimelineRenderer({ ownerDocument: { defaultView: null } } as any, plugin, { ganttMode: true, getReferenceDate: () => new Date('2026-10-09T00:00:00Z') });
  const r = renderer as any;
  r.root = { clientWidth: 1000, clientHeight: 600 };
  r.scrollTop = 0;
  r.viewStart = Date.UTC(1420, 0, 1);
  r.viewEnd = Date.UTC(1421, 0, 1);
  return r;
}

const end = (lane: any, start: number, finish = start) => ({ item: { start, end: finish }, lane });

describe('Gantt dependency arrows that cannot reach the screen are skipped', () => {
  const visibleLane = { top: 60, height: 40 };
  const farBelowLane = { top: 5000, height: 40 };
  const view = Date.UTC(1420, 6, 1);

  it('keeps an arrow with an end in view', () => {
    const mayShow = setup().connectorCuller(1000, 600);
    expect(mayShow(end(visibleLane, view), end(visibleLane, view + 86_400_000))).toBe(true);
  });

  it('keeps an arrow that crosses the view between two off-screen ends', () => {
    const mayShow = setup().connectorCuller(1000, 600);
    expect(mayShow(end(visibleLane, Date.UTC(1300, 0, 1)), end(visibleLane, Date.UTC(1500, 0, 1)))).toBe(true);
  });

  it('skips an arrow with both ends long before the view', () => {
    const mayShow = setup().connectorCuller(1000, 600);
    expect(mayShow(end(visibleLane, Date.UTC(1400, 0, 1)), end(visibleLane, Date.UTC(1401, 0, 1)))).toBe(false);
  });

  it('skips an arrow with both ends long after the view', () => {
    const mayShow = setup().connectorCuller(1000, 600);
    expect(mayShow(end(visibleLane, Date.UTC(1440, 0, 1)), end(visibleLane, Date.UTC(1441, 0, 1)))).toBe(false);
  });

  it('keeps an arrow whose source chip still reaches into view from the left', () => {
    // The chip draws right of its start, so an event a few days before the
    // left edge can still be on screen.
    const mayShow = setup().connectorCuller(1000, 600);
    const justBefore = Date.UTC(1419, 11, 28);
    expect(mayShow(end(visibleLane, justBefore), end(visibleLane, justBefore - 2 * 86_400_000))).toBe(true);
  });

  it('skips an arrow between two lanes scrolled far below the view', () => {
    const mayShow = setup().connectorCuller(1000, 600);
    expect(mayShow(end(farBelowLane, view), end(farBelowLane, view))).toBe(false);
  });

  it('keeps an arrow from a lane in view to one far below', () => {
    const mayShow = setup().connectorCuller(1000, 600);
    expect(mayShow(end(visibleLane, view), end(farBelowLane, view + YEAR / 12))).toBe(true);
  });
});
