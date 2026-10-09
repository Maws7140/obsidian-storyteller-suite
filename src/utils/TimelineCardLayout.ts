export interface AlternatingTimelinePoint<T> {
    value: T;
    position: number;
}

export interface AlternatingTimelinePlacement<T> extends AlternatingTimelinePoint<T> {
    placedPosition: number;
    above: boolean;
    tier: number;
}

/** Narrowest vertical card that still shows a readable title and date. */
export const VERTICAL_CARD_MIN_WIDTH = 150;
/** Widest vertical card. Beyond this extra width adds no readable text. */
export const VERTICAL_CARD_MAX_WIDTH = 220;

/**
 * How many side-by-side card columns fit on one side of a vertical timeline
 * without any column dropping below the readable minimum. Columns past this
 * count are overflow and are shown as markers rather than squeezed cards.
 */
export function maxVerticalCardTiers(sideWidth: number, gap = 12): number {
    return Math.max(1, Math.floor((sideWidth + gap) / (VERTICAL_CARD_MIN_WIDTH + gap)));
}

/**
 * Width of each card when a side holds `tierCount` columns that share the
 * side's width. The 88 px floor only matters on canvases too narrow for the
 * readable minimum; there the card is cut down rather than made unreadable.
 */
export function verticalCardWidth(sideWidth: number, tierCount: number, gap = 12): number {
    const columns = Math.max(1, tierCount);
    const shared = (sideWidth - (columns - 1) * gap) / columns;
    return Math.max(88, Math.min(VERTICAL_CARD_MAX_WIDTH, shared));
}

/**
 * Alternate chronological cards across the two sides of an axis. Collisions
 * gain a perpendicular tier rather than sliding along the time axis: moving a
 * card away from its date makes the connector ambiguous after a pan.
 */
export function placeAlternatingTimelineCards<T>(
    points: AlternatingTimelinePoint<T>[],
    _start: number,
    _end: number,
    cardWidth: number,
    gap = 12,
    alternateSides = true
): AlternatingTimelinePlacement<T>[] {
    const placements = points.map((point, index) => ({
        ...point,
        // Never clamp to the viewport. A timeline card is content, not chrome:
        // it must pan offscreen with its date marker rather than sticking to an
        // edge and growing a long leader line back to the moving timeline.
        placedPosition: point.position,
        above: !alternateSides || index % 2 === 0,
        tier: 0
    }));

    [true, false].forEach(above => {
        const side = placements.filter(placement => placement.above === above);
        const tierEnds: number[] = [];
        side.forEach(placement => {
            const cardStart = placement.placedPosition - cardWidth / 2;
            let tier = tierEnds.findIndex(previousEnd => previousEnd + gap <= cardStart);
            if (tier < 0) tier = tierEnds.length;
            placement.tier = tier;
            tierEnds[tier] = placement.placedPosition + cardWidth / 2;
        });
    });

    return placements;
}
