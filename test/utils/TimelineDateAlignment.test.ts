import { describe, it, expect } from 'vitest';
import { parseEventDate, toMillis } from '../../src/utils/DateParsing';

const DAY_MS = 86400000;

/**
 * The timeline axis counts whole days from the Unix epoch and labels its
 * gridlines in UTC, so a day-precision date has to land exactly on a day
 * boundary. Parsed in the system zone it lands at local midnight instead,
 * which is the local UTC offset away from the gridline that names it, and
 * every event sits beside its own day rather than on it.
 */
describe('timeline date alignment', () => {
    const positionOf = (value: string) =>
        toMillis(parseEventDate(value, { timezone: 'utc' }).start);

    it('puts a day-precision date on a day boundary', () => {
        const millis = positionOf('1420-03-15');
        expect(millis).toBeDefined();
        // Math.abs because a pre-epoch position is negative and `-0 % n` is -0.
        expect(Math.abs(millis! % DAY_MS)).toBe(0);
    });

    it('puts a modern day-precision date on a day boundary', () => {
        expect(positionOf('2024-03-15')! % DAY_MS).toBe(0);
    });

    it('puts a year-only date on a day boundary', () => {
        expect(Math.abs(positionOf('1420')! % DAY_MS)).toBe(0);
    });

    it('puts a month-precision date on a day boundary', () => {
        expect(positionOf('2024-03')! % DAY_MS).toBe(0);
    });

    it('keeps consecutive days exactly one day apart', () => {
        expect(positionOf('2024-03-16')! - positionOf('2024-03-15')!).toBe(DAY_MS);
    });

    it('agrees with the UTC calendar date the axis labels', () => {
        const millis = positionOf('2024-03-15')!;
        expect(new Date(millis).toISOString().slice(0, 10)).toBe('2024-03-15');
    });

    it('round trips a position written back as an ISO string', () => {
        // The drag write-back formats with toISOString, so reading that value
        // again has to give the same position or every drag shifts the event.
        const millis = positionOf('2024-03-15')!;
        const written = new Date(millis).toISOString().replace('T', ' ').replace(/:00\.000Z$/, '');
        expect(positionOf(written)).toBe(millis);
    });
});
