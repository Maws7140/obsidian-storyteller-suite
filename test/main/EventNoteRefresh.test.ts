import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  // Obsidian's debounce, reduced to its trailing-call behaviour.
  const debounce = (fn: (...args: any[]) => void, wait: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (...args: any[]) => { if (timer) clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
  };
  const merged: any = { ...actual, debounce };
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});
(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };

import StorytellerSuitePlugin from '../../src/main';

function makePlugin(eventFolder: string) {
  const plugin: any = Object.create((StorytellerSuitePlugin as any).prototype);
  plugin.tryGetEntityFolder = vi.fn(() => ({ path: eventFolder }));
  plugin.refreshTimelineViews = vi.fn();
  return plugin;
}

describe('event note changes refresh open timelines', () => {
  it('recognises notes inside the event folder only', () => {
    const plugin = makePlugin('Story/Events');
    expect(plugin.isEventNotePath('Story/Events/Alpha.md')).toBe(true);
    expect(plugin.isEventNotePath('Story/Characters/Ada.md')).toBe(false);
    expect(plugin.isEventNotePath('Story/Events-archive/Alpha.md')).toBe(false);
    expect(plugin.isEventNotePath('Story/Events/Alpha.png')).toBe(false);
  });

  it('coalesces a burst of event note changes into one timeline refresh', async () => {
    vi.useFakeTimers();
    try {
      const plugin = makePlugin('Story/Events');
      // The field is set up in the constructor; construct a real instance for the debounce.
      const real: any = new (StorytellerSuitePlugin as any)({ vault: {}, metadataCache: {}, workspace: {} }, { id: 'x', version: '0' });
      real.tryGetEntityFolder = plugin.tryGetEntityFolder;
      real.refreshTimelineViews = plugin.refreshTimelineViews;
      real.refreshEventTimelines();
      real.refreshEventTimelines();
      real.refreshEventTimelines();
      expect(plugin.refreshTimelineViews).not.toHaveBeenCalled();
      vi.advanceTimersByTime(400);
      expect(plugin.refreshTimelineViews).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
