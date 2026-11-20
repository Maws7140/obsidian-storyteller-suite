import { describe, expect, it } from 'vitest';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import { toAbsolute } from '../../src/calendar/CalendarEngine';
import type { CalendarSystem } from '../../src/calendar/types';
import {
  buildMonthGrid, daySpanOf, holidaysBetween, layoutCalendarWeek, monthOfDay, shiftMonth,
  weekdayIndex, weekdayNames,
} from '../../src/utils/TimelineCalendarGrid';

const gregorianDay = (year: number, month: number, day: number) =>
  toAbsolute(GREGORIAN_CALENDAR, { year, month, day }).absoluteDay;

/**
 * A made-up world: a 5-day week, months of 5, 3 and 4 days, and a leap year
 * every second year that adds a day to the last month. The origin (year 1,
 * month 0, day 1) sits on absolute day 1000 and falls on the first weekday.
 */
const ODD: CalendarSystem = {
  schemaVersion: 1,
  id: 'test-odd-world',
  name: 'Odd world',
  baseUnit: 'day',
  unitsPerDay: 1,
  epochAbsoluteDay: 1000,
  months: [
    { name: 'Frostmoot', days: 5 },
    { name: 'Thaw', days: 3 },
    { name: 'Bloom', days: 4 },
  ],
  week: { days: ['Moonday', 'Tideday', 'Starday', 'Windday', 'Stoneday'] },
  leapRule: { everyYears: 2, extraDays: 1, monthIndex: 2 },
  holidays: [{ name: 'Feast of Lanterns', month: 1, day: 2, length: 2, color: '#f00' }],
};

