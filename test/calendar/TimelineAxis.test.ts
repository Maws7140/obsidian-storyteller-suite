import { describe, it, expect } from 'vitest';
import {
  projectDay,
  unprojectPx,
  generateTicks,
  type AxisView,
} from '../../src/calendar/TimelineAxis';
import { toAbsolute } from '../../src/calendar/CalendarEngine';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import type { CalendarSystem } from '../../src/calendar/types';
import { CALENDAR_SCHEMA_VERSION } from '../../src/calendar/types';

const G = GREGORIAN_CALENDAR;

describe('TimelineAxis — projection', () => {
  const view: AxisView = { startDay: 1000, endDay: 2000, widthPx: 500 };

  it('projects edges and midpoint linearly', () => {
    expect(projectDay(1000, view)).toBe(0);
    expect(projectDay(2000, view)).toBe(500);
    expect(projectDay(1500, view)).toBe(250);
  });

  it('unproject inverts project', () => {
    for (const day of [1000, 1234, 1750, 2000]) {
      expect(unprojectPx(projectDay(day, view), view)).toBeCloseTo(day, 6);
    }
  });
});

describe('TimelineAxis — Gregorian tick generation', () => {
  const dayOf = (y: number, m: number, d: number) =>
    toAbsolute(G, { year: y, month: m - 1, day: d }).absoluteDay;

  it('uses year granularity for a multi-century span, with nice steps', () => {
    const view: AxisView = {
      startDay: dayOf(1800, 1, 1),
      endDay: dayOf(2000, 1, 1),
      widthPx: 1000,
    };
    const ticks = generateTicks(G, view);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((t) => t.level === 'year')).toBe(true);
    expect(ticks.length).toBeLessThanOrEqual(12);
    // Consecutive year ticks are evenly spaced on a single "nice" step.
    const years = ticks.map((t) => parseInt(t.label));
    const step = years[1] - years[0];
    expect([1, 2, 5, 10, 20, 25, 50, 100]).toContain(step);
    for (let i = 1; i < years.length; i++) {
      expect(years[i] - years[i - 1]).toBe(step);
      expect(years[i] % step).toBe(0);
    }
  });

  it('year labels carry the epoch label and align to Jan 1', () => {
    const view: AxisView = {
      startDay: dayOf(2000, 1, 1),
      endDay: dayOf(2010, 1, 1),
      widthPx: 800,
    };
    const ticks = generateTicks(G, view);
    const t2005 = ticks.find((t) => t.label.startsWith('2005'));
    expect(t2005?.label).toBe('2005 CE');
    expect(t2005?.absoluteDay).toBe(dayOf(2005, 1, 1));
  });

  it('uses month granularity within a single year', () => {
    const view: AxisView = {
      startDay: dayOf(2024, 1, 1),
      endDay: dayOf(2024, 12, 31),
      widthPx: 1200,
    };
    const ticks = generateTicks(G, view);
    expect(ticks.every((t) => t.level === 'month')).toBe(true);
    expect(ticks.map((t) => t.label)).toContain('March');
    // First tick sits at the left edge, projected to x=0.
    expect(ticks[0].x).toBeCloseTo(0, 6);
  });

  it('uses day granularity for a sub-month span', () => {
    const view: AxisView = {
      startDay: dayOf(2024, 3, 1),
      endDay: dayOf(2024, 3, 20),
      widthPx: 600,
    };
    const ticks = generateTicks(G, view);
    expect(ticks.every((t) => t.level === 'day')).toBe(true);
    expect(ticks[0].label).toBe('1');
    expect(ticks.some((t) => t.label === '15')).toBe(true);
  });

  it('uses hour ticks when zoomed inside a day', () => {
    const start = toAbsolute(G, { year: 2024, month: 2, day: 1, unitOfDay: 8 * 60 }).absoluteDay;
    const ticks = generateTicks(G, { startDay: start, endDay: start + 12 / 24, widthPx: 900 });
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((tick) => tick.level === 'hour')).toBe(true);
    expect(ticks.some((tick) => tick.label === '12:00')).toBe(true);
  });

  it('uses minute ticks at the closest zoom level', () => {
    const start = toAbsolute(G, { year: 2024, month: 2, day: 1, unitOfDay: 10 * 60 }).absoluteDay;
    const ticks = generateTicks(G, { startDay: start, endDay: start + 30 / 1440, widthPx: 900 });
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((tick) => tick.level === 'minute')).toBe(true);
    expect(ticks.some((tick) => tick.label === '10:15')).toBe(true);
  });

  it('keeps every tick inside the view window', () => {
    const view: AxisView = {
      startDay: dayOf(1950, 6, 15),
      endDay: dayOf(2050, 6, 15),
      widthPx: 900,
    };
    for (const t of generateTicks(G, view)) {
      expect(t.absoluteDay).toBeGreaterThanOrEqual(view.startDay);
      expect(t.absoluteDay).toBeLessThanOrEqual(view.endDay);
    }
  });
});

describe('TimelineAxis — custom-calendar ticks', () => {
  // 40-day year (4 months x 10 days), epoch offset, no leap.
  const FANTASY: CalendarSystem = {
    schemaVersion: CALENDAR_SCHEMA_VERSION,
    id: 'axis-fantasy',
    name: 'Fantasy Forty',
    baseUnit: 'day',
    unitsPerDay: 1,
    epochAbsoluteDay: 0,
    epochLabel: 'AF',
    months: [
      { name: 'Frost', days: 10 },
      { name: 'Bloom', days: 10 },
      { name: 'Blaze', days: 10 },
      { name: 'Fade', days: 10 },
    ],
  };

  it('emits native month names, not Gregorian ones', () => {
    // One full 40-day year -> month granularity.
    const start = toAbsolute(FANTASY, { year: 5, month: 0, day: 1 }).absoluteDay;
    const view: AxisView = { startDay: start, endDay: start + 40, widthPx: 400 };
    const ticks = generateTicks(FANTASY, view);
    expect(ticks.every((t) => t.level === 'month')).toBe(true);
    expect(ticks.map((t) => t.label)).toEqual(['Frost', 'Bloom', 'Blaze', 'Fade']);
  });

  it('year ticks respect the 40-day year length', () => {
    const start = toAbsolute(FANTASY, { year: 1, month: 0, day: 1 }).absoluteDay;
    const view: AxisView = { startDay: start, endDay: start + 40 * 10, widthPx: 800 };
    const ticks = generateTicks(FANTASY, view);
    expect(ticks.every((t) => t.level === 'year')).toBe(true);
    // Year 2 begins exactly 40 days after year 1.
    const y2 = ticks.find((t) => t.label === '2 AF');
    expect(y2?.absoluteDay).toBe(start + 40);
  });
});
