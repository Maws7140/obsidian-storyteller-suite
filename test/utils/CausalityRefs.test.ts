import { describe, it, expect } from 'vitest';
import {
    serializeCausalityRef,
    parseCausalityRef,
    parseCausalityRefs,
    causalityRefTarget,
    invertCausalityRef
} from '../../src/utils/CausalityRefs';

describe('serializeCausalityRef', () => {
    it('writes type, target and description', () => {
        expect(serializeCausalityRef({ target: 'The siege', linkType: 'direct', description: 'the gates fell' }))
            .toBe('direct: [[The siege]] - the gates fell');
    });

    it('writes strength after the type', () => {
        expect(serializeCausalityRef({ target: 'The famine', linkType: 'indirect', strength: 'strong' }))
            .toBe('indirect/strong: [[The famine]]');
    });

    it('defaults a missing type to direct', () => {
        expect(serializeCausalityRef({ target: 'The famine', linkType: '' })).toBe('direct: [[The famine]]');
    });

    it('refuses to write a link with no target', () => {
        expect(serializeCausalityRef({ target: '  ', linkType: 'direct' })).toBe('');
    });
});

describe('parseCausalityRef', () => {
    it('round-trips a full link', () => {
        const ref = { target: 'The siege', linkType: 'catalyst', strength: 'absolute' as const, description: 'why' };
        expect(parseCausalityRef(serializeCausalityRef(ref))).toEqual(ref);
    });

    it('reads a link with no description', () => {
        expect(parseCausalityRef('direct: [[The siege]]')).toEqual({ target: 'The siege', linkType: 'direct' });
    });

    it('keeps a bare event name rather than dropping it', () => {
        expect(parseCausalityRef('[[The siege]]')).toEqual({ target: 'The siege', linkType: 'direct' });
    });

    it('keeps an unbracketed name too', () => {
        expect(parseCausalityRef('The siege')).toEqual({ target: 'The siege', linkType: 'direct' });
    });

    it('drops an unrecognised strength instead of storing nonsense', () => {
        expect(parseCausalityRef('direct/enormous: [[The siege]]')).toEqual({ target: 'The siege', linkType: 'direct' });
    });

    it('follows an alias to the real note name', () => {
        expect(parseCausalityRef('direct: [[The siege|that night]]')?.target).toBe('The siege');
    });

    it('reads the legacy object form', () => {
        expect(parseCausalityRef({ target: 'The siege', linkType: 'indirect', strength: 'weak' }))
            .toEqual({ target: 'The siege', linkType: 'indirect', strength: 'weak' });
    });

    it('returns nothing for an empty value', () => {
        expect(parseCausalityRef('')).toBeNull();
        expect(parseCausalityRef(undefined)).toBeNull();
    });
});

describe('parseCausalityRefs', () => {
    it('reads a whole list', () => {
        expect(parseCausalityRefs(['direct: [[A]]', 'indirect/weak: [[B]] - because'])).toEqual([
            { target: 'A', linkType: 'direct' },
            { target: 'B', linkType: 'indirect', strength: 'weak', description: 'because' }
        ]);
    });

    it('is empty for a non-array', () => {
        expect(parseCausalityRefs('direct: [[A]]')).toEqual([]);
    });
});

describe('causalityRefTarget', () => {
    it('pulls the event name out for matching', () => {
        expect(causalityRefTarget('catalyst/strong: [[The siege]] - why')).toBe('The siege');
    });

    it('is empty when there is nothing to point at', () => {
        expect(causalityRefTarget('')).toBe('');
    });
});

describe('invertCausalityRef', () => {
    it('swaps the target and keeps everything the link itself owns', () => {
        expect(invertCausalityRef('catalyst/strong: [[The siege]] - why', 'The famine'))
            .toBe('catalyst/strong: [[The famine]] - why');
    });

    it('still produces a usable link from an unparseable one', () => {
        expect(invertCausalityRef('', 'The famine')).toBe('direct: [[The famine]]');
    });
});
