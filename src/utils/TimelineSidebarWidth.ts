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
 *
 * @param maxWidth the full column width, from the timeline theme (174 by default).
 */
export function sidebarWidthFor(paneWidth: number, collapsed: boolean, maxWidth = SIDEBAR_MAX_WIDTH): number {
    if (collapsed) return 0;
    // The pane share scales with the theme's label width, so a theme asking
    // for a wider column gets it on a wide pane and still shrinks on a narrow one.
    const share = SIDEBAR_PANE_SHARE * maxWidth / SIDEBAR_MAX_WIDTH;
    return Math.round(Math.min(maxWidth, Math.max(Math.min(SIDEBAR_MIN_WIDTH, maxWidth), paneWidth * share)));
}
