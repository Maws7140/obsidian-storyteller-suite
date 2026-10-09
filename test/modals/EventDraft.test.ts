import { describe, expect, it } from 'vitest';
import { changedMemberships, cloneEventDraft } from '../../src/modals/entity/EventDraft';

describe('Event modal draft', () => {
    it('does not mutate the loaded event when nested draft values change', () => {
        const source = {
            name: 'Memory',
            characters: ['A'],
            narrativeMarkers: { isFlashback: true, narrativeContext: 'A remembered room' },
        };
        const draft = cloneEventDraft(source);
        draft.characters?.push('B');
        draft.narrativeMarkers!.narrativeContext = 'Changed';
        expect(source.characters).toEqual(['A']);
        expect(source.narrativeMarkers.narrativeContext).toBe('A remembered room');
    });

    it('computes deferred membership changes', () => {
        expect(changedMemberships(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] });
    });
});
