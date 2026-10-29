import { describe, it, expect } from 'vitest';
import {
  projectDay,
  unprojectPx,
  generateTicks,
  thinTicks,
  contextualTickLabel,
  type AxisView,
} from '../../src/calendar/TimelineAxis';
import { fromAbsolute, toAbsolute } from '../../src/calendar/CalendarEngine';
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

  /**
   * The Gregorian calendar carries "CE" so a date typed as "1420 CE" parses,
   * but a reader looking at an ordinary modern year does not need telling which
   * era they are in, and the suffix on every tick was noise.
   */
  it('labels Gregorian years plainly and aligns them to Jan 1', () => {
    const view: AxisView = {
      startDay: dayOf(2000, 1, 1),
      endDay: dayOf(2010, 1, 1),
      widthPx: 800,
    };
    const ticks = generateTicks(G, view);
    const t2005 = ticks.find((t) => t.label.startsWith('2005'));
    expect(t2005?.label).toBe('2005');
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
    expect(ticks[0].label).toBe('Mar 1');
    expect(ticks.some((t) => t.label === '15')).toBe(true);
  });

  it('keeps month context when a day-level view starts mid-month and crosses a boundary', () => {
    const view: AxisView = {
      startDay: dayOf(2024, 3, 12),
      endDay: dayOf(2024, 4, 8),
      widthPx: 900,
    };
    const ticks = generateTicks(G, view);
    expect(ticks[0].label).toBe('Mar 12');
    expect(ticks.find(tick => tick.absoluteDay === dayOf(2024, 4, 1))?.label).toBe('Apr 1');
    expect(ticks.find(tick => tick.absoluteDay === dayOf(2024, 3, 13))?.label).toBe('13');
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

  it('uses fantasy month names for day-level context', () => {
    const start = toAbsolute(FANTASY, { year: 5, month: 0, day: 7 }).absoluteDay;
    const view: AxisView = { startDay: start, endDay: start + 9, widthPx: 500 };
    const ticks = generateTicks(FANTASY, view);
    expect(ticks[0].label).toBe('Frost 7');
    expect(ticks.find(tick => tick.label === 'Bloom 1')).toBeDefined();
  });
});

describe('TimelineAxis — lane axis ticks (thinned, with context)', () => {
  const dayOf = (y: number, m: number, d: number) =>
    toAbsolute(G, { year: y, month: m - 1, day: d }).absoluteDay;
  /** What the Chronology and Gantt header draws: generate, thin, label. */
  const axis = (cal: CalendarSystem, view: AxisView, maxTicks: number) =>
    thinTicks(cal, generateTicks(cal, view, maxTicks), maxTicks)
      .map((tick, index) => ({ ...tick, text: contextualTickLabel(cal, tick, index) }));

  it('labels each Gregorian year once, on 1 January (the "1420, 1420, 1422" bug)', () => {
    // The view that reproduced it: two months before 1420 to mid-1423, 826px.
    const ticks = axis(G, { startDay: dayOf(1419, 11, 2), endDay: dayOf(1423, 7, 1), widthPx: 826 }, 6);
    expect(ticks.map(tick => tick.text)).toEqual(['1420', '1421', '1422', '1423']);
    ticks.forEach(tick => {
      const date = fromAbsolute(G, { absoluteDay: tick.absoluteDay });
      expect([date.month, date.day]).toEqual([0, 1]);
    });
  });

  it('never repeats a year label across many spans and widths', () => {
    for (const [from, to] of [[1, 30], [1420, 1424], [1899, 1911], [2000, 2100], [-500, 400], [1066, 1067]]) {
      for (const width of [300, 826, 1600]) {
        const maxTicks = Math.max(2, Math.floor(width / 120));
        const ticks = axis(G, { startDay: dayOf(from, 1, 1) - 17, endDay: dayOf(to, 1, 1) + 40, widthPx: width }, maxTicks);
        const labels = ticks.map(tick => tick.text);
        expect(new Set(labels).size).toBe(labels.length);
        expect(ticks.length).toBeLessThanOrEqual(maxTicks + 1);
      }
    }
  });

  it('reads years before 1 CE as BCE, not as negative numbers', () => {
    const ticks = axis(G, { startDay: dayOf(-10, 1, 1), endDay: dayOf(10, 1, 1), widthPx: 800 }, 6);
    expect(ticks.map(tick => tick.text)).toContain('1 BCE');
    expect(ticks.some(tick => tick.text.startsWith('-'))).toBe(false);
  });

  it('thins months to whole steps that keep January', () => {
    const ticks = axis(G, { startDay: dayOf(2024, 1, 1), endDay: dayOf(2026, 11, 1), widthPx: 826 }, 6);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks.every(tick => fromAbsolute(G, { absoluteDay: tick.absoluteDay }).month % 6 === 0)).toBe(true);
    expect(ticks[0].text).toBe('January 2024');
    expect(ticks.map(tick => tick.text)).toContain('July 2025');
  });

  it('thins days to month-aligned steps without crowding a month end', () => {
    const ticks = axis(G, { startDay: dayOf(2024, 3, 1), endDay: dayOf(2024, 5, 1), widthPx: 826 }, 6);
    const days = ticks.map(tick => fromAbsolute(G, { absoluteDay: tick.absoluteDay }).day);
    // Steps of 10 fit six ticks; day 31 would sit on top of the next 1st.
    expect(days).toEqual([1, 11, 21, 1, 11, 21]);
    expect(ticks[0].text).toBe('Mar 1, 2024');
  });

  it('gives the first thinned day tick its month and year', () => {
    const ticks = axis(G, { startDay: dayOf(2024, 3, 12), endDay: dayOf(2024, 5, 20), widthPx: 826 }, 6);
    const first = fromAbsolute(G, { absoluteDay: ticks[0].absoluteDay });
    expect(ticks[0].text).toBe(`${G.months[first.month].abbr} ${first.day}, 2024`);
  });

  it('leaves ticks alone when they already fit', () => {
    const view: AxisView = { startDay: dayOf(2024, 3, 1), endDay: dayOf(2024, 3, 8), widthPx: 900 };
    const ticks = generateTicks(G, view, 12);
    expect(thinTicks(G, ticks, 12)).toBe(ticks);
  });

  it('thins a custom calendar by its own months', () => {
    const SEASONS: CalendarSystem = {
      schemaVersion: CALENDAR_SCHEMA_VERSION, id: 'seasons', name: 'Seasons', baseUnit: 'day', unitsPerDay: 1,
      epochAbsoluteDay: 0, epochLabel: 'S',
      months: [{ name: 'Thaw', days: 20 }, { name: 'Bloom', days: 20 }, { name: 'Ash', days: 20 }, { name: 'Rime', days: 20 }],
    };
    const start = toAbsolute(SEASONS, { year: 3, month: 0, day: 1 }).absoluteDay;
    const ticks = axis(SEASONS, { startDay: start, endDay: start + 80 * 2.5, widthPx: 500 }, 4);
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(ticks[0].text).toBe('Thaw 3 S');
  });
});

