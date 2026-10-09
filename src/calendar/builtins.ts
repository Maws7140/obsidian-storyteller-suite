import type { CalendarSystem } from './types';
import { CALENDAR_SCHEMA_VERSION } from './types';

/**
 * The built-in proleptic Gregorian calendar — the default and the reference the
 * universal axis is defined against: absoluteDay 0 == astronomical year 1,
 * January 1. It is an ordinary {@link CalendarSystem}, carrying no privileges the
 * engine wouldn't grant any imported calendar.
 */
export const GREGORIAN_CALENDAR: CalendarSystem = {
  schemaVersion: CALENDAR_SCHEMA_VERSION,
  id: 'builtin-gregorian',
  name: 'Gregorian',
  description: 'The default proleptic Gregorian calendar.',
  baseUnit: 'minute',
  unitsPerDay: 1440,
  epochAbsoluteDay: 0,
  epochLabel: 'CE',
  months: [
    { name: 'January', abbr: 'Jan', days: 31 },
    { name: 'February', abbr: 'Feb', days: 28 },
    { name: 'March', abbr: 'Mar', days: 31 },
    { name: 'April', abbr: 'Apr', days: 30 },
    { name: 'May', abbr: 'May', days: 31 },
    { name: 'June', abbr: 'Jun', days: 30 },
    { name: 'July', abbr: 'Jul', days: 31 },
    { name: 'August', abbr: 'Aug', days: 31 },
    { name: 'September', abbr: 'Sep', days: 30 },
    { name: 'October', abbr: 'Oct', days: 31 },
    { name: 'November', abbr: 'Nov', days: 30 },
    { name: 'December', abbr: 'Dec', days: 31 },
  ],
  week: {
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  },
  leapRule: {
    everyYears: 4,
    extraDays: 1,
    monthIndex: 1, // February
    exceptions: [
      { everyYears: 100, skip: true },
      { everyYears: 400, skip: false },
    ],
  },
};
