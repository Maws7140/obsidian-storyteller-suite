/**
 * TimelineAxis — the pure geometry + tick math for the native (post-vis-timeline)
 * renderer. It works entirely in the shared "absolute day" space produced by
 * {@link CalendarEngine}, so it is calendar-agnostic: the same code lays out a
 * Gregorian timeline, a 40-day fantasy calendar, or a 72-kō year. No DOM, no
 * Obsidian — just numbers, so it is fully unit-testable and cheap in the hot path.
 *
 * The renderer supplies a {@link AxisView} (the visible absolute-day window and
 * its pixel width); this module converts between days and pixels and produces
 * {@link AxisTick}s whose labels are drawn from the active calendar.
 */
import type { CalendarSystem } from './types';
import {
  toAbsolute,
  fromAbsolute,
  normalYearLength,
  monthLength,
  monthsInYear,
} from './CalendarEngine';

/** The visible slice of the axis the renderer is drawing. */
export interface AxisView {
  /** Absolute day at the left edge (may be fractional). */
  startDay: number;
  /** Absolute day at the right edge (must be > startDay). */
  endDay: number;
  /** Pixel width the [startDay, endDay) window is drawn across. */
  widthPx: number;
}

export type TickLevel = 'year' | 'month' | 'day' | 'hour' | 'minute';

export interface AxisTick {
  /** Position on the shared axis. */
  absoluteDay: number;
  /** Pixel offset from the left edge of the view. */
  x: number;
  /** Calendar-native label ("342", "Frost", "15"). */
  label: string;
  level: TickLevel;
}

/** Map an absolute day to a pixel offset within the view. */
export function projectDay(absoluteDay: number, view: AxisView): number {
  const span = view.endDay - view.startDay;
  return ((absoluteDay - view.startDay) / span) * view.widthPx;
}

/** Inverse of {@link projectDay} — pixel offset back to an absolute day. */
export function unprojectPx(x: number, view: AxisView): number {
  const span = view.endDay - view.startDay;
  return view.startDay + (x / view.widthPx) * span;
}

/** "Nice" year steps so tick counts stay readable at any zoom. */
const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/** Smallest nice step keeping the count at or under `maxTicks`. */
function niceYearStep(yearSpan: number, maxTicks: number): number {
  for (const step of YEAR_STEPS) {
    if (yearSpan / step <= maxTicks) return step;
  }
  // Beyond the table, round up to a power-of-ten multiple.
  let step = YEAR_STEPS[YEAR_STEPS.length - 1];
  while (yearSpan / step > maxTicks) step *= 10;
  return step;
}

/** Choose tick granularity from how many days the view spans. */
function chooseLevel(cal: CalendarSystem, spanDays: number): TickLevel {
  const yearLen = normalYearLength(cal);
  const avgMonthLen = yearLen / cal.months.length;
  if (spanDays >= yearLen * 3) return 'year';
  if (spanDays >= avgMonthLen * 3) return 'month';
  if (cal.baseUnit === 'minute' && spanDays <= 3 / 24) return 'minute';
  if (cal.baseUnit === 'minute' && spanDays <= 3) return 'hour';
  return 'day';
}

function yearLabel(cal: CalendarSystem, year: number): string {
  return cal.epochLabel ? `${year} ${cal.epochLabel}` : String(year);
}

/**
 * Generate axis ticks for the visible window, with labels taken from `cal`.
 * Granularity (year / month / day) is chosen from the span; `maxTicks` bounds
 * the count at the coarsest (year) level. Ticks are clamped to the view.
 */
export function generateTicks(
  cal: CalendarSystem,
  view: AxisView,
  maxTicks = 12,
): AxisTick[] {
  const spanDays = view.endDay - view.startDay;
  if (spanDays <= 0) return [];
  const level = chooseLevel(cal, spanDays);

  const startYear = fromAbsolute(cal, { absoluteDay: view.startDay }).year;
  const endYear = fromAbsolute(cal, { absoluteDay: view.endDay }).year;
  const ticks: AxisTick[] = [];

  // Half-open window [startDay, endDay): a tick sitting exactly on the right
  // edge belongs to the next period and would duplicate its first label.
  const push = (absoluteDay: number, label: string, lvl: TickLevel) => {
    if (absoluteDay < view.startDay || absoluteDay >= view.endDay) return;
    ticks.push({ absoluteDay, x: projectDay(absoluteDay, view), label, level: lvl });
  };

  if (level === 'year') {
    const step = niceYearStep(endYear - startYear + 1, maxTicks);
    // Snap the first labelled year down to a multiple of the step.
    const first = Math.floor(startYear / step) * step;
    for (let y = first; y <= endYear; y += step) {
      push(toAbsolute(cal, { year: y, month: 0, day: 1 }).absoluteDay, yearLabel(cal, y), 'year');
    }
    return ticks;
  }

  if (level === 'month') {
    for (let y = startYear; y <= endYear; y++) {
      const months = monthsInYear(cal, y);
      for (let m = 0; m < months.length; m++) {
        const day = toAbsolute(cal, { year: y, month: m, day: 1 }).absoluteDay;
        push(day, months[m].name, 'month');
      }
    }
    return ticks;
  }

  if (level === 'hour' || level === 'minute') {
    const startUnit = Math.floor(view.startDay * cal.unitsPerDay);
    const endUnit = Math.ceil(view.endDay * cal.unitsPerDay);
    const candidates = level === 'hour'
      ? [60, 120, 180, 360, 720]
      : [1, 2, 5, 10, 15, 30, 60];
    const rawStep = Math.max(1, (endUnit - startUnit) / maxTicks);
    const stepUnits = candidates.find(step => step >= rawStep) ?? Math.ceil(rawStep / 60) * 60;
    const firstUnit = Math.ceil(startUnit / stepUnits) * stepUnits;
    for (let unit = firstUnit; unit < endUnit; unit += stepUnits) {
      const absoluteDay = unit / cal.unitsPerDay;
      const date = fromAbsolute(cal, { absoluteDay });
      const unitOfDay = Math.round(date.unitOfDay ?? 0);
      const label = cal.unitsPerDay === 1440
        ? `${String(Math.floor(unitOfDay / 60)).padStart(2, '0')}:${String(unitOfDay % 60).padStart(2, '0')}`
        : `Unit ${unitOfDay}`;
      push(absoluteDay, label, level);
    }
    return ticks;
  }

  // day level
  for (let y = startYear; y <= endYear; y++) {
    const months = monthsInYear(cal, y);
    for (let m = 0; m < months.length; m++) {
      const len = monthLength(cal, y, m);
      for (let d = 1; d <= len; d++) {
        const day = toAbsolute(cal, { year: y, month: m, day: d }).absoluteDay;
        if (day > view.endDay) break;
        const firstVisibleTick = ticks.length === 0 && day >= view.startDay;
        const monthContext = d === 1 || firstVisibleTick;
        const monthLabel = months[m].abbr || months[m].name;
        push(day, monthContext ? `${monthLabel} ${d}` : String(d), 'day');
      }
    }
  }
  return ticks;
}
