import { describe, expect, it } from 'vitest';
import { sameMarkerRuns } from '../../src/utils/ChronologyMarkerGroups';

describe('sameMarkerRuns', () => {
    it('returns no runs for no items', () => {
        expect(sameMarkerRuns([], (value: number) => value)).toEqual([]);
    });

    it('groups adjacent items that share a column and keeps order', () => {
        const items = [{ id: 'a', x: 10 }, { id: 'b', x: 10 }, { id: 'c', x: 10 }, { id: 'd', x: 14 }];
        const runs = sameMarkerRuns(items, item => item.x);
        expect(runs.map(run => run.map(item => item.id))).toEqual([['a', 'b', 'c'], ['d']]);
    });

    it('starts a new run when a column returns after a different one', () => {
        const runs = sameMarkerRuns([1, 1, 2, 1], value => value);
        expect(runs).toEqual([[1, 1], [2], [1]]);
    });

    it('keeps items with no placeable column apart from each other', () => {
        const runs = sameMarkerRuns([Number.NaN, Number.NaN], value => value);
        expect(runs).toHaveLength(2);
    });
});
