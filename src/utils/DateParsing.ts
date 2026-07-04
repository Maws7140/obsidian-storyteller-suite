import { DateTime, FixedOffsetZone } from 'luxon';
import * as chrono from 'chrono-node';
import type { Event } from '../types';

export type ParsedPrecision = 'year' | 'month' | 'day' | 'time';

export interface ParseOptions {
  forwardDate?: boolean;
  timezone?: string | number; // e.g. 'America/New_York' or minute offset
  locale?: string; // for Luxon formatting in UI
  /** Reference date for relative parsing (e.g., "next Friday"). Defaults to system today. */
  referenceDate?: Date;
}

export interface ParsedEventDate {
  start?: DateTime;
  end?: DateTime;
  precision?: ParsedPrecision;
  approximate?: boolean;
  error?: string;
  isBCE?: boolean; // Flag to indicate BCE date
  originalYear?: number; // Original BCE year for display purposes
}

const APPROX_RE = /(circa|around|about|approx|~|approx\.)/i;
const BCE_RE = /\b(\d+)\s*(BC|bce|BCE|B\.C\.|B\.C|B\.C\.E\.|b\.c\.|b\.c\.e\.|bc|b\.c\.e)\b/i;
const CE_RE = /\b(\d+)\s*(CE|ce|A\.D\.|AD|ad|a\.d\.)\b/i;

function inferPrecisionFromChrono(result: chrono.ParsedResult): ParsedPrecision {
  const start = result.start;
  // If hour/minute specified -> time precision
  if (start.isCertain('hour') || start.isCertain('minute')) return 'time';
  if (start.isCertain('day')) return 'day';
  if (start.isCertain('month')) return 'month';
  return 'year';
}

function inferPrecisionFromLuxon(dt: DateTime): ParsedPrecision {
  // If time components present
  if (dt.hour !== 0 || dt.minute !== 0 || dt.second !== 0 || dt.millisecond !== 0) return 'time';
  if (dt.day !== 1) return 'day';
  if (dt.month !== 1) return 'month';
  return 'year';
}

function coerceDateInput(input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input === 'string') return input.trim();
  if (input instanceof Date) return input.toISOString();
  if (typeof input === 'number' || typeof input === 'bigint') return String(input);
  if (Array.isArray(input)) {
    const joined = input
      .map((part) => (part == null ? '' : String(part).trim()))
      .filter(Boolean)
      .join(' to ');
    return joined || undefined;
  }
  if (typeof input === 'object') {
    const maybe = input as Record<string, unknown>;
    // Common range-like shapes in YAML/JSON frontmatter
    if (typeof maybe.dateTime === 'string') return maybe.dateTime.trim();
    const start = maybe.start != null ? String(maybe.start).trim() : '';
    const end = maybe.end != null ? String(maybe.end).trim() : '';
    if (start && end) return `${start} to ${end}`;
    if (start) return start;
    if (end) return end;
  }
  const text = String(input).trim();
  return text && text !== '[object Object]' ? text : undefined;
}

function getLuxonZone(timezone: ParseOptions['timezone']): string | FixedOffsetZone | undefined {
  if (typeof timezone === 'number') return FixedOffsetZone.instance(timezone);
  return timezone;
}

/**
 * Pad an ISO-shaped numeric date so Luxon will accept it.
 * Fantasy/historical years are commonly written unpadded ("342", "342-03-15"),
 * but Luxon's ISO parser requires a 4-digit year (and 2-digit month/day).
 * Left-pads the year to 4 digits and month/day to 2 so `342` -> `0342`,
 * `342-3-1` -> `0342-03-01`. Returns the trimmed input unchanged if it is not
 * a bare numeric ISO date (e.g. "next Friday", "March 15, 500 BCE").
 * Luxon still stores the true integer year, so display is not zero-padded.
 */
