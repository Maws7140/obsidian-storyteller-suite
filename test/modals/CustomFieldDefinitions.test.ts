import { describe, it, expect } from 'vitest';
import {
    CustomFieldDefinition,
    commitDefinedFieldValues,
    displayValueForDefinition,
    linkTargetName,
    normalizeDefinedValue,
    normalizeLinksInput,
    normalizeNumberInput,
    normalizeTextInput,
    parseListInput,
    sanitizeCustomFieldDefinitionMap,
    sanitizeCustomFieldDefinitions,
    sweepCustomFieldsOnRead,
    toWikiLink,
    validateCustomFieldKey,
} from '../../src/modals/entity/CustomFieldDefinitions';
import { buildFrontmatter, EntityType } from '../../src/yaml/EntitySections';
import { parseYaml, stringifyYaml } from 'obsidian';

describe('validateCustomFieldKey', () => {
    it('rejects blank and whitespace-only names', () => {
        expect(validateCustomFieldKey('', 'character')).not.toBeNull();
        expect(validateCustomFieldKey('   ', 'character')).not.toBeNull();
    });

    it('rejects names that would not be valid property names', () => {
        expect(validateCustomFieldKey('a:b', 'character')).not.toBeNull();
        expect(validateCustomFieldKey('line\nbreak', 'character')).not.toBeNull();
        expect(validateCustomFieldKey('_secret', 'character')).not.toBeNull();
        expect(validateCustomFieldKey('x'.repeat(65), 'character')).not.toBeNull();
    });

    it('rejects built-in keys for the entity type, ignoring case', () => {
        expect(validateCustomFieldKey('name', 'character')).not.toBeNull();
        expect(validateCustomFieldKey('Traits', 'character')).not.toBeNull();
        expect(validateCustomFieldKey('description', 'character')).not.toBeNull();
        expect(validateCustomFieldKey('customFields', 'character')).not.toBeNull();
    });

    it('rejects names already taken for the same type, ignoring case', () => {
        expect(validateCustomFieldKey('Intent', 'character', ['intent'])).not.toBeNull();
    });

    it('accepts a free name that is not built in', () => {
        expect(validateCustomFieldKey(' aliases ', 'character', ['intent'])).toBeNull();
        expect(validateCustomFieldKey('Birth place', 'character')).toBeNull();
    });

    it('allows a name that is built in for a different type', () => {
        // 'dateTime' is an event field, so it is free on a character.
        expect(validateCustomFieldKey('dateTime', 'character')).toBeNull();
    });
});

describe('sanitizeCustomFieldDefinitions', () => {
    it('drops malformed, blank, invalid and duplicate entries', () => {
        const out = sanitizeCustomFieldDefinitions('character', [
            null,
            'intent',
            { key: '', type: 'text' },
            { key: 'name', type: 'text' },
            { key: 'aliases', type: 'list' },
            { key: 'Aliases', type: 'text' },
            { key: 'intent', type: 'textarea', label: '  Intent  ' },
        ]);
        expect(out).toEqual([
            { key: 'aliases', type: 'list' },
            { key: 'intent', type: 'textarea', label: 'Intent' },
        ]);
    });

    it('falls back to text for an unknown type', () => {
        expect(sanitizeCustomFieldDefinitions('character', [{ key: 'x', type: 'date' }])).toEqual([
            { key: 'x', type: 'text' },
        ]);
    });

    it('keeps a valid target on link fields and drops link fields without one', () => {
        const out = sanitizeCustomFieldDefinitions('character', [
            { key: 'parents', type: 'links', target: 'character' },
            { key: 'mentor', type: 'link', target: 'not-a-type' },
            { key: 'home', type: 'link' },
        ]);
        expect(out).toEqual([{ key: 'parents', type: 'links', target: 'character' }]);
    });

    it('ignores a target on non-link fields', () => {
        expect(sanitizeCustomFieldDefinitions('item', [{ key: 'weight', type: 'number', target: 'character' }])).toEqual([
            { key: 'weight', type: 'number' },
        ]);
    });

    it('sanitises a whole settings map and drops unknown entity types', () => {
        const map = sanitizeCustomFieldDefinitionMap({
            character: [{ key: 'intent', type: 'text' }],
            nonsense: [{ key: 'x', type: 'text' }],
            event: 'not-an-array',
        });
        expect(map).toEqual({ character: [{ key: 'intent', type: 'text' }] });
    });
});

