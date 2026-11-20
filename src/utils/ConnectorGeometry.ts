// Where a dependency arrow starts and ends, given the two bars it joins.
//
// Kept apart from the renderer because it is arithmetic on four numbers, and
// the bug it exists to fix is only visible at particular zooms: an arrow that
// runs backwards is easy to reason about in a test and very hard to catch by
// looking at a canvas.

/** The parts of a bar's rectangle an arrow needs. Matches DOMRect's names. */
export interface ConnectorRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ConnectorEnds {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/** Bars closer than this horizontally have no useful side to enter from. */
const SIDE_MARGIN = 4;

/**
 * Endpoints for an arrow from one bar to another.
 *
 * The arrow used to always leave the source's right edge and enter the
 * target's left, which assumes the source is drawn to the left of the target.
 * That assumption breaks as soon as the zoom puts two events closer together
 * than a chip is wide: a bar with no duration still draws a chip at least 88px
 * across, so the source's right edge ends up well past the target's left one
 * and the arrow ran backwards through both of them.
 *
 * So the side is chosen from where the bars actually are:
 * - target clearly to the right: right edge to left edge, as before
 * - target clearly to the left: left edge to right edge
 * - overlapping, on different rows: straight down or up between their centres,
 *   because neither side is outside the other
 * - overlapping on the same row: back to edge-to-edge, which is short and
 *   backwards, but the bars are drawn on top of each other and there is no
 *   honest arrow to draw between them
 */
export function chooseConnectorEnds(from: ConnectorRect, to: ConnectorRect): ConnectorEnds {
    const fromRight = from.x + from.width;
    const toRight = to.x + to.width;
    const fromY = from.y + from.height / 2;
    const toY = to.y + to.height / 2;

    if (to.x >= fromRight - SIDE_MARGIN) return { x1: fromRight, y1: fromY, x2: to.x, y2: toY };
    if (toRight <= from.x + SIDE_MARGIN) return { x1: from.x, y1: fromY, x2: toRight, y2: toY };

    const sameRow = Math.abs(fromY - toY) < 2;
    if (sameRow) return { x1: fromRight, y1: fromY, x2: to.x, y2: toY };

    // Down the middle of whatever the two bars have in common, from the edge of
    // one row to the edge of the next, so the arrow crosses the gap between the
    // rows rather than the bars themselves.
    const shared = (Math.max(from.x, to.x) + Math.min(fromRight, toRight)) / 2;
    const downwards = toY > fromY;
    return {
        x1: shared,
        y1: downwards ? from.y + from.height : from.y,
        x2: shared,
        y2: downwards ? to.y : to.y + to.height
    };
}
