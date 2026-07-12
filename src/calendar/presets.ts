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
  name: 'Japanese (sekki & kō)',
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
    { name: 'Sekki', entries: spread(SEKKI, YEAR_LEN) },
    { name: 'Kō', entries: spread(KO_NAMES, YEAR_LEN) },
  ],
};

export const PRESET_CALENDARS: CalendarSystem[] = [THIRTEEN_MOONS, JAPANESE_KO];
