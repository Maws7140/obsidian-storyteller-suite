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
import { formatCalendarYear } from './CalendarDateText';
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

/**
 * Smallest on-screen spacing, in pixels, between snap boundaries. Below this
 * the next coarser unit is chosen instead.
 *
 * This doubles as the slot pitch: boundaries are drawn on the lane baseline as
 * empty slots you drop events into, and a slot you cannot see is not a target.
 * So it is set by legibility rather than by pointer precision — a few pixels
 * would be aimable in principle but would carpet the baseline in dots.
 */
const MIN_SNAP_PX = 14;

/** Hard ceiling on generated slots, in case a degenerate view slips through. */
const MAX_SLOTS = 512;

export type SnapLevel = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

/** A snap granularity: `step` units of `level` per slot. */
export interface SnapResolution {
  level: SnapLevel;
  step: number;
}

/** Days in one week of this calendar. Seven only by default. */
function weekLength(cal: CalendarSystem): number {
  return cal.week?.days.length || 7;
}

/** The calendar's own origin, used to tile weeks from a fixed point. */
function calendarOrigin(cal: CalendarSystem): number {
  return toAbsolute(cal, { year: 1, month: 0, day: 1 }).absoluteDay;
}

/** Typical width in days of one step at this resolution. */
function resolutionDays(cal: CalendarSystem, level: SnapLevel, step: number): number {
  switch (level) {
    case 'minute': return step / cal.unitsPerDay;
    case 'hour': return (step * 60) / cal.unitsPerDay;
    case 'day': return step;
    case 'week': return step * weekLength(cal);
    case 'month': return step * (normalYearLength(cal) / cal.months.length);
    case 'year': return step * normalYearLength(cal);
  }
}

/**
 * Pick the granularity drag edits snap to, and slots are drawn at.
 *
 * Walks a ladder from finest to coarsest and takes the first rung at least
 * {@link MIN_SNAP_PX} wide on screen: minutes, hours, days, weeks, months, then
 * years in widening steps. Every width comes from the calendar, so a 40-day
 * fantasy month and a 5-day fantasy week size their own rungs and zooming out
 * walks the user's own units rather than Gregorian ones.
 *
 * Deliberately *not* {@link generateTicks}'s label level. Labels thin out to
 * whatever reads well; snapping needs a boundary you can aim at.
 *
 * Always returns a resolution. Year steps widen without bound, so there is no
 * zoom at which this fails to find a rung and has to draw nothing.
 */
export function chooseSnapResolution(cal: CalendarSystem, view: AxisView): SnapResolution {
  const spanDays = view.endDay - view.startDay;
  if (!(spanDays > 0)) return { level: 'day', step: 1 };
  const minDays = (spanDays / Math.max(1, view.widthPx)) * MIN_SNAP_PX;

  const ladder: SnapResolution[] = [];
  // Sub-day rungs only where time of day is actually what you are looking at.
  // The same thresholds generateTicks uses, so the slots never offer a
  // precision the axis is not labelling: a fortnight view would otherwise fit
  // twelve-hour slots and snap events to noon.
  if (cal.baseUnit === 'minute' && cal.unitsPerDay > 1) {
    if (spanDays <= 3 / 24) [1, 2, 5, 10, 15, 30].forEach(step => ladder.push({ level: 'minute', step }));
    if (spanDays <= 3) [1, 2, 3, 6, 12].forEach(step => ladder.push({ level: 'hour', step }));
  }
  ladder.push({ level: 'day', step: 1 }, { level: 'week', step: 1 }, { level: 'month', step: 1 });
  YEAR_STEPS.forEach(step => ladder.push({ level: 'year', step }));

  for (const rung of ladder) {
    if (resolutionDays(cal, rung.level, rung.step) >= minDays) return rung;
  }
  // Past the table, widen years by powers of ten. There is always a coarser
  // step, which is why this never has to give up.
  let step = YEAR_STEPS[YEAR_STEPS.length - 1];
  while (resolutionDays(cal, 'year', step) < minDays) step *= 10;
  return { level: 'year', step };
}

/**
 * Round an absolute day to the nearest real boundary of `level` in `cal`.
 *
 * Months and years cannot be snapped by modulus: `monthLength` varies, leap
 * rules add days, and intercalary months insert whole periods, so there is no
 * fixed unit to divide by. Instead this locates the period containing the day
 * and compares its two ends, which is exact for any calendar and stays O(1) in
 * the pointermove hot path.
 */
