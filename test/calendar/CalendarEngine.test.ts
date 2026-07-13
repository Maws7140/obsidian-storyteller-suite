import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
  toAbsolute,
  fromAbsolute,
  isLeapYear,
  daysInYear,
  normalYearLength,
  resolveCycle,
  monthsInYear,
} from '../../src/calendar/CalendarEngine';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import type { CalendarSystem, CalendarDate } from '../../src/calendar/types';
import { CALENDAR_SCHEMA_VERSION } from '../../src/calendar/types';

const G = GREGORIAN_CALENDAR;

/** Days between an ISO date and 0001-01-01, per Luxon (our oracle). */
function luxonAbsoluteDay(year: number, month: number, day: number): number {
  const origin = DateTime.fromObject({ year: 1, month: 1, day: 1 }, { zone: 'utc' });
  const d = DateTime.fromObject({ year, month, day }, { zone: 'utc' });
  return Math.round(d.diff(origin, 'days').days);
}

describe('CalendarEngine — Gregorian vs Luxon oracle', () => {
  it('normal year length is 365', () => {
    expect(normalYearLength(G)).toBe(365);
  });

  it('leap-year rule matches the 4/100/400 convention', () => {
    expect(isLeapYear(G, 2004)).toBe(true);
    expect(isLeapYear(G, 1900)).toBe(false); // divisible by 100, not 400
    expect(isLeapYear(G, 2000)).toBe(true); // divisible by 400
    expect(isLeapYear(G, 2001)).toBe(false);
    expect(daysInYear(G, 2000)).toBe(366);
    expect(daysInYear(G, 1900)).toBe(365);
  });

  it('toAbsolute matches Luxon day-diff across many CE dates', () => {
    const samples: [number, number, number][] = [
      [1, 1, 1],
      [1, 12, 31],
      [1000, 6, 15],
      [1582, 10, 15],
      [1969, 12, 31],
      [1970, 1, 1],
      [2000, 2, 29],
      [2024, 3, 2],
      [2024, 12, 31],
      [9999, 1, 1],
    ];
    for (const [y, m, d] of samples) {
      const abs = toAbsolute(G, { year: y, month: m - 1, day: d }).absoluteDay;
      expect(abs, `${y}-${m}-${d}`).toBe(luxonAbsoluteDay(y, m, d));
    }
  });

  it('round-trips date -> absolute -> date across a wide range incl. negatives', () => {
    const samples: CalendarDate[] = [
      { year: -4713, month: 0, day: 1 },
      { year: -1, month: 5, day: 30 },
      { year: 0, month: 1, day: 29 }, // year 0 is leap astronomically
      { year: 1, month: 0, day: 1 },
      { year: 753, month: 3, day: 21 },
      { year: 2024, month: 1, day: 29 },
      { year: 100000, month: 11, day: 31 },
    ];
    for (const d of samples) {
      const back = fromAbsolute(G, toAbsolute(G, d));
      expect(back, JSON.stringify(d)).toEqual({ ...d, unitOfDay: 0 });
    }
  });

  it('preserves sub-day precision via unitOfDay (minutes)', () => {
    const d: CalendarDate = { year: 2024, month: 2, day: 2, unitOfDay: 725 };
    const back = fromAbsolute(G, toAbsolute(G, d));
    expect(back).toEqual(d);
  });
});

