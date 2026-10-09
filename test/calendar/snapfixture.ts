import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import type { CalendarSystem } from '../../src/calendar/types';
import { CALENDAR_SCHEMA_VERSION } from '../../src/calendar/types';
import { toAbsolute } from '../../src/calendar/CalendarEngine';

export const G = GREGORIAN_CALENDAR;

export const dayOf = (y: number, m: number, d: number) =>
  toAbsolute(G, { year: y, month: m - 1, day: d }).absoluteDay;

/**
 * Uneven months, a leap rule, and a five-day week, so nothing here can pass by
 * assuming Gregorian shapes or a fixed unit length.
 */
export const UNEVEN: CalendarSystem = {
  schemaVersion: CALENDAR_SCHEMA_VERSION,
  id: 'axis-uneven',
  name: 'Uneven',
  baseUnit: 'day',
  unitsPerDay: 1,
  epochAbsoluteDay: 0,
  months: [
    { name: 'Short', days: 7 },
    { name: 'Long', days: 33 },
    { name: 'Middling', days: 20 },
  ],
  week: { days: ['Ka', 'Lo', 'Mi', 'Ne', 'Or'] },
  leapRule: { everyYears: 4, monthIndex: 0, extraDays: 1 },
};
