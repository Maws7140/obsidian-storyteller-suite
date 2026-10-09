import { describe, expect, it } from 'vitest';
import { narrativeDirectionOf, narrativeSequenceOf, setNarrativeDirection, timelineDateForMode } from '../../src/utils/NarrativeTimeline';
import type { Event } from '../../src/types';

describe('NarrativeTimeline', () => {
    it('uses chronology normally and the narration date in narrative mode', () => {
        const event: Event = { name: 'Reveal', dateTime: '1900-01-01', narrativeMarkers: { narrativeDate: '2000-01-01' } };
        expect(timelineDateForMode(event, false)).toBe('1900-01-01');
        expect(timelineDateForMode(event, true)).toBe('2000-01-01');
    });

    it('falls back to chronology when no narrative date exists', () => {
        expect(timelineDateForMode({ name: 'Now', dateTime: '2024-01-01' }, true)).toBe('2024-01-01');
    });

    it('uses sequence as a stable secondary order', () => {
        expect(narrativeSequenceOf({ name: 'Second', narrativeSequence: 2 })).toBe(2);
        expect(narrativeSequenceOf({ name: 'Unsequenced' })).toBe(Number.POSITIVE_INFINITY);
    });

    it('exposes the narrative direction used by timeline icons', () => {
        expect(narrativeDirectionOf({ name: 'Memory', narrativeMarkers: { isFlashback: true } })).toBe('flashback');
        expect(narrativeDirectionOf({ name: 'Premonition', narrativeMarkers: { isFlashforward: true } })).toBe('flashforward');
        expect(narrativeDirectionOf({ name: 'Present' })).toBeNull();
    });

    it('never leaves an event marked in both narrative directions', () => {
        const event: Event = { name: 'Memory', narrativeMarkers: { isFlashforward: true } };
        setNarrativeDirection(event, 'flashback', true);
        expect(event.narrativeMarkers).toMatchObject({ isFlashback: true });
        expect(event.narrativeMarkers?.isFlashforward).toBeUndefined();
    });
});