describe('CalendarEngine — custom fantasy calendar', () => {
  // 4 months of 10 days = 40-day year, no leap, with a season cycle overlay.
  const FANTASY: CalendarSystem = {
    schemaVersion: CALENDAR_SCHEMA_VERSION,
    id: 'test-fantasy',
    name: 'Fantasy Forty',
    baseUnit: 'day',
    unitsPerDay: 1,
    epochAbsoluteDay: 1000,
    months: [
      { name: 'Frost', days: 10 },
      { name: 'Bloom', days: 10 },
      { name: 'Blaze', days: 10 },
      { name: 'Fade', days: 10 },
    ],
    cycles: [
      {
        name: 'Season',
        entries: [
          { name: 'Winter', startDayOfYear: 0 },
          { name: 'Spring', startDayOfYear: 10 },
          { name: 'Summer', startDayOfYear: 20 },
          { name: 'Autumn', startDayOfYear: 30 },
        ],
      },
    ],
  };

  it('year length has no leap days', () => {
    expect(normalYearLength(FANTASY)).toBe(40);
    expect(daysInYear(FANTASY, 5)).toBe(40);
  });

  it('origin sits at its epochAbsoluteDay', () => {
    expect(toAbsolute(FANTASY, { year: 1, month: 0, day: 1 }).absoluteDay).toBe(1000);
  });

  it('round-trips including negative years', () => {
    for (const d of [
      { year: 1, month: 0, day: 1 },
      { year: 3, month: 2, day: 7 },
      { year: -5, month: 3, day: 10 },
    ] as CalendarDate[]) {
      expect(fromAbsolute(FANTASY, toAbsolute(FANTASY, d))).toEqual({ ...d, unitOfDay: 0 });
    }
  });

  it('resolves cycle entries (seasons) by day-of-year', () => {
    expect(resolveCycle(FANTASY, { year: 2, month: 0, day: 1 }, 'Season')?.entry.name).toBe('Winter');
    expect(resolveCycle(FANTASY, { year: 2, month: 1, day: 5 }, 'Season')?.entry.name).toBe('Spring');
    expect(resolveCycle(FANTASY, { year: 2, month: 3, day: 10 }, 'Season')?.entry.name).toBe('Autumn');
    expect(resolveCycle(FANTASY, { year: 2, month: 0, day: 1 }, 'Nope')).toBeNull();
  });
});

describe('CalendarEngine — irregular calendar rules', () => {
  const IRREGULAR: CalendarSystem = {
    schemaVersion: CALENDAR_SCHEMA_VERSION,
    id: 'test-irregular',
    name: 'Irregular',
    baseUnit: 'day',
    unitsPerDay: 1,
    epochAbsoluteDay: 0,
    months: [{ name: 'First', days: 20 }, { name: 'Second', days: 20 }],
    leapRule: { cycleYears: 5, leapYears: [2, 5], extraDays: 1, monthIndex: 1 },
    intercalaryMonths: [
      { name: 'Festival', days: 4, afterMonth: 0, cycleYears: 3, years: [3] },
    ],
    yearOverrides: [
      { year: 7, months: [{ name: 'First', days: 18 }, { name: 'Long Night', days: 25 }] },
    ],
  };

  it('supports leap patterns with multiple leap years in a cycle', () => {
    expect(isLeapYear(IRREGULAR, 2)).toBe(true);
    expect(isLeapYear(IRREGULAR, 5)).toBe(true);
    expect(isLeapYear(IRREGULAR, 6)).toBe(false);
    expect(daysInYear(IRREGULAR, 2)).toBe(41);
  });

  it('inserts recurring intercalary months into matching years', () => {
    expect(monthsInYear(IRREGULAR, 3).map(month => month.name)).toEqual(['First', 'Festival', 'Second']);
    expect(daysInYear(IRREGULAR, 3)).toBe(44);
    const date = { year: 3, month: 1, day: 4 };
    expect(fromAbsolute(IRREGULAR, toAbsolute(IRREGULAR, date))).toEqual({ ...date, unitOfDay: 0 });
  });

  it('uses explicit month layouts for exceptional years', () => {
    expect(monthsInYear(IRREGULAR, 7).map(month => month.name)).toEqual(['First', 'Long Night']);
    expect(daysInYear(IRREGULAR, 7)).toBe(44);
    const date = { year: 7, month: 1, day: 25 };
    expect(fromAbsolute(IRREGULAR, toAbsolute(IRREGULAR, date))).toEqual({ ...date, unitOfDay: 0 });
  });
});