export function snapDay(cal: CalendarSystem, absoluteDay: number, res: SnapResolution): number {
  const { level, step } = res;
  if (level === 'minute' || level === 'hour') {
    const stepUnits = (level === 'minute' ? 1 : 60) * step;
    const units = absoluteDay * cal.unitsPerDay;
    return (Math.round(units / stepUnits) * stepUnits) / cal.unitsPerDay;
  }
  if (level === 'day') return Math.round(absoluteDay / step) * step;
  if (level === 'week') {
    // Weeks have no calendar anchor of their own, so they tile from the
    // calendar's origin rather than from each year's start, which would make
    // the cycle stutter every new year.
    const span = weekLength(cal) * step;
    const origin = calendarOrigin(cal);
    return origin + Math.round((absoluteDay - origin) / span) * span;
  }

  const date = fromAbsolute(cal, { absoluteDay: Math.floor(absoluteDay) });
  let lower: number;
  let upper: number;
  if (level === 'month') {
    lower = toAbsolute(cal, { year: date.year, month: date.month, day: 1 }).absoluteDay;
    const next = date.month + 1;
    upper = next < monthsInYear(cal, date.year).length
      ? toAbsolute(cal, { year: date.year, month: next, day: 1 }).absoluteDay
      : toAbsolute(cal, { year: date.year + 1, month: 0, day: 1 }).absoluteDay;
  } else {
    const anchor = Math.floor(date.year / step) * step;
    lower = toAbsolute(cal, { year: anchor, month: 0, day: 1 }).absoluteDay;
    upper = toAbsolute(cal, { year: anchor + step, month: 0, day: 1 }).absoluteDay;
  }
  return absoluteDay - lower <= upper - absoluteDay ? lower : upper;
}

/**
 * The boundary one snap unit away from `absoluteDay` in `direction` (±1).
 *
 * Used by keyboard nudging, where "one month later" has to mean the next month
 * in this calendar rather than a fixed number of days.
 */
export function stepDay(
  cal: CalendarSystem,
  absoluteDay: number,
  res: SnapResolution,
  direction: 1 | -1,
): number {
  const { level, step } = res;
  const snapped = snapDay(cal, absoluteDay, res);
  if (level === 'minute' || level === 'hour') {
    return snapped + (direction * (level === 'minute' ? 1 : 60) * step) / cal.unitsPerDay;
  }
  if (level === 'day') return snapped + direction * step;
  if (level === 'week') return snapped + direction * weekLength(cal) * step;

  const date = fromAbsolute(cal, { absoluteDay: snapped });
  if (level === 'year') {
    return toAbsolute(cal, { year: date.year + direction * step, month: 0, day: 1 }).absoluteDay;
  }
  const target = date.month + direction;
  if (target < 0) {
    const previous = date.year - 1;
    const months = monthsInYear(cal, previous);
    return toAbsolute(cal, { year: previous, month: months.length - 1, day: 1 }).absoluteDay;
  }
  if (target >= monthsInYear(cal, date.year).length) {
    return toAbsolute(cal, { year: date.year + 1, month: 0, day: 1 }).absoluteDay;
  }
  return toAbsolute(cal, { year: date.year, month: target, day: 1 }).absoluteDay;
}

/**
 * Every snap boundary in the visible window, in absolute days.
 *
 * These are the slots events drop into, so this must agree exactly with
 * {@link snapDay} — it is built from the same primitives rather than
 * re-deriving a grid, so the two cannot drift apart.
 *
 * Because {@link chooseSnapResolution} always finds a rung wide enough, slots
 * exist at every zoom: days become weeks become months become decades. An
 * earlier version returned nothing when the grid got too dense, which left the
 * user with no visible target exactly when they most needed one.
 */
export function snapSlots(cal: CalendarSystem, view: AxisView): number[] {
  const spanDays = view.endDay - view.startDay;
  if (!(spanDays > 0)) return [];
  const res = chooseSnapResolution(cal, view);
  const slots: number[] = [];
  let day = snapDay(cal, view.startDay, res);
  if (day < view.startDay) day = stepDay(cal, day, res, 1);
  while (day <= view.endDay && slots.length < MAX_SLOTS) {
    slots.push(day);
    const next = stepDay(cal, day, res, 1);
    // stepDay always advances, but a malformed calendar could stall the loop.
    if (!(next > day)) break;
    day = next;
  }
  return slots;
}

function yearLabel(cal: CalendarSystem, year: number): string {
  return formatCalendarYear(cal, year);
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
