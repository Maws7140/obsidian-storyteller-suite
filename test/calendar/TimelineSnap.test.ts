import { describe, it, expect } from 'vitest';
import {
  chooseSnapResolution,
  snapDay,
  snapSlots,
  stepDay,
  projectDay,
  generateTicks,
  type AxisView,
  type SnapResolution,
} from '../../src/calendar/TimelineAxis';
import { fromAbsolute, toAbsolute } from '../../src/calendar/CalendarEngine';
import { G, UNEVEN, dayOf } from './snapfixture';

/** A day view, a month view, a year view, a decade view and a millennium view. */
const VIEWS: AxisView[] = [
  { startDay: dayOf(2024, 3, 1), endDay: dayOf(2024, 3, 20), widthPx: 600 },
  { startDay: dayOf(2024, 1, 1), endDay: dayOf(2024, 4, 1), widthPx: 900 },
  { startDay: dayOf(2024, 1, 1), endDay: dayOf(2025, 1, 1), widthPx: 900 },
  { startDay: dayOf(2010, 1, 1), endDay: dayOf(2015, 1, 1), widthPx: 1200 },
  { startDay: dayOf(1500, 1, 1), endDay: dayOf(2000, 1, 1), widthPx: 900 },
  { startDay: dayOf(0, 1, 1), endDay: dayOf(5000, 1, 1), widthPx: 900 },
  { startDay: 0, endDay: 400, widthPx: 700 },
];

