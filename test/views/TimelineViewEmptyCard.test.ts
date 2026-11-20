import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  class Notice { constructor(message: string) { (globalThis as any).__notices.push(String(message)); } }
  return new Proxy({ ...actual, Notice }, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});
(globalThis as any).__notices = [];
(globalThis as any).window = { requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
(globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
vi.mock('../../src/modals/EventModal', () => ({ EventModal: class { open() {} } }));

import { TimelineView } from '../../src/views/TimelineView';
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';

/** Minimal fake DOM node: enough for the empty-state card and container. */
function fakeEl(): any {
  const el: any = { children: [] as any[], cls: '', listeners: {} as Record<string, Function[]>, text: '', ownerDocument: { defaultView: null } };
  el.createDiv = (cls?: string) => { const c = fakeEl(); c.cls = typeof cls === 'string' ? cls : (cls as any)?.cls || ''; c.parent = el; el.children.push(c); return c; };
  el.createEl = (tag: string, opts?: any) => { const c = fakeEl(); c.tag = tag; c.cls = opts?.cls || ''; c.text = opts?.text || ''; c.parent = el; el.children.push(c); return c; };
  el.createSpan = (cls?: any) => el.createDiv(cls);
  el.empty = () => { el.children = []; };
  el.setCssStyles = () => {};
  el.addEventListener = (type: string, fn: Function) => { (el.listeners[type] ||= []).push(fn); };
  el.setText = (t: string) => { el.text = t; };
  el.querySelector = (sel: string) => {
    const cls = sel.replace('.', '');
    const walk = (n: any): any => { for (const c of n.children) { if (String(c.cls).split(' ').includes(cls)) return c; const f = walk(c); if (f) return f; } return null; };
    return walk(el);
  };
  el.remove = () => { el.parent.children = el.parent.children.filter((c: any) => c !== el); };
  el.addClass = () => {};
  return el;
}

function plugin(events: any[]) {
  const store = events;
  return {
    app: { vault: { getMarkdownFiles: () => [] }, metadataCache: { getFileCache: () => null }, workspace: {} },
    settings: { calendarSystems: [], timelineThemes: [], stories: [], activeStoryId: '', timelineConflicts: [] },
    getActiveStory: () => undefined,
    getTimelineTracks: () => [], getTimelineForks: () => [], getTimelineFork: () => undefined,
    listEvents: async () => store.map((e: any) => ({ ...e })), listLocations: async () => [], listCharacters: async () => [],
    getReferenceTodayDate: () => new Date('2026-10-09T00:00:00Z'),
    getTimelineConflicts: () => [],
    setTimelineConflicts: vi.fn(async () => {}),
    saveEvent: vi.fn(async () => {}),
  } as any;
}

function viewFor(p: any) {
  const container = fakeEl();
  const view: any = Object.create((TimelineView as any).prototype);
  Object.assign(view, {
    timelineContainer: container,
    currentState: { ganttMode: false, timelineLayout: 'chronology', timelineOrientation: 'horizontal', groupMode: 'none', stackEnabled: true, density: 50, editMode: false, showEras: false, showPresence: false, narrativeOrder: false, filters: {} },
    plugin: p, showScenes: false, showWatchedNotes: false, renderer: null, timelineBuildGeneration: 0,
    controlsBuilder: { updateZoomReadout() {} },
    updateSearchDropdown() {}, scheduleTimelineRedraw() {}, updateFooterStatus() {}, buildToolbar() {},
    lastBranchSignature: '', branchSignature: () => '',
    handleConflicts: vi.fn(async () => {}),
  });
  return { view, container };
}
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(res => setTimeout(res, 0)); };
const findCls = (node: any, cls: string): any => node.querySelector('.' + cls);
const buttonsIn = (node: any): any[] => { const out: any[] = []; const walk = (n: any) => { for (const c of n.children) { if (c.tag === 'button') out.push(c); walk(c); } }; walk(node); return out; };

describe('TimelineView empty-state card', () => {
  it('Clear filters on the card makes the hidden event visible and removes the card', async () => {
    const p = plugin([{ id: 'a', name: 'Alpha', filePath: 'Events/Alpha.md', dateTime: '1420-03-15 00:00', characters: ['Ada'] }]);
    const { view, container } = viewFor(p);
    const renderer: any = new NativeTimelineRenderer(container as any, p, { getReferenceDate: () => new Date('2026-10-09T00:00:00Z') });
    view.renderer = renderer;
    view.currentState.filters = { characters: new Set(['Nobody']) };
    renderer.applyFilters(view.currentState.filters);
    await renderer.refresh();
    view.renderEmptyState();
    const card = findCls(container, 'storyteller-timeline-empty');
    expect(card).toBeTruthy();
    const btn = buttonsIn(card).find((b: any) => b.text === 'Clear filters');
    expect(btn).toBeTruthy();
    await btn.listeners.click[0]();
    await flush();
    expect(renderer.getVisibleEvents().length).toBe(1);
    expect(findCls(container, 'storyteller-timeline-empty')).toBeFalsy();
  });

  it('a refresh that finishes after a rebuild started does not show "Nothing on this timeline yet" over the loading timeline', async () => {
    const container = fakeEl();
    const view: any = Object.create((TimelineView as any).prototype);
    Object.assign(view, {
      timelineContainer: container,
      currentState: { filters: {} },
      plugin: { settings: {}, getReferenceTodayDate: () => new Date() },
      renderer: null, timelineBuildGeneration: 0, showScenes: false, showWatchedNotes: false,
      updateSearchDropdown() {}, scheduleTimelineRedraw() {}, updateFooterStatus() {}, buildToolbar() {},
      lastBranchSignature: '', branchSignature: () => '',
      controlsBuilder: { updateZoomReadout() {} },
    });
    let release!: () => void;
    const gate = new Promise<void>(res => { release = res; });
    // Renderer A holds events and is refreshing slowly.
    const A: any = {
      refresh: vi.fn(async () => { await gate; }),
      getEventTally: () => ({ dated: 1, undated: [], hiddenByFilters: 0, total: 1 }),
      destroy: vi.fn(), redraw() {}, applyFilters() {},
    };
    view.renderer = A;
    const refreshing = view.refresh();
    // A rebuild replaces the renderer while A's refresh is still in flight. B has not loaded its events.
    const B: any = {
      initialize: () => new Promise(() => {}),
      destroy() {}, getEventTally: () => ({ dated: 0, undated: [], hiddenByFilters: 0, total: 0 }),
      redraw() {}, applyFilters() {}, setShowScenes() {}, setShowWatchedNotes() {},
    };
    view.renderer = B;
    release();
    await refreshing;
    expect(container.querySelector('.storyteller-timeline-empty')).toBeFalsy();
  });
});
