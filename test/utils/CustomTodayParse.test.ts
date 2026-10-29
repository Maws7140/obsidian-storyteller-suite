import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async (orig) => {
  const actual: any = await orig();
  const merged: any = { ...actual };
  return new Proxy(merged, { get: (target, key) => (typeof key === 'string' && key !== 'then' && !(key in target) ? (target[key] = function Stub() {}) : target[key]) });
});

import StorytellerSuitePlugin from '../../src/main';

/** Call the real getReferenceTodayDate with only the settings it reads. */
function todayFor(customTodayISO: string | undefined): Date {
  const fakePlugin = { settings: { customTodayISO } } as any;
  return (StorytellerSuitePlugin.prototype as any).getReferenceTodayDate.call(fakePlugin);
}

describe('getReferenceTodayDate reads a custom today with the event date parser', () => {
  it.each([
    ['44 BCE', -43, 0, 1],
    ['-0044-03-15', -44, 2, 15],
    ['-000044-03-15', -44, 2, 15],
    ['-44-03-15', -44, 2, 15],
    ['1420-06-01', 1420, 5, 1],
  ])('reads %s as the right day', (input, year, month, day) => {
    const date = todayFor(input);
    expect(date.getUTCFullYear()).toBe(year);
    expect(date.getUTCMonth()).toBe(month);
    expect(date.getUTCDate()).toBe(day);
  }, 60_000);

  it('uses the system clock when no custom today is set', () => {
    const before = Date.now();
    const date = todayFor(undefined);
    expect(Math.abs(date.getTime() - before)).toBeLessThan(5_000);
  }, 60_000);

  it('falls back to the system clock for text it cannot read', () => {
    const before = Date.now();
    const date = todayFor('someday soon-ish');
    expect(Math.abs(date.getTime() - before)).toBeLessThan(5_000);
  }, 60_000);
});
