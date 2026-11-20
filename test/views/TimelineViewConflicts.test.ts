import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  return new Proxy({ ...actual }, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});
(globalThis as any).window = { requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
vi.mock('../../src/modals/EventModal', () => ({ EventModal: class { open() {} } }));
import { TimelineView } from '../../src/views/TimelineView';

function makeView() {
  let stored: any[] = [];
  const setTimelineConflicts = vi.fn(async (next: any[]) => { stored = next; });
  const view: any = Object.create((TimelineView as any).prototype);
  Object.assign(view, {
    plugin: { getTimelineConflicts: () => stored, setTimelineConflicts },
    buildToolbar() {},
  });
  return { view, setTimelineConflicts };
}

const conflict = (description: string): any => ({
  id: 'conflict-ada',
  type: 'character',
  severity: 'warning',
  message: description,
  events: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }],
  details: {},
});

describe('TimelineView.handleConflicts', () => {
  it('does not write settings again when the same conflicts are detected on a later rebuild', async () => {
    const { view, setTimelineConflicts } = makeView();
    await view.handleConflicts([conflict('Ada is in two places')]);
    expect(setTimelineConflicts).toHaveBeenCalledTimes(1);
    await new Promise(res => setTimeout(res, 5));
    await view.handleConflicts([conflict('Ada is in two places')]);
    expect(setTimelineConflicts).toHaveBeenCalledTimes(1);
  });

  it('writes settings when a conflict actually changes', async () => {
    const { view, setTimelineConflicts } = makeView();
    await view.handleConflicts([conflict('Ada is in two places')]);
    await view.handleConflicts([conflict('Ada is in two places and also late')]);
    expect(setTimelineConflicts).toHaveBeenCalledTimes(2);
  });

  it('keeps the first detection time for an unchanged conflict', async () => {
    const { view, setTimelineConflicts } = makeView();
    await view.handleConflicts([conflict('Ada is in two places')]);
    const first = setTimelineConflicts.mock.calls[0][0][0].detected;
    await new Promise(res => setTimeout(res, 5));
    await view.handleConflicts([conflict('Ada is in two places')]);
    expect(setTimelineConflicts).toHaveBeenCalledTimes(1);
    expect(first).toBeTruthy();
  });
});
