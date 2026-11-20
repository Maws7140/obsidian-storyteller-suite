import { describe, it, expect } from 'vitest';
import { parseEventDate, toMillis } from '../../src/utils/DateParsing';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('TimelineReferenceDate', () => {
  // A custom "today" set in the plugin settings, far from the real clock.
  const customToday = new Date('2300-06-15T12:00:00Z');

  it('resolves "today" against the custom reference date', () => {
    const r = parseEventDate('today', { referenceDate: customToday, timezone: 'utc' });
    expect(r.error).toBeUndefined();
    const millis = toMillis(r.start);
    if (millis === undefined) throw new Error('expected a parsed start');
    expect(Math.abs(millis - customToday.getTime())).toBeLessThan(DAY_MS);
  });

  it('resolves "3 days ago" against the custom reference date', () => {
    const r = parseEventDate('3 days ago', { referenceDate: customToday, timezone: 'utc' });
    expect(r.error).toBeUndefined();
    const millis = toMillis(r.start);
    if (millis === undefined) throw new Error('expected a parsed start');
    const diffDays = (customToday.getTime() - millis) / DAY_MS;
    expect(diffDays).toBeGreaterThan(2.5);
    expect(diffDays).toBeLessThan(3.5);
  });

  it('does not depend on the real clock when a custom reference is given', () => {
    const r = parseEventDate('yesterday', { referenceDate: customToday, timezone: 'utc' });
    const millis = toMillis(r.start);
    if (millis === undefined) throw new Error('expected a parsed start');
    expect(millis).toBeLessThan(customToday.getTime());
    expect(millis).toBeGreaterThan(customToday.getTime() - 2 * DAY_MS);
    expect(new Date(millis).getUTCFullYear()).toBe(2300);
  });
});
