import { describe, expect, it, vi } from 'vitest';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';

vi.mock('../../src/modals/EventModal', () => ({ EventModal: class {} }));
// main.ts extends Plugin and reads more Obsidian classes at module load; stub the ones the test mock lacks.
vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  const merged: any = { ...actual };
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});
(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };

const DAY = 86_400_000;

/**
 * Build a renderer with one laid-out chip, the way `rebuild` leaves it, so the
 * pointer handlers can be driven without mounting a canvas.
 */
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
  r.events = events;
  r.filters = {};
  r.viewStart = Date.UTC(1420, 0, 1);
  r.viewEnd = Date.UTC(1421, 0, 1);
  return { r, saved };
}

function chipItem(r: any, event: any, start: number, end: number) {
  const item = { id: 'x', event, eventIndex: 0, start, end, laneId: 'l', laneLabel: 'L', laneColor: '#000', row: 0, approximate: !!event.approximate, rect: { x: 100, y: 100, right: 200, bottom: 120, width: 100, height: 20 } };
  r.lanes = [{ id: 'l', label: 'L', color: '#000', items: [item], top: 0, height: 40, branchDepth: 0 }];
  r.visibleItems = [item];
  return item;
}

async function dragChip(r: any, dx: number) {
  await r.onPointerDown({ pointerId: 1, offsetX: 150, offsetY: 110, clientX: 150, clientY: 110, pointerType: 'mouse' });
  await r.onPointerMove({ pointerId: 1, offsetX: 150 + dx, offsetY: 110, clientX: 150 + dx, clientY: 110 });
  await r.onPointerUp({ pointerId: 1, offsetX: 150 + dx, offsetY: 110, clientX: 150 + dx, clientY: 110 });
}

const ev = (p: Record<string, unknown>) => ({ id: 'e1', name: 'Event', filePath: 'Events/Event.md', ...p });

describe('chip-body drag respects isDraggable', () => {
  it('does not rewrite an approximate date as an exact one', async () => {
    const event = ev({ dateTime: 'around 1420', approximate: true });
    const { r, saved } = setup([event]);
    const item = chipItem(r, event, Date.UTC(1420, 0, 1), Date.UTC(1420, 0, 1));
    await dragChip(r, 30);
    expect(saved).toHaveLength(0);
    expect(event.dateTime).toBe('around 1420');
    expect(item.start).toBe(Date.UTC(1420, 0, 1));
  });

  it('does not drag a scene chip, so no note is handed to saveEvent', async () => {
    const scene = ev({ name: 'Scene A', dateTime: '1420-03-15', filePath: 'Scenes/Scene A.md', tags: ['scene'] });
    const { r, saved } = setup([scene]);
    const item = chipItem(r, scene, Date.UTC(1420, 2, 15), Date.UTC(1420, 2, 15));
    await dragChip(r, 50);
    expect(saved).toHaveLength(0);
    expect(item.start).toBe(Date.UTC(1420, 2, 15));
  });

  it('does not drag a watched-note chip', async () => {
    const note = ev({ name: 'Note', dateTime: '1420-03-15', filePath: 'Notes/Note.md', tags: ['watched-note'] });
    const { r, saved } = setup([note]);
    chipItem(r, note, Date.UTC(1420, 2, 15), Date.UTC(1420, 2, 15));
    await dragChip(r, 50);
    expect(saved).toHaveLength(0);
  });

  it('still drags an ordinary dated event', async () => {
    const event = ev({ dateTime: '1420-03-15' });
    const { r, saved } = setup([event]);
    chipItem(r, event, Date.UTC(1420, 2, 15), Date.UTC(1420, 2, 15));
    await dragChip(r, 50);
    expect(saved).toHaveLength(1);
  });

  it('still selects a non-draggable chip on press', async () => {
    const scene = ev({ name: 'Scene A', dateTime: '1420-03-15', filePath: 'Scenes/Scene A.md', tags: ['scene'] });
    const { r } = setup([scene]);
    const item = chipItem(r, scene, Date.UTC(1420, 2, 15), Date.UTC(1420, 2, 15));
    await r.onPointerDown({ pointerId: 1, offsetX: 150, offsetY: 110, clientX: 150, clientY: 110, pointerType: 'mouse' });
    expect(r.selected).toBe(item);
    await r.onPointerUp({ pointerId: 1, offsetX: 150, offsetY: 110, clientX: 150, clientY: 110 });
  });
});

describe('saveEvent refuses non-event objects (defence in depth)', () => {
  it('refuses a scene or watched-note object before touching the vault', async () => {
    const { default: StorytellerSuitePlugin } = await import('../../src/main');
    const fakePlugin = {
      ensureEventFolder: vi.fn(async () => { throw new Error('must not reach the vault'); }),
      safeRenameFile: vi.fn(),
    } as any;
    const save = (StorytellerSuitePlugin.prototype as any).saveEvent as (e: unknown) => Promise<void>;
    for (const tags of [['scene'], ['watched-note']]) {
      await expect(save.call(fakePlugin, { name: 'X', filePath: 'Scenes/X.md', tags })).resolves.toBeUndefined();
    }
    expect(fakePlugin.ensureEventFolder).not.toHaveBeenCalled();
    expect(fakePlugin.safeRenameFile).not.toHaveBeenCalled();
  }, 60_000);
});
