import { describe, it, expect } from 'vitest';
import {
    suggestImpliedLinks,
    linkSuggestionKey,
    connectionForSuggestion,
    splitNameList,
    LinkSuggestionCharacter
} from '../../src/utils/RelationshipSuggestions';
import type { Group } from '../../src/types';

function person(name: string, extra: Partial<LinkSuggestionCharacter> = {}): LinkSuggestionCharacter {
    return { name, id: name.toLowerCase().replace(/\s+/g, '-'), ...extra } as LinkSuggestionCharacter;
}

describe('suggestImpliedLinks', () => {
    it('suggests characters who share a group', () => {
        const mira = person('Mira', { groups: ['grp-guild'] });
        const sera = person('Sera', { groups: ['grp-guild'] });
        const other = person('Other');
        const groups = [{ id: 'grp-guild', name: 'Ninth Bell Guild', members: [] }] as Array<Pick<Group, 'id' | 'name' | 'members'>>;

        const suggestions = suggestImpliedLinks({ characters: [mira, sera, other], groups });
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0]).toEqual(expect.objectContaining({
            reason: 'shared-group',
            source: 'Mira',
            target: 'Sera',
            kind: 'acquaintance',
            direction: 'mutual',
            label: 'same group: Ninth Bell Guild'
        }));
    });

    it('suggests shared-group pairs from the group members list too', () => {
        const groups = [{
            id: 'g1', name: 'Council', members: [{ type: 'character', id: 'mira' }, { type: 'character', id: 'sera' }]
        }] as Array<Pick<Group, 'id' | 'name' | 'members'>>;
        const suggestions = suggestImpliedLinks({
            characters: [person('Mira'), person('Sera')],
            groups
        });
        expect(suggestions.map(s => s.reason)).toEqual(['shared-group']);
    });

    it('skips groups that are too large to be a meaningful signal', () => {
        const members = ['A', 'B', 'C'].map(n => person(n, { groups: ['big'] }));
        const groups = [{ id: 'big', name: 'Big', members: [] }] as Array<Pick<Group, 'id' | 'name' | 'members'>>;
        expect(suggestImpliedLinks({ characters: members, groups, maxGroupSize: 2 })).toEqual([]);
    });

    it('suggests co-present characters only once they reach the threshold', () => {
        const a = person('Ayla');
        const b = person('Brin');
        const occasions = [
            { id: 'e1', participants: ['Ayla', 'Brin'] },
            { id: 'e2', participants: ['[[Ayla]]', 'Brin'] },
            { id: 's1', participants: ['Ayla', 'Brin', 'Nobody'] }
        ];
        expect(suggestImpliedLinks({ characters: [a, b], occasions, coPresenceThreshold: 4 })).toEqual([]);

        const suggestions = suggestImpliedLinks({ characters: [a, b], occasions, coPresenceThreshold: 3 });
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0]).toEqual(expect.objectContaining({
            reason: 'co-presence',
            kind: 'acquaintance',
            direction: 'mutual',
            detail: 'Together in 3 scenes or events'
        }));
    });

    it('does not count the same occasion twice', () => {
        const occasions = [
            { id: 'e1', participants: ['Ayla', 'Brin'] },
            { id: 'e1', participants: ['Ayla', 'Brin'] },
            { id: 'e1', participants: ['Ayla', 'Brin'] }
        ];
        expect(suggestImpliedLinks({ characters: [person('Ayla'), person('Brin')], occasions, coPresenceThreshold: 2 })).toEqual([]);
    });

    it('suggests a parent from a "parents" custom field, one-way from the parent', () => {
        const mira = person('Mira', { customFields: { Parents: 'Tom, Anne' } });
        const tom = person('Tom');
        const anne = person('Anne');
        const suggestions = suggestImpliedLinks({ characters: [mira, tom, anne] });
        expect(suggestions.map(s => [s.source, s.kind, s.target, s.direction])).toEqual([
            ['Tom', 'parent', 'Mira', 'to'],
            ['Anne', 'parent', 'Mira', 'to']
        ]);
    });

    it('reads a typed top-level "parents" array of wikilinks, not only customFields', () => {
        const mira = { ...person('Mira'), parents: ['[[Arathorn]]'] } as unknown as LinkSuggestionCharacter;
        const arathorn = person('Arathorn');
        const suggestions = suggestImpliedLinks({ characters: [mira, arathorn] });
        expect(suggestions).toEqual([expect.objectContaining({
            reason: 'family-field',
            source: 'Arathorn',
            kind: 'parent',
            target: 'Mira',
            direction: 'to',
        })]);
    });

    it('reads top-level family strings and arrays with several names', () => {
        const aragorn = { ...person('Aragorn'), children: ['[[Eldarion]]', 'Arwen Undomiel'], spouse: '[[Arwen]]' } as unknown as LinkSuggestionCharacter;
        const suggestions = suggestImpliedLinks({ characters: [aragorn, person('Eldarion'), person('Arwen Undomiel'), person('Arwen')] });
        expect(suggestions.map(s => [s.source, s.kind, s.target, s.direction])).toEqual([
            ['Aragorn', 'parent', 'Eldarion', 'to'],
            ['Aragorn', 'parent', 'Arwen Undomiel', 'to'],
            ['Aragorn', 'spouse', 'Arwen', 'mutual'],
        ]);
    });

    it('suggests a child from a "children" field, with the owner as parent', () => {
        const tom = person('Tom', { customFields: { children: '[[Mira]]' } });
        const suggestions = suggestImpliedLinks({ characters: [tom, person('Mira')] });
        expect(suggestions).toEqual([expect.objectContaining({ source: 'Tom', kind: 'parent', target: 'Mira', direction: 'to', reason: 'family-field' })]);
    });

    it('suggests siblings and spouses as mutual, once per pair', () => {
        const mira = person('Mira', { customFields: { sibling: 'Sera', spouse: 'Brin' } });
        const sera = person('Sera', { customFields: { siblings: 'Mira' } });
        const brin = person('Brin');
        const suggestions = suggestImpliedLinks({ characters: [mira, sera, brin] });
        expect(suggestions.map(s => [s.kind, s.direction])).toEqual([
            ['sibling', 'mutual'],
            ['spouse', 'mutual']
        ]);
    });

    it('ignores family fields that do not name a known character', () => {
        const mira = person('Mira', { customFields: { parents: 'Unknown, none' } });
        expect(suggestImpliedLinks({ characters: [mira] })).toEqual([]);
    });

    it('skips a family suggestion when the same relationship is already stated on either side', () => {
        const mira = person('Mira', {
            customFields: { parents: 'Tom' },
            connections: []
        });
        const tom = person('Tom', { connections: [{ type: 'parent', target: 'Mira' }] });
        // Tom says he is Mira's parent. That is a stated parent link from Tom to Mira, so nothing new to suggest.
        expect(suggestImpliedLinks({ characters: [mira, tom] })).toEqual([]);

        // The same fact stated from Mira's side: Mira is Tom's child
        const miraChild = person('Mira', { customFields: { parents: 'Tom' }, connections: [{ type: 'child', target: 'Tom' }] });
        expect(suggestImpliedLinks({ characters: [miraChild, person('Tom')] })).toEqual([]);
    });

    it('does not suggest pairs that already have any relationship, for co-presence and groups', () => {
        const a = person('Ayla', { connections: [{ type: 'enemy', target: 'Brin' }] });
        const b = person('Brin');
        const occasions = [1, 2, 3].map(i => ({ id: `e${i}`, participants: ['Ayla', 'Brin'] }));
        expect(suggestImpliedLinks({ characters: [a, b], occasions })).toEqual([]);
    });

    it('treats legacy string relationships as existing links', () => {
        const a = person('Ayla', { relationships: ['Brin'] });
        const b = person('Brin');
        const occasions = [1, 2, 3].map(i => ({ id: `e${i}`, participants: ['Ayla', 'Brin'] }));
        expect(suggestImpliedLinks({ characters: [a, b], occasions })).toEqual([]);
    });

    it('filters out dismissed suggestions', () => {
        const a = person('Ayla');
        const b = person('Brin');
        const occasions = [1, 2, 3].map(i => ({ id: `e${i}`, participants: ['Ayla', 'Brin'] }));
        const first = suggestImpliedLinks({ characters: [a, b], occasions });
        expect(first).toHaveLength(1);

        // Dismissed in either order: the key is symmetric for mutual links
        const dismissed = [linkSuggestionKey('acquaintance', 'Brin', 'Ayla', 'mutual')];
        expect(suggestImpliedLinks({ characters: [a, b], occasions, dismissed })).toEqual([]);
    });

    it('filters dismissed family suggestions without touching others', () => {
        const mira = person('Mira', { customFields: { parents: 'Tom, Anne' } });
        const characters = [mira, person('Tom'), person('Anne')];
        const dismissed = [linkSuggestionKey('parent', 'Tom', 'Mira', 'to')];
        const remaining = suggestImpliedLinks({ characters, dismissed });
        expect(remaining.map(s => s.source)).toEqual(['Anne']);
    });

    it('lists family suggestions first, then co-presence, then groups', () => {
        const mira = person('Mira', { customFields: { parents: 'Tom' }, groups: ['g'] });
        const sera = person('Sera', { groups: ['g'] });
        const tom = person('Tom');
        const brin = person('Brin');
        const occasions = [1, 2, 3].map(i => ({ id: `e${i}`, participants: ['Brin', 'Tom'] }));
        const groups = [{ id: 'g', name: 'Guild', members: [] }] as Array<Pick<Group, 'id' | 'name' | 'members'>>;
        const suggestions = suggestImpliedLinks({ characters: [mira, sera, tom, brin], occasions, groups });
        expect(suggestions.map(s => s.reason)).toEqual(['family-field', 'co-presence', 'shared-group']);
    });

    it('returns no suggestions for empty data', () => {
        expect(suggestImpliedLinks({ characters: [] })).toEqual([]);
    });
});

