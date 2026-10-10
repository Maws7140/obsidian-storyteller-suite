import { describe, expect, it } from 'vitest';
import { EraManager, resolveEraEndInstant } from '../../src/utils/EraManager';
import type { Event, TimelineEra } from '../../src/types';

const era = (endDate: string): TimelineEra => ({ id: 'e', name: 'Age of X', startDate: '1400', endDate, events: [] } as any);
const event = (id: string, dateTime: string): Event => ({ id, name: id, dateTime } as any);

describe('resolveEraEndInstant', () => {
  it('a year end covers the whole year', () => {
    expect(resolveEraEndInstant('1420')?.toISO()).toMatch(/^1420-12-31T23:59:59/);
  });

  it('a month end covers the whole month', () => {
    expect(resolveEraEndInstant('1420-02')?.toISO()).toMatch(/^1420-02-29T23:59:59/);
  });

  it('a day end covers the whole day', () => {
    expect(resolveEraEndInstant('1420-03-15')?.toISO()).toMatch(/^1420-03-15T23:59:59/);
  });

  it('a timed end stays at its instant', () => {
    expect(resolveEraEndInstant('1420-03-15 10:00')?.toISO()).toMatch(/^1420-03-15T10:00:00/);
  });

  it('returns undefined for text that does not parse', () => {
    expect(resolveEraEndInstant('not a date')).toBeUndefined();
    expect(resolveEraEndInstant(undefined)).toBeUndefined();
  });
});

describe('era containment with year-only end dates', () => {
  it('a year-only end date keeps the events of that year', () => {
    const events = [
      event('early', '1410-05-01'),
      event('last-year', '1420-03-15'),
      event('dec', '1420-12-01'),
      event('after', '1421-01-02'),
    ];
    const inEra = EraManager.getEventsInEra(era('1420'), events).map(e => e.id);
    expect(inEra).toEqual(['early', 'last-year', 'dec']);
  });

  it('a range overlapping only the last year of an era is reported as overlapping', () => {
    const hits = EraManager.getErasForDateRange([era('1420')], '1420-03-01', '1420-06-01').map(e => e.name);
    expect(hits).toEqual(['Age of X']);
  });

  it('a range after the era does not overlap it', () => {
    const hits = EraManager.getErasForDateRange([era('1420')], '1421-03-01', '1421-06-01');
    expect(hits).toEqual([]);
  });

  it('an event in the last year is found by findErasForEvent', () => {
    const found = EraManager.findErasForEvent(event('dec', '1420-12-01'), [era('1420')]).map(e => e.name);
    expect(found).toEqual(['Age of X']);
  });
});
