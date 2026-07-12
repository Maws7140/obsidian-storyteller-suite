/**
 * CalendarEngine — pure, dependency-free conversion between a {@link CalendarDate}
 * expressed in some {@link CalendarSystem} and the shared universal axis
 * ({@link AbsoluteInstant}). No Obsidian, no Luxon: just integer arithmetic, so
 * it is fully unit-testable and safe to run in the timeline hot path.
 *
 * Years are astronomical (…, -1, 0, 1, …). The calendar's origin is
 * (year 1, month 0, day 1), pinned to the universal axis by
 * {@link CalendarSystem.epochAbsoluteDay}.
 */
import type {
  CalendarSystem,
  CalendarDate,
  AbsoluteInstant,
  CycleEntry,
} from './types';

/** Integer floor division that behaves correctly for negative numerators. */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Count of integers x with a <= x < b and x % n === 0 (n > 0). */
function countMultiples(a: number, b: number, n: number): number {
  if (b <= a) return 0;
  return floorDiv(b - 1, n) - floorDiv(a - 1, n);
}

/** Sum of month lengths in a normal (non-leap) year. */
export function normalYearLength(cal: CalendarSystem): number {
  let sum = 0;
  for (const m of cal.months) sum += m.days;
  return sum;
}

/** Which month absorbs the leap days (defaults to the last month). */
function leapMonthIndex(cal: CalendarSystem): number {
  const explicit = cal.leapRule?.monthIndex;
  if (explicit != null) return explicit;
  return cal.months.length - 1;
}

/** Whether `year` is a leap year under the calendar's rule (with overrides). */
export function isLeapYear(cal: CalendarSystem, year: number): boolean {
  const rule = cal.leapRule;
  if (!rule) return false;
  let leap = year % rule.everyYears === 0;
  for (const ex of rule.exceptions ?? []) {
    if (year % ex.everyYears === 0) leap = !ex.skip;
  }
  return leap;
}

/** Extra days added to `year` by the leap rule (0 when not a leap year). */
export function leapExtraDays(cal: CalendarSystem, year: number): number {
  return isLeapYear(cal, year) ? cal.leapRule!.extraDays : 0;
}

/** Total days in `year`, including any leap days. */
export function daysInYear(cal: CalendarSystem, year: number): number {
  return normalYearLength(cal) + leapExtraDays(cal, year);
}

/** Length of `monthIndex` in `year`, including leap days if it is the leap month. */
export function monthLength(cal: CalendarSystem, year: number, monthIndex: number): number {
  const base = cal.months[monthIndex].days;
  if (monthIndex === leapMonthIndex(cal)) return base + leapExtraDays(cal, year);
  return base;
}

/** Days before the first of `monthIndex` within `year` (0-based month). */
export function daysBeforeMonth(cal: CalendarSystem, year: number, monthIndex: number): number {
  let sum = 0;
  for (let i = 0; i < monthIndex; i++) sum += monthLength(cal, year, i);
  return sum;
}

/** Count of leap years in the half-open astronomical-year range [from, to). */
function countLeapYears(cal: CalendarSystem, from: number, to: number): number {
  const rule = cal.leapRule;
  if (!rule) return 0;
  let count = countMultiples(from, to, rule.everyYears);
  for (const ex of rule.exceptions ?? []) {
    count += (ex.skip ? -1 : 1) * countMultiples(from, to, ex.everyYears);
  }
  return count;
}

/** Whole days spanned by astronomical years [from, to); negative if to < from. */
function daysBetweenYears(cal: CalendarSystem, from: number, to: number): number {
  if (to === from) return 0;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const extraPerLeap = cal.leapRule?.extraDays ?? 0;
  const span =
    normalYearLength(cal) * (hi - lo) + countLeapYears(cal, lo, hi) * extraPerLeap;
  return to < from ? -span : span;
}

/** 0-based day-of-year for `date` (0 == year, month 0, day 1). */
export function dayOfYear(cal: CalendarSystem, date: CalendarDate): number {
  return daysBeforeMonth(cal, date.year, date.month) + (date.day - 1);
}

/** Whole days from the calendar origin (year 1, month 0, day 1) to `date`. */
function daysFromOrigin(cal: CalendarSystem, date: CalendarDate): number {
  return daysBetweenYears(cal, 1, date.year) + dayOfYear(cal, date);
}

/** Convert a calendar date to a point on the shared universal axis. */
export function toAbsolute(cal: CalendarSystem, date: CalendarDate): AbsoluteInstant {
  const whole = cal.epochAbsoluteDay + daysFromOrigin(cal, date);
  const frac = (date.unitOfDay ?? 0) / cal.unitsPerDay;
  return { absoluteDay: whole + frac };
}

/** Convert a universal-axis point back into `cal`'s calendar date. */
export function fromAbsolute(cal: CalendarSystem, abs: AbsoluteInstant): CalendarDate {
  const rel = abs.absoluteDay - cal.epochAbsoluteDay;
  let dayCount = Math.floor(rel);
  const frac = rel - dayCount;
  const unitOfDay = Math.round(frac * cal.unitsPerDay);
  // Rounding can push us to exactly the next day.
  if (unitOfDay >= cal.unitsPerDay) dayCount += 1;

  // Estimate the year, then correct by walking (cheap: at most a few steps).
  const avgLen =
    normalYearLength(cal) +
    (cal.leapRule ? (cal.leapRule.extraDays) / cal.leapRule.everyYears : 0);
  let year = 1 + Math.floor(dayCount / avgLen);
  while (daysBetweenYears(cal, 1, year) > dayCount) year--;
  while (daysBetweenYears(cal, 1, year + 1) <= dayCount) year++;

  let doy = dayCount - daysBetweenYears(cal, 1, year);
  let month = 0;
  while (month < cal.months.length - 1 && doy >= monthLength(cal, year, month)) {
    doy -= monthLength(cal, year, month);
    month++;
  }
  return {
    year,
    month,
    day: doy + 1,
    unitOfDay: unitOfDay >= cal.unitsPerDay ? 0 : unitOfDay,
  };
}

/**
 * Resolve which entry of a named cycle (season / sekki / kō) a date falls in.
 * Returns the entry plus its 0-based index, or null if the cycle is unknown or
 * empty. Entries are treated as contiguous spans; the last wraps to year end.
 */
export function resolveCycle(
  cal: CalendarSystem,
  date: CalendarDate,
  cycleName: string,
): { entry: CycleEntry; index: number } | null {
  const cycle = cal.cycles?.find((c) => c.name === cycleName);
  if (!cycle || cycle.entries.length === 0) return null;
  const doy = dayOfYear(cal, date);
  const entries = cycle.entries;
  let index = 0;
  for (let i = 0; i < entries.length; i++) {
    if (doy >= entries[i].startDayOfYear) index = i;
    else break;
  }
  return { entry: entries[index], index };
}
