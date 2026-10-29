import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/modals/EventModal', () => ({ EventModal: class {} }));
import { NativeTimelineRenderer } from '../../src/utils/NativeTimelineRenderer';

function fakeEl(): any {
  const el: any = { children: [], style: {}, classList: new Set(), listeners: {} };
  el.empty = () => { el.children = []; };
  el.remove = () => { el.removed = true; };
  el.setAttribute = () => {};
  el.addEventListener = () => {};
  el.addClass = () => {};
  el.toggleClass = () => {};
  el.hide = () => {}; el.show = () => {};
  el.setCssStyles = () => {};
  el.createDiv = () => { const c = fakeEl(); el.children.push(c); return c; };
  el.createEl = () => { const c = fakeEl(); c.getContext = () => ctxStub; el.children.push(c); return c; };
  el.getContext = () => ctxStub;
  el.clientWidth = 900; el.clientHeight = 500;
  el.getBoundingClientRect = () => ({ left: 0, top: 0 });
  return el;
}
const ctxStub: any = new Proxy({ measureText: () => ({ width: 10 }) }, { get: (t: any, k) => (k in t ? t[k] : () => {}), set: () => true });

describe('NativeTimelineRenderer destroyed before initialize() finishes', () => {
  it('does not mount, so no ResizeObserver or font listener is left behind', async () => {
    const observers: Array<{ live: boolean }> = [];
    (globalThis as any).window = { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0 };
    (globalThis as any).ResizeObserver = class { live = false; observe() { this.live = true; observers.push(this); } disconnect() { this.live = false; } };
    (globalThis as any).getComputedStyle = () => ({ getPropertyValue: () => '' });
    const fontListeners = new Set<unknown>();
    const doc: any = { defaultView: null, fonts: { addEventListener: (_: string, f: unknown) => fontListeners.add(f), removeEventListener: (_: string, f: unknown) => fontListeners.delete(f) } };
    const container: any = fakeEl(); container.ownerDocument = doc;
    const plugin: any = { app: { vault: { getMarkdownFiles: () => [], getAbstractFileByPath: () => null }, workspace: {}, metadataCache: {} }, settings: { calendarSystems: [], timelineThemes: [], stories: [] }, getActiveStory: () => undefined, getTimelineTracks: () => [], getTimelineForks: () => [], listEvents: async () => [], listLocations: async () => [], listCharacters: async () => [], getReferenceTodayDate: () => new Date(), getTimelineConflicts: () => [] };
    const r: any = new NativeTimelineRenderer(container, plugin, { getReferenceDate: () => new Date() });
    // What TimelineBlockChild does: onload starts initialize, onunload calls destroy while it is pending.
    const init = r.initialize();
    r.destroy();
    await init;
    expect(observers.filter(o => o.live)).toHaveLength(0);
    expect(fontListeners.size).toBe(0);
    expect(container.children).toHaveLength(0);
  });
});
