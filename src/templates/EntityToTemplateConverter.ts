/**
 * Entity to Template Converter
 * Converts existing entities into reusable templates
 */

import {
    Template,
    TemplateEntity,
    TemplateEntities,
    TemplateGenre,
    TemplateCategory,
    TemplateEntityType
} from './TemplateTypes';
import {
    Character,
    Location,
    Event,
    PlotItem,
    Group,
    Culture,
    Economy,
    MagicSystem,
    Chapter,
    Scene,
    Reference
} from '../types';
import { entityToYaml, entityToMarkdown } from '../utils/TemplatePreviewRenderer';

export interface ConversionOptions {
    /** Template name */
    name: string;

    /** Template description */
    description: string;

    /** Genre classification */
    genre: TemplateGenre;

    /** Category (typically 'single-entity' for individual entities) */
    category: TemplateCategory;

    /** Tags for searching */
    tags?: string[];

    /** Whether to include relationships */
    includeRelationships: boolean;

    /** Whether to make relationships generic/optional */
    genericizeRelationships: boolean;

    /** Whether to include custom fields */
    includeCustomFields: boolean;

    /** Whether to include profile images */
    includeProfileImages: boolean;

    /** Fields to exclude from template */
    excludeFields?: string[];

    /** Whether to include section content (Description, Backstory, etc.) */
    includeSectionContent?: boolean;

    /** Whether to include custom YAML fields not in core entity structure */
    includeCustomYaml?: boolean;

    /** Section content to include (if provided externally) */
    sectionContent?: Record<string, string>;

