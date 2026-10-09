export interface AlternatingTimelinePoint<T> {
    value: T;
    position: number;
}

export interface AlternatingTimelinePlacement<T> extends AlternatingTimelinePoint<T> {
    placedPosition: number;
    above: boolean;
    tier: number;
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
