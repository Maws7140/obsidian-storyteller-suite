/**
 * ReferenceToday — the "today" a timeline is drawn against: where the now
 * marker sits, where Jump to today lands, and what relative phrases such as
 * "yesterday" count from.
 *
 * Today can be set at several levels, most specific first: an embedded
 * timeline block's `today:`, the story's own today, the plugin-wide default.
 * Each is text the user typed, read the same way the timeline reads an event
 * date in that story, so "15 Hammer 1492 DR" works in a Forgotten Realms story
 * and lands on the same day an event dated that way does.
 */
import type { CalendarSystem } from './types';
import { GREGORIAN_CALENDAR } from './builtins';
import { toAbsolute } from './CalendarEngine';
import { parseToAbsoluteDay } from './CalendarDateText';
import { parseReferenceDate } from '../utils/DateParsing';

const DAY_MS = 86_400_000;

/**
 * Read one typed today. Null when blank or unreadable.
 *
 * A custom calendar is tried first and its absolute day placed on the axis
 * from the Unix epoch, exactly as the native timeline places event dates.
 * Anything it cannot read (or a Gregorian story) goes through the event date
 * parser, which understands ISO, BCE years and prose.
 */
export function parseTodayText(text: string | undefined, calendar: CalendarSystem): Date | null {
    const trimmed = text?.trim();
    if (!trimmed) return null;
    if (calendar.id !== GREGORIAN_CALENDAR.id) {
        const day = parseToAbsoluteDay(trimmed, calendar);
        if (day != null && Number.isFinite(day)) {
            const epoch = toAbsolute(GREGORIAN_CALENDAR, { year: 1970, month: 0, day: 1 }).absoluteDay;
            return new Date((day - epoch) * DAY_MS);
        }
    }
    return parseReferenceDate(trimmed);
}

/**
 * The first readable today in `sources`, most specific first, else the system
 * clock. An unreadable level falls through to the next rather than to the
 * clock, so a typo in one story does not throw away the vault-wide default.
 */
export function resolveReferenceToday(
    sources: ReadonlyArray<string | undefined>,
    calendar: CalendarSystem,
    now: () => Date = () => new Date()
): Date {
    for (const source of sources) {
        const parsed = parseTodayText(source, calendar);
        if (parsed) return parsed;
    }
    return now();
}

/** Why typed today text cannot be used, or null when it is blank or readable. */
export function todayTextProblem(text: string, calendar: CalendarSystem): string | null {
    const trimmed = text.trim();
    if (!trimmed || parseTodayText(trimmed, calendar)) return null;
    const example = calendar.id === GREGORIAN_CALENDAR.id ? '2026-03-15 or 44 BCE' : `a date in ${calendar.name}, 2026-03-15 or 44 BCE`;
    return `Could not read "${trimmed}" as a date. Use a form such as ${example}.`;
}
