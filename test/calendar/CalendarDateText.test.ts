import { describe, it, expect } from 'vitest';
import {
  parseInCalendar,
  formatInCalendar,
  parseToAbsoluteDay,
  formatAbsoluteDay,
  formatCalendarYear,
} from '../../src/calendar/CalendarDateText';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import type { CalendarSystem } from '../../src/calendar/types';
import { CALENDAR_SCHEMA_VERSION } from '../../src/calendar/types';

const FANTASY: CalendarSystem = {
  schemaVersion: CALENDAR_SCHEMA_VERSION,
  id: 'text-fantasy',
  name: 'Fantasy Forty',
  baseUnit: 'day',
  unitsPerDay: 1,
  epochAbsoluteDay: 0,
  epochLabel: 'AF',
  months: [
    { name: 'Frost', abbr: 'Fr', days: 10 },
    { name: 'Bloom', abbr: 'Bl', days: 10 },
    { name: 'Blaze', abbr: 'Bz', days: 10 },
    { name: 'Fade', abbr: 'Fa', days: 10 },
  ],
};

describe('CalendarDateText — parse in a custom calendar', () => {
  it('parses numeric year / month / day (unpadded)', () => {
    expect(parseInCalendar('342', FANTASY)).toEqual({
      date: { year: 342, month: 0, day: 1, unitOfDay: 0 },
      precision: 'year',
    });
    expect(parseInCalendar('342-3', FANTASY)?.precision).toBe('month');
    expect(parseInCalendar('342-3-7', FANTASY)).toEqual({
      date: { year: 342, month: 2, day: 7, unitOfDay: 0 },
      precision: 'day',
    });
  });

  it('parses month names in several orders', () => {
    expect(parseInCalendar('Frost 5, 342', FANTASY)?.date).toEqual({ year: 342, month: 0, day: 5 });
    expect(parseInCalendar('5 Blaze 342', FANTASY)?.date).toEqual({ year: 342, month: 2, day: 5 });
    expect(parseInCalendar('Fade 342', FANTASY)).toEqual({
      date: { year: 342, month: 3, day: 1 },
      precision: 'month',
    });
  });

  it('accepts and strips a trailing epoch label', () => {
    expect(parseInCalendar('342 AF', FANTASY)?.date.year).toBe(342);
    expect(parseInCalendar('Frost 5, 342 AF', FANTASY)?.date).toEqual({ year: 342, month: 0, day: 5 });
  });

  it('rejects out-of-range months and days', () => {
    expect(parseInCalendar('342-5-1', FANTASY)).toBeNull(); // only 4 months
    expect(parseInCalendar('342-1-11', FANTASY)).toBeNull(); // months are 10 days
    expect(parseInCalendar('Smorgle 5, 342', FANTASY)).toBeNull(); // unknown month
  });

  it('round-trips parse -> format for each precision', () => {
    for (const [text, precision] of [
      ['342', 'year'],
      ['Frost 342', 'month'],
      ['Frost 5, 342', 'day'],
    ] as const) {
      const p = parseInCalendar(text, FANTASY)!;
      expect(p.precision).toBe(precision);
      expect(formatInCalendar(p.date, FANTASY, p.precision)).toBe(
        precision === 'year' ? '342 AF' : precision === 'month' ? 'Frost 342 AF' : 'Frost 5, 342 AF',
      );
    }
  });

  it('round-trips through the shared absolute-day axis', () => {
    const abs = parseToAbsoluteDay('Blaze 7, 342', FANTASY)!;
    expect(formatAbsoluteDay(abs, FANTASY)).toBe('Blaze 7, 342 AF');
  });
});

describe('CalendarDateText — Gregorian (minute base unit)', () => {
  it('parses clock time into unitOfDay minutes', () => {
    const p = parseInCalendar('2024-03-02 14:30', GREGORIAN_CALENDAR)!;
    expect(p.precision).toBe('time');
    expect(p.date).toEqual({ year: 2024, month: 2, day: 2, unitOfDay: 14 * 60 + 30 });
    expect(formatInCalendar(p.date, GREGORIAN_CALENDAR, 'time')).toBe('March 2, 2024 CE 14:30');
  });
});

/**
 * The epoch label only earns its place when the calendar is somebody's own.
 * "March 15, 2024 CE" on the default calendar is the reader being told which
 * era they live in.
 */
describe('formatCalendarYear', () => {
  it('leaves an ordinary Gregorian year alone', () => {
    expect(formatCalendarYear(GREGORIAN_CALENDAR, 2024)).toBe('2024');
  });

  it('reads a pre-epoch Gregorian year as BCE rather than a negative number', () => {
    // Astronomical years: 0 is 1 BCE, -43 is 44 BCE.
    expect(formatCalendarYear(GREGORIAN_CALENDAR, 0)).toBe('1 BCE');
    expect(formatCalendarYear(GREGORIAN_CALENDAR, -43)).toBe('44 BCE');
  });

  it("keeps a custom calendar's own epoch label", () => {
    expect(formatCalendarYear(FANTASY, 342)).toBe('342 AF');
  });

  it('gives a custom calendar with no label a bare year', () => {
    expect(formatCalendarYear({ ...FANTASY, epochLabel: '' }, 342)).toBe('342');
  });
});

describe('CalendarDateText — named months with a clock in a minute calendar', () => {
  const MINUTE: CalendarSystem = {
    schemaVersion: CALENDAR_SCHEMA_VERSION,
    id: 'text-minute-named',
    name: 'Minute Named',
    baseUnit: 'minute',
    unitsPerDay: 1440,
    epochAbsoluteDay: 0,
    epochLabel: 'MC',
    months: [
      { name: 'A', days: 30 },
      { name: 'B', days: 30 },
      { name: 'C', days: 30 },
    ],
  };

  it('reads the "Name day, year EPOCH HH:MM" form that formatInCalendar writes', () => {
    const parsed = parseInCalendar('B 12, 1 MC 00:00', MINUTE);
    expect(parsed).not.toBeNull();
    expect(parsed!.precision).toBe('time');
    expect(parsed!.date).toMatchObject({ year: 1, month: 1, day: 12 });
    expect(parsed!.date.unitOfDay ?? 0).toBe(0);
  });

  it('round-trips every timed date through format and parse', () => {
    const samples = [
      { year: 1, month: 1, day: 12, unitOfDay: 0 },
      { year: 1, month: 1, day: 12, unitOfDay: 605 },
      { year: 2, month: 0, day: 1, unitOfDay: 1439 },
      { year: 0, month: 2, day: 30, unitOfDay: 90 },
    ];
    for (const date of samples) {
      const text = formatInCalendar(date, MINUTE, 'time');
      const parsed = parseInCalendar(text, MINUTE);
      expect(parsed, text).not.toBeNull();
      expect(parsed!.precision, text).toBe('time');
      expect(parsed!.date.year, text).toBe(date.year);
      expect(parsed!.date.month, text).toBe(date.month);
      expect(parsed!.date.day, text).toBe(date.day);
      expect(parsed!.date.unitOfDay ?? 0, text).toBe(date.unitOfDay);
    }
  });

  it('still reads the named day form without a clock', () => {
    const parsed = parseInCalendar('B 12, 1 MC', MINUTE);
    expect(parsed?.precision).toBe('day');
    expect(parsed?.date).toMatchObject({ year: 1, month: 1, day: 12 });
  });
});