describe('TimelineCalendarGrid: Gregorian month', () => {
  it('places October 2026 from its real weekday, Thursday, in a seven-column grid', () => {
    const grid = buildMonthGrid(GREGORIAN_CALENDAR, { year: 2026, month: 9 });
    expect(grid.monthName).toBe('October');
    expect(grid.weekdays).toEqual(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
    expect(grid.columns).toBe(7);
    expect(grid.days).toHaveLength(31);
    expect(grid.days[0].column).toBe(4);
    expect(grid.rows).toBe(5);
    expect(grid.gridStart).toBe(gregorianDay(2026, 9, 1) - 4);
  });

  it('knows the weekday of a known date', () => {
    // 4 October 2026 is a Sunday.
    expect(weekdayIndex(GREGORIAN_CALENDAR, gregorianDay(2026, 9, 4))).toBe(0);
    // 1 January 0001 is a Monday in the proleptic calendar.
    expect(weekdayIndex(GREGORIAN_CALENDAR, 0)).toBe(1);
  });

  it('gives February 29 days in a leap year and 28 otherwise', () => {
    expect(buildMonthGrid(GREGORIAN_CALENDAR, { year: 2028, month: 1 }).days).toHaveLength(29);
    expect(buildMonthGrid(GREGORIAN_CALENDAR, { year: 2027, month: 1 }).days).toHaveLength(28);
  });

  it('does not treat 1900 as a leap year', () => {
    expect(buildMonthGrid(GREGORIAN_CALENDAR, { year: 1900, month: 1 }).days).toHaveLength(28);
  });

  it('wraps December into January of the next year', () => {
    expect(shiftMonth(GREGORIAN_CALENDAR, { year: 2025, month: 11 }, 1)).toEqual({ year: 2026, month: 0 });
    expect(shiftMonth(GREGORIAN_CALENDAR, { year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(monthOfDay(GREGORIAN_CALENDAR, gregorianDay(2026, 9, 17))).toEqual({ year: 2026, month: 9 });
  });
});

describe('TimelineCalendarGrid: custom calendar with odd months and a five-day week', () => {
  it('uses the calendar\'s own weekday names and count', () => {
    expect(weekdayNames(ODD)).toEqual(['Moonday', 'Tideday', 'Starday', 'Windday', 'Stoneday']);
    const grid = buildMonthGrid(ODD, { year: 1, month: 2 });
    expect(grid.monthName).toBe('Bloom');
    expect(grid.columns).toBe(5);
    expect(grid.weekdays).toHaveLength(5);
  });

  it('starts the month on the weekday its origin offset gives', () => {
    // Year 1 Bloom begins 8 days after the origin: 8 mod 5 = 3, Windday.
    const grid = buildMonthGrid(ODD, { year: 1, month: 2 });
    expect(grid.firstDay).toBe(1008);
    expect(grid.days[0].column).toBe(3);
    expect(grid.days[0].row).toBe(0);
    // Four days from column 3: Windday, Stoneday, then the second row starts at Moonday.
    expect(grid.days.map(day => [day.column, day.row])).toEqual([[3, 0], [4, 0], [0, 1], [1, 1]]);
    expect(grid.rows).toBe(2);
    expect(grid.gridStart).toBe(1005);
  });

  it('gives a fallback week of seven numbered days when the calendar has none', () => {
    const bare: CalendarSystem = { ...ODD, week: undefined };
    expect(weekdayNames(bare)).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7']);
    expect(buildMonthGrid(bare, { year: 1, month: 0 }).columns).toBe(7);
  });

  it('steps across months of different lengths', () => {
    expect(shiftMonth(ODD, { year: 1, month: 0 }, 3)).toEqual({ year: 2, month: 0 });
    expect(shiftMonth(ODD, { year: 2, month: 0 }, -1)).toEqual({ year: 1, month: 2 });
    expect(shiftMonth(ODD, { year: 1, month: 1 }, 1)).toEqual({ year: 1, month: 2 });
  });
});

describe('TimelineCalendarGrid: leap year', () => {
  it('gives the leap month its extra day only in leap years', () => {
    expect(buildMonthGrid(ODD, { year: 1, month: 2 }).days).toHaveLength(4);
    const leap = buildMonthGrid(ODD, { year: 2, month: 2 });
    expect(leap.days).toHaveLength(5);
    // Year 2 starts 12 days after the origin (year 1 is 12 days long), and Bloom 8 after that.
    expect(leap.firstDay).toBe(1020);
    expect(leap.days[0].column).toBe(0);
  });
});

describe('TimelineCalendarGrid: holidays', () => {
  it('marks every day a multi-day holiday covers, and only those', () => {
    const holidays = holidaysBetween(ODD, 1005, 1008);
    expect(holidays).toHaveLength(1);
    expect(holidays[0]).toMatchObject({ name: 'Feast of Lanterns', startDay: 1006, length: 2 });
    const grid = buildMonthGrid(ODD, { year: 1, month: 1 });
    expect(grid.days.map(day => day.holidays.map(holiday => holiday.name))).toEqual([[], ['Feast of Lanterns'], ['Feast of Lanterns']]);
  });
});

describe('TimelineCalendarGrid: spans and week rows', () => {
  it('spans an event over a month boundary: clipped in each month, with continuation marks', () => {
    const span = { key: 'trip', ...daySpanOf(gregorianDay(2026, 0, 30), gregorianDay(2026, 1, 2)) };

    const january = buildMonthGrid(GREGORIAN_CALENDAR, { year: 2026, month: 0 });
    const lastJanuaryRow = january.rows - 1;
    const januaryWeek = layoutCalendarWeek([span], january.gridStart + lastJanuaryRow * 7, 7, january.firstDay, january.lastDay, 3);
    expect(januaryWeek.segments).toEqual([
      { key: 'trip', startColumn: 5, endColumn: 6, lane: 0, continuesBefore: false, continuesAfter: true },
    ]);

    const february = buildMonthGrid(GREGORIAN_CALENDAR, { year: 2026, month: 1 });
    const firstFebruaryWeek = layoutCalendarWeek([span], february.gridStart, 7, february.firstDay, february.lastDay, 3);
    expect(firstFebruaryWeek.segments).toEqual([
      { key: 'trip', startColumn: 0, endColumn: 1, lane: 0, continuesBefore: true, continuesAfter: false },
    ]);
  });

  it('keeps overlapping spans in separate lanes and packs non-overlapping ones into one', () => {
    const spans = [
      { key: 'a', firstDay: 10, lastDay: 12 },
      { key: 'b', firstDay: 11, lastDay: 11 },
      { key: 'c', firstDay: 13, lastDay: 14 },
    ];
    const layout = layoutCalendarWeek(spans, 7, 7, 1, 31, 3);
    expect(layout.lanes).toBe(2);
    expect(Object.fromEntries(layout.segments.map(segment => [segment.key, segment.lane]))).toEqual({ a: 0, b: 1, c: 0 });
  });

  it('counts events past the visible lanes as "+N more" in each day they cover', () => {
    const spans = [
      { key: 'one', firstDay: 10, lastDay: 10 },
      { key: 'two', firstDay: 10, lastDay: 10 },
      { key: 'three', firstDay: 10, lastDay: 10 },
      { key: 'four', firstDay: 10, lastDay: 11 },
    ];
    const layout = layoutCalendarWeek(spans, 7, 7, 1, 31, 3);
    // The two-day event takes the first lane, so the single-day 'two' is the one that does not fit.
    expect(layout.segments.map(segment => segment.key)).toEqual(['four', 'one', 'three']);
    expect(layout.overflow).toEqual([{ column: 3, hidden: 1, keys: ['two'] }]);
    expect(layout.lanes).toBe(4);
  });

  it('never draws a span in a blank cell outside the month', () => {
    const layout = layoutCalendarWeek([{ key: 'late', firstDay: 28, lastDay: 40 }], 25, 7, 26, 31, 3);
    expect(layout.segments).toEqual([
      { key: 'late', startColumn: 3, endColumn: 6, lane: 0, continuesBefore: false, continuesAfter: true },
    ]);
  });
});

describe('TimelineCalendarGrid: first weekday setting', () => {
  it('starts the calendar on the chosen weekday and shifts every later day with it', () => {
    const anchored: CalendarSystem = { ...ODD, week: { days: ODD.week!.days, firstWeekday: 3 } };
    const origin = toAbsolute(anchored, { year: 1, month: 0, day: 1 }).absoluteDay;
    expect(weekdayIndex(anchored, origin)).toBe(3);
    expect(weekdayIndex(anchored, origin + 2)).toBe(0);
    expect(weekdayIndex(ODD, origin)).toBe(0);
    const grid = buildMonthGrid(anchored, { year: 1, month: 0 });
    expect(grid.days[0].column).toBe(3);
  });

  it('keeps Gregorian on its real weekdays, with or without the saved setting', () => {
    const legacy: CalendarSystem = { ...GREGORIAN_CALENDAR, week: { days: GREGORIAN_CALENDAR.week!.days } };
    const thursday = gregorianDay(2026, 9, 1);
    expect(weekdayIndex(GREGORIAN_CALENDAR, thursday)).toBe(4);
    expect(weekdayIndex(legacy, thursday)).toBe(4);
  });

  it('wraps an out-of-range setting into the week', () => {
    const wrapped: CalendarSystem = { ...ODD, week: { days: ODD.week!.days, firstWeekday: 7 } };
    const origin = toAbsolute(wrapped, { year: 1, month: 0, day: 1 }).absoluteDay;
    expect(weekdayIndex(wrapped, origin)).toBe(2);
  });
});

describe('TimelineCalendarGrid: order within a day', () => {
  it('puts the earlier event of a day above the later one, whatever their keys', () => {
    const spans = [
      { key: 'a-evening', firstDay: 10, lastDay: 10, order: 2000 },
      { key: 'b-morning', firstDay: 10, lastDay: 10, order: 1000 },
    ];
    const layout = layoutCalendarWeek(spans, 7, 7, 1, 31, 3);
    expect(layout.segments.find(s => s.key === 'b-morning')?.lane).toBe(0);
    expect(layout.segments.find(s => s.key === 'a-evening')?.lane).toBe(1);
  });
});
