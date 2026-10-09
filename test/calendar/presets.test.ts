import { describe, it, expect } from 'vitest';
import { THIRTEEN_MOONS, JAPANESE_KO, TABULAR_HIJRI } from '../../src/calendar/presets';
import { daysInYear, fromAbsolute, normalYearLength, resolveCycle } from '../../src/calendar/CalendarEngine';
import {
  parseInCalendar,
  parseToAbsoluteDay,
  formatAbsoluteDay,
} from '../../src/calendar/CalendarDateText';
import { generateTicks, type AxisView } from '../../src/calendar/TimelineAxis';
import { toAbsolute } from '../../src/calendar/CalendarEngine';

describe('preset: Thirteen Moons (more than 12 months)', () => {
  it('has 13 months and a 364-day year', () => {
    expect(THIRTEEN_MOONS.months.length).toBe(13);
    expect(normalYearLength(THIRTEEN_MOONS)).toBe(364);
  });

  it('parses and round-trips a date in the 13th month', () => {
    const p = parseInCalendar('5-13-20', THIRTEEN_MOONS)!;
    expect(p.date).toEqual({ year: 5, month: 12, day: 20, unitOfDay: 0 });
    const abs = parseToAbsoluteDay('Ice 20, 5', THIRTEEN_MOONS)!;
    expect(formatAbsoluteDay(abs, THIRTEEN_MOONS)).toBe('Ice 20, 5 TM');
  });

  it('lays out all 13 months as axis ticks across a year', () => {
    const start = toAbsolute(THIRTEEN_MOONS, { year: 3, month: 0, day: 1 }).absoluteDay;
    const view: AxisView = { startDay: start, endDay: start + 364, widthPx: 1300 };
    const ticks = generateTicks(THIRTEEN_MOONS, view);
    expect(ticks.every((t) => t.level === 'month')).toBe(true);
    expect(ticks.length).toBe(13);
    expect(ticks.map((t) => t.label)).toContain('Long Night');
  });
});

describe('preset: Japanese sekki & kō (fine cycle grain)', () => {
  const koCycle = JAPANESE_KO.cycles!.find((c) => c.name === 'Kō')!;
  const sekkiCycle = JAPANESE_KO.cycles!.find((c) => c.name === 'Sekki')!;

  it('keeps 12 months but layers 24 sekki and 72 kō over them', () => {
    expect(JAPANESE_KO.months.length).toBe(12);
    expect(sekkiCycle.entries.length).toBe(24);
    expect(koCycle.entries.length).toBe(72);
    expect(koCycle.parentCycle).toBe('Sekki');
  });

  it('cycle entries are ordered and partition the year', () => {
    expect(koCycle.entries[0].startDayOfYear).toBe(0);
    for (let i = 1; i < koCycle.entries.length; i++) {
      expect(koCycle.entries[i].startDayOfYear).toBeGreaterThan(
        koCycle.entries[i - 1].startDayOfYear,
      );
    }
    expect(koCycle.entries[71].startDayOfYear).toBeLessThan(365);
  });

  it('resolves which kō a date falls in', () => {
    // Day 0 of the year is the first kō.
    const first = resolveCycle(JAPANESE_KO, { year: 800, month: 0, day: 1 }, 'Kō');
    expect(first?.index).toBe(0);
    expect(first?.entry.name).toContain('Risshun');
    // A mid-year date lands on a later, distinct kō.
    const mid = resolveCycle(JAPANESE_KO, { year: 800, month: 6, day: 1 }, 'Kō');
    expect(mid!.index).toBeGreaterThan(30);
  });
});

describe('preset: arithmetic Hijri', () => {
  it('uses the civil 30-year leap pattern', () => {
    const lengths = Array.from({ length: 30 }, (_, index) => daysInYear(TABULAR_HIJRI, index + 1));
    expect(lengths.filter(length => length === 355)).toHaveLength(11);
    expect(lengths.filter(length => length === 354)).toHaveLength(19);
  });

  it('round-trips dates across several cycles', () => {
    for (const date of [
      { year: 1, month: 0, day: 1 },
      { year: 2, month: 11, day: 30 },
      { year: 1447, month: 8, day: 1 },
    ]) {
      expect(fromAbsolute(TABULAR_HIJRI, toAbsolute(TABULAR_HIJRI, date))).toEqual({ ...date, unitOfDay: 0 });
    }
  });

  it('parses multiword month names', () => {
    expect(parseInCalendar('Rabi al-Awwal 12, 1447', TABULAR_HIJRI)?.date).toEqual({
      year: 1447,
      month: 2,
      day: 12,
    });
  });
});
