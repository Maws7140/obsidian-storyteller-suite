import { describe, it, expect } from 'vitest';
import { locationPinKey, normalizeBoardName, resolveBoardSelection } from '../../src/utils/CampaignBoardSelection';

describe('campaign board selection', () => {
    it('keys a pin by id, falling back to a normalised name', () => {
        expect(locationPinKey({ id: 'loc-1', name: 'Gate' })).toBe('loc-1');
        expect(locationPinKey({ name: '[[Old Gate|The Gate]]' })).toBe('old gate');
        expect(locationPinKey({ name: '  Harbour  ' })).toBe('harbour');
    });

    it('normalises wiki-link and case differences when matching names', () => {
        expect(normalizeBoardName('[[Tavern#Upstairs]]')).toBe('tavern');
        expect(normalizeBoardName(undefined)).toBe('');
    });

    it('keeps the previous selection while that pin still exists', () => {
        expect(resolveBoardSelection(['a', 'b', 'c'], 'b', 'c')).toBe('b');
    });

    it('prefers the scene location when there is no valid previous selection', () => {
        expect(resolveBoardSelection(['a', 'b', 'c'], 'gone', 'c')).toBe('c');
        expect(resolveBoardSelection(['a', 'b', 'c'], null, 'c')).toBe('c');
    });

    it('falls back to the first pin when neither previous nor current applies', () => {
        expect(resolveBoardSelection(['a', 'b'], null, 'missing')).toBe('a');
    });

    it('returns null when the board has no pins', () => {
        expect(resolveBoardSelection([], 'a', 'a')).toBeNull();
    });
});
