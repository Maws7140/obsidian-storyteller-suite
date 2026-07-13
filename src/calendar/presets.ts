/**
 * Bundled example calendars. These are ordinary {@link CalendarSystem} values —
 * exactly what a user would author and share as a `.storycal.json` — provided so
 * the feature ships with something to start from and to demonstrate that neither
 * the month count nor the cycle grain is fixed at 12/anything.
 *
 * - {@link THIRTEEN_MOONS}: a 13-month calendar (arbitrary month counts work).
 * - {@link JAPANESE_KO}: 12 traditional month names PLUS a 24-entry sekki cycle
 *   and a 72-entry kō (microseason) cycle layered over them. The cycles are a
 *   solar-year template anchored at the year start; users can fine-tune the
 *   day-of-year offsets to their world.
 */
import type { CalendarSystem, CycleEntry } from './types';
import { CALENDAR_SCHEMA_VERSION } from './types';

/** A 13-month calendar (13 × 28 = 364-day year), proving month count is free. */
export const THIRTEEN_MOONS: CalendarSystem = {
  schemaVersion: CALENDAR_SCHEMA_VERSION,
  id: 'preset-thirteen-moons',
  name: 'Thirteen Moons',
  description: 'A lunar-style calendar of thirteen 28-day months.',
  baseUnit: 'day',
  unitsPerDay: 1,
  epochAbsoluteDay: 0,
  epochLabel: 'TM',
  months: [
    { name: 'Wolf', days: 28 },
    { name: 'Snow', days: 28 },
    { name: 'Worm', days: 28 },
    { name: 'Seed', days: 28 },
    { name: 'Flower', days: 28 },
    { name: 'Rose', days: 28 },
    { name: 'Hay', days: 28 },
    { name: 'Grain', days: 28 },
    { name: 'Harvest', days: 28 },
    { name: 'Hunter', days: 28 },
    { name: 'Frost', days: 28 },
    { name: 'Long Night', days: 28 },
    { name: 'Ice', days: 28 },
  ],
};

/** The 24 solar terms (sekki), in year order. */
const SEKKI: string[] = [
  'Risshun (start of spring)',
  'Usui (rain water)',
  'Keichitsu (awakening of insects)',
  'Shunbun (spring equinox)',
  'Seimei (clear and bright)',
  'Kokuu (grain rain)',
  'Rikka (start of summer)',
  'Shōman (grain full)',
  'Bōshu (grain in ear)',
  'Geshi (summer solstice)',
  'Shōsho (minor heat)',
  'Taisho (major heat)',
  'Risshū (start of autumn)',
  'Shosho (limit of heat)',
  'Hakuro (white dew)',
  'Shūbun (autumn equinox)',
  'Kanro (cold dew)',
  'Sōkō (frost descends)',
  'Rittō (start of winter)',
  'Shōsetsu (minor snow)',
  'Taisetsu (major snow)',
  'Tōji (winter solstice)',
  'Shōkan (minor cold)',
  'Daikan (major cold)',
];

const KO_PHASE = ['first', 'second', 'third'];

/** Evenly space `n` cycle entries across a `yearLength`-day year from day 0. */
function spread(names: string[], yearLength: number): CycleEntry[] {
  return names.map((name, i) => ({
    name,
    startDayOfYear: Math.round((i * yearLength) / names.length),
  }));
}

const YEAR_LEN = 365;

/** 72 kō = each of the 24 sekki split into three microseasons. */
const KO_NAMES: string[] = SEKKI.flatMap((sekki) =>
  KO_PHASE.map((phase) => `${sekki} · ${phase} kō`),
);

export const JAPANESE_KO: CalendarSystem = {
  schemaVersion: CALENDAR_SCHEMA_VERSION,
  id: 'preset-japanese-ko',
  name: 'Japanese seasonal template (sekki & kō)',
  description:
    'Twelve traditional month names with the 24 sekki and 72 kō microseasons as ' +
    'solar-year cycle overlays. A template — tune the offsets to your setting.',
  baseUnit: 'day',
  unitsPerDay: 1,
  epochAbsoluteDay: 0,
  epochLabel: '',
  months: [
    { name: 'Mutsuki', days: 31 },
    { name: 'Kisaragi', days: 28 },
    { name: 'Yayoi', days: 31 },
    { name: 'Uzuki', days: 30 },
    { name: 'Satsuki', days: 31 },
    { name: 'Minazuki', days: 30 },
    { name: 'Fumizuki', days: 31 },
    { name: 'Hazuki', days: 31 },
    { name: 'Nagatsuki', days: 30 },
    { name: 'Kannazuki', days: 31 },
    { name: 'Shimotsuki', days: 30 },
    { name: 'Shiwasu', days: 31 },
  ],
  leapRule: {
    everyYears: 4,
    extraDays: 1,
    monthIndex: 1,
    exceptions: [
      { everyYears: 100, skip: true },
      { everyYears: 400, skip: false },
    ],
  },
  cycles: [
    { name: 'Sekki', color: '#3b82f6', entries: spread(SEKKI, YEAR_LEN) },
    { name: 'Kō', parentCycle: 'Sekki', color: '#14b8a6', entries: spread(KO_NAMES, YEAR_LEN) },
  ],
  calendarKind: 'solar',
};

/**
 * Arithmetic Hijri calendar using the civil 30-year leap cycle. This is useful
 * for planning and conversion, but intentionally does not claim to predict
 * locally observed crescent sightings. Observed years can be corrected with
 * CalendarSystem.yearOverrides.
 */
export const TABULAR_HIJRI: CalendarSystem = {
  schemaVersion: CALENDAR_SCHEMA_VERSION,
  id: 'preset-tabular-hijri',
  name: 'Hijri (arithmetic)',
  description:
    'A rule-based Hijri calendar for planning. Local observed month starts may differ; use year overrides for a specific tradition or setting.',
  calendarKind: 'lunar',
  baseUnit: 'day',
  unitsPerDay: 1,
  epochAbsoluteDay: 227014,
  epochLabel: 'AH',
  months: [
    { name: 'Muharram', days: 30 },
    { name: 'Safar', days: 29 },
    { name: 'Rabi al-Awwal', days: 30 },
    { name: 'Rabi al-Thani', days: 29 },
    { name: 'Jumada al-Awwal', days: 30 },
    { name: 'Jumada al-Thani', days: 29 },
    { name: 'Rajab', days: 30 },
    { name: "Sha'ban", days: 29 },
    { name: 'Ramadan', days: 30 },
    { name: 'Shawwal', days: 29 },
    { name: 'Dhu al-Qadah', days: 30 },
    { name: 'Dhu al-Hijjah', days: 29 },
  ],
  week: { days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] },
  leapRule: {
    cycleYears: 30,
    leapYears: [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29],
    extraDays: 1,
    monthIndex: 11,
  },
  holidays: [
    { name: 'Ramadan', month: 8, day: 1, length: 30, color: '#14b8a6' },
    { name: 'Eid al-Fitr', month: 9, day: 1, length: 3, color: '#f59e0b' },
    { name: 'Eid al-Adha', month: 11, day: 10, length: 4, color: '#8b5cf6' },
  ],
};

export const PRESET_CALENDARS: CalendarSystem[] = [THIRTEEN_MOONS, JAPANESE_KO, TABULAR_HIJRI];
