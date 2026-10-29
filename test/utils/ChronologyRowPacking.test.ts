import { describe, it, expect } from 'vitest';
import { packChronologyRows, ChronologySpan } from '../../src/utils/ChronologyRowPacking';

const DAY = 86_400_000;
/** Every chip takes one day of room, and the overflow chip takes two. */
const span = (startDays: number, lengthDays = 0): ChronologySpan => ({
    start: startDays * DAY,
    end: (startDays + lengthDays) * DAY,
    reservation: DAY,
});
const OVERFLOW = 2 * DAY;

describe('packChronologyRows', () => {
    it('stacks overlapping chips down rows and leaves separated chips on row 0', () => {
        const spans = [span(0), span(0), span(0), span(5)];
        const { rows, clusters } = packChronologyRows(spans, Infinity, OVERFLOW);
        expect(rows).toEqual([0, 1, 2, 0]);
        expect(clusters).toEqual([]);
    });

    it('keeps the last row for overflow and folds the rest into one chip', () => {
        // Cap of 3 leaves rows 0 and 1 for events and row 2 for overflow.
        const spans = [span(0), span(0), span(0), span(0), span(0)];
        const { rows, clusters } = packChronologyRows(spans, 3, OVERFLOW);
        expect(rows).toEqual([0, 1, 2, 2, 2]);
        expect(clusters).toHaveLength(1);
        expect(clusters[0]).toEqual({ row: 2, members: [2, 3, 4] });
    });

    it('never places a normal chip on the overflow row', () => {
        const spans = Array.from({ length: 40 }, () => span(0));
        const { rows } = packChronologyRows(spans, 6, OVERFLOW);
        expect(Math.max(...rows)).toBe(5);
        expect(rows.filter(row => row < 5)).toHaveLength(5);
    });

    it('accounts for every event, either as a row chip or as a folded member', () => {
        const spans = Array.from({ length: 60 }, (_, index) => span(index % 3, 0));
        const { rows, clusters } = packChronologyRows(spans, 4, OVERFLOW);
        const folded = clusters.flatMap(cluster => cluster.members);
        const drawn = rows.filter((_, index) => !folded.includes(index));
        expect(drawn.length + folded.length).toBe(spans.length);
        expect(folded.length).toBeGreaterThan(0);
        expect(new Set(folded).size).toBe(folded.length);
    });

    it('starts a new overflow chip once the previous one has run out of room', () => {
        // Rows: 0 is taken by span 0, and cap 2 means overflow starts at once.
        // Chip A reserves days 0 to 2, so day 1 joins it and day 3 starts chip B.
        const spans = [span(0, 10), span(0), span(1), span(3), span(3.5)];
        const { clusters } = packChronologyRows(spans, 2, OVERFLOW);
        expect(clusters.map(cluster => cluster.members)).toEqual([[1, 2], [3, 4]]);
    });

    it('does not fold anything when the cap is not reached', () => {
        const spans = [span(0), span(1), span(2)];
        const { rows, clusters } = packChronologyRows(spans, 4, OVERFLOW);
        expect(rows).toEqual([0, 0, 0]);
        expect(clusters).toEqual([]);
    });
});