describe('suggestion keys and accepting', () => {
    it('keys mutual links the same in either order, and one-way links by direction', () => {
        expect(linkSuggestionKey('sibling', 'Mira', 'Sera', 'mutual'))
            .toBe(linkSuggestionKey('sibling', 'Sera', 'Mira', 'mutual'));
        expect(linkSuggestionKey('parent', 'Tom', 'Mira', 'to'))
            .not.toBe(linkSuggestionKey('parent', 'Mira', 'Tom', 'to'));
    });

    it('turns an accepted suggestion into a real relationship on the source note', () => {
        expect(connectionForSuggestion({
            kind: 'parent', target: 'Mira', direction: 'to'
        })).toEqual({ target: 'Mira', type: 'parent', direction: 'to' });
        expect(connectionForSuggestion({
            kind: 'acquaintance', target: 'Sera', direction: 'mutual', label: 'same group: Guild'
        })).toEqual({ target: 'Sera', type: 'acquaintance', direction: 'mutual', label: 'same group: Guild' });
    });

    it('splits free-text name lists', () => {
        expect(splitNameList('Tom, Anne and [[Bob|Robert]]; none')).toEqual(['Tom', 'Anne', 'Bob']);
        expect(splitNameList('Tom / Anne & Bob')).toEqual(['Tom', 'Anne', 'Bob']);
    });
});

describe('suggestImpliedLinks pair overlap', () => {
    it('does not offer acquaintance for a pair already suggested through a family field', () => {
        const aria = person('Aria', { customFields: { sibling: 'Bran' } } as Partial<LinkSuggestionCharacter>);
        const bran = person('Bran');
        const occasions = [1, 2, 3].map(i => ({ id: `event:${i}`, participants: ['Aria', 'Bran'] }));

        const suggestions = suggestImpliedLinks({ characters: [aria, bran], occasions });
        expect(suggestions.map(s => [s.reason, s.kind])).toEqual([['family-field', 'sibling']]);
    });

    it('does not offer a shared-group acquaintance for a pair already suggested through a family field', () => {
        const aria = person('Aria', { groups: ['grp-guild'], customFields: { parent: 'Bran' } } as Partial<LinkSuggestionCharacter>);
        const bran = person('Bran', { groups: ['grp-guild'] });
        const groups = [{ id: 'grp-guild', name: 'Ninth Bell Guild', members: [] }] as Array<Pick<Group, 'id' | 'name' | 'members'>>;

        const suggestions = suggestImpliedLinks({ characters: [aria, bran], groups });
        expect(suggestions.map(s => s.reason)).toEqual(['family-field']);
    });
});
