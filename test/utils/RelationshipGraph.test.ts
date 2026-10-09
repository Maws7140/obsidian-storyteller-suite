import { describe, it, expect } from 'vitest';
import type { Character, Group, GraphEdge, GraphNode, TypedRelationship } from '../../src/types';
import {
    extractAllRelationships,
    withImpliedInverseEdges,
    buildCytoscapeElements,
    graphEdgeId,
    isDeceasedStatus,
    characterSubtitle,
    getEntityShape,
    GROUP_MEMBERSHIP_LABEL
} from '../../src/utils/GraphUtils';
import { defaultDirectionFor, resolveDirection, inverseKindOf, RELATIONSHIP_KINDS, RELATIONSHIP_CATEGORIES } from '../../src/utils/RelationshipKinds';

function character(name: string, extra: Partial<Character> = {}): Character {
    return { id: name.toLowerCase().replace(/\s+/g, '-'), name, ...extra } as Character;
}

function extract(characters: Character[], groups: Group[] = []): GraphEdge[] {
    return extractAllRelationships(characters, [], [], [], [], [], [], groups);
}

describe('relationship kinds and direction', () => {
    it('groups every kind into exactly one category', () => {
        const flat = RELATIONSHIP_CATEGORIES.flatMap(c => c.kinds);
        expect(flat.sort()).toEqual([...RELATIONSHIP_KINDS].sort());
        expect(new Set(flat).size).toBe(flat.length);
        expect(RELATIONSHIP_KINDS).toContain('loyal-to');
        expect(RELATIONSHIP_KINDS).toContain('neutral');
    });

    it('infers mutual for symmetric kinds and one-way for the rest', () => {
        expect(defaultDirectionFor('sibling')).toBe('mutual');
        expect(defaultDirectionFor('spouse')).toBe('mutual');
        expect(defaultDirectionFor('rival')).toBe('mutual');
        expect(defaultDirectionFor('loves')).toBe('to');
        expect(defaultDirectionFor('parent')).toBe('to');
        expect(defaultDirectionFor('some legacy word')).toBe('to');
    });

    it('prefers an explicit direction over the inferred one', () => {
        expect(resolveDirection({ type: 'rival', direction: 'to' })).toBe('to');
        expect(resolveDirection({ type: 'loves' })).toBe('to');
    });

    it('pairs parent and child as inverses only', () => {
        expect(inverseKindOf('parent')).toBe('child');
        expect(inverseKindOf('child')).toBe('parent');
        expect(inverseKindOf('loves')).toBeNull();
    });
});

describe('extraction of typed connections', () => {
    it('keeps direction, ended and label on the edge', () => {
        const conns: TypedRelationship[] = [
            { type: 'loves', target: 'Arwen', direction: 'to', label: 'since the council' },
            { type: 'hates', target: 'Gollum', direction: 'to', ended: true }
        ];
        const edges = extract([character('Aragorn', { connections: conns }), character('Arwen'), character('Gollum')]);
        expect(edges).toEqual([
            expect.objectContaining({ source: 'aragorn', target: 'arwen', relationshipType: 'loves', direction: 'to', label: 'since the council' }),
            expect.objectContaining({ source: 'aragorn', target: 'gollum', relationshipType: 'hates', direction: 'to', ended: true })
        ]);
        expect(edges[1].ended).toBe(true);
        expect(edges[0].ended).toBeUndefined();
    });

    it('draws a mutual relationship once even when both notes state it', () => {
        const edges = extract([
            character('Boromir', { connections: [{ type: 'rival', target: 'Aragorn', direction: 'mutual' }] }),
            character('Aragorn', { connections: [{ type: 'rival', target: 'Boromir', direction: 'mutual' }] })
        ]);
        expect(edges).toHaveLength(1);
        expect(edges[0].direction).toBe('mutual');
    });

    it('keeps an ended relationship alongside a live one with the same words', () => {
        const edges = extract([
            character('Mira', {
                connections: [
                    { type: 'enemy', target: 'Noe' },
                    { type: 'enemy', target: 'Noe', ended: true }
                ]
            }),
            character('Noe')
        ]);
        expect(edges).toHaveLength(2);
        expect(new Set(edges.map(graphEdgeId)).size).toBe(2);
    });
});

describe('implied inverse edges', () => {
    it('draws the child implied by a stored parent, marked implied', () => {
        const edges = extract([
            character('Tom', { connections: [{ type: 'parent', target: 'Mira', direction: 'to', label: 'raised her' }] }),
            character('Mira')
        ]);
        const withInverse = withImpliedInverseEdges(edges);
        expect(withInverse).toHaveLength(2);
        expect(withInverse[1]).toEqual({
            source: 'mira',
            target: 'tom',
            relationshipType: 'child',
            label: 'raised her',
            direction: 'to',
            implied: true
        });
    });

    it('does not duplicate the inverse when the other side already states it', () => {
        const edges = extract([
            character('Tom', { connections: [{ type: 'parent', target: 'Mira' }] }),
            character('Mira', { connections: [{ type: 'child', target: 'Tom' }] })
        ]);
        const withInverse = withImpliedInverseEdges(edges);
        expect(withInverse).toHaveLength(2);
        expect(withInverse.some(e => e.implied)).toBe(false);
    });

    it('does not imply inverses for non-family kinds', () => {
        const edges = extract([character('A', { connections: [{ type: 'loves', target: 'B' }] }), character('B')]);
        expect(withImpliedInverseEdges(edges)).toHaveLength(1);
    });

    it('does not imply an inverse for an ended parent link that is not live', () => {
        const edges = extract([character('Tom', { connections: [{ type: 'parent', target: 'Mira', ended: true }] }), character('Mira')]);
        const withInverse = withImpliedInverseEdges(edges);
        expect(withInverse[1]).toEqual(expect.objectContaining({ relationshipType: 'child', ended: true, implied: true }));
    });
});

