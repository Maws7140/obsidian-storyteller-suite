import { describe, expect, it } from 'vitest';
import { GREGORIAN_CALENDAR } from '../../src/calendar/builtins';
import { toAbsolute } from '../../src/calendar/CalendarEngine';
import { calendarImageMonths, MAX_EXPORT_MONTHS } from '../../src/utils/TimelineCalendarImage';

const day = (year: number, month: number, date: number) => toAbsolute(GREGORIAN_CALENDAR, { year, month, day: date }).absoluteDay;

describe('calendar image months', () => {
    it('covers every month from the first event to the last', () => {
        const months = calendarImageMonths(GREGORIAN_CALENDAR, day(3019, 10, 20), day(3020, 1, 3));
        expect(months).toEqual([
            { year: 3019, month: 10 },
            { year: 3019, month: 11 },
            { year: 3020, month: 0 },
            { year: 3020, month: 1 },
        ]);
    });

    it('is one month when everything falls in it', () => {
        expect(calendarImageMonths(GREGORIAN_CALENDAR, day(2026, 9, 1), day(2026, 9, 31))).toEqual([{ year: 2026, month: 9 }]);
    });

    it('stops at the cap for a long history', () => {
        const months = calendarImageMonths(GREGORIAN_CALENDAR, day(1900, 0, 1), day(2000, 0, 1));
        expect(months).toHaveLength(MAX_EXPORT_MONTHS);
        expect(months[0]).toEqual({ year: 1900, month: 0 });
    });
});
