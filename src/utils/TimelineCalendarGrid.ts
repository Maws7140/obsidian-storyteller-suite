/**
 * Date arithmetic for the Timeline's Calendar view: which days a month covers,
 * where each one falls in the week, which holidays land on it, and how an
 * event's days wrap across the week rows of a month. Pure, so it runs without
 * the DOM and can be unit-tested directly.
 *
 * Days are absolute days on the shared axis (see CalendarEngine). A span is an
 * inclusive day range, and a fractional instant belongs to the day it falls in.
 */
import { fromAbsolute, monthLength, monthsInYear, toAbsolute } from '../calendar/CalendarEngine';
import { GREGORIAN_CALENDAR } from '../calendar/builtins';
import type { CalendarSystem } from '../calendar/types';

/** Columns used when a calendar defines no week, so the grid still reads as a week. */
const FALLBACK_WEEK_DAYS = 7;

/** A month of a calendar, by astronomical year and 0-based month index. */
export interface CalendarMonthRef {
  year: number;
  month: number;
}

/** A holiday as it falls in a particular year. `startDay` is absolute. */
export interface CalendarHoliday {
  name: string;
  startDay: number;
  length: number;
  color?: string;
}

/** One day of a month grid. `row` and `column` place it in the week rows. */
export interface CalendarGridDay {
  absoluteDay: number;
  /** 1-based day of the month. */
  day: number;
  column: number;
  row: number;
  holidays: CalendarHoliday[];
}

export interface CalendarMonthGrid {
  ref: CalendarMonthRef;
  monthName: string;
  /** Column headers, one per weekday. */
  weekdays: string[];
  columns: number;
  rows: number;
  /** Absolute day of the 1st, and of the last day of the month. */
  firstDay: number;
  lastDay: number;
  /** Absolute day in column 0 of row 0. Days before the 1st are blank cells. */
  gridStart: number;
  days: CalendarGridDay[];
}

/** An inclusive run of absolute days, e.g. the days an event covers. */
export interface CalendarDaySpan {
  key: string;
  firstDay: number;
  lastDay: number;
}