describe('chooseSnapResolution — the zoom ladder', () => {
  it('walks days to weeks to months to years as the view widens', () => {
    const width = 900;
    const at = (spanDays: number) => {
      const start = dayOf(2024, 1, 1);
      return chooseSnapResolution(G, { startDay: start, endDay: start + spanDays, widthPx: width });
    };
    expect(at(20).level).toBe('day');
    expect(at(200).level).toBe('week');
    expect(at(1000).level).toBe('month');
    expect(at(8000).level).toBe('year');
  });

  it('never gives up, however far out the view goes', () => {
    const start = dayOf(0, 1, 1);
    for (const spanDays of [1e3, 1e4, 1e5, 1e6, 1e7]) {
      const res = chooseSnapResolution(G, { startDay: start, endDay: start + spanDays, widthPx: 900 });
      expect(res.step).toBeGreaterThan(0);
      expect(Number.isFinite(res.step)).toBe(true);
    }
  });

  it('widens the year step rather than stalling at one year', () => {
    const start = dayOf(0, 1, 1);
    const narrow = chooseSnapResolution(G, { startDay: start, endDay: start + 8000, widthPx: 900 });
    const wide = chooseSnapResolution(G, { startDay: start, endDay: start + 800000, widthPx: 900 });
    expect(narrow.level).toBe('year');
    expect(wide.level).toBe('year');
    expect(wide.step).toBeGreaterThan(narrow.step);
  });

  it('is monotonic — zooming out never picks a finer grid', () => {
    const start = dayOf(2000, 1, 1);
    const order = { minute: 0, hour: 1, day: 2, week: 3, month: 4, year: 5 } as const;
    let previous = -Infinity;
    for (let span = 5; span < 2_000_000; span *= 1.6) {
      const res = chooseSnapResolution(G, { startDay: start, endDay: start + span, widthPx: 900 });
      const rank = order[res.level] * 1e6 + res.step;
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });

  it('sizes rungs from the calendar, so a five-day week is the week rung', () => {
    // 200 days across 900px: days too narrow, weeks wide enough in both.
    const view: AxisView = { startDay: 0, endDay: 200, widthPx: 900 };
    expect(chooseSnapResolution(G, view).level).toBe('week');
    expect(chooseSnapResolution(UNEVEN, view).level).toBe('week');
    // Gregorian weeks are 7 days, UNEVEN's are 5, so the same rung is a
    // different number of days in each.
    const gregorianSlots = snapSlots(G, view);
    const unevenSlots = snapSlots(UNEVEN, view);
    expect(gregorianSlots[1] - gregorianSlots[0]).toBe(7);
    expect(unevenSlots[1] - unevenSlots[0]).toBe(5);
  });

  it('does not follow the axis labels up to year level', () => {
    const view: AxisView = { startDay: dayOf(2020, 1, 1), endDay: dayOf(2024, 1, 1), widthPx: 1000 };
    expect(generateTicks(G, view).every(t => t.level === 'year')).toBe(true);
    expect(chooseSnapResolution(G, view).level).toBe('month');
  });
});

describe('snapDay', () => {
  const RESOLUTIONS: SnapResolution[] = [
    { level: 'day', step: 1 },
    { level: 'week', step: 1 },
    { level: 'month', step: 1 },
    { level: 'year', step: 1 },
    { level: 'year', step: 10 },
  ];

  it('is idempotent at every resolution', () => {
    for (const res of RESOLUTIONS) {
      for (const cal of [G, UNEVEN]) {
        for (const day of [-4000.3, -1, 0, 0.5, 733.25, 12345.9, 738000.1]) {
          const once = snapDay(cal, day, res);
          expect(snapDay(cal, once, res)).toBe(once);
        }
      }
    }
  });

  it('always lands on the first of a month at month level', () => {
    for (const cal of [G, UNEVEN]) {
      for (let day = -200; day < 900; day += 7) {
        const snapped = snapDay(cal, day + 0.4, { level: 'month', step: 1 });
        expect(fromAbsolute(cal, { absoluteDay: snapped }).day).toBe(1);
      }
    }
  });

  it('always lands on the first day of a year at year level', () => {
    for (const cal of [G, UNEVEN]) {
      for (let day = -500; day < 2000; day += 37) {
        const date = fromAbsolute(cal, { absoluteDay: snapDay(cal, day, { level: 'year', step: 1 }) });
        expect(date.month).toBe(0);
        expect(date.day).toBe(1);
      }
    }
  });

  it('lands on a multiple of the step at year level', () => {
    for (let day = 0; day < 400000; day += 9999) {
      const snapped = snapDay(G, day, { level: 'year', step: 10 });
      const date = fromAbsolute(G, { absoluteDay: snapped });
      expect(date.year % 10).toBe(0);
      expect(date.month).toBe(0);
      expect(date.day).toBe(1);
    }
  });

  it('tiles weeks evenly, with no stutter at the year boundary', () => {
    const res: SnapResolution = { level: 'week', step: 1 };
    for (const cal of [G, UNEVEN]) {
      const span = cal === G ? 7 : 5;
      let day = snapDay(cal, dayOf(2023, 11, 1), res);
      // Walk across a new year and check every gap is exactly one week.
      for (let i = 0; i < 30; i++) {
        const next = stepDay(cal, day, res, 1);
        expect(next - day).toBe(span);
        day = next;
      }
    }
  });

  it('honours variable month length around a leap February', () => {
    const res: SnapResolution = { level: 'month', step: 1 };
    expect(snapDay(G, dayOf(2023, 2, 15) + 0.5, res)).toBe(dayOf(2023, 3, 1));
    expect(snapDay(G, dayOf(2024, 2, 15) + 0.5, res)).toBe(dayOf(2024, 2, 1));
  });
});

describe('stepDay', () => {
  it('steps by the real length of the month it leaves', () => {
    const res: SnapResolution = { level: 'month', step: 1 };
    expect(stepDay(G, dayOf(2024, 2, 1), res, 1) - dayOf(2024, 2, 1)).toBe(29);
    expect(stepDay(G, dayOf(2023, 2, 1), res, 1) - dayOf(2023, 2, 1)).toBe(28);
    const longStart = toAbsolute(UNEVEN, { year: 3, month: 1, day: 1 }).absoluteDay;
    expect(stepDay(UNEVEN, longStart, res, 1) - longStart).toBe(33);
  });

  it('rolls over the year boundary in both directions', () => {
    const res: SnapResolution = { level: 'month', step: 1 };
    const last = toAbsolute(UNEVEN, { year: 6, month: 2, day: 1 }).absoluteDay;
    const next = fromAbsolute(UNEVEN, { absoluteDay: stepDay(UNEVEN, last, res, 1) });
    expect([next.year, next.month, next.day]).toEqual([7, 0, 1]);

    const first = toAbsolute(UNEVEN, { year: 6, month: 0, day: 1 }).absoluteDay;
    const previous = fromAbsolute(UNEVEN, { absoluteDay: stepDay(UNEVEN, first, res, -1) });
    expect([previous.year, previous.month, previous.day]).toEqual([5, 2, 1]);
  });

  it('is reversible and always moves in the requested direction', () => {
    const resolutions: SnapResolution[] = [
      { level: 'day', step: 1 },
      { level: 'week', step: 1 },
      { level: 'month', step: 1 },
      { level: 'year', step: 1 },
      { level: 'year', step: 25 },
    ];
    for (const cal of [G, UNEVEN]) {
      for (const res of resolutions) {
        for (const day of [0, 733, 12345]) {
          expect(stepDay(cal, stepDay(cal, day, res, 1), res, -1)).toBe(snapDay(cal, day, res));
          expect(stepDay(cal, day, res, 1)).toBeGreaterThan(snapDay(cal, day, res));
          expect(stepDay(cal, day, res, -1)).toBeLessThan(snapDay(cal, day, res));
        }
      }
    }
  });
});

describe('snapSlots', () => {
  it('produces slots at every zoom, including the ones that used to bail', () => {
    for (const cal of [G, UNEVEN]) {
      for (const view of VIEWS) {
        expect(snapSlots(cal, view).length).toBeGreaterThan(0);
      }
    }
  });

  it('stays inside the view, ordered, and agrees with snapDay', () => {
    for (const cal of [G, UNEVEN]) {
      for (const view of VIEWS) {
        const res = chooseSnapResolution(cal, view);
        const slots = snapSlots(cal, view);
        for (const slot of slots) {
          expect(slot).toBeGreaterThanOrEqual(view.startDay);
          expect(slot).toBeLessThanOrEqual(view.endDay);
          expect(snapDay(cal, slot, res)).toBe(slot);
        }
        for (let i = 1; i < slots.length; i++) expect(slots[i]).toBeGreaterThan(slots[i - 1]);
      }
    }
  });

  it('snapping anything inside the view lands on a drawn slot', () => {
    for (const cal of [G, UNEVEN]) {
      for (const view of VIEWS) {
        const res = chooseSnapResolution(cal, view);
        const set = new Set(snapSlots(cal, view));
        const span = view.endDay - view.startDay;
        for (let f = 0.15; f < 0.85; f += 0.07) {
          expect(set.has(snapDay(cal, view.startDay + span * f, res))).toBe(true);
        }
      }
    }
  });

  it('keeps slots far enough apart to aim at', () => {
    for (const view of VIEWS) {
      const slots = snapSlots(G, view);
      for (let i = 1; i < slots.length; i++) {
        const gapPx = projectDay(slots[i], view) - projectDay(slots[i - 1], view);
        expect(gapPx).toBeGreaterThanOrEqual(13.9);
      }
    }
  });

  it('never returns more slots than the view has room for', () => {
    for (const cal of [G, UNEVEN]) {
      for (const view of VIEWS) {
        expect(snapSlots(cal, view).length).toBeLessThanOrEqual(Math.ceil(view.widthPx / 14) + 1);
      }
    }
  });

  it('uses the calendar own month boundaries, not evenly spaced ones', () => {
    const start = toAbsolute(UNEVEN, { year: 2, month: 0, day: 1 }).absoluteDay;
    const view: AxisView = { startDay: start, endDay: start + 240, widthPx: 600 };
    expect(chooseSnapResolution(UNEVEN, view).level).toBe('month');
    const slots = snapSlots(UNEVEN, view);
    const gaps = new Set<number>();
    for (let i = 1; i < slots.length; i++) gaps.add(slots[i] - slots[i - 1]);
    // 7, 33 and 20 all present; an evenly spaced grid would give a single gap.
    expect(gaps.has(7)).toBe(true);
    expect(gaps.has(33)).toBe(true);
    expect(gaps.has(20)).toBe(true);
  });

  it('returns nothing for a degenerate view', () => {
    expect(snapSlots(G, { startDay: 100, endDay: 100, widthPx: 500 })).toEqual([]);
    expect(snapSlots(G, { startDay: 100, endDay: 50, widthPx: 500 })).toEqual([]);
  });
});
