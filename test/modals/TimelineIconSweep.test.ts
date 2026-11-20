import { describe, expect, it } from 'vitest';
import { sweepCustomFieldsOnRead } from '../../src/modals/entity/CustomFieldDefinitions';
import type { EntityType } from '../../src/yaml/EntitySections';

describe('timeline icon fields on read', () => {
    it('keeps icon and iconColor on events and scenes rather than sweeping them into custom fields', () => {
        for (const type of ['event', 'scene'] as EntityType[]) {
            const entity: Record<string, unknown> = { icon: 'sword', iconColor: '#b03a2e', mood: 'grim' };
            const customFields = sweepCustomFieldsOnRead(type, entity);
            expect(entity.icon).toBe('sword');
            expect(entity.iconColor).toBe('#b03a2e');
            expect(customFields).toEqual({ mood: 'grim' });
        }
    });

    it('still sweeps icon on other entity types, where it is an ordinary property', () => {
        const entity: Record<string, unknown> = { icon: 'book-open' };
        const customFields = sweepCustomFieldsOnRead('character' as EntityType, entity);
        expect(entity.icon).toBeUndefined();
        expect(customFields).toEqual({ icon: 'book-open' });
    });
});
