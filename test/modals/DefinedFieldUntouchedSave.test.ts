import { describe, it, expect } from 'vitest';
import {
    commitDefinedFieldValues,
    displayValueForDefinition,
    sanitizeCustomFieldDefinitions,
} from '../../src/modals/entity/CustomFieldDefinitions';

/**
 * A defined field the user did not change must keep its stored value. The
 * modal's display form is lossy (list items are joined with commas, link
 * aliases are dropped), so committing it back on an unrelated save changed data.
 */
describe('defined fields the user did not change', () => {
    it('list items containing a comma survive an untouched save', () => {
        const defs = sanitizeCustomFieldDefinitions('character', [{ key: 'aliases', type: 'list' }]);
        const stored = ['Doe, Jane', 'Smith'];
        const entity: Record<string, unknown> = { aliases: stored };
        const draft = { aliases: displayValueForDefinition(defs[0], stored) };
        commitDefinedFieldValues(entity, defs, draft);
        expect(entity.aliases).toEqual(['Doe, Jane', 'Smith']);
    });

    it('link alias in an existing link is kept on an untouched save', () => {
        const defs = sanitizeCustomFieldDefinitions('character', [{ key: 'mentor', type: 'link', target: 'character' }]);
        const entity: Record<string, unknown> = { mentor: '[[Aria|Ari]]' };
        const draft = { mentor: displayValueForDefinition(defs[0], entity.mentor) };
        commitDefinedFieldValues(entity, defs, draft);
        expect(entity.mentor).toBe('[[Aria|Ari]]');
    });

    it('links items keep their aliases on an untouched save', () => {
        const defs = sanitizeCustomFieldDefinitions('character', [{ key: 'allies', type: 'links', target: 'character' }]);
        const entity: Record<string, unknown> = { allies: ['[[Aria|Ari]]', '[[Bob]]'] };
        const draft = { allies: displayValueForDefinition(defs[0], entity.allies) };
        commitDefinedFieldValues(entity, defs, draft);
        expect(entity.allies).toEqual(['[[Aria|Ari]]', '[[Bob]]']);
    });

    it('a list the user edited is committed', () => {
        const defs = sanitizeCustomFieldDefinitions('character', [{ key: 'aliases', type: 'list' }]);
        const entity: Record<string, unknown> = { aliases: ['Smith'] };
        commitDefinedFieldValues(entity, defs, { aliases: 'Smith, Jones' });
        expect(entity.aliases).toEqual(['Smith', 'Jones']);
    });

    it('a link the user changed is committed', () => {
        const defs = sanitizeCustomFieldDefinitions('character', [{ key: 'mentor', type: 'link', target: 'character' }]);
        const entity: Record<string, unknown> = { mentor: '[[Aria|Ari]]' };
        commitDefinedFieldValues(entity, defs, { mentor: 'Bob' });
        expect(entity.mentor).toBe('[[Bob]]');
    });
});
