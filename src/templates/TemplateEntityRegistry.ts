import type { TemplateEntities, TemplateEntityType } from './TemplateTypes';

export interface TemplateEntityTypeDefinition {
    type: TemplateEntityType;
    label: string;
    pluralKey: keyof TemplateEntities;
    folderName: string;
    idPrefix: string;
}

export const TEMPLATE_ENTITY_DEFINITIONS: readonly TemplateEntityTypeDefinition[] = [
    { type: 'character', label: 'Character', pluralKey: 'characters', folderName: 'Characters', idPrefix: 'CHAR' },
    { type: 'location', label: 'Location', pluralKey: 'locations', folderName: 'Locations', idPrefix: 'LOC' },
    { type: 'event', label: 'Event', pluralKey: 'events', folderName: 'Events', idPrefix: 'EVT' },
    { type: 'item', label: 'Item', pluralKey: 'items', folderName: 'Items', idPrefix: 'ITEM' },
    { type: 'group', label: 'Group', pluralKey: 'groups', folderName: 'Groups', idPrefix: 'GROUP' },
    { type: 'map', label: 'Map', pluralKey: 'maps', folderName: 'Maps', idPrefix: 'MAP' },
    { type: 'culture', label: 'Culture', pluralKey: 'cultures', folderName: 'Cultures', idPrefix: 'CULT' },
    { type: 'economy', label: 'Economy', pluralKey: 'economies', folderName: 'Economies', idPrefix: 'ECON' },
    { type: 'magicSystem', label: 'Magic System', pluralKey: 'magicSystems', folderName: 'MagicSystems', idPrefix: 'MAGIC' },
    { type: 'chapter', label: 'Chapter', pluralKey: 'chapters', folderName: 'Chapters', idPrefix: 'CHAP' },
    { type: 'scene', label: 'Scene', pluralKey: 'scenes', folderName: 'Scenes', idPrefix: 'SCENE' },
    { type: 'reference', label: 'Reference', pluralKey: 'references', folderName: 'References', idPrefix: 'REF' },
    { type: 'compendiumEntry', label: 'Compendium Entry', pluralKey: 'compendiumEntries', folderName: 'CompendiumEntries', idPrefix: 'COMP' },
    { type: 'book', label: 'Book', pluralKey: 'books', folderName: 'Books', idPrefix: 'BOOK' },
    { type: 'campaignSession', label: 'Campaign Session', pluralKey: 'campaignSessions', folderName: 'CampaignSessions', idPrefix: 'SESS' }
];

export const TEMPLATE_ENTITY_TYPES: readonly TemplateEntityType[] =
    TEMPLATE_ENTITY_DEFINITIONS.map(definition => definition.type);

export function getTemplateEntityDefinition(entityType: TemplateEntityType): TemplateEntityTypeDefinition {
    const definition = TEMPLATE_ENTITY_DEFINITIONS.find(item => item.type === entityType);
    if (!definition) {
        throw new Error(`Unknown template entity type: ${entityType}`);
    }
    return definition;
}

export function getTemplateEntityLabel(entityType: TemplateEntityType): string {
    return getTemplateEntityDefinition(entityType).label;
}

export function getTemplateEntityPluralKey(entityType: TemplateEntityType): keyof TemplateEntities {
    return getTemplateEntityDefinition(entityType).pluralKey;
}

export function getTemplateEntityFolder(entityType: TemplateEntityType): string {
    return getTemplateEntityDefinition(entityType).folderName;
}

export function getTemplateEntityIdPrefix(entityType: TemplateEntityType): string {
    return getTemplateEntityDefinition(entityType).idPrefix;
}

export function isTemplateEntityType(value: string): value is TemplateEntityType {
    return TEMPLATE_ENTITY_TYPES.some(type => type.toLowerCase() === value.toLowerCase());
}

export function findTemplateEntityType(value: string): TemplateEntityType | null {
    const normalized = value.trim().toLowerCase();
    return TEMPLATE_ENTITY_TYPES.find(type => type.toLowerCase() === normalized) ?? null;
}

export function getTemplateEntityCounts(entities: TemplateEntities): Record<TemplateEntityType, number> {
    const counts = {} as Record<TemplateEntityType, number>;
    TEMPLATE_ENTITY_DEFINITIONS.forEach(definition => {
        const entityList = entities[definition.pluralKey];
        counts[definition.type] = Array.isArray(entityList) ? entityList.length : 0;
    });
    return counts;
}
