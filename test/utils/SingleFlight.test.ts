import { describe, it, expect, vi } from 'vitest';
import { singleFlight } from '../../src/utils/SingleFlight';

/**
 * A double click on Save or Create must run the action once. The second click
 * used to start a second write, which found the file the first had created and
 * reported a false failure.
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

describe('singleFlight', () => {
  it('ignores a second activation while the first is still running', async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    const busy: boolean[] = [];
    const run = singleFlight(action, value => busy.push(value));

    run();
    run();
    expect(action).toHaveBeenCalledTimes(1);
    expect(busy).toEqual([true]);

    gate.resolve();
    await gate.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(busy).toEqual([true, false]);
  });

  it('runs again once the first activation has finished', async () => {
    const action = vi.fn(async () => {});
    const run = singleFlight(action);
    run();
    await new Promise(resolve => setTimeout(resolve, 0));
    run();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('becomes available again when the action throws', async () => {
    const action = vi.fn(async () => { throw new Error('write failed'); });
    const busy: boolean[] = [];
    const run = singleFlight(action, value => busy.push(value));
    run();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(busy).toEqual([true, false]);
    run();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(action).toHaveBeenCalledTimes(2);
  });
});