describe('groups in the graph', () => {
    const fellowship: Group = {
        id: 'grp-fellowship',
        storyId: 's1',
        name: 'Fellowship',
        members: [{ type: 'character', id: 'frodo' }]
    } as Group;

    it('draws membership from a character groups list', () => {
        const edges = extract(
            [character('Frodo', { groups: ['grp-fellowship'] }), character('Sam')],
            [fellowship]
        );
        expect(edges).toEqual([
            { source: 'frodo', target: 'grp-fellowship', relationshipType: 'neutral', label: GROUP_MEMBERSHIP_LABEL, direction: 'to' }
        ]);
    });

    it('draws membership from the group members list and merges duplicates', () => {
        const edges = extract(
            [character('Frodo', { id: 'frodo', groups: ['grp-fellowship'] })],
            [fellowship]
        );
        expect(edges).toHaveLength(1);
    });

    it('resolves group membership by group name', () => {
        const edges = extract([character('Sam', { groups: ['Fellowship'] })], [fellowship]);
        expect(edges.map(e => e.target)).toEqual(['grp-fellowship']);
    });

    it('ignores groups that are not in the list (for example, filtered out)', () => {
        expect(extract([character('Sam', { groups: ['grp-other'] })], [fellowship])).toEqual([]);
    });

    it('uses a distinct shape for group nodes', () => {
        expect(getEntityShape('group')).toBe('round-triangle');
        expect(getEntityShape('character')).toBe('ellipse');
    });

    it('builds group nodes into Cytoscape elements', () => {
        const nodes: GraphNode[] = [{ id: 'grp-fellowship', label: 'Fellowship', type: 'group', data: fellowship }];
        const elements = buildCytoscapeElements(nodes, []);
        expect(elements).toHaveLength(1);
        expect(elements[0].data).toEqual(expect.objectContaining({ id: 'grp-fellowship', type: 'group', degree: 0 }));
    });
});

describe('dead characters and the R-Map lifecycle', () => {
    it('recognises dead and deceased statuses', () => {
        expect(isDeceasedStatus('Deceased')).toBe(true);
        expect(isDeceasedStatus('dead')).toBe(true);
        expect(isDeceasedStatus('Deceased (1204)')).toBe(true);
        expect(isDeceasedStatus('Alive')).toBe(false);
        expect(isDeceasedStatus('Missing')).toBe(false);
        expect(isDeceasedStatus(undefined)).toBe(false);
    });

    it('keeps a dead character on the graph with its edges and marks it deceased', () => {
        const characters = [
            character('Boromir', { status: 'Deceased', connections: [{ type: 'loves', target: 'Faramir' }] }),
            character('Faramir', { status: 'Alive' })
        ];
        const edges = extract(characters);
        const elements = buildCytoscapeElements(
            characters.map(c => ({ id: c.id as string, label: c.name, type: 'character' as const, data: c })),
            edges
        );
        const boromir = elements.find(e => e.data.id === 'boromir');
        const faramir = elements.find(e => e.data.id === 'faramir');
        expect(boromir?.data.deceased).toBe(true);
        expect(faramir?.data.deceased).toBe(false);
        expect(boromir?.data.degree).toBe(1);
        expect(elements.filter(e => e.data.source)).toHaveLength(1);
    });

    it('flags ended and implied edges in the Cytoscape data', () => {
        const edges: GraphEdge[] = [
            { source: 'a', target: 'b', relationshipType: 'rival', direction: 'mutual', ended: true },
            { source: 'b', target: 'a', relationshipType: 'child', direction: 'to', implied: true }
        ];
        const elements = buildCytoscapeElements([], edges);
        expect(elements[0].data).toEqual(expect.objectContaining({ direction: 'mutual', ended: true, implied: false }));
        expect(elements[1].data).toEqual(expect.objectContaining({ direction: 'to', ended: false, implied: true }));
        expect(elements[0].data.id).not.toBe(elements[1].data.id);
    });
});

describe('node subtitle (R-Map minimum notation)', () => {
    it('shows age and gender when present', () => {
        expect(characterSubtitle({ age: '34', gender: 'female' })).toBe('34 · female');
        expect(characterSubtitle({ age: 'ancient' })).toBe('ancient');
        expect(characterSubtitle({ gender: 'male' })).toBe('male');
    });

    it('is empty when neither is set', () => {
        expect(characterSubtitle({})).toBe('');
        expect(characterSubtitle({ age: '  ', gender: undefined })).toBe('');
    });

    it('is carried on the node element', () => {
        const c = character('Mira', { age: '29', gender: 'female' });
        const [element] = buildCytoscapeElements([{ id: 'mira', label: 'Mira', type: 'character', data: c }], []);
        expect(element.data.subtitle).toBe('29 · female');
    });
});
