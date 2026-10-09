import type { Event } from '../types';

export type NarrativeDirection = 'flashback' | 'flashforward';

/** Date used to position an event in the selected reading mode. */
export function timelineDateForMode(event: Event, narrativeOrder: boolean): string | undefined {
    if (narrativeOrder) {
        const narrativeDate = event.narrativeMarkers?.narrativeDate?.trim();
        if (narrativeDate) return narrativeDate;
    }
    return event.dateTime;
}

/** Stable secondary ordering when several narrated events share a date. */
export function narrativeSequenceOf(event: Event): number {
    const value = event.narrativeSequence;
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : Number.POSITIVE_INFINITY;
}

/** Narrative direction to surface on timeline cards and in their tooltips. */
export function narrativeDirectionOf(event: Event): NarrativeDirection | null {
    if (event.narrativeMarkers?.isFlashback) return 'flashback';
    if (event.narrativeMarkers?.isFlashforward) return 'flashforward';
    return null;
}

/** Flashback and flash-forward are mutually exclusive narrative directions. */
export function setNarrativeDirection(
    event: Event,
    direction: NarrativeDirection,
    enabled: boolean
): void {
    event.narrativeMarkers ??= {};
    if (direction === 'flashback') {
        event.narrativeMarkers.isFlashback = enabled || undefined;
        if (enabled) event.narrativeMarkers.isFlashforward = undefined;
    } else {
        event.narrativeMarkers.isFlashforward = enabled || undefined;
        if (enabled) event.narrativeMarkers.isFlashback = undefined;
    }
}