describe('value normalisation', () => {
    it('wiki-links a single name, once', () => {
        expect(toWikiLink('Ann')).toBe('[[Ann]]');
        expect(toWikiLink('[[Ann]]')).toBe('[[Ann]]');
        expect(toWikiLink('[[Ann|Annie]]')).toBe('[[Ann]]');
        expect(toWikiLink('   ')).toBeUndefined();
        expect(linkTargetName('[[Ann Lee]]')).toBe('Ann Lee');
    });

    it('wiki-links many names, dropping blanks and duplicates', () => {
        expect(normalizeLinksInput(['Ann', '[[Bo]]', 'ann', '', '  '])).toEqual(['[[Ann]]', '[[Bo]]']);
        expect(normalizeLinksInput('Ann, Bo')).toEqual(['[[Ann]]', '[[Bo]]']);
    });

    it('parses list input from commas or lines, trimmed and case-insensitively unique', () => {
        expect(parseListInput(' Ash, ember ,ASH,\n  ')).toEqual(['Ash', 'ember']);
        expect(parseListInput('')).toEqual([]);
    });

    it('parses numbers and treats empty or non-numeric input as absent', () => {
        expect(normalizeNumberInput('42')).toBe(42);
        expect(normalizeNumberInput(' 3.5 ')).toBe(3.5);
        expect(normalizeNumberInput('')).toBeUndefined();
        expect(normalizeNumberInput('abc')).toBeUndefined();
        expect(normalizeNumberInput(Number.NaN)).toBeUndefined();
    });

    it('collapses text onto one line, since frontmatter cannot hold line breaks', () => {
        expect(normalizeTextInput('  Protect\n the   city  ')).toBe('Protect the city');
        expect(normalizeTextInput('   ')).toBeUndefined();
    });

    it('normalises each type to its stored shape', () => {
        const def = (type: CustomFieldDefinition['type'], target?: string): CustomFieldDefinition => ({ key: 'k', type, target });
        expect(normalizeDefinedValue(def('list'), 'a, b')).toEqual(['a', 'b']);
        expect(normalizeDefinedValue(def('link', 'character'), 'Ann')).toBe('[[Ann]]');
        expect(normalizeDefinedValue(def('links', 'character'), ['Ann'])).toEqual(['[[Ann]]']);
        expect(normalizeDefinedValue(def('number'), '7')).toBe(7);
    });

    it('turns stored values back into modal input, including legacy strings', () => {
        const links = displayValueForDefinition({ key: 'p', type: 'links', target: 'character' }, ['[[Ann]]', '[[Bo|B]]']);
        expect(links).toEqual(['Ann', 'Bo']);
        const list = displayValueForDefinition({ key: 'a', type: 'list' }, ['x', 'y']);
        expect(list).toBe('x, y');
        const legacyLink = displayValueForDefinition({ key: 'm', type: 'link', target: 'character' }, '[[Ann]]');
        expect(legacyLink).toBe('Ann');
    });
});

describe('round trip through frontmatter', () => {
    const definitions: CustomFieldDefinition[] = [
        { key: 'aliases', type: 'list' },
        { key: 'intent', type: 'text' },
        { key: 'parents', type: 'links', target: 'character' },
        { key: 'age', type: 'number' },
    ];

    it('writes defined fields as top-level properties and reads them back without duplicates', () => {
        const entity: Record<string, unknown> = {
            id: 'c1',
            name: 'Mara',
            customFields: { notes: 'free text' },
        };
        commitDefinedFieldValues(entity, definitions, {
            aliases: 'Ash, Ember, ash',
            intent: '  Protect the city  ',
            parents: ['Ann', '[[Bo|Bo the Bold]]'],
            age: '42',
        });

        const frontmatter = buildFrontmatter('character', entity as never, new Set(Object.keys(entity)), {
            customFieldsMode: 'flatten',
        });
        expect(frontmatter).not.toHaveProperty('customFields');
        expect(frontmatter).toMatchObject({
            aliases: ['Ash', 'Ember'],
            intent: 'Protect the city',
            parents: ['[[Ann]]', '[[Bo]]'],
            age: 42,
            notes: 'free text',
        });

        const yaml = stringifyYaml(frontmatter);
        const fromDisk = parseYaml(yaml) as Record<string, unknown>;
        const customFields = sweepCustomFieldsOnRead('character' as EntityType, fromDisk, definitions);

        expect(fromDisk.aliases).toEqual(['Ash', 'Ember']);
        expect(fromDisk.intent).toBe('Protect the city');
        expect(fromDisk.parents).toEqual(['[[Ann]]', '[[Bo]]']);
        expect(fromDisk.age).toBe(42);
        // Defined keys stay top-level; only free-form scalars are swept.
        expect(customFields).toEqual({ notes: 'free text' });
        expect(fromDisk.customFields).toEqual({ notes: 'free text' });
        for (const key of ['aliases', 'intent', 'parents']) {
            expect(yaml.split(`\n${key}:`).length - 1).toBe(1);
        }
    });

    it('clears a field on an existing note instead of letting the old value survive', () => {
        const original = { id: 'c1', name: 'Mara', intent: 'Old purpose', parents: ['[[Ann]]'] };
        const entity: Record<string, unknown> = { id: 'c1', name: 'Mara', customFields: {} };
        commitDefinedFieldValues(entity, definitions, { aliases: '', intent: '', parents: [], age: '' });

        const frontmatter = buildFrontmatter('character', entity as never, new Set(Object.keys(entity)), {
            customFieldsMode: 'flatten',
            originalFrontmatter: original,
        });
        expect(frontmatter.intent).toBe('');
        expect(frontmatter.parents).toEqual([]);
    });

    it('does not write empty defined fields onto a new note', () => {
        const entity: Record<string, unknown> = { id: 'c2', name: 'Bo', customFields: {} };
        commitDefinedFieldValues(entity, definitions, { aliases: '', intent: '', parents: [], age: '' });
        const frontmatter = buildFrontmatter('character', entity as never, new Set(Object.keys(entity)), {
            customFieldsMode: 'flatten',
        });
        expect(frontmatter).not.toHaveProperty('aliases');
        expect(frontmatter).not.toHaveProperty('intent');
        expect(frontmatter).not.toHaveProperty('parents');
        expect(frontmatter).not.toHaveProperty('age');
    });

    it('adopts a value swept into customFields before its definition existed', () => {
        const fromDisk: Record<string, unknown> = { id: 'c3', name: 'Cy', intent: 'Legacy' };
        const swept = sweepCustomFieldsOnRead('character' as EntityType, fromDisk, []);
        expect(swept).toEqual({ intent: 'Legacy' });

        // Once defined, the same file keeps intent top-level and out of customFields.
        const again: Record<string, unknown> = { id: 'c3', name: 'Cy', intent: 'Legacy' };
        expect(sweepCustomFieldsOnRead('character' as EntityType, again, definitions)).toEqual({});
        expect(again.intent).toBe('Legacy');
    });
});
