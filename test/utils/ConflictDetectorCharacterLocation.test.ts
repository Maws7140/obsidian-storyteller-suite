import { describe, expect, it } from 'vitest';
import type { Event } from '../../src/types';
import { ConflictDetector } from '../../src/utils/ConflictDetector';

function event(id: string, dateTime: string, location: string, characters: string[] = ['Mira']): Event {
    return { id, name: `Event ${id}`, dateTime, location, characters };
}

describe('character location conflicts', () => {
    it('reports the same overlapping pairs, in the same order, for a small fixture', () => {
        const events: Event[] = [
            event('a', '2026-01-15T10:00', 'harbor'),
            event('b', '2026-01-15T10:30', 'archive'),
            event('c', '2026-01-15T11:00', 'archive'),
            event('d', '2026-01-15', 'keep'),
            event('e', '2026-01-15T10:45', 'harbor'),
            event('f', '2026-03-01T09:00', 'harbor'),
        ];

        const ids = ConflictDetector.detectCharacterLocationConflicts(events).map(c => c.id);

        // Sorted by start, then every later event that starts before the current one ends.
        // Back-to-back hours (a ends at 11:00, c starts at 11:00) do not overlap.
        expect(ids).toEqual([
            'conflict-Mira-d-a',
            'conflict-Mira-d-b',
            'conflict-Mira-d-e',
            'conflict-Mira-d-c',
            'conflict-Mira-a-b',
            'conflict-Mira-b-e',
            'conflict-Mira-e-c',
        ]);
    });

    it('keeps precision-based ranges when deciding overlap', () => {
        // A month-precision event covers the whole month, so a day event inside it conflicts,
        // while an hour event on the next day does not.
        const events: Event[] = [
            event('m', '2026-02', 'harbor'),
            event('day', '2026-02-10', 'archive'),
            event('next', '2026-03-02T12:00', 'archive'),
        ];

        const ids = ConflictDetector.detectCharacterLocationConflicts(events).map(c => c.id);
        expect(ids).toEqual(['conflict-Mira-m-day']);
    });

    it('finishes 2,000 synthetic events well under a second', () => {
        const base = Date.UTC(2020, 0, 1);
        // Every hour slot holds two entries at different locations for one of ten characters, so
        // each character has many hour-long events and a steady stream of real overlaps.
        const events: Event[] = Array.from({ length: 2000 }, (_, i) => {
            const slot = Math.floor(i / 2);
            const start = new Date(base + slot * 60 * 60 * 1000).toISOString().slice(0, 16);
            return event(`e${i}`, start, `Loc ${i % 5}`, [`Char ${slot % 10}`]);
        });

        const started = performance.now();
        const conflicts = ConflictDetector.detectCharacterLocationConflicts(events);
        const elapsed = performance.now() - started;

        expect(conflicts.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(1000);
    });
});
