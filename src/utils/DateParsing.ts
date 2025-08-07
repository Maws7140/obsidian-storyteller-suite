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
}

const APPROX_RE = /(circa|around|about|approx|~|approx\.)/i;

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

/** Try Luxon ISO first, then SQL, then Chrono (casual). */
export function parseEventDate(input?: string, opts: ParseOptions = {}): ParsedEventDate {
  if (!input || !input.trim()) return { error: 'empty' };
  const text = input.trim();
  const approximate = APPROX_RE.test(text);

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

export function toDisplay(dt?: DateTime, locale?: string): string {
  if (!dt) return '';
  const v = locale ? dt.setLocale(locale) : dt;
  return v.toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY);
}

export function toMillis(dt?: DateTime): number | undefined {
  return dt?.toMillis();
}


