/**
 * Row packing for chronology lanes, with a cap on how many rows a lane may use.
 *
 * Chips are placed at their date and pushed down a row whenever they would
 * land on a chip already in that row. Left uncapped, a cluster of events
 * cascades into a staircase many rows deep while the space to its right sits
 * empty. Past the cap, the chips that would have needed another row fold into
 * a single "+K more" chip on the last row, so every event still has its marker
 * on the axis and the lane stops growing.
 */

/** One chip as the packer sees it, in milliseconds. */
export interface ChronologySpan {
    start: number;
    end: number;
    /** How much time the chip needs to itself, including its gap to the next one. */
    reservation: number;
}

export interface ChronologyOverflowChip {
    /** Always the last row. */
    row: number;
    /** Indexes into the input spans, in input order. */
    members: number[];
}

export interface ChronologyPacking {
    /** Row for each input span, in input order. Folded spans sit on the overflow row. */
    rows: number[];
    clusters: ChronologyOverflowChip[];
}

/**
 * Assign rows to spans that are already sorted by start.
 *
 * The last row (`rowCap - 1`) is kept for overflow chips, so at most
 * `rowCap - 1` rows carry events one by one. A span that finds no free row
 * before that is folded into the overflow chip reserved at its start. Spans
 * that start before the chip's reserved room has run out join it, and a span
 * past that room starts another chip on the same row.
 *
 * Pass `Infinity` as the cap to get plain packing with no folding.
 *
 * @param overflowReservation time the "+K more" chip needs to itself.
 */
export function packChronologyRows(
    spans: readonly ChronologySpan[],
    rowCap: number,
    overflowReservation: number
): ChronologyPacking {
    const overflowRow = rowCap - 1;
    const rowEnds: number[] = [];
    const rows: number[] = [];
    const clusters: ChronologyOverflowChip[] = [];
    let current: ChronologyOverflowChip | null = null;
    let currentReservedEnd = Number.NEGATIVE_INFINITY;

    spans.forEach((span, index) => {
        let row = 0;
        while (row < rowEnds.length && row < overflowRow && rowEnds[row] > span.start) row++;
        if (row < overflowRow) {
            rows[index] = row;
            rowEnds[row] = Math.max(span.end, span.start + span.reservation);
            return;
        }
        if (!current || span.start >= currentReservedEnd) {
            current = { row: overflowRow, members: [] };
            clusters.push(current);
            currentReservedEnd = span.start + overflowReservation;
        }
        current.members.push(index);
        rows[index] = overflowRow;
    });

    return { rows, clusters };
}
