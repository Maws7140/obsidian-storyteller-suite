import { describe, it, expect } from 'vitest';
import {
    isModalFieldVisible,
    setModalFieldHidden,
    seedDefaultCustomFields,
    CHARACTER_MODAL_FIELDS,
    EVENT_MODAL_FIELDS,
    ITEM_MODAL_FIELDS,
    MODAL_FIELD_SETS,
} from '../../src/modals/entity/ModalFieldVisibility';

describe('isModalFieldVisible', () => {
    it('shows everything when nothing is configured', () => {
        expect(isModalFieldVisible(undefined, 'character', 'quirks')).toBe(true);
        expect(isModalFieldVisible({}, 'character', 'quirks')).toBe(true);
    });

    it('hides only the listed field', () => {
        const hidden = { character: ['quirks'] };
        expect(isModalFieldVisible(hidden, 'character', 'quirks')).toBe(false);
        expect(isModalFieldVisible(hidden, 'character', 'description')).toBe(true);
    });

    it('does not leak a hidden field across entity types', () => {
        const hidden = { character: ['description'] };
        expect(isModalFieldVisible(hidden, 'location', 'description')).toBe(true);
    });

    it('an empty hidden list shows everything', () => {
        expect(isModalFieldVisible({ character: [] }, 'character', 'quirks')).toBe(true);
    });

    it('falls back to visible when the stored value is malformed', () => {
        // A settings file edited by hand, or written by an older version, must
        // never blank out the modal.
        const malformed = { character: 'quirks' } as unknown as Record<string, string[]>;
        expect(isModalFieldVisible(malformed, 'character', 'quirks')).toBe(true);
    });

    it('ignores a key the registry no longer knows', () => {
        // A stale entry left by a renamed field must not silently remove
        // something settings no longer offers a toggle for.
        expect(isModalFieldVisible({ character: ['retiredField'] }, 'character', 'retiredField')).toBe(true);
    });

    it('hides an item field', () => {
        expect(isModalFieldVisible({ item: ['quantity'] }, 'item', 'quantity')).toBe(false);
        expect(isModalFieldVisible({ item: ['quantity'] }, 'item', 'creator')).toBe(true);
    });
});

describe('setModalFieldHidden', () => {
    it('adds a key when hiding', () => {
        expect(setModalFieldHidden({}, 'character', 'quirks', true)).toEqual({ character: ['quirks'] });
    });

    it('removes a key when showing', () => {
        expect(setModalFieldHidden({ character: ['quirks'] }, 'character', 'quirks', false)).toEqual({});
    });

    it('drops the entity key once nothing is hidden for it', () => {
        const next = setModalFieldHidden({ character: ['quirks'], item: ['creator'] }, 'character', 'quirks', false);
        expect(next).toEqual({ item: ['creator'] });
        expect('character' in next).toBe(false);
    });

    it('does not duplicate an already-hidden key', () => {
        expect(setModalFieldHidden({ character: ['quirks'] }, 'character', 'quirks', true).character).toEqual(['quirks']);
    });

    it('does not mutate the input', () => {
        const original = { character: ['quirks'] };
        setModalFieldHidden(original, 'character', 'backstory', true);
        expect(original).toEqual({ character: ['quirks'] });
    });

    it('survives a malformed stored value', () => {
        const malformed = { character: 'quirks' } as unknown as Record<string, string[]>;
        expect(setModalFieldHidden(malformed, 'character', 'backstory', true).character).toEqual(['backstory']);
    });

    it('round-trips through isModalFieldVisible', () => {
        let map = setModalFieldHidden(undefined, 'character', 'dndStats', true);
        expect(isModalFieldVisible(map, 'character', 'dndStats')).toBe(false);
        map = setModalFieldHidden(map, 'character', 'dndStats', false);
        expect(isModalFieldVisible(map, 'character', 'dndStats')).toBe(true);
    });
});

describe('seedDefaultCustomFields', () => {
    it('adds each configured field with an empty value', () => {
        expect(seedDefaultCustomFields({}, ['intent', 'parents'])).toEqual({ intent: '', parents: '' });
    });

    it('never overwrites a value that is already there', () => {
        expect(seedDefaultCustomFields({ intent: 'revenge' }, ['intent'])).toEqual({ intent: 'revenge' });
    });

    it('keeps fields that are not in the defaults', () => {
        expect(seedDefaultCustomFields({ mood: 'grim' }, ['intent'])).toEqual({ mood: 'grim', intent: '' });
    });

    it('ignores blank entries and trims names', () => {
        expect(seedDefaultCustomFields({}, ['', '   ', '  intent  '])).toEqual({ intent: '' });
    });

    it('returns a copy rather than the original object', () => {
        const existing = { mood: 'grim' };
        const result = seedDefaultCustomFields(existing, ['intent']);
        expect(result).not.toBe(existing);
        expect(existing).toEqual({ mood: 'grim' });
    });

    it('handles both arguments being absent', () => {
        expect(seedDefaultCustomFields(undefined, undefined)).toEqual({});
    });
});

describe('field definitions', () => {
    it('name is not hideable, since saving requires it', () => {
        expect(CHARACTER_MODAL_FIELDS.some(f => f.key === 'name')).toBe(false);
        expect(ITEM_MODAL_FIELDS.some(f => f.key === 'name')).toBe(false);
        expect(EVENT_MODAL_FIELDS.some(f => f.key === 'name')).toBe(false);
    });

    it('keys are unique', () => {
        for (const fields of Object.values(MODAL_FIELD_SETS)) {
            const keys = fields.map(f => f.key);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });

    it('every field has a label', () => {
        for (const fields of Object.values(MODAL_FIELD_SETS)) {
            for (const field of fields) {
                expect(field.label.trim().length).toBeGreaterThan(0);
            }
        }
    });
});
