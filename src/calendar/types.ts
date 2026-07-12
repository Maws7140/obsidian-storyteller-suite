/**
 * Custom calendar systems — portable model.
 *
 * A {@link CalendarSystem} is a self-contained, shareable description of how a
 * world measures time: its year structure (months), optional overlays (seasons,
 * the 24 sekki, the 72 kō, ...), leap rules, weekdays and holidays. It is the
 * `.storycal.json` interchange document — designed to be exported, shared with
 * other Storyteller users, and imported without special-casing. The bundled
 * Gregorian calendar is just one instance of this same model.
 *
 * All engine math runs on a single shared integer axis (the "absolute day",
 * a proleptic day count) so events authored in *different* calendars can sit on
 * one timeline. Years here are ASTRONOMICAL (…, -1, 0, 1, …); the BCE/CE style
 * "no year zero" convention is a display concern handled at the parse/format
 * layer, not in the engine, so the day arithmetic stays gap-free.
 */

/** Resolution of a calendar's integer tick axis. */
export type BaseUnit = 'day' | 'minute';

/** Current schema version for {@link CalendarSystem}. Bump on breaking changes. */
export const CALENDAR_SCHEMA_VERSION = 1;

export interface MonthDef {
  name: string;
  /** Number of days in this month in a normal (non-leap) year. */
  days: number;
  /** Optional short form for compact display, e.g. "Jan". */
  abbr?: string;
}

/** One named span inside a {@link CycleDef} (a single season / sekki / kō). */
export interface CycleEntry {
  name: string;
  /** 0-based day-of-year this entry begins on; runs until the next entry. */
  startDayOfYear: number;
}

/**
 * A named partition of the year into ordered, contiguous spans. Layers over the
 * month grid rather than aligning to it — e.g. the 72 kō are ~5-day periods that
 * cross month boundaries. The last entry wraps to the end of the year.
 */
export interface CycleDef {
  name: string;
  entries: CycleEntry[];
}

/**
 * Periodic leap rule with optional nested overrides (Gregorian's 100/400 rule).
 * A year is leap if divisible by {@link everyYears}; each exception, applied in
 * order, flips membership for years divisible by its own period. Exceptions must
 * be listed by increasing divisibility (…, 100, 400) — matching every real rule.
 */
export interface LeapRule {
  everyYears: number;
  /** Extra days added in a leap year. */
  extraDays: number;
  /** 0-based month the extra days extend; defaults to the last month. */
  monthIndex?: number;
  exceptions?: { everyYears: number; skip: boolean }[];
}

export interface WeekDef {
  days: string[];
}

export interface HolidayDef {
  name: string;
  /** 0-based month index. */
  month: number;
  /** 1-based day of month the holiday starts on. */
  day: number;
  /** Length in days (>= 1); multi-day holidays span forward. Defaults to 1. */
  length?: number;
  description?: string;
}

export interface CalendarSystem {
  schemaVersion: number;
  id: string;
  name: string;
  description?: string;
  baseUnit: BaseUnit;
  /** Base units per day (1 for 'day'; e.g. 1440 for a 24h 'minute' calendar). */
  unitsPerDay: number;
  /**
   * Absolute (proleptic-Gregorian) day number of this calendar's origin
   * (astronomical year 1, month 0, day 1, unit 0). Anchors cross-calendar math.
   * The built-in Gregorian uses 0 == 0001-01-01.
   */
  epochAbsoluteDay: number;
  /** Era label for the calendar's counting origin, e.g. "AUC", "Kōki". */
  epochLabel?: string;
  months: MonthDef[];
  week?: WeekDef;
  cycles?: CycleDef[];
  leapRule?: LeapRule;
  holidays?: HolidayDef[];
}

/** A moment expressed in a specific calendar. Years are astronomical. */
export interface CalendarDate {
  year: number;
  /** 0-based month index. */
  month: number;
  /** 1-based day of month. */
  day: number;
  /** Base-units into the day (0 for whole-day / day-based calendars). */
  unitOfDay?: number;
}

/** A point on the shared universal axis; fractional for sub-day precision. */
export interface AbsoluteInstant {
  absoluteDay: number;
}