function padIsoDate(s: string): string {
  const trimmed = s.trim();
  const m = trimmed.match(/^(\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!m) return trimmed;
  let out = m[1].padStart(4, '0');
  if (m[2]) out += '-' + m[2].padStart(2, '0');
  if (m[3]) out += '-' + m[3].padStart(2, '0');
  return out;
}

/**
 * Split a date range into its two endpoints on an explicit separator.
 * Only splits on unambiguous separators (`to`, `through`, `until`, `thru`, `..`,
 * or a spaced en/em dash) so ISO hyphens are never touched. Returns null when
 * there is not exactly one separator producing two non-empty sides, letting the
 * caller fall through to single-date / chrono parsing.
 */
function splitRange(text: string): [string, string] | null {
  const parts = text.split(/\s+(?:to|through|until|thru)\s+|\s*\.\.\s*|\s+[–—]\s+/i);
  if (parts.length === 2) {
    const a = parts[0].trim();
    const b = parts[1].trim();
    if (a && b) return [a, b];
  }
  return null;
}

/** Try CE/BCE patterns first, then Luxon ISO, SQL, Chrono (casual), then ad-hoc formats. */export function parseEventDate(input?: unknown, opts: ParseOptions = {}): ParsedEventDate {
  const text = coerceDateInput(input);
  if (!text) return { error: 'empty' };

  // 0) Explicit ranges ("0342 to 0367", "342 through 367", "0342-03-01 .. 0342-09-15").
  // Parse each endpoint through the full pipeline (so BCE + unpadded-year handling
  // apply to both sides), then combine into a single start/end span. Done before
  // chrono so it never has to guess where a range splits.
  const range = splitRange(text);
  if (range) {
    const startRes = parseEventDate(range[0], opts);
    const endRes = parseEventDate(range[1], opts);
    if (startRes.start && !startRes.error) {
      return {
        start: startRes.start,
        end: endRes.end ?? endRes.start,
        precision: startRes.precision,
        approximate: startRes.approximate || endRes.approximate,
        isBCE: startRes.isBCE,
        originalYear: startRes.originalYear,
      };
    }
    // If the range didn't resolve, fall through and let the full string be tried as-is.
  }

  const approximate = APPROX_RE.test(text);
  const zone = getLuxonZone(opts.timezone);

  // 0) CE date detection
  const ceMatch = text.match(CE_RE);

  if (ceMatch) {
    const year = parseInt(ceMatch[1]);
    if (year > 0) {
      // CE dates use the year directly without conversion

      // Check if it's a simple year-only CE date
      const isSimpleYear = /^\s*\d+\s*(?:CE|ce|A\.D\.|AD|ad|a\.d\.)\s*$/i.test(text);
      if (isSimpleYear) {
        const yearOnly = DateTime.fromObject({ year: year }, { zone });

        if (yearOnly.isValid) {
          return {
            start: yearOnly,
            precision: 'year',
            approximate,
          };
        }
      }

      // Try different date formats with CE year
      const testFormats = [
        // ISO format: "2024-03-15" -> "2024-03-15 100"
        text.replace(CE_RE, year.toString()),
      ];

      for (const testText of testFormats) {
        // Try ISO format
        const iso = DateTime.fromISO(testText, { zone });
        if (iso.isValid) {
          return {
            start: iso,
            precision: inferPrecisionFromLuxon(iso),
            approximate,
          };
        }

        // Try SQL format
        const sql = DateTime.fromSQL(testText, { zone });
        if (sql.isValid) {
          return {
            start: sql,
            precision: inferPrecisionFromLuxon(sql),
            approximate,
          };
        }
      }

      // Try Chrono parsing as fallback
      try {
        const reference: Date | undefined = opts.referenceDate;
        const results = chrono.parse(text, reference, { forwardDate: !!opts.forwardDate });
        if (results && results.length > 0) {
          const r = results[0];
          const start = DateTime.fromJSDate(r.start.date(), { zone });
          const end = r.end ? DateTime.fromJSDate(r.end.date(), { zone }) : undefined;
          const precision = inferPrecisionFromChrono(r);
          return {
            start,
            end,
            precision,
            approximate,
          };
        }
      } catch {
        // Fall through to regular parsing
      }
    }
  }

  // 1) BCE date detection
  const bceMatch = text.match(BCE_RE);

  if (bceMatch) {
    const year = parseInt(bceMatch[1]);
    if (year > 0) {
      // Convert BCE year to JavaScript year (BCE 1 = year 0, BCE 2 = year -1, etc.)
      const jsYear = 1 - year;

      // First try: Just the year as a standalone value, but only for simple year-only dates
      // Don't use this for dates that might have month/day info
      const isSimpleYear = /^\s*\d+\s*(?:BC|bce|BCE|B\.C\.|B\.C|B\.C\.E\.|b\.c\.|b\.c\.e\.|bc|b\.c\.e)\s*$/i.test(text);
      if (isSimpleYear) {
        const yearOnly = DateTime.fromObject({ year: jsYear }, { zone });

        if (yearOnly.isValid) {
          return {
            start: yearOnly,
            precision: 'year',
            approximate,
            isBCE: true,
            originalYear: year
          };
        }
      }

      // Try different date formats with BCE year converted
      const testFormats = [
        // ISO format: "2024-03-15" -> "2024-03-15 -499"
        text.replace(BCE_RE, jsYear.toString()),
        // Just the year: "500 BCE" -> "-499"
        jsYear.toString(),
      ];

      for (const testText of testFormats) {
        // Try ISO format
        const iso = DateTime.fromISO(testText, { zone });
        if (iso.isValid) {
          return {
            start: iso,
            precision: inferPrecisionFromLuxon(iso),
            approximate,
            isBCE: true,
            originalYear: year
          };
        }

        // Try SQL format
        const sql = DateTime.fromSQL(testText, { zone });
        if (sql.isValid) {
          return {
            start: sql,
            precision: inferPrecisionFromLuxon(sql),
            approximate,
            isBCE: true,
            originalYear: year
          };
        }
      }

      // Try Chrono parsing as fallback
      try {
        const reference: Date | undefined = opts.referenceDate;
        const results = chrono.parse(text, reference, { forwardDate: !!opts.forwardDate });
        if (results && results.length > 0) {
          const r = results[0];
          // Check if the parsed date is in BCE range (negative year) or if the original text contains BCE
          const jsDate = r.start.date();
          const start = DateTime.fromJSDate(jsDate, { zone });
          if (start.year < 0 || bceMatch) {
            const end = r.end ? DateTime.fromJSDate(r.end.date(), { zone }) : undefined;
            const precision = inferPrecisionFromChrono(r);
            // If we detected BCE from the regex, use the converted year from BCE detection
            // Otherwise, convert negative year to positive BCE year
            const originalYear = bceMatch ? year : (start.year === 0 ? 1 : Math.abs(start.year));

            // If we have BCE, we need to adjust the year in the DateTime object
            let adjustedStart = start;
            if (bceMatch) {
              const jsYear = 1 - year;
              // Preserve the original month and day when setting the year
              adjustedStart = start.set({ year: jsYear, month: start.month, day: start.day });
            }



            return {
              start: adjustedStart,
              end,
              precision,
              approximate,
              isBCE: true,
              originalYear: originalYear
            };
          }
        }
      } catch {
        // Fall through to regular parsing
      }
    }
  }

  // 1) ISO (pad unpadded fantasy/historical years first so Luxon's parser accepts
  // them, and so this catches a bare year like "342" ahead of chrono — which would
  // otherwise misread it as the time 3:42).
  const isoText = padIsoDate(text);
  const iso = DateTime.fromISO(isoText, { zone });
  if (iso.isValid) {
    // Infer precision from the text format if possible, as Luxon loses this info
    let precision: ParsedPrecision = 'day';
    const trimmed = isoText;

    if (/^\d{4}$/.test(trimmed)) {
        precision = 'year';
    } else if (/^\d{4}-\d{2}$/.test(trimmed)) {
        precision = 'month';
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        precision = 'day';
    } else if (trimmed.includes('T') || (trimmed.includes(':') && trimmed.includes(' '))) {
        precision = 'time';
    } else {
        precision = inferPrecisionFromLuxon(iso);
    }

    return { start: iso, precision, approximate };
  }

  // 2) SQL
  const sql = DateTime.fromSQL(text, { zone });
  if (sql.isValid) {
    return { start: sql, precision: inferPrecisionFromLuxon(sql), approximate };
  }

  // 3) Chrono parse (supports ranges)
  try {
    const reference: Date | undefined = opts.referenceDate;
    const results = chrono.parse(text, reference, { forwardDate: !!opts.forwardDate });
    if (results && results.length > 0) {
      const r = results[0];
      const start = DateTime.fromJSDate(r.start.date(), { zone });
      const end = r.end ? DateTime.fromJSDate(r.end.date(), { zone }) : undefined;
      const precision = inferPrecisionFromChrono(r);
      return { start, end, precision, approximate };
    }
  } catch {
    // fallthrough
  }

  // 4) Few common ad-hoc formats
  const candidates = [
    ['yyyy-MM', 'month'],
    ['yyyy', 'year'],
    ['LLL dd yyyy', 'day'],
    ['LLLL dd yyyy', 'day'],
  ] as const;
  for (const [fmt, prec] of candidates) {
    const dt = DateTime.fromFormat(text, fmt, { zone });
    if (dt.isValid) return { start: dt, precision: prec, approximate };
  }

  return { error: 'unparsed' };
}

export function toDisplay(dt?: DateTime, locale?: string, isBCE?: boolean, originalYear?: number): string {
  if (!dt) return '';

  // Handle BCE dates
  if (isBCE && originalYear) {
    const month = dt.month;
    const day = dt.day;
    const yearStr = originalYear + ' BCE';

    if (month === 1 && day === 1) {
      return yearStr;
    } else if (day === 1) {
      return `${dt.monthLong} ${yearStr}`;
    } else {
      return `${dt.monthLong} ${day}, ${yearStr}`;
    }
  }

  const v = locale ? dt.setLocale(locale) : dt;
  return v.toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY);
}

export function toMillis(dt?: DateTime): number | undefined {
  return dt?.toMillis();
}

/**
 * Extract the appropriate date string from an Event for timeline positioning
 * @param event Event object
 * @returns Date string to use for parsing (Gregorian format)
 */
export function getEventDateForTimeline(event: Event): string | undefined {
  return event.dateTime;
}


