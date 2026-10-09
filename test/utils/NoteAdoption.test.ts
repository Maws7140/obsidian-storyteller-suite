import { describe, it, expect } from 'vitest';
import {
    collectFrontmatterKeys,
    computeNotePatch,
    decodeMappingAction,
    encodeMappingAction,
    findNameDuplicates,
    getMappableFields,
    humanizeFieldName,
    planPlacement,
    suggestMappings,
    summarizeRenames,
} from '../../src/utils/NoteAdoption';

describe('NoteAdoption', () => {
    describe('collectFrontmatterKeys', () => {
        it('counts non-empty uses, keeps an example, and ignores position', () => {
            const stats = collectFrontmatterKeys([
                { frontmatter: { title: 'Aria', position: { start: 1 }, tags: ['a'] } },
                { frontmatter: { title: 'Brin', tags: [] } },
                { frontmatter: { desc: '' } },
            ]);
            const byKey = Object.fromEntries(stats.map(s => [s.key, s]));
            expect(byKey['position']).toBeUndefined();
            expect(byKey['title']).toEqual({ key: 'title', count: 2, example: 'Aria' });
            expect(byKey['tags']).toEqual({ key: 'tags', count: 1, example: 'a' });
            expect(byKey['desc'].count).toBe(0);
        });

        it('sorts by count then key', () => {
            const stats = collectFrontmatterKeys([
                { frontmatter: { b: 1, a: 1 } },
                { frontmatter: { b: 2 } },
            ]);
            expect(stats.map(s => s.key)).toEqual(['b', 'a']);
        });

        it('truncates long examples', () => {
            const long = 'x'.repeat(200);
            const [stat] = collectFrontmatterKeys([{ frontmatter: { notes: long } }]);
            expect(stat.example.length).toBeLessThanOrEqual(60);
            expect(stat.example.endsWith('...')).toBe(true);
        });
    });

    describe('humanizeFieldName and getMappableFields', () => {
        it('turns field names into readable labels', () => {
            expect(humanizeFieldName('profileImagePath')).toBe('Profile image path');
            expect(humanizeFieldName('currentLocationId')).toBe('Current location (ID)');
            expect(humanizeFieldName('childLocationIds')).toBe('Child location (IDs)');
        });

        it('offers whitelist fields only, without plumbing or body sections', () => {
            const fields = getMappableFields('character').map(f => f.field);
            expect(fields).toContain('name');
            expect(fields).toContain('profileImagePath');
            expect(fields).toContain('groups');
            expect(fields).not.toContain('id');
            expect(fields).not.toContain('entityType');
            expect(fields).not.toContain('customFields');
            expect(fields).not.toContain('mapId');
            // Description and Backstory are body sections, not frontmatter targets.
            expect(fields).not.toContain('description');
            expect(fields).not.toContain('backstory');
        });
    });

    describe('suggestMappings', () => {
        it('suggests synonyms for the target type', () => {
            const s = suggestMappings(['title', 'image', 'faction', 'location', 'job'], 'character');
            expect(s['title']).toEqual({ kind: 'map', target: 'name' });
            expect(s['image']).toEqual({ kind: 'map', target: 'profileImagePath' });
            expect(s['faction']).toEqual({ kind: 'map', target: 'groups' });
            expect(s['location']).toEqual({ kind: 'map', target: 'currentLocationId' });
            expect(s['job']).toEqual({ kind: 'map', target: 'occupation' });
        });

        it('keeps exact field names and maps case-only variants to the canonical field', () => {
            const s = suggestMappings(['status', 'Occupation', 'name'], 'character');
            expect(s['status']).toEqual({ kind: 'keep' });
            expect(s['name']).toEqual({ kind: 'keep' });
            expect(s['Occupation']).toEqual({ kind: 'map', target: 'occupation' });
        });

        it('does not let a synonym steal a field a note already names directly', () => {
            const s = suggestMappings(['title', 'name'], 'character');
            expect(s['name']).toEqual({ kind: 'keep' });
            expect(s['title']).toEqual({ kind: 'keep' });
        });

        it('leaves unknown keys as keep and never suggests ignore', () => {
            const s = suggestMappings(['cssclasses', 'favouriteColour'], 'character');
            expect(s['cssclasses']).toEqual({ kind: 'keep' });
            expect(s['favouriteColour']).toEqual({ kind: 'keep' });
        });

        it('applies type-specific synonyms only to their type', () => {
            // 'type' is already a real field on locations, so it is an identity match.
            expect(suggestMappings(['type'], 'location')).toEqual({ type: { kind: 'keep' } });
            expect(suggestMappings(['type'], 'item')['type']).toEqual({ kind: 'map', target: 'itemType' });
        });

        it('keeps underscore and runtime keys alone', () => {
            const s = suggestMappings(['_skipSync'], 'character');
            expect(s['_skipSync']).toEqual({ kind: 'keep' });
        });
    });

    describe('encode and decode mapping actions', () => {
        it('round-trips every action kind', () => {
            for (const action of [{ kind: 'keep' }, { kind: 'ignore' }, { kind: 'map', target: 'groups' }] as const) {
                expect(decodeMappingAction(encodeMappingAction(action))).toEqual(action);
            }
            expect(decodeMappingAction('nonsense')).toEqual({ kind: 'keep' });
        });
    });

    describe('computeNotePatch', () => {
        it('renames mapped keys, stamps entityType, and keeps unmapped keys', () => {
            const result = computeNotePatch(
                { title: 'Aria', age: 30, custom: 'kept' },
                'Aria file',
                'character',
                { title: { kind: 'map', target: 'name' }, age: { kind: 'keep' }, custom: { kind: 'keep' } }
            );
            expect(result.next).toEqual({ entityType: 'character', name: 'Aria', age: 30, custom: 'kept' });
            expect(result.renames).toEqual([{ from: 'title', to: 'name' }]);
            expect(result.nameFromFilename).toBe(false);
            expect(result.conflicts).toEqual([]);
        });

        it('never deletes a key the user chose to ignore', () => {
            const result = computeNotePatch(
                { title: 'Aria', legacy: 'old value' },
                'Aria',
                'character',
                { title: { kind: 'map', target: 'name' }, legacy: { kind: 'ignore' } }
            );
            expect(result.next['legacy']).toBe('old value');
        });

        it('falls back to the basename when there is no name', () => {
            const result = computeNotePatch({ age: 3 }, 'Old Wizard', 'character', {});
            expect(result.next['name']).toBe('Old Wizard');
            expect(result.nameFromFilename).toBe(true);
        });

        it('falls back to the basename when the mapped name is empty', () => {
            const result = computeNotePatch(
                { title: '   ' },
                'Fallback',
                'location',
                { title: { kind: 'map', target: 'name' } }
            );
            expect(result.next['name']).toBe('Fallback');
            expect(result.nameFromFilename).toBe(true);
        });

        it('keeps an existing target value and reports the conflict', () => {
            const result = computeNotePatch(
                { name: 'Real', title: 'Other' },
                'x',
                'character',
                { title: { kind: 'map', target: 'name' } }
            );
            expect(result.next['name']).toBe('Real');
            expect(result.next['title']).toBe('Other');
            expect(result.conflicts).toHaveLength(1);
            expect(result.conflicts[0]).toMatchObject({ key: 'title', target: 'name' });
            expect(result.renames).toEqual([]);
        });

        it('lets only one source key fill a target', () => {
            const result = computeNotePatch(
                { faction: 'Guild', factions: 'Order' },
                'x',
                'character',
                { faction: { kind: 'map', target: 'groups' }, factions: { kind: 'map', target: 'groups' } }
            );
            expect(result.renames).toEqual([{ from: 'faction', to: 'groups' }]);
            expect(result.conflicts[0].key).toBe('factions');
            expect(result.next['factions']).toBe('Order');
        });

        it('wraps a scalar into an array for array targets', () => {
            const result = computeNotePatch(
                { faction: 'Guild' },
                'x',
                'character',
                { faction: { kind: 'map', target: 'groups' } }
            );
            expect(result.next['groups']).toEqual(['Guild']);
        });

        it('turns an empty value into an empty array for array targets', () => {
            const result = computeNotePatch(
                { name: 'A', faction: '' },
                'x',
                'character',
                { faction: { kind: 'map', target: 'groups' } }
            );
            expect(result.next['groups']).toEqual([]);
        });

        it('reports a retyped note when the old stamp named another type', () => {
            const result = computeNotePatch({ entityType: 'location', name: 'X' }, 'X', 'character', {});
            expect(result.retypedFrom).toBe('location');
            expect(result.next['entityType']).toBe('character');
        });

        it('does not report a retype when the stamp already matches', () => {
            const result = computeNotePatch({ entityType: 'character', name: 'X' }, 'X', 'character', {});
            expect(result.retypedFrom).toBeNull();
        });

        it('drops Obsidian internal position from the output', () => {
            const result = computeNotePatch({ position: { start: 0 }, name: 'X' }, 'X', 'character', {});
            expect(result.next).not.toHaveProperty('position');
        });
    });

    describe('planPlacement', () => {
        const folder = 'Story/Characters';

        it('moves notes into the folder and keeps notes already there in place', () => {
            const decisions = planPlacement(
                [
                    { path: 'Old/Aria.md', basename: 'Aria', folderPath: 'Old' },
                    { path: 'Story/Characters/Brin.md', basename: 'Brin', folderPath: 'Story/Characters' },
                ],
                folder,
                ['Story/Characters/Brin.md'],
                'skip'
            );
            expect(decisions.find(d => d.path === 'Old/Aria.md')).toEqual({
                path: 'Old/Aria.md',
                destPath: 'Story/Characters/Aria.md',
                action: 'move',
            });
            expect(decisions.find(d => d.path.endsWith('Brin.md'))).toMatchObject({ action: 'stay' });
        });

        it('skips a note whose destination is taken when the policy is skip', () => {
            const decisions = planPlacement(
                [{ path: 'Old/Aria.md', basename: 'Aria', folderPath: 'Old' }],
                folder,
                ['Story/Characters/Aria.md'],
                'skip'
            );
            expect(decisions[0]).toMatchObject({ action: 'skip', destPath: 'Old/Aria.md' });
            expect(decisions[0].reason).toContain('already exists');
        });

        it('suffixes the name when the policy is suffix', () => {
            const decisions = planPlacement(
                [{ path: 'Old/Aria.md', basename: 'Aria', folderPath: 'Old' }],
                folder,
                ['Story/Characters/Aria.md', 'Story/Characters/Aria (2).md'],
                'suffix'
            );
            expect(decisions[0]).toMatchObject({ action: 'move', destPath: 'Story/Characters/Aria (3).md' });
        });

        it('does not let two incoming notes with the same basename collide', () => {
            const decisions = planPlacement(
                [
                    { path: 'A/Aria.md', basename: 'Aria', folderPath: 'A' },
                    { path: 'B/Aria.md', basename: 'Aria', folderPath: 'B' },
                ],
                folder,
                [],
                'skip'
            );
            const moves = decisions.filter(d => d.action === 'move').map(d => d.destPath);
            const skips = decisions.filter(d => d.action === 'skip');
            expect(moves).toEqual(['Story/Characters/Aria.md']);
            expect(skips).toHaveLength(1);
        });

        it('tolerates a trailing slash on the target folder', () => {
            const [d] = planPlacement([{ path: 'x/A.md', basename: 'A', folderPath: 'x' }], 'Story/Characters/', [], 'skip');
            expect(d.destPath).toBe('Story/Characters/A.md');
        });
    });

    describe('findNameDuplicates and summarizeRenames', () => {
        it('flags names that clash case-insensitively with existing or incoming entities', () => {
            const clashes = findNameDuplicates(
                [
                    { path: 'Old/aria.md', name: 'aria' },
                    { path: 'Old/Brin.md', name: 'Brin' },
                    { path: 'Old/Brin copy.md', name: 'brin' },
                ],
                [{ path: 'Story/Characters/Aria.md', name: 'Aria' }]
            );
            expect(clashes).toEqual([
                { path: 'Old/aria.md', name: 'aria', duplicateOf: 'Story/Characters/Aria.md' },
                { path: 'Old/Brin copy.md', name: 'brin', duplicateOf: 'Old/Brin.md' },
            ]);
        });

        it('counts renames across notes', () => {
            const summary = summarizeRenames([
                [{ from: 'title', to: 'name' }],
                [{ from: 'title', to: 'name' }, { from: 'image', to: 'profileImagePath' }],
            ]);
            expect(summary[0]).toEqual({ from: 'title', to: 'name', count: 2 });
            expect(summary[1]).toEqual({ from: 'image', to: 'profileImagePath', count: 1 });
        });
    });
});
