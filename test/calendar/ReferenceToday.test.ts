import { describe, it, expect } from 'vitest';
import { parseTodayText, resolveReferenceToday, todayTextProblem } from '../../src/calendar/ReferenceToday';
import { parseToAbsoluteDay } from '../../src/calendar/CalendarDateText';
import { toAbsolute } from '../../src/calendar/CalendarEngine';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import type { CalendarSystem } from '../../src/calendar/types';
import { CALENDAR_SCHEMA_VERSION } from '../../src/calendar/types';

const FANTASY: CalendarSystem = {
  schemaVersion: CALENDAR_SCHEMA_VERSION,
  id: 'text-fantasy',
  name: 'Fantasy Forty',
  baseUnit: 'day',
  unitsPerDay: 1,
  epochAbsoluteDay: 0,
  epochLabel: 'AF',
  months: [
    { name: 'Frost', abbr: 'Fr', days: 10 },
    { name: 'Bloom', abbr: 'Bl', days: 10 },
    { name: 'Blaze', abbr: 'Bz', days: 10 },
    { name: 'Fade', abbr: 'Fa', days: 10 },
  ],
};

const DAY_MS = 86_400_000;
const NEVER = () => new Date(Number.NaN);

describe('parseTodayText', () => {
  it('reads ISO and BCE text in a Gregorian story', () => {
    expect(parseTodayText('1420-06-01', GREGORIAN_CALENDAR)?.toISOString()).toBe('1420-06-01T00:00:00.000Z');
    expect(parseTodayText('44 BCE', GREGORIAN_CALENDAR)?.getUTCFullYear()).toBe(-43);
  });

  it('places a date in a custom calendar where the timeline places an event with that date', () => {
    const day = parseToAbsoluteDay('342-3-7', FANTASY)!;
    const epoch = toAbsolute(GREGORIAN_CALENDAR, { year: 1970, month: 0, day: 1 }).absoluteDay;
    expect(parseTodayText('342-3-7', FANTASY)?.getTime()).toBe((day - epoch) * DAY_MS);
  });

  it('still reads ISO text in a custom-calendar story when the calendar cannot', () => {
    expect(parseTodayText('1420-06-01T12:00:00Z', FANTASY)).not.toBeNull();
  });

  it('is null for blank or unreadable text', () => {
    expect(parseTodayText(undefined, GREGORIAN_CALENDAR)).toBeNull();
    expect(parseTodayText('   ', GREGORIAN_CALENDAR)).toBeNull();
    expect(parseTodayText('someday soon-ish', GREGORIAN_CALENDAR)).toBeNull();
  });
});

describe('resolveReferenceToday', () => {
  it('takes the most specific readable level', () => {
    const block = '1500-01-01', story = '1420-06-01', vault = '1300-01-01';
    expect(resolveReferenceToday([block, story, vault], GREGORIAN_CALENDAR, NEVER).getUTCFullYear()).toBe(1500);
    expect(resolveReferenceToday([undefined, story, vault], GREGORIAN_CALENDAR, NEVER).getUTCFullYear()).toBe(1420);
    expect(resolveReferenceToday([undefined, '', vault], GREGORIAN_CALENDAR, NEVER).getUTCFullYear()).toBe(1300);
  });

  it('falls through an unreadable level to the next one, not to the clock', () => {
    expect(resolveReferenceToday(['someday soon-ish', '1300-01-01'], GREGORIAN_CALENDAR, NEVER).getUTCFullYear()).toBe(1300);
  });

  it('uses the clock when no level is set', () => {
    const clock = new Date('2026-10-29T00:00:00Z');
    expect(resolveReferenceToday([undefined, undefined], GREGORIAN_CALENDAR, () => clock)).toBe(clock);
  });
});

describe('todayTextProblem', () => {
  it('accepts blank (inherit) and readable text', () => {
    expect(todayTextProblem('', GREGORIAN_CALENDAR)).toBeNull();
    expect(todayTextProblem('1420-06-01', GREGORIAN_CALENDAR)).toBeNull();
    expect(todayTextProblem('342-3-7', FANTASY)).toBeNull();
  });

  it('names the calendar when the text cannot be read', () => {
    expect(todayTextProblem('someday soon-ish', FANTASY)).toContain('Fantasy Forty');
  });
});