    /** Custom YAML fields to include (if provided externally) */
    customYamlFields?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class EntityToTemplateConverter {
    /**
     * Convert a single entity to a template
     */
    static convertEntityToTemplate<T>(
        entity: T,
        entityType: TemplateEntityType,
        options: ConversionOptions
    ): Template {
        const templateId = this.generateTemplateId(entityType);
        const templateEntity = this.convertToTemplateEntity(
            entity,
            entityType,
            templateId,
            options
        );

        const entities = this.createEntitiesContainer(entityType, templateEntity);

        const template: Template = {
            id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            name: options.name,
            description: options.description,
            genre: options.genre,
            category: options.category,
            version: '1.0.0',
            author: 'User',
            isBuiltIn: false,
            isEditable: true,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            tags: options.tags || [],
            entities,
            entityTypes: [entityType],
            usageCount: 0,
            quickApplyEnabled: true
        };

        return template;
    }

    /**
     * Convert multiple entities to a template (entity-set)
     */
    static convertEntitiesToTemplate(
        entities: {
            characters?: Character[];
            locations?: Location[];
            events?: Event[];
            items?: PlotItem[];
            groups?: Group[];
            cultures?: Culture[];
            economies?: Economy[];
            magicSystems?: MagicSystem[];
            chapters?: Chapter[];
            scenes?: Scene[];
            references?: Reference[];
        },
        options: ConversionOptions
    ): Template {
        const templateEntities: TemplateEntities = {};
        const entityTypes: TemplateEntityType[] = [];

        // Convert each entity type
        if (entities.characters && entities.characters.length > 0) {
            templateEntities.characters = entities.characters.map((char, index) =>
                this.convertToTemplateEntity(
                    char,
                    'character',
                    `CHAR_${index + 1}`,
                    options
                )
            );
            entityTypes.push('character');
        }

        if (entities.locations && entities.locations.length > 0) {
            templateEntities.locations = entities.locations.map((loc, index) =>
                this.convertToTemplateEntity(
                    loc,
                    'location',
                    `LOC_${index + 1}`,
                    options
                )
            );
            entityTypes.push('location');
        }

        if (entities.events && entities.events.length > 0) {
            templateEntities.events = entities.events.map((evt, index) =>
                this.convertToTemplateEntity(
                    evt,
                    'event',
                    `EVT_${index + 1}`,
                    options
                )
            );
            entityTypes.push('event');
        }

        if (entities.items && entities.items.length > 0) {
            templateEntities.items = entities.items.map((item, index) =>
                this.convertToTemplateEntity(
                    item,
                    'item',
                    `ITEM_${index + 1}`,
                    options
                )
            );
            entityTypes.push('item');
        }

        if (entities.groups && entities.groups.length > 0) {
            templateEntities.groups = entities.groups.map((group, index) =>
                this.convertToTemplateEntity(
                    group,
                    'group',
                    `GROUP_${index + 1}`,
                    options
                )
            );
            entityTypes.push('group');
        }

        if (entities.cultures && entities.cultures.length > 0) {
            templateEntities.cultures = entities.cultures.map((cult, index) =>
                this.convertToTemplateEntity(
                    cult,
                    'culture',
                    `CULT_${index + 1}`,
                    options
                )
            );
            entityTypes.push('culture');
        }

        if (entities.economies && entities.economies.length > 0) {
            templateEntities.economies = entities.economies.map((econ, index) =>
                this.convertToTemplateEntity(
                    econ,
                    'economy',
                    `ECON_${index + 1}`,
                    options
                )
            );
            entityTypes.push('economy');
        }

        if (entities.magicSystems && entities.magicSystems.length > 0) {
            templateEntities.magicSystems = entities.magicSystems.map((magic, index) =>
                this.convertToTemplateEntity(
                    magic,
                    'magicSystem',
                    `MAGIC_${index + 1}`,
                    options
                )
            );
            entityTypes.push('magicSystem');
        }

        if (entities.chapters && entities.chapters.length > 0) {
            templateEntities.chapters = entities.chapters.map((chap, index) =>
                this.convertToTemplateEntity(
                    chap,
                    'chapter',
                    `CHAP_${index + 1}`,
                    options
                )
            );
            entityTypes.push('chapter');
        }

        if (entities.scenes && entities.scenes.length > 0) {
            templateEntities.scenes = entities.scenes.map((scene, index) =>
                this.convertToTemplateEntity(
                    scene,
                    'scene',
                    `SCENE_${index + 1}`,
                    options
                )
            );
            entityTypes.push('scene');
        }

        if (entities.references && entities.references.length > 0) {
            templateEntities.references = entities.references.map((ref, index) =>
                this.convertToTemplateEntity(
                    ref,
                    'reference',
                    `REF_${index + 1}`,
                    options
                )
            );
            entityTypes.push('reference');
        }

        const template: Template = {
            id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            name: options.name,
            description: options.description,
            genre: options.genre,
            category: options.category,
            version: '1.0.0',
            author: 'User',
            isBuiltIn: false,
            isEditable: true,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            tags: options.tags || [],
            entities: templateEntities,
            entityTypes,
            usageCount: 0,
            quickApplyEnabled: true
        };

        return template;
    }

    /**
     * Convert an entity to a template entity
     */
    private static convertToTemplateEntity<T>(
        entity: T,
        entityType: TemplateEntityType,
        templateId: string,
        options: ConversionOptions
    ): TemplateEntity<T> {
        const converted: Record<string, unknown> = {
            templateId,
            ...this.copyEntityFields(entity, options)
        };

        // Remove fields that shouldn't be in template
        delete converted['id'];
        delete converted['filePath'];
        delete converted['storyId'];

        // Handle relationships based on options
        if (!options.includeRelationships) {
            // Remove all relationship fields
            this.deleteFields(converted, [
                'relationships',
                'connections',
                'locations',
                'events',
                'characters',
                'groups',
                'linkedCharacters',
                'linkedLocations',
                'linkedEvents',
                'linkedItems',
                'linkedGroups',
                'linkedCultures',
                'linkedFactions',
                'members',
                'territories',
                'parentLocation',
                'parentGroup',
                'parentCulture',
                'currentOwner',
                'pastOwners',
                'currentLocation',
                'associatedEvents',
                'dependencies',
                'groupRelationships',
                'relatedCultures',
                'subgroups',
                'chapterId'
            ]);
        } else if (options.genericizeRelationships) {
            // Make relationships optional/generic
            // This would involve more complex logic to create placeholders
            // For now, we'll keep them but add a note
        }

        // Handle custom fields
        if (!options.includeCustomFields) {
            delete converted['customFields'];
        }

        // Handle profile images
        if (!options.includeProfileImages) {
            delete converted['profileImagePath'];
        }

        // Exclude specific fields
        if (options.excludeFields) {
            options.excludeFields.forEach(field => {
                delete converted[field];
            });
        }

        // Add section content if provided (old format)
        if (options.includeSectionContent && options.sectionContent) {
            converted['sectionContent'] = options.sectionContent;
        }

        // Add custom YAML fields if provided (old format)
        if (options.includeCustomYaml && options.customYamlFields) {
            converted['customYamlFields'] = options.customYamlFields;
        }

        // Generate new format (yamlContent and markdownContent) from entity
        // This ensures new templates use the simplified format
        try {
            converted['yamlContent'] = entityToYaml(converted);
            converted['markdownContent'] = entityToMarkdown(converted);
        } catch (error) {
            console.warn('Failed to generate yamlContent/markdownContent:', error);
            // Fallback: keep old format if conversion fails
        }

        return converted as TemplateEntity<T>;
    }

    /**
     * Copy entity fields (shallow copy with exclusions)
     */
    private static copyEntityFields(entity: unknown, options: ConversionOptions): Record<string, unknown> {
        const copy: Record<string, unknown> = {};
        if (!isRecord(entity)) {
            return copy;
        }

        Object.keys(entity).forEach(key => {
            // Skip undefined values
            if (entity[key] === undefined) return;

            // Copy the value
            copy[key] = entity[key];
        });

        return copy;
    }

    /**
     * Generate a template ID for an entity
     */
    private static generateTemplateId(entityType: TemplateEntityType): string {
        const prefix = entityType.toUpperCase().substring(0, 4);
        return `${prefix}_1`;
    }

    /**
     * Get the plural form of entity type for TemplateEntities
     */
    private static createEntitiesContainer<T>(
        entityType: TemplateEntityType,
        templateEntity: TemplateEntity<T>
    ): TemplateEntities {
        switch (entityType) {
            case 'character':
                return { characters: [templateEntity] };
            case 'location':
                return { locations: [templateEntity] };
            case 'event':
                return { events: [templateEntity] };
            case 'item':
                return { items: [templateEntity] };
            case 'group':
                return { groups: [templateEntity] };
            case 'map':
                return { maps: [templateEntity] };
            case 'culture':
                return { cultures: [templateEntity] };
            case 'economy':
                return { economies: [templateEntity] };
            case 'magicSystem':
                return { magicSystems: [templateEntity] };
            case 'chapter':
                return { chapters: [templateEntity] };
            case 'scene':
                return { scenes: [templateEntity] };
            case 'reference':
                return { references: [templateEntity] };
        }
    }

    private static deleteFields(target: Record<string, unknown>, fields: string[]): void {
        fields.forEach(field => {
            delete target[field];
        });
    }

    /**
     * Extract entity type from entity object
     */
    static detectEntityType(entity: unknown): TemplateEntityType | null {
        if (!isRecord(entity)) {
            return null;
        }

        // This is a heuristic approach based on unique fields
        if ('traits' in entity || 'backstory' in entity) return 'character';
        if ('locationType' in entity || 'climate' in entity) return 'location';
        if ('eventType' in entity || 'date' in entity) return 'event';
        if ('itemType' in entity || 'rarity' in entity) return 'item';
        if ('groupType' in entity || 'members' in entity) return 'group';
        if ('values' in entity || 'religion' in entity) return 'culture';
        if ('currencies' in entity || 'resources' in entity) return 'economy';
        if ('source' in entity || 'costs' in entity) return 'magicSystem';
        if ('order' in entity && 'linkedCharacters' in entity) return 'chapter';
        if ('chapterId' in entity) return 'scene';
        if ('referenceType' in entity) return 'reference';

        return null;
    }
}
