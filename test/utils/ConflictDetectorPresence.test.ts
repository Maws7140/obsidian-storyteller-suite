import { describe, expect, it } from 'vitest';
import type { Character, Event, Location } from '../../src/types';
import { ConflictDetector } from '../../src/utils/ConflictDetector';

const locations: Location[] = [
    { id: 'loc-harbor', name: 'Glass Harbor' },
    { id: 'loc-archive', name: 'Sunken Archive' },
];

const character: Character = {
    id: 'char-mira',
    name: 'Mira Vale',
    locationHistory: [{
        locationId: 'loc-harbor',
        relationship: 'Present',
        timeRange: { start: '2026-01-01', end: '2026-01-31' },
    }],
};

function event(overrides: Partial<Event> = {}): Event {
    return {
        id: 'event-1',
        name: 'Archive door opens',
        dateTime: '2026-01-15',
        characters: ['[[Mira Vale]]'],
        location: 'loc-archive',
        ...overrides,
    };
}

describe('presence-span conflict detection', () => {
    it('reports a confirmed event that contradicts a recorded location span', () => {
        const conflicts = ConflictDetector.detectPresenceConflicts([event()], [character], locations);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({
            type: 'location',
            severity: 'error',
            character: 'Mira Vale',
            details: { locations: ['Glass Harbor', 'loc-archive'] },
        });
    });

    it('treats a disputed or sourced claim as a finding rather than a hard error', () => {
        const conflicts = ConflictDetector.detectPresenceConflicts([
            event({ certainty: 'disputed', claimedBy: ['Dockmaster'] }),
        ], [character], locations);
        expect(conflicts[0]?.severity).toBe('warning');
        expect(conflicts[0]?.message).toContain('claimed event');
    });

    it('accepts the same location and events outside the span', () => {
        const samePlace = event({ location: 'Glass Harbor' });
        const later = event({ id: 'event-2', dateTime: '2026-02-15' });
        expect(ConflictDetector.detectPresenceConflicts([samePlace, later], [character], locations)).toEqual([]);
    });

    it('is included in the complete scan when character context is supplied', () => {
        const conflicts = ConflictDetector.detectAllConflicts([event()], [character], locations);
        expect(conflicts.some(conflict => conflict.id.startsWith('conflict-presence-'))).toBe(true);
    });
});
