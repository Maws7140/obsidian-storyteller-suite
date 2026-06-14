/**
 * Allowlist of fields that template-created entities may link to existing vault
 * entities. Each entry constrains a source entity type to a specific field, the
 * target entity type the user picks from, the cardinality, and whether the field
 * stores the target entity's ID or display name.
 *
 * Conventions are taken directly from src/types.ts — keep these in sync if the
 * underlying entity field shapes change.
 */

import type { TemplateEntityType, TemplateLinkValueKind } from './TemplateTypes';

export interface TemplateLinkFieldDefinition {
    /** Field written on the created source entity */
    field: string;
    /** Human label for the field shown in the editor */
    label: string;
    /** Existing vault entity type the user chooses from */
    targetType: TemplateEntityType;
    /** Whether the field holds multiple references */
    multiple: boolean;
    /** Whether the field stores the target entity's ID or display name */
    valueKind: TemplateLinkValueKind;
}

/**
 * Source entity type → fields that can link to existing vault entities.
 * Starts intentionally narrow; expand as needed.
 */
export const TEMPLATE_LINK_FIELDS: Partial<Record<TemplateEntityType, readonly TemplateLinkFieldDefinition[]>> = {
    character: [
        { field: 'currentLocationId', label: 'Current location', targetType: 'location', multiple: false, valueKind: 'id' },
        { field: 'locations', label: 'Locations', targetType: 'location', multiple: true, valueKind: 'name' },
        { field: 'magicSystems', label: 'Magic systems', targetType: 'magicSystem', multiple: true, valueKind: 'id' },
        { field: 'groups', label: 'Groups', targetType: 'group', multiple: true, valueKind: 'id' },
        { field: 'cultures', label: 'Cultures', targetType: 'culture', multiple: true, valueKind: 'id' }
    ],
    item: [
        { field: 'currentLocation', label: 'Current location', targetType: 'location', multiple: false, valueKind: 'name' },
        { field: 'currentOwner', label: 'Current owner', targetType: 'character', multiple: false, valueKind: 'name' },
        { field: 'groups', label: 'Groups', targetType: 'group', multiple: true, valueKind: 'id' }
    ],
    event: [
        { field: 'location', label: 'Location', targetType: 'location', multiple: false, valueKind: 'name' },
        { field: 'characters', label: 'Characters', targetType: 'character', multiple: true, valueKind: 'name' },
        { field: 'groups', label: 'Groups', targetType: 'group', multiple: true, valueKind: 'id' }
    ],
    scene: [
        { field: 'linkedCharacters', label: 'Characters', targetType: 'character', multiple: true, valueKind: 'name' },
        { field: 'linkedLocations', label: 'Locations', targetType: 'location', multiple: true, valueKind: 'name' },
        { field: 'linkedEvents', label: 'Events', targetType: 'event', multiple: true, valueKind: 'name' },
        { field: 'linkedItems', label: 'Items', targetType: 'item', multiple: true, valueKind: 'name' },
        { field: 'linkedGroups', label: 'Groups', targetType: 'group', multiple: true, valueKind: 'id' }
    ],
    magicSystem: [
        { field: 'linkedCharacters', label: 'Characters', targetType: 'character', multiple: true, valueKind: 'name' },
        { field: 'linkedLocations', label: 'Locations', targetType: 'location', multiple: true, valueKind: 'name' },
        { field: 'linkedCultures', label: 'Cultures', targetType: 'culture', multiple: true, valueKind: 'name' },
        { field: 'linkedEvents', label: 'Events', targetType: 'event', multiple: true, valueKind: 'name' },
        { field: 'linkedItems', label: 'Items', targetType: 'item', multiple: true, valueKind: 'name' }
    ]
};

/** Source entity types that support existing-entity links */
export const TEMPLATE_LINK_SOURCE_TYPES: readonly TemplateEntityType[] =
    (Object.keys(TEMPLATE_LINK_FIELDS) as TemplateEntityType[]);

/** Returns the allowlisted link fields for a source entity type (empty if none) */
export function getLinkFieldsForSourceType(sourceType: TemplateEntityType): readonly TemplateLinkFieldDefinition[] {
    return TEMPLATE_LINK_FIELDS[sourceType] ?? [];
}

/** Look up a single field definition for a source type + field name */
export function getLinkFieldDefinition(
    sourceType: TemplateEntityType,
    field: string
): TemplateLinkFieldDefinition | undefined {
    return (TEMPLATE_LINK_FIELDS[sourceType] ?? []).find(definition => definition.field === field);
}