/** One event's chip within a single week row. Columns are 0-based and inclusive. */
export interface CalendarWeekSegment {
  key: string;
  startColumn: number;
  endColumn: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** Events hidden in one column of a week row because the lanes were full. */
export interface CalendarWeekOverflow {
  column: number;
  hidden: number;
  keys: string[];
}

export interface CalendarWeekLayout {
  /** Chip rows to draw, including the "+N more" row when anything is hidden. */
  lanes: number;
  segments: CalendarWeekSegment[];
  overflow: CalendarWeekOverflow[];
}

/** Weekday names in order. Falls back to numbered days when the calendar has no week. */
export function weekdayNames(cal: CalendarSystem): string[] {
  const names = cal.week?.days.filter(name => name.trim().length > 0) ?? [];
  if (names.length) return names;
  return Array.from({ length: FALLBACK_WEEK_DAYS }, (_, index) => `Day ${index + 1}`);
}

export function weekLength(cal: CalendarSystem): number {
  return weekdayNames(cal).length;
}

/**
 * Which weekday index the calendar's origin day falls on, from the week's
 * `firstWeekday` setting. The built-in Gregorian origin, 0001-01-01, is a
 * Monday; a saved copy of it from before the setting existed keeps that.
 */
export function weekdayOfOrigin(cal: CalendarSystem): number {
  const length = weekLength(cal);
  const anchor = cal.week?.firstWeekday ?? (cal.id === GREGORIAN_CALENDAR.id ? 1 : 0);
  const index = Number.isFinite(anchor) ? Math.floor(anchor) : 0;
  return ((index % length) + length) % length;
}

/** Weekday index (0-based, into weekdayNames) of an absolute day. */
export function weekdayIndex(cal: CalendarSystem, absoluteDay: number): number {
  const length = weekLength(cal);
  const offset = Math.floor(absoluteDay) - cal.epochAbsoluteDay + weekdayOfOrigin(cal);
  return ((offset % length) + length) % length;
}

/** The month that contains an absolute day. */
export function monthOfDay(cal: CalendarSystem, absoluteDay: number): CalendarMonthRef {
  const date = fromAbsolute(cal, { absoluteDay: Math.floor(absoluteDay) });
  return { year: date.year, month: date.month };
}

/** Absolute day of the 1st of a month. */
export function monthStartDay(cal: CalendarSystem, ref: CalendarMonthRef): number {
  return Math.floor(toAbsolute(cal, { year: ref.year, month: ref.month, day: 1 }).absoluteDay);
}

/** The month `delta` months away, crossing year boundaries as the calendar's years allow. */
export function shiftMonth(cal: CalendarSystem, ref: CalendarMonthRef, delta: number): CalendarMonthRef {
  let { year, month } = ref;
  let remaining = Math.trunc(delta);
  while (remaining > 0) {
    month++;
    remaining--;
    if (month >= monthsInYear(cal, year).length) {
      month = 0;
      year++;
    }
  }
  while (remaining < 0) {
    month--;
    remaining++;
    if (month < 0) {
      year--;
      month = monthsInYear(cal, year).length - 1;
    }
  }
  return { year, month };
}

/**
 * The holidays of one year, placed on the axis. A holiday names its month by
 * the base calendar's month, so it is found by name in that year's months,
 * which is how the Timeline's calendar bands have always found them.
 */
export function holidayOccurrencesInYear(cal: CalendarSystem, year: number): CalendarHoliday[] {
  const yearMonths = monthsInYear(cal, year);
  const occurrences: CalendarHoliday[] = [];
  for (const holiday of cal.holidays ?? []) {
    const baseMonth = cal.months[holiday.month];
    const month = baseMonth ? yearMonths.findIndex(candidate => candidate.name === baseMonth.name) : -1;
    if (month < 0 || holiday.day > monthLength(cal, year, month)) continue;
    occurrences.push({
      name: holiday.name,
      startDay: toAbsolute(cal, { year, month, day: holiday.day }).absoluteDay,
      length: Math.max(1, holiday.length || 1),
      color: holiday.color,
    });
  }
  return occurrences;
}

/** Holidays that share at least one day with [fromDay, toDay). */
export function holidaysBetween(cal: CalendarSystem, fromDay: number, toDay: number): CalendarHoliday[] {
  if (!cal.holidays?.length || toDay <= fromDay) return [];
  // A holiday can start in the year before and run into this one, so look one year either side.
  const firstYear = fromAbsolute(cal, { absoluteDay: fromDay }).year - 1;
  const lastYear = fromAbsolute(cal, { absoluteDay: toDay - 1 }).year + 1;
  const found: CalendarHoliday[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    for (const holiday of holidayOccurrencesInYear(cal, year)) {
      if (holiday.startDay < toDay && holiday.startDay + holiday.length > fromDay) found.push(holiday);
    }
  }
  return found;
}

/** Lay out one month as week rows. The leading blank cells come from the weekday of the 1st. */
export function buildMonthGrid(cal: CalendarSystem, ref: CalendarMonthRef): CalendarMonthGrid {
  const columns = weekLength(cal);
  const firstDay = monthStartDay(cal, ref);
  const length = monthLength(cal, ref.year, ref.month);
  const lastDay = firstDay + length - 1;
  const leading = weekdayIndex(cal, firstDay);
  const holidays = holidaysBetween(cal, firstDay, lastDay + 1);
  const days: CalendarGridDay[] = [];
  for (let index = 0; index < length; index++) {
    const absoluteDay = firstDay + index;
    const position = leading + index;
    days.push({
      absoluteDay,
      day: index + 1,
      column: position % columns,
      row: Math.floor(position / columns),
      holidays: holidays.filter(holiday => holiday.startDay <= absoluteDay && absoluteDay < holiday.startDay + holiday.length),
    });
  }
  return {
    ref: { year: ref.year, month: ref.month },
    monthName: monthsInYear(cal, ref.year)[ref.month]?.name ?? `Month ${ref.month + 1}`,
    weekdays: weekdayNames(cal),
    columns,
    rows: Math.ceil((leading + length) / columns),
    firstDay,
    lastDay,
    gridStart: firstDay - leading,
    days,
  };
}

/** The whole days an instant range covers. An end on the same day as the start still covers that day. */
export function daySpanOf(startAbsoluteDay: number, endAbsoluteDay: number): { firstDay: number; lastDay: number } {
  const firstDay = Math.floor(startAbsoluteDay);
  return { firstDay, lastDay: Math.max(firstDay, Math.floor(endAbsoluteDay)) };
}

/**
 * Place the spans that touch one week row. Spans are clipped to the month, so
 * blank cells never carry a chip. Lanes are assigned greedily by start day,
 * which keeps the row as short as the overlaps allow. Anything past
 * `maxLanes` is counted per column as "+N more" instead of drawn.
 */
export function layoutCalendarWeek(
  spans: readonly CalendarDaySpan[],
  weekStart: number,
  columns: number,
  monthFirst: number,
  monthLast: number,
  maxLanes: number,
): CalendarWeekLayout {
  const from = Math.max(weekStart, monthFirst);
  const to = Math.min(weekStart + columns - 1, monthLast);
  const placed: CalendarWeekSegment[] = [];
  for (const span of spans) {
    const first = Math.max(span.firstDay, from);
    const last = Math.min(span.lastDay, to);
    if (first > last) continue;
    placed.push({
      key: span.key,
      startColumn: first - weekStart,
      endColumn: last - weekStart,
      lane: 0,
      continuesBefore: span.firstDay < first,
      continuesAfter: span.lastDay > last,
    });
  }
  placed.sort((a, b) => a.startColumn - b.startColumn
    || (b.endColumn - b.startColumn) - (a.endColumn - a.startColumn)
    || a.key.localeCompare(b.key));

  // The last column each lane is occupied up to.
  const laneEnds: number[] = [];
  for (const segment of placed) {
    let lane = laneEnds.findIndex(end => end < segment.startColumn);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(segment.endColumn);
    } else {
      laneEnds[lane] = segment.endColumn;
    }
    segment.lane = lane;
  }

  const segments = placed.filter(segment => segment.lane < maxLanes);
  const hiddenByColumn = new Map<number, CalendarWeekOverflow>();
  for (const segment of placed) {
    if (segment.lane < maxLanes) continue;
    for (let column = segment.startColumn; column <= segment.endColumn; column++) {
      const entry = hiddenByColumn.get(column) ?? { column, hidden: 0, keys: [] };
      entry.hidden++;
      entry.keys.push(segment.key);
      hiddenByColumn.set(column, entry);
    }
  }
  const overflow = Array.from(hiddenByColumn.values()).sort((a, b) => a.column - b.column);
  const usedLanes = segments.reduce((most, segment) => Math.max(most, segment.lane + 1), 0);
  return { lanes: overflow.length ? maxLanes + 1 : usedLanes, segments, overflow };
}
