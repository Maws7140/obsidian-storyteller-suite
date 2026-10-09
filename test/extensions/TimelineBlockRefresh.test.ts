import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  const merged: any = { ...actual };
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});
// A renderer that records every refresh, so the test can see which live views were told about new data.
vi.mock('../../src/utils/NativeTimelineRenderer', () => {
  class FakeRenderer {
    refreshCalls = 0; destroyed = false;
    constructor(public container: any, public plugin: any, public options: any) {}
    async initialize() {}
    async refresh() { this.refreshCalls++; }
    destroy() { this.destroyed = true; }
    applyFilters() {} setVisibleRange() {} redraw() {}
  }
  return { TimelineRenderer: FakeRenderer };
});
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };

import StorytellerSuitePlugin from '../../src/main';
import { registerTimelineBlockProcessor } from '../../src/extensions/TimelineBlockExtension';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** A plugin whose methods are the real ones; only its Obsidian-side state is faked. */
function makePlugin() {
  const plugin: any = Object.create(StorytellerSuitePlugin.prototype);
  plugin.app = { workspace: { getLeavesOfType: () => [] } };
  plugin.getReferenceTodayDate = () => new Date('2026-10-09T00:00:00Z');
  plugin.settings = { ganttDefaultDuration: 1 };
  // Class field initialisers do not run under Object.create, so set the registry up as the constructor would.
  plugin.liveTimelineSurfaces = new Set();
  plugin.registerMarkdownCodeBlockProcessor = (_lang: string, fn: any) => { plugin.blockProcessor = fn; };
  return plugin;
}

function el(): any {
  const node: any = { setCssStyles() {}, createDiv: () => el(), empty() {} };
  return node;
}

/** Render a ```timeline block the way Obsidian does, and bring its render child up. */
async function renderBlock(plugin: any) {
  registerTimelineBlockProcessor(plugin);
  const children: any[] = [];
  plugin.blockProcessor('', el(), { addChild: (child: any) => { children.push(child); child.onload(); } });
  await flush();
  return children[0];
}

describe('embedded timeline blocks follow data changes', () => {
  it('refreshes when the plugin announces that timeline data moved', async () => {
    const plugin = makePlugin();
    const child = await renderBlock(plugin);
    const renderer = child.renderer;
    const before = renderer.refreshCalls;
    plugin.refreshTimelineViews();
    await flush();
    expect(renderer.refreshCalls).toBe(before + 1);
  });

  it('stops being refreshed once its note closes', async () => {
    const plugin = makePlugin();
    const child = await renderBlock(plugin);
    const renderer = child.renderer;
    child.onunload();
    plugin.refreshTimelineViews();
    await flush();
    expect(renderer.refreshCalls).toBe(0);
  });
});
