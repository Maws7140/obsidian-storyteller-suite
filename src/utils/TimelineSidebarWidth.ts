/** Narrowest the lane-label column gets before a lane name stops being readable. */
const SIDEBAR_MIN_WIDTH = 72;
/** Widest the lane-label column gets, which is the size it had when it was fixed. */
const SIDEBAR_MAX_WIDTH = 174;
/** Share of the pane the lane-label column takes before the clamp applies. */
const SIDEBAR_PANE_SHARE = 0.18;

/**
 * Width of the lane-label column for a pane this wide.
 *
 * A fixed column took 44% of a 400 px pane and left the plot a sliver. Scaling
 * it with the pane keeps most of a narrow pane for the plot. When there is only
 * one unnamed lane the column collapses to nothing, since its only label would
 * be "Timeline" repeated beside every chip.
 */
export function sidebarWidthFor(paneWidth: number, collapsed: boolean): number {
    if (collapsed) return 0;
    return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, paneWidth * SIDEBAR_PANE_SHARE)));
}
