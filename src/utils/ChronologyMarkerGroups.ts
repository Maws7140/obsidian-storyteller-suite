/**
 * Splits items into runs that share one axis marker column.
 *
 * The input must already be sorted by time, because a column is a pixel
 * position and columns only repeat across neighbours in time order. Within
 * that order, equal columns are adjacent, so one pass finds every run.
 */
export function sameMarkerRuns<T>(items: T[], columnOf: (item: T) => number): T[][] {
    const runs: T[][] = [];
    let previous = Number.NaN;
    items.forEach(item => {
        const column = columnOf(item);
        // NaN never equals itself, so an unplaceable item stands alone rather
        // than swallowing its neighbours into one group.
        if (runs.length && column === previous) runs[runs.length - 1].push(item);
        else runs.push([item]);
        previous = column;
    });
    return runs;
}
