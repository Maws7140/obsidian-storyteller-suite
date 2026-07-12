/**
 * CalendarDateText — read and write dates in the terms of a specific
 * {@link CalendarSystem}. This is what makes a custom dating system "just work":
 * a user types `Frost 5, 342` (or `342-03-15`) in their own calendar and it
 * parses to a {@link CalendarDate}; the engine turns that into a universal
 * absolute day, and this module formats it back with the calendar's own month
 * names. No Luxon, no chrono — those only understand Gregorian.
 *
 * Years are astronomical here (matching the engine); an optional trailing epoch
 * label (e.g. "342 AF") is accepted and stripped on parse and re-applied on
 * format.
 */
import type { CalendarSystem, CalendarDate } from './types';
import { monthLength, toAbsolute, fromAbsolute } from './CalendarEngine';

export type DatePrecision = 'year' | 'month' | 'day' | 'time';

export interface ParsedCalendarDate {
  date: CalendarDate;
  precision: DatePrecision;
}

/** Find a 0-based month index by (case-insensitive) name or abbreviation. */
function monthIndexByName(cal: CalendarSystem, token: string): number {
  const t = token.trim().toLowerCase();
  return cal.months.findIndex(
    (m) => m.name.toLowerCase() === t || (m.abbr && m.abbr.toLowerCase() === t),
  );
}

/** Strip a trailing epoch label ("342 AF" -> "342"); returns the remainder. */
function stripEpochLabel(cal: CalendarSystem, text: string): string {
  if (!cal.epochLabel) return text;
  const re = new RegExp(`\\s+${escapeRe(cal.epochLabel)}\\s*$`, 'i');
  return text.replace(re, '').trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Validate a candidate date against the calendar; return it or null. */
function validate(cal: CalendarSystem, date: CalendarDate): CalendarDate | null {
  if (date.month < 0 || date.month >= cal.months.length) return null;
  if (date.day < 1 || date.day > monthLength(cal, date.year, date.month)) return null;
  return date;
}

/**
 * Parse a date string in the terms of `cal`. Accepts:
 *  - numeric ISO-ish: `342`, `342-3`, `342-03-15`, `342-03-15 14:30`
 *  - month names: `Frost 5, 342`, `5 Frost 342`, `Frost 342`
 * Returns null if nothing parses cleanly (caller can fall back to Gregorian).
 */
export function parseInCalendar(text: string, cal: CalendarSystem): ParsedCalendarDate | null {
  const raw = stripEpochLabel(cal, text.trim());
  if (!raw) return null;

  // Numeric: year[-month[-day]] [ HH:MM ]
  const num = raw.match(/^(-?\d+)(?:-(\d+))?(?:-(\d+))?(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (num) {
    const year = parseInt(num[1], 10);
    const hasMonth = num[2] != null;
    const hasDay = num[3] != null;
    const hasTime = num[4] != null;
    const month = hasMonth ? parseInt(num[2], 10) - 1 : 0;
    const day = hasDay ? parseInt(num[3], 10) : 1;
    let unitOfDay = 0;
    if (hasTime && cal.baseUnit === 'minute') {
      unitOfDay = parseInt(num[4], 10) * 60 + parseInt(num[5], 10);
    }
    const date = validate(cal, { year, month, day, unitOfDay });
    if (!date) return null;
    const precision: DatePrecision = hasTime ? 'time' : hasDay ? 'day' : hasMonth ? 'month' : 'year';
    return { date, precision };
  }

  // Month name forms.
  const named =
    raw.match(/^(\w[\w'’-]*)\s+(\d+)(?:,)?\s+(-?\d+)$/) || // Name day, year
    raw.match(/^(\d+)\s+(\w[\w'’-]*)\s+(-?\d+)$/); // day Name year
  if (named) {
    // Normalise which capture is the name.
    let name: string, day: number, year: number;
    if (/^\d/.test(named[1])) {
      day = parseInt(named[1], 10);
      name = named[2];
      year = parseInt(named[3], 10);
    } else {
      name = named[1];
      day = parseInt(named[2], 10);
      year = parseInt(named[3], 10);
    }
    const month = monthIndexByName(cal, name);
    if (month < 0) return null;
    const date = validate(cal, { year, month, day });
    if (!date) return null;
    return { date, precision: 'day' };
  }

  // Name year (month precision, e.g. "Frost 342").
  const nameYear = raw.match(/^(\w[\w'’-]*)\s+(-?\d+)$/);
  if (nameYear) {
    const month = monthIndexByName(cal, nameYear[1]);
    if (month < 0) return null;
    const year = parseInt(nameYear[2], 10);
    const date = validate(cal, { year, month, day: 1 });
    if (!date) return null;
    return { date, precision: 'month' };
  }

  return null;
}

/** Two-digit pad for clock components. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Format a calendar date using the calendar's own month names. Precision trims
 * the output: `year` -> "342 AF", `month` -> "Frost 342 AF",
 * `day` -> "Frost 5, 342 AF", `time` -> "Frost 5, 342 AF 14:30".
 * (Layer 3 will add fully custom theme templates; this is the default voice.)
 */
export function formatInCalendar(
  date: CalendarDate,
  cal: CalendarSystem,
  precision: DatePrecision = 'day',
): string {
  const era = cal.epochLabel ? ` ${cal.epochLabel}` : '';
  const yearStr = `${date.year}${era}`;
  if (precision === 'year') return yearStr;
  const monthName = cal.months[date.month]?.name ?? `Month ${date.month + 1}`;
  if (precision === 'month') return `${monthName} ${yearStr}`;
  const dayPart = `${monthName} ${date.day}, ${yearStr}`;
  if (precision === 'day') return dayPart;
  const unit = date.unitOfDay ?? 0;
  if (cal.baseUnit === 'minute') {
    const h = Math.floor(unit / 60);
    const m = unit % 60;
    return `${dayPart} ${pad2(h)}:${pad2(m)}`;
  }
  return dayPart;
}

/** Convenience: parse straight to an absolute day (null if unparseable). */
export function parseToAbsoluteDay(text: string, cal: CalendarSystem): number | null {
  const parsed = parseInCalendar(text, cal);
  if (!parsed) return null;
  return toAbsolute(cal, parsed.date).absoluteDay;
}

/** Convenience: format an absolute day in a calendar (assumes day precision). */
export function formatAbsoluteDay(
  absoluteDay: number,
  cal: CalendarSystem,
  precision: DatePrecision = 'day',
): string {
  return formatInCalendar(fromAbsolute(cal, { absoluteDay }), cal, precision);
}
