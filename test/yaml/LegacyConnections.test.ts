import { describe, it, expect } from 'vitest';
import { parseTypedRelationships, serializeTypedRelationships } from '../../src/yaml/EntitySections';

describe('legacy object-form connections', () => {
    it('reads the target from targetId when target is missing', () => {
        expect(parseTypedRelationships([{ targetId: 'k3x9ab', type: 'ally' }])).toEqual([
            { type: 'ally', target: 'k3x9ab' },
        ]);
    });

    it('reads the target from name when target and targetId are missing', () => {
        expect(parseTypedRelationships([{ name: 'Boromir', type: 'rival', label: 'old feud' }])).toEqual([
            { type: 'rival', target: 'Boromir', label: 'old feud' },
        ]);
    });

    it('prefers target, then targetId, then name', () => {
        expect(parseTypedRelationships([{ target: 'Aragorn', targetId: 'x1', name: 'Strider', type: 'ally' }])).toEqual([
            { type: 'ally', target: 'Aragorn' },
        ]);
        expect(parseTypedRelationships([{ targetId: 'x1', name: 'Strider', type: 'ally' }])).toEqual([
            { type: 'ally', target: 'x1' },
        ]);
    });

    it('keeps an object with no usable target as a neutral entry instead of dropping it', () => {
        const parsed = parseTypedRelationships([{ type: 'ally', label: 'unknown' }, { target: '   ', type: 'rival' }]);
        expect(parsed).toHaveLength(2);
        expect(parsed[0]).toEqual({ type: 'ally', target: '', label: 'unknown' });
        expect(parsed[1]).toEqual({ type: 'rival', target: '' });
    });

    it('a save after load keeps legacy connections on disk', () => {
        const onDisk: unknown[] = [
            { targetId: 'k3x9ab', type: 'ally' },
            { name: 'Boromir', type: 'rival', label: 'old feud' },
            'mentor: [[Gandalf]]',
        ];
        const parsed = parseTypedRelationships(onDisk);
        const written = serializeTypedRelationships([...parsed, { target: 'Bran', type: 'acquaintance', direction: 'mutual' }]);
        expect(written).toEqual([
            'ally: [[k3x9ab]]',
            'rival: [[Boromir]] — old feud',
            'mentor: [[Gandalf]]',
            'acquaintance <-> [[Bran]]',
        ]);
    });
});
