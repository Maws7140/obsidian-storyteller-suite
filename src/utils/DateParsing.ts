import { DateTime } from 'luxon';
import * as chrono from 'chrono-node';

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

/** Try BCE patterns first, then Luxon ISO, SQL, Chrono (casual). */
export function parseEventDate(input?: string, opts: ParseOptions = {}): ParsedEventDate {
  if (!input || !input.trim()) return { error: 'empty' };
  const text = input.trim();
  const approximate = APPROX_RE.test(text);

  // 0) CE date detection
  const ceMatch = text.match(CE_RE);

  if (ceMatch) {
    const year = parseInt(ceMatch[1]);
    if (year > 0) {
      // CE dates use the year directly without conversion

      // Check if it's a simple year-only CE date
      const isSimpleYear = /^\s*\d+\s*(?:CE|ce|A\.D\.|AD|ad|a\.d\.)\s*$/i.test(text);
      if (isSimpleYear) {
        const yearOnly = DateTime.fromObject({ year: year }, { zone: opts.timezone as any });

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
        const iso = DateTime.fromISO(testText, { zone: opts.timezone as any });
        if (iso.isValid) {
          return {
            start: iso,
            precision: inferPrecisionFromLuxon(iso),
            approximate,
          };
        }

        // Try SQL format
        const sql = DateTime.fromSQL(testText, { zone: opts.timezone as any });
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
        const results = chrono.parse(text, reference as any, { forwardDate: !!opts.forwardDate });
        if (results && results.length > 0) {
          const r = results[0];
          const start = DateTime.fromJSDate(r.start.date(), { zone: opts.timezone as any });
          const end = r.end ? DateTime.fromJSDate(r.end.date(), { zone: opts.timezone as any }) : undefined;
          const precision = inferPrecisionFromChrono(r);
          return {
            start,
            end,
            precision,
            approximate,
          };
        }
      } catch (e) {
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
        const yearOnly = DateTime.fromObject({ year: jsYear }, { zone: opts.timezone as any });

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
        const iso = DateTime.fromISO(testText, { zone: opts.timezone as any });
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
        const sql = DateTime.fromSQL(testText, { zone: opts.timezone as any });
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
        const results = chrono.parse(text, reference as any, { forwardDate: !!opts.forwardDate });
        if (results && results.length > 0) {
          const r = results[0];
          // Check if the parsed date is in BCE range (negative year) or if the original text contains BCE
          const jsDate = r.start.date();
          const start = DateTime.fromJSDate(jsDate, { zone: opts.timezone as any });
          if (start.year < 0 || bceMatch) {
            const end = r.end ? DateTime.fromJSDate(r.end.date(), { zone: opts.timezone as any }) : undefined;
            const precision = inferPrecisionFromChrono(r);
            const isBceDetected = bceMatch || start.year < 0;

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
      } catch (e) {
        // Fall through to regular parsing
      }
    }
  }

  // 1) ISO
  const iso = DateTime.fromISO(text, { zone: opts.timezone as any });
  if (iso.isValid) {
    return { start: iso, precision: inferPrecisionFromLuxon(iso), approximate };
  }

  // 2) SQL
  const sql = DateTime.fromSQL(text, { zone: opts.timezone as any });
  if (sql.isValid) {
    return { start: sql, precision: inferPrecisionFromLuxon(sql), approximate };
  }

  // 3) Chrono parse (supports ranges)
  try {
    const reference: Date | undefined = opts.referenceDate;
    const results = chrono.parse(text, reference as any, { forwardDate: !!opts.forwardDate });
    if (results && results.length > 0) {
      const r = results[0];
      const start = DateTime.fromJSDate(r.start.date(), { zone: opts.timezone as any });
      const end = r.end ? DateTime.fromJSDate(r.end.date(), { zone: opts.timezone as any }) : undefined;
      const precision = inferPrecisionFromChrono(r);
      return { start, end, precision, approximate };
    }
  } catch (e) {
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
    const dt = DateTime.fromFormat(text, fmt, { zone: opts.timezone as any });
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


